import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { AbonoCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { getNextNumero } from '@/lib/sequence'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { searchParams } = new URL(request.url)
  const facturaId = searchParams.get('facturaId')

  try {
    const abonos = await prisma.abono.findMany({
      where: facturaId ? { facturaId } : undefined,
      orderBy: { fecha: 'desc' },
      include: {
        cliente: true,
      },
    })

    return apiSuccess({ abonos })
  } catch (error) {
    console.error('Error fetching abonos:', error instanceof Error ? error.message : 'Unknown')
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
    const { facturaId, clienteId, monto, metodoPago } = parsed.data

    const result = await withAdvisoryLock('ABONO', async (tx) => {
      // Verificar que la factura existe
      const factura = await tx.factura.findUnique({
        where: { id: facturaId },
      })

      if (!factura) {
        throw new Error('FACTURA_NOT_FOUND')
      }

      // Calcular siguiente número
      const nextNum = await getNextNumero(tx, { model: 'abono', field: 'numero' })

      // Crear abono
      const abono = await tx.abono.create({
        data: {
          numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
          facturaId,
          clienteId,
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

      const nuevoEstado = Number(updatedFactura.saldo) === 0 ? 'PAGADA' : 'EMITIDA'
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

      return { abono }
    })

    logAudit({
      entidad: 'Abono',
      registroId: result.abono.id,
      accion: 'CREATE',
      datos: { monto, facturaId },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ abono: result.abono }, 201)
  } catch (error) {
    console.error('Error creating abono:', error instanceof Error ? error.message : 'Unknown')
    if (error instanceof Error && error.message === 'FACTURA_NOT_FOUND') {
      return apiError('Factura no encontrada', 404)
    }
    if (error instanceof Error && error.message === 'Abono excede saldo de factura') {
      return apiError(error.message, 400)
    }
    return apiError('Error creating abono', 500)
  }
}