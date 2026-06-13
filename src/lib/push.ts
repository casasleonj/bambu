/**
 * Web Push helper.
 *
 * Wraps the `web-push` library with:
 * - Lazy initialization of VAPID keys (only at first send)
 * - Automatic cleanup of expired subscriptions (410 Gone, 404 Not Found)
 * - Bounded parallelism for fan-out (web-push es una lib sync)
 *
 * VAPID keys config (env vars):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  - public key, exposed to browser
 *   VAPID_PRIVATE_KEY             - private key, server-only
 *   VAPID_SUBJECT                 - mailto: or URL (RFC 8292)
 *
 * @see scripts/gen-vapid-keys.ts para generar keys
 */

import webpush, { type PushSubscription as WebPushSub } from 'web-push'
import { prisma } from './prisma'
import { logger } from './logger'

let initialized = false

function ensureInit(): boolean {
  if (initialized) return true
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    logger.warn('[push] VAPID keys no configuradas. Push notifications deshabilitadas.')
    return false
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    initialized = true
    return true
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : 'Unknown' }, '[push] Error setVapidDetails')
    return false
  }
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/**
 * Envia push notification a TODAS las suscripciones activas del sistema.
 *
 * Usado por el cron de alertas: cuando un Caso ALTA se crea, todos los
 * admins reciben un push (incluso si no tienen la pagina abierta).
 *
 * Las suscripciones que devuelven 410 Gone o 404 Not Found se eliminan
 * automaticamente (el browser las invalido).
 *
 * Retorna el numero de notificaciones enviadas exitosamente.
 * Si VAPID no esta configurado, retorna 0 sin error (permite que el
 * resto del sistema funcione sin push configurado en dev).
 */
export async function broadcastPush(payload: PushPayload): Promise<number> {
  if (!ensureInit()) return 0

  const subscriptions = await prisma.pushSubscription.findMany({
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })

  if (subscriptions.length === 0) return 0

  const jsonPayload = JSON.stringify(payload)
  let successCount = 0
  const expired: string[] = []

  // Fan-out: procesa todas en paralelo (web-push es sync por request
  // pero cada send es independiente). Con cap de concurrencia para
  // no saturar el event loop si hay cientos de suscripciones.
  const CONCURRENCY = 10
  for (let i = 0; i < subscriptions.length; i += CONCURRENCY) {
    const batch = subscriptions.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (sub) => {
        const webpushSub: WebPushSub = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        }
        try {
          await webpush.sendNotification(webpushSub, jsonPayload)
          successCount++
          // Update lastSeenAt para garbage collection
          await prisma.pushSubscription.update({
            where: { id: sub.id },
            data: { lastSeenAt: new Date() },
          }).catch(() => undefined) // no-op si falla
        } catch (e: unknown) {
          const statusCode = (e as { statusCode?: number }).statusCode
          if (statusCode === 404 || statusCode === 410) {
            // Suscripcion expirada: marcar para borrar
            expired.push(sub.id)
            logger.info({ endpoint: sub.endpoint.slice(0, 60) }, '[push] Suscripcion expirada (404/410)')
          } else {
            const errMsg = e instanceof Error ? e.message : 'Unknown'
            logger.warn({ err: errMsg, statusCode }, '[push] Error enviando notificacion')
          }
        }
      }),
    )
  }

  // Cleanup: borrar suscripciones expiradas en una sola query
  if (expired.length > 0) {
    try {
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: expired } },
      })
      logger.info({ count: expired.length }, '[push] Suscripciones expiradas eliminadas')
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown'
      logger.warn({ err: errMsg }, '[push] Error eliminando suscripciones expiradas')
    }
  }

  return successCount
}

/**
 * Envia push a las suscripciones de UN usuario especifico.
 * Usado cuando queremos notificar solo al admin asignado al caso
 * (en vez de broadcast a todos).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<number> {
  if (!ensureInit()) return 0

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  })

  if (subscriptions.length === 0) return 0

  const jsonPayload = JSON.stringify(payload)
  let successCount = 0
  const expired: string[] = []

  for (const sub of subscriptions) {
    const webpushSub: WebPushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    }
    try {
      await webpush.sendNotification(webpushSub, jsonPayload)
      successCount++
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { lastSeenAt: new Date() },
      }).catch(() => undefined)
    } catch (e: unknown) {
      const statusCode = (e as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        expired.push(sub.id)
      } else {
        const errMsg = e instanceof Error ? e.message : 'Unknown'
        logger.warn({ err: errMsg, statusCode, userId }, '[push] Error enviando a usuario')
      }
    }
  }

  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: expired } },
    }).catch(() => undefined)
  }

  return successCount
}

/**
 * Test helper: reset initialization state. Solo para tests.
 */
export function __resetPushInitForTests(): void {
  initialized = false
}
