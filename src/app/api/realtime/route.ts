import { logger } from '@/lib/logger'
import { auth } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { getRealtimeChannel, type RealtimeEvent } from '@/lib/realtime'

// SSE connection lifetime. 300s matches Vercel Pro max; Hobby runtime caps
// to 60s automatically. Configurable via env to tune cost vs freshness.
export const maxDuration = Number(process.env.REALTIME_MAX_DURATION ?? 300)
export const dynamic = 'force-dynamic'

const HEARTBEAT_INTERVAL_MS = 45_000

/**
 * Server-Sent Events endpoint for realtime updates.
 *
 * Each client opens a long-lived HTTP connection. The server subscribes to
 * Redis 'bambu:events' and forwards every published event as an SSE message.
 *
 * Auth: relies on the session cookie automatically sent by the browser for
 * same-origin EventSource requests. We validate it with auth() before keeping
 * the connection open.
 */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Rate limit realtime connections per user to prevent runaway consumption
  // from many tabs, aggressive reconnects, or misbehaving clients.
  const rateLimit = await checkRateLimit(session.user.id, 'realtime')
  if (!rateLimit.allowed) {
    // Return a valid SSE stream with a rate_limited event instead of a plain
    // 429. Native EventSource implementations may auto-reconnect aggressively
    // on non-event-stream error responses, causing a request storm. A 200
    // text/event-stream response lets the client parse the event and back off.
    const retryAfter = rateLimit.retryAfter ?? 60
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(sseEvent('rate_limited', { retryAfter }))
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Retry-After': String(retryAfter),
        Connection: 'close',
      },
    })
  }

  if (!process.env.REDIS_URL) {
    return new Response('Realtime not configured', { status: 503 })
  }

  const { createClient } = await import('redis')
  const subscriber = createClient({
    url: process.env.REDIS_URL,
    disableOfflineQueue: true,
  })

  subscriber.on('error', (err: Error) => {
    logger.error({ err, userId: session.user?.id }, 'Realtime SSE Redis subscriber error')
  })

  await subscriber.connect()

  const channel = getRealtimeChannel()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection ack so the client knows it's alive.
      controller.enqueue(sseEvent('connected', { timestamp: new Date().toISOString() }))

      const onMessage = (message: string) => {
        try {
          const event = JSON.parse(message) as RealtimeEvent
          controller.enqueue(sseEvent('message', event))
        } catch (err) {
          logger.error({ err, message }, 'Failed to parse realtime message')
        }
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(sseEvent('heartbeat', { timestamp: new Date().toISOString() }))
        } catch {
          // Stream already closed; interval will be cleaned up on close.
        }
      }, HEARTBEAT_INTERVAL_MS)

      subscriber.subscribe(channel, onMessage).catch((err: Error) => {
        logger.error({ err }, 'Failed to subscribe to realtime channel')
        controller.error(err)
      })

      // Cleanup when the client disconnects or the function times out.
      const cleanup = () => {
        clearInterval(heartbeat)
        subscriber.unsubscribe(channel).catch(() => {
          // Ignore unsubscribe errors during cleanup.
        })
        subscriber.quit().catch(() => {
          // Ignore quit errors during cleanup.
        })
      }

      request.signal.addEventListener('abort', cleanup, { once: true })
    },
    cancel() {
      // Force cleanup when the stream is cancelled.
      subscriber.unsubscribe(channel).catch(() => {})
      subscriber.quit().catch(() => {})
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

function sseEvent(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
}
