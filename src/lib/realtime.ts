import { logger } from './logger'

/**
 * Realtime event publisher using Redis Pub/Sub.
 *
 * Architecture:
 * - Backend: after a successful mutation, call publishRealtimeEvent(type, id).
 *   This PUBLISHes a small JSON message to the 'bambu:events' channel.
 * - SSE endpoint (/api/realtime): each connected client subscribes to the same
 *   Redis channel and forwards events as text/event-stream.
 * - Frontend: a single EventSource is shared via RealtimeProvider; screens
 *   subscribe to event patterns and refetch their data when a matching event
 *   arrives.
 */

export type RealtimeEntity =
  | 'cliente'
  | 'pedido'
  | 'embarque'
  | 'pago'
  | 'gasto'
  | 'compra'
  | 'produccion'

export type RealtimeAction = 'created' | 'updated' | 'deleted'

export type RealtimeEventType = `${RealtimeEntity}.${RealtimeAction}`

export interface RealtimeEvent {
  type: RealtimeEventType
  id: string
  timestamp: string
}

const REALTIME_CHANNEL = 'bambu:events'

let publisherClient: ReturnType<typeof import('redis').createClient> | null = null

async function getPublisherClient(): Promise<ReturnType<typeof import('redis').createClient> | null> {
  if (publisherClient) return publisherClient
  if (!process.env.REDIS_URL) return null

  try {
    const { createClient } = await import('redis')
    const client = createClient({
      url: process.env.REDIS_URL,
      disableOfflineQueue: true,
    })
    client.on('error', (err: Error) => {
      logger.error({ err }, 'Realtime Redis publisher error')
    })
    await client.connect()
    publisherClient = client
    return client
  } catch (err) {
    logger.error({ err }, 'Failed to connect realtime Redis publisher')
    publisherClient = null
    return null
  }
}

export async function publishRealtimeEvent(
  type: RealtimeEventType,
  id: string,
): Promise<void> {
  const client = await getPublisherClient()
  if (!client) {
    // Redis not configured — realtime silently disabled. This keeps the app
    // working in dev without Redis, while degrading gracefully.
    return
  }

  const event: RealtimeEvent = {
    type,
    id,
    timestamp: new Date().toISOString(),
  }

  try {
    await client.publish(REALTIME_CHANNEL, JSON.stringify(event))
  } catch (err) {
    logger.error({ err, type, id }, 'Failed to publish realtime event')
  }
}

export function getRealtimeChannel(): string {
  return REALTIME_CHANNEL
}
