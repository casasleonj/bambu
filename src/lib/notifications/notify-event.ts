import { sendPushToUser } from '@/lib/push'
import { logger } from '@/lib/logger'
import { resolveRecipients } from './resolve-recipients'
import { NOTIFICATION_EVENT_META, type NotificationEventType } from './event-types'

export interface NotifyEventPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

const CONCURRENCY = 10

/**
 * Fan-out fire-and-forget: resuelve destinatarios via NotificationRule
 * y manda un push dirigido (sendPushToUser) a cada uno — nunca
 * broadcastPush (eso manda a TODAS las suscripciones sin filtrar).
 *
 * Nunca lanza — los call sites siempre invocan esto como
 * `void notifyEvent(...)`, igual que ya se hacía con broadcastPush.
 */
export async function notifyEvent(
  eventType: NotificationEventType,
  payload: NotifyEventPayload,
): Promise<void> {
  try {
    const userIds = await resolveRecipients(eventType)
    if (userIds.length === 0) return

    const persistent = NOTIFICATION_EVENT_META[eventType].persistent

    for (let i = 0; i < userIds.length; i += CONCURRENCY) {
      const batch = userIds.slice(i, i + CONCURRENCY)
      await Promise.all(
        batch.map((userId) =>
          sendPushToUser(userId, { ...payload, persistent }).catch(() => undefined),
        ),
      )
    }
  } catch (e) {
    logger.warn(
      { err: e instanceof Error ? e.message : 'Unknown', eventType },
      '[notifications] notifyEvent failed',
    )
  }
}
