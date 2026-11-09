import type { Prisma } from '@prisma/client'
import { getConfig } from '@/lib/config'
import { ROLES_QUE_PUEDEN_CONFIRMAR_PAGOS, rolPuedeConfirmarPagos } from '@/lib/confirmador-roles'

/**
 * #406 — Quién confirma pagos digitales.
 *
 * Es un permiso por persona (`User.puedeConfirmarPagos`, la casilla «Puede confirmar pagos» de Usuarios), igual que
 * el de autorizar excepciones de crédito. Pueden ser varias personas. El Repartidor no puede tenerlo: confirmaría
 * pagos que él mismo cobra. Un usuario inactivo no confirma.
 *
 * Compatibilidad: si `Config.USUARIO_CONFIRMA_PAGOS` (el mecanismo anterior, de una sola persona) apunta a un usuario
 * activo que no sea Repartidor, también confirma. En producción esa clave nunca se guardó.
 */

export { ROLES_QUE_PUEDEN_CONFIRMAR_PAGOS, rolPuedeConfirmarPagos }

type Db = Pick<Prisma.TransactionClient, 'user'>

export async function puedeConfirmarPagos(db: Db, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  const u = await db.user.findUnique({ where: { id: userId }, select: { activo: true, rol: true, puedeConfirmarPagos: true } })
  if (!u || !u.activo || !rolPuedeConfirmarPagos(u.rol)) return false
  if (u.puedeConfirmarPagos) return true
  const heredado = await getConfig('USUARIO_CONFIRMA_PAGOS').catch(() => null)
  return !!heredado && heredado === userId
}

/** Para el aviso del cierre: nombres de quienes confirman (activos, con rol válido). */
export async function listarConfirmadoresDePagos(db: Db): Promise<string[]> {
  const us = await db.user.findMany({
    where: { activo: true, puedeConfirmarPagos: true, rol: { in: [...ROLES_QUE_PUEDEN_CONFIRMAR_PAGOS] } },
    select: { nombre: true, apellido: true, username: true },
    orderBy: [{ nombre: 'asc' }, { username: 'asc' }],
  })
  return us.map((u) => [u.nombre, u.apellido].filter(Boolean).join(' ').trim() || u.username)
}
