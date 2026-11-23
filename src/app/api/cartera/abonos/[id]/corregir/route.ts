import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { CorreccionAbonoSchema } from '@/lib/validators'
import { formatZodError } from '@/lib/utils'
import { withAdvisoryLock, acquireAdvisoryLockTx } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { aplicarReversionMonetaria } from '@/lib/correccion-monetaria'
import { publishRealtimeEvent } from '@/lib/realtime'
import { prisma } from '@/lib/prisma'
import { verificarConsumoBonoAbono } from '@/lib/bono-saldo-favor'

/**
 * POST /api/cartera/abonos/[id]/corregir — ADR-CORRECCION-MONETARIA-001.
 *
 * Revierte (append-only) un `Abono` mal aplicado: crea una `CorreccionAbono`,
 * una `ReceivableEntry` tipo `REVERSION`, y recalcula `Factura` + `Pedido`
 * (saldo/montoPagado/estadoPago). NUNCA edita ni borra el `Abono` original.
 * `tipo = NO_RECIBIDO` abre además un `ResponsibilityCase PAGO_NO_CONFIRMADO`.
 *
 * Roles: ADMIN + CONTADOR (D.2). Idempotente por `correccionOfflineId`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const userId = (authResult.user as { id?: string } | undefined)?.id
  if (!userId) return apiError('Sesión inválida', 401)

  const { id: abonoId } = await params

  try {
    const body = await request.json()
    const parsed = CorreccionAbonoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const { tipo, montoRevertido, motivo, correccionOfflineId } = parsed.data

    // Lectura fuera del lock solo para conocer las claves de los locks (cliente y pedido).
    const abonoPre = await prisma.abono.findUnique({
      where: { id: abonoId },
      select: { clienteId: true, pedidoId: true, factura: { select: { pedidoId: true } } },
    })
    if (!abonoPre) return apiError('Abono no encontrado', 404)

    const result = await withAdvisoryLock('CARTERA', abonoPre.clienteId, async (tx) => {
      // Dedup real por DB (además del lock). El `correccionOfflineId` es único
      // por comando: si ya existe pero para OTRO abono, es un bug del cliente
      // (reusó el id) — devolvemos 409 en vez de deduplicar en silencio la
      // corrección equivocada.
      if (correccionOfflineId) {
        const previa = await tx.correccionAbono.findUnique({ where: { correccionOfflineId } })
        if (previa) {
          if (previa.abonoId !== abonoId) throw new Error('OFFLINE_ID_REUSADO')
          return { correccion: previa, deduped: true as const }
        }
      }

      // #796 (auditoría F5): esta ruta reescribe `totalPagado/saldo` del pedido, igual que los cobros y entregas.
      // Toma también el lock de PEDIDO, en el mismo orden que `pagar-fiado` (CARTERA y luego PEDIDO), para no
      // pisar ni ser pisada por un flujo que solo bloquea el pedido. Se adquiere antes de leer el pedido.
      const pedidoParaLock = abonoPre.pedidoId ?? abonoPre.factura?.pedidoId
      if (pedidoParaLock) await acquireAdvisoryLockTx(tx, 'PEDIDO', pedidoParaLock)

      const abono = await tx.abono.findUnique({
        where: { id: abonoId },
        include: {
          factura: { include: { pedido: { select: { id: true, total: true, totalPagado: true, saldo: true, estadoEntrega: true, estado: true, estadoPago: true } } } },
          correcciones: { select: { montoRevertido: true } },
        },
      })
      if (!abono) throw new Error('ABONO_NOT_FOUND')

      const factura = abono.factura
      const pedido = factura?.pedido ?? null

      // Guard D.4: si el pedido/factura está anulado, la reconciliación va por
      // el camino de anular/cancelar, no por acá.
      if (
        factura?.estado === 'ANULADA' ||
        pedido?.estadoEntrega === 'ANULADO' ||
        pedido?.estado === 'ANULADO'
      ) {
        throw new Error('PEDIDO_ANULADO')
      }

      const montoAbono = Number(abono.monto)
      const yaRevertido = abono.correcciones.reduce((s, c) => s + Number(c.montoRevertido), 0)
      // MONTO admite reversión parcial; el resto revierte el saldo no revertido.
      const revertir =
        tipo === 'MONTO' && montoRevertido != null
          ? Math.round(montoRevertido * 100) / 100
          : Math.round((montoAbono - yaRevertido) * 100) / 100

      if (revertir <= 0) throw new Error('MONTO_INVALIDO')
      if (yaRevertido + revertir > montoAbono + 1e-6) throw new Error('EXCEDE_ABONO')

      // #772: la corrección de un BONO real devuelve crédito ya consumido.
      // Un Abono BONO legado sin marcador NO prueba que alguna vez descontó
      // saldo a favor: devolverle crédito fabricaría un saldo inexistente.
      const creditoBonoRestituible =
        (await verificarConsumoBonoAbono(tx, abono)) ? revertir : 0

      // Número COR-NNNNN — serializado por SECUENCIA:correccionAbono para no
      // colisionar entre correcciones de clientes distintos (MAX+1).
      await acquireAdvisoryLockTx(tx, 'SECUENCIA', 'correccionAbono')
      const num = await getNextNumero(tx, { model: 'correccionAbono', field: 'numero' })

      // D.7 — pago no recibido → investigación vía ResponsibilityCase.
      let responsibilityCaseId: string | null = null
      if (tipo === 'NO_RECIBIDO') {
        const caso = await tx.responsibilityCase.create({
          data: {
            tipo: 'PAGO_NO_CONFIRMADO',
            descripcion: `Abono ${abono.numero} reportado como NO recibido. ${motivo}`,
            montoEstimado: revertir,
            clienteId: abono.clienteId,
          },
        })
        responsibilityCaseId = caso.id
      }

      const correccion = await tx.correccionAbono.create({
        data: {
          numero: `COR-${num.toString().padStart(5, '0')}`,
          abonoId: abono.id,
          tipo,
          montoRevertido: revertir,
          motivo,
          autorizadoPorId: userId,
          responsibilityCaseId,
          // `|| null`: un "" válido para z.string().optional() no debe colisionar
          // en el índice UNIQUE (consistente con abonos/pagar-fiado).
          correccionOfflineId: correccionOfflineId || null,
        },
      })

      // Factura + Pedido + ReceivableEntry REVERSION: un solo cálculo compartido con la corrección de un pago (ADR-002).
      const { efecto, pedidoActualizado, facturaActualizada } = await aplicarReversionMonetaria(tx, {
        pedido: pedido
          ? { id: pedido.id, total: pedido.total, totalPagado: pedido.totalPagado, saldo: pedido.saldo, estadoEntrega: pedido.estadoEntrega, estadoPago: pedido.estadoPago }
          : null,
        factura: factura
          ? { id: factura.id, total: factura.total, montoPagado: factura.montoPagado, saldo: factura.saldo, estado: factura.estado }
          : null,
        clienteId: abono.clienteId,
        revertir,
        correccionOfflineId: correccionOfflineId || null,
      })

      if (creditoBonoRestituible > 0) {
        // Misma transacción que la reversión de Factura/Pedido y el historial.
        // Reintentos deduplicados retornan antes de esta línea.
        await tx.cliente.update({
          where: { id: abono.clienteId },
          data: { saldoFavor: { increment: creditoBonoRestituible } },
        })
      }

      await logAudit(
        {
          entidad: 'Abono',
          registroId: abono.id,
          accion: 'UPDATE',
          datos: {
            accion: 'CORRECCION',
            correccionNumero: correccion.numero,
            tipo,
            montoRevertido: revertir,
            creditoBonoRestituido: creditoBonoRestituible,
            motivo,
            responsibilityCaseId,
            // Condición 3 del PO: valores anteriores y posteriores de lo que cambió.
            antes: { pedido: efecto.pedido?.antes ?? null, factura: efecto.factura?.antes ?? null },
            despues: { pedido: efecto.pedido?.despues ?? null, factura: efecto.factura?.despues ?? null },
          },
          usuarioId: userId,
        },
        tx,
      )

      return {
        correccion,
        factura: facturaActualizada,
        pedido: pedidoActualizado,
        clienteId: abono.clienteId,
        pedidoId: pedido?.id ?? null,
        deduped: false as const,
      }
    })

    if (!result.deduped) {
      publishRealtimeEvent('pago.created', result.clienteId).catch(() => {})
      if (result.pedidoId) publishRealtimeEvent('pedido.updated', result.pedidoId).catch(() => {})
    }

    return apiSuccess(
      result.deduped
        ? { correccion: result.correccion, deduped: true }
        : { correccion: result.correccion, factura: result.factura, pedido: result.pedido },
      result.deduped ? 200 : 201,
    )
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    if (msg === 'ABONO_NOT_FOUND') return apiError('Abono no encontrado', 404)
    if (msg === 'PEDIDO_ANULADO') {
      return apiError('El pedido/factura está anulado: la reversión va por el flujo de anulación', 409)
    }
    if (msg === 'BONO_AUDITORIA_INVALIDA') return apiError('La procedencia del BONO requiere conciliación; no se modificó el abono.', 409, { code: 'BONO_AUDITORIA_INVALIDA' })
    if (msg === 'MONTO_INVALIDO') return apiError('El monto a revertir debe ser mayor a 0', 400)
    if (msg === 'EXCEDE_ABONO') return apiError('El monto a revertir excede el saldo no revertido del abono', 400)
    if (msg === 'OFFLINE_ID_REUSADO') {
      return apiError('El correccionOfflineId ya se usó para corregir otro abono', 409)
    }
    logger.error({ err: msg, abonoId }, 'Error corrigiendo abono')
    return apiError('Error procesando la corrección', 500)
  }
}
