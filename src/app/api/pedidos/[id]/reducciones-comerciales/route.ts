import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/pedidos/[id]/reducciones-comerciales — historial de reducciones del pedido, si quien
 * consulta puede autorizar y los datos que la pantalla propone sin pedírselos al usuario:
 * la tienda del pedido, su titular y los contactos del cliente (quién pudo aceptar).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const { id } = await params

  try {
    const [filas, yo, pedido] = await Promise.all([
      prisma.pedidoReduccionComercial.findMany({
        where: { pedidoId: id },
        orderBy: { solicitadoAt: 'desc' },
        include: {
          solicitadoPor: { select: { id: true, nombre: true } },
          resueltoPor: { select: { id: true, nombre: true } },
          notaCredito: { select: { numero: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: auth.user?.id ?? '' },
        select: { activo: true, rol: true, nombre: true, apellido: true, puedeAutorizarReduccionComercial: true },
      }),
      prisma.pedido.findUnique({
        where: { id },
        select: {
          cliente: {
            select: { nombre: true, apellido: true, contactos: { orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, relacion: true } } },
          },
          negocio: { select: { nombre: true } },
        },
      }),
    ])
    if (!pedido) return apiError('Pedido no encontrado', 404)
    const titular = [pedido.cliente.nombre, pedido.cliente.apellido].filter(Boolean).join(' ').trim()
    return apiSuccess({
      yo: { nombre: [yo?.nombre, yo?.apellido].filter(Boolean).join(' ').trim() },
      puedeAutorizar: Boolean(yo?.activo && yo.puedeAutorizarReduccionComercial && (yo.rol === 'ADMIN' || yo.rol === 'ASISTENTE')),
      cliente: { titular, tienda: pedido.negocio?.nombre ?? null, contactos: pedido.cliente.contactos },
      reducciones: filas.map((c) => ({
        ...c,
        precio: Number(c.precio),
        monto: Number(c.monto),
        totalAntes: c.totalAntes === null ? null : Number(c.totalAntes),
        totalDespues: c.totalDespues === null ? null : Number(c.totalDespues),
      })),
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error listando reducciones comerciales')
    return apiError('Error al listar las reducciones del pedido', 500)
  }
}
