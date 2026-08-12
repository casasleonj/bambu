import { prisma } from '@/lib/prisma'
import type { NotificationEventType } from './event-types'

/**
 * Resuelve los userIds que deben recibir push para un tipo de evento,
 * según la NotificationRule configurada (roles + usuarios específicos).
 *
 * Sin regla, regla deshabilitada, o regla vacía → [] (no-op seguro).
 * Nunca lanza — el caller (notifyEvent) decide qué hacer con errores.
 */
export async function resolveRecipients(eventType: NotificationEventType): Promise<string[]> {
  const rule = await prisma.notificationRule.findUnique({
    where: { eventType },
    include: {
      targetUsers: {
        select: { user: { select: { id: true, activo: true } } },
      },
    },
  })

  if (!rule || !rule.enabled) return []

  const roleUserIds =
    rule.roles.length > 0
      ? (
          await prisma.user.findMany({
            where: { rol: { in: rule.roles }, activo: true },
            select: { id: true },
          })
        ).map((u) => u.id)
      : []

  const explicitUserIds = rule.targetUsers
    .map((t) => t.user)
    .filter((u) => u.activo)
    .map((u) => u.id)

  return Array.from(new Set([...roleUserIds, ...explicitUserIds]))
}
