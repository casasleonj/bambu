import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { AbonoCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { registrarReceivableEntry, detectarDivergencia, registrarDivergencia } from '@/lib/receivable-entry'

export async function GET(request: NextRequest) {
  // FIX CRITICAL (C-SEC-2): Only ADMIN/CONTADOR can read abonos
  // Previously: requireAuth() only — included cliente PII (PII leak)
  const authResult = await requireRole(['ADMIN', 'CONTADOR'])
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const facturaId = searchParams.get('facturaId')
  const clienteId = searchParams.get('clienteId')

  try {
    const where: Record<string, unknown> = {}
    if (facturaId) where.facturaId = facturaId
    if (clienteId) where.clienteId = clienteId

    const abonos = await prisma.abono.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { fecha: 'desc' },
      include: {
        cliente: true,
      },
    })

    return apiSuccess({ abonos })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching abonos:')
    return apiError('Error fetching abonos', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = AbonoCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { facturaId, clienteId, pedidoId, monto, metodoPago } = parsed.data

    const result = await withAdvisoryLock('CARTERA', clienteId, async (tx) => {
      // Verificar que la factura existe
      const factura = await tx.factura.findUnique({
        where: { id: facturaId },
      })

      if (!factura) {
        throw new Error('FACTURA_NOT_FOUND')
      }

      // FIX: la Factura se crea al mismo tiempo que el Pedido (ver
      // CrearPedidoUseCase / recurrentes.ts), no cuando se entrega — un
      // pedido PENDIENTE/EN_RUTA/NO_ENTREGADO ya tiene factura EMITIDA.
      // Sin este guard se podía registrar abono (dinero cobrado) sobre
      // mercancía que nunca salió de bodega.
      const pedido = await tx.pedido.findUnique({
        where: { id: factura.pedidoId },
        select: { estadoEntrega: true },
      })
      if (!pedido) {
        throw new Error('PEDIDO_NOT_FOUND')
      }
      if (pedido.estadoEntrega !== 'ENTREGADO') {
        throw new Error('PEDIDO_NO_ENTREGADO')
      }

      // Calcular siguiente número
      const nextNum = await getNextNumero(tx, { model: 'abono', field: 'numero' })

      // Crear abono
      const abono = await tx.abono.create({
        data: {
          numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
          facturaId,
          clienteId,
          pedidoId,
          monto,
          metodoPago,
        },
      })

      // Actualizar saldo y monto pagado de la factura atómicamente
      const updatedFactura = await tx.factura.update({
        where: { id: facturaId },
        data: {
          saldo: { decrement: monto },
          montoPagado: { increment: monto },
        },
      })

      if (Number(updatedFactura.saldo) < 0) {
        throw new Error('Abono excede saldo de factura')
      }

      const saldoActual = Number(updatedFactura.saldo)
      const montoPagadoActual = Number(updatedFactura.montoPagado)
      const nuevoEstado = saldoActual <= 0 ? 'PAGADA' : (montoPagadoActual > 0 ? 'PARCIAL' : 'EMITIDA')
      if (updatedFactura.estado !== nuevoEstado) {
        await tx.factura.update({
          where: { id: facturaId },
          data: { estado: nuevoEstado },
        })
      }

      // Sincronizar Pedido.saldo con Factura.saldo
      await tx.pedido.update({
        where: { id: factura.pedidoId },
        data: {
          saldo: updatedFactura.saldo,
          totalPagado: { increment: monto },
        },
      })

      // FASE 5 (ADR-MONETARIO-001, §12): proyección de auditoría en la MISMA tx.
      await registrarReceivableEntry(tx, {
        pedidoId: factura.pedidoId,
        facturaId,
        clienteId,
        tipo: 'ABONO',
        monto,
        saldoResultante: Number(updatedFactura.saldo),
        totalPagadoResultante: Number(updatedFactura.montoPagado),
      })

      // Contrato §12: verifica que Pedido.saldo (canónico) y la proyección
      // recién escrita realmente coincidan -- guarda contra un bug futuro
      // que desincronice los dos "Sincronizar Pedido.saldo con Factura.saldo"
      // (línea de arriba) de lo que se registró en ReceivableEntry.
      const pedidoSincronizado = await tx.pedido.findUnique({
        where: { id: factura.pedidoId },
        select: { saldo: true },
      })
      const { divergencia, diferencia } = detectarDivergencia(
        Number(pedidoSincronizado?.saldo ?? 0),
        Number(updatedFactura.saldo),
      )
      if (divergencia) {
        registrarDivergencia({
          pedidoId: factura.pedidoId,
          canonico: Number(pedidoSincronizado?.saldo ?? 0),
          proyeccion: Number(updatedFactura.saldo),
          diferencia,
        })
      }

      // F1 (ADR-CONCURRENCIA-001 / contrato §51): la auditoría se escribe en
      // la MISMA transacción que creó el Abono. Antes corría post-commit con
      // `.catch(() => {})` → un abono podía quedar registrado sin evidencia.
      await logAudit({
        entidad: 'Abono',
        registroId: abono.id,
        accion: 'CREATE',
        datos: { monto, facturaId },
        usuarioId: (authResult.user as { id?: string } | undefined)?.id,
      }, tx)

      return { abono }
    })

    return apiSuccess({ abono: result.abono }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating abono:')
    if (error instanceof Error && error.message === 'FACTURA_NOT_FOUND') {
      return apiError('Factura no encontrada', 404)
    }
    if (error instanceof Error && error.message === 'PEDIDO_NOT_FOUND') {
      return apiError('Pedido asociado a la factura no encontrado', 404)
    }
    if (error instanceof Error && error.message === 'PEDIDO_NO_ENTREGADO') {
      return apiError('No se puede registrar abono: el pedido aun no ha sido entregado', 400)
    }
    if (error instanceof Error && error.message === 'Abono excede saldo de factura') {
      return apiError(error.message, 400)
    }
    return apiError('Error creating abono', 500)
  }
}