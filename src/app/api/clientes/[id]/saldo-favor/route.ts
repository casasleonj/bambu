import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { leerSaldoFavorCliente } from '@/lib/saldo-favor-cliente'

/**
 * GET /api/clientes/[id]/saldo-favor (#696) — solo lectura. Saldo a favor del cliente y de dónde viene cada
 * movimiento: entradas por cobro de fiados (con el pedido, la factura y quién recibió el dinero, leídos de la
 * auditoría del cobro) y correcciones, reducciones y anulaciones de pedidos. Lo que no se puede comprobar
 * viene en null: la pantalla lo muestra como «sin dato», nunca como un valor inventado.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const lectura = await leerSaldoFavorCliente(prisma, id)
    if (!lectura) return apiError('Cliente no encontrado', 404)
    return apiSuccess(lectura)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown', clienteId: id }, 'Error leyendo el saldo a favor del cliente')
    return apiError('Error leyendo el saldo a favor del cliente')
  }
}
