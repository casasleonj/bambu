import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { creditoNetoDelPedido, proyectarReversionCredito } from '@/modules/pedidos/application/services/saldo-favor-excedente.service'

/**
 * GET /api/pedidos/[id]/saldo-favor (#577) — solo lectura. Lo que la pantalla necesita para no dejar
 * al usuario perdido cuando un pedido tiene (o tuvo) dinero pasado a saldo a favor:
 *  - `proyeccion`: qué pasaría con el saldo a favor si el pedido se anulara o cancelara AHORA
 *    (null cuando el pedido ya está anulado o cancelado).
 *  - `resultado`: en un pedido ya anulado o cancelado, cuánto se restó y cuánto no se pudo restar
 *    porque el cliente ya lo había usado en otros pedidos.
 *  - `movimientos`: historial del pedido (pasó al saldo a favor, se reaplicó, se restó al anular).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id },
      select: {
        id: true, numero: true, clienteId: true, estadoEntrega: true,
        cliente: { select: { nombre: true, apellido: true } },
        negocio: { select: { nombre: true } },
      },
    })
    if (!pedido) return apiError('Pedido no encontrado', 404)

    const filas = await prisma.pedidoSaldoFavorMovimiento.findMany({
      where: { pedidoId: id },
      orderBy: { createdAt: 'asc' },
      include: { autor: { select: { nombre: true, apellido: true } } },
    })
    const movimientos = filas.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      monto: Number(m.monto),
      origenTipo: m.origenTipo,
      motivo: m.motivo,
      fecha: m.createdAt.toISOString(),
      autor: [m.autor.nombre, m.autor.apellido].filter(Boolean).join(' ').trim(),
    }))

    const terminal = pedido.estadoEntrega === 'ANULADO' || pedido.estadoEntrega === 'CANCELADO'
    const proyeccion = terminal ? null : await proyectarReversionCredito(prisma, id, pedido.clienteId)
    const resultado = terminal && movimientos.length > 0
      ? {
          revertido: movimientos.filter((m) => m.tipo === 'REVERSION_ANULACION').reduce((s, m) => s + Math.round(m.monto * 100), 0) / 100,
          yaUsado: await creditoNetoDelPedido(prisma, id),
        }
      : null

    return apiSuccess({
      pedido: { id: pedido.id, numero: pedido.numero, estadoEntrega: pedido.estadoEntrega },
      cliente: {
        titular: [pedido.cliente.nombre, pedido.cliente.apellido].filter(Boolean).join(' ').trim(),
        tienda: pedido.negocio?.nombre ?? null,
      },
      proyeccion,
      resultado,
      movimientos,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error leyendo saldo a favor del pedido')
    return apiError('Error leyendo el saldo a favor del pedido')
  }
}
