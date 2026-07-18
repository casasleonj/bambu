import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { logger } from './logger'

// Configuration:
// - Local/dev: uses in-memory limiter (per-process, fine for single instance)
// - Production (serverless, multi-instance): requires REDIS_URL for distributed rate limit
//   Without Redis in prod, rate limits are per-instance, effectively bypassable.
//
// NOTE: solo dos buckets están activos en producción:
//   - 'api'    → aplicado por src/proxy.ts a todas las rutas /api/* (excepto health/cron).
//   - 'realtime' → aplicado por src/app/api/realtime/route.ts por user.id.
// Los buckets 'auth' y 'page' existían históricamente pero nunca fueron
// ejecutados por proxy.ts (el matcher excluye /api/auth/* y el proxy nunca
// rate limitó rutas de página). Se eliminaron para reducir deuda técnica.

const redisUrl = process.env.REDIS_URL

export const LIMITS = {
  api: { points: 300, duration: 60, blockDuration: 0 },
  // SSE realtime: allow a small number of connections per user to prevent
  // runaway consumption from many tabs or aggressive reconnects.
  // Each refresh consumes one point; 6 points per minute is enough for normal
  // use while capping abuse.
  // Configurable via env to tune cost vs freshness per deployment.
  realtime: {
    points: Math.max(1, Number(process.env.REALTIME_RATE_LIMIT_POINTS ?? 6) || 6),
    duration: Math.max(1, Number(process.env.REALTIME_RATE_LIMIT_DURATION_SEC ?? 60) || 60),
    blockDuration: Math.max(0, Number(process.env.REALTIME_RATE_LIMIT_BLOCK_DURATION_SEC ?? 0) || 0),
  },
} as const

export type RateLimitType = keyof typeof LIMITS

type AnyLimiter = RateLimiterMemory | RateLimiterRedis
const limiters = new Map<string, AnyLimiter>()

// Lazy Redis client — only imported when REDIS_URL is set
// Using a minimal interface that matches what rate-limiter-flexible needs
type RedisStoreClient = {
  on: (event: string, listener: (err: Error) => void) => void
  connect: () => Promise<void>
}
let redisClient: RedisStoreClient | null = null
async function getRedisClient() {
  if (redisClient !== null) return redisClient
  if (!redisUrl) return null
  try {
    // Dynamic import avoids bundling redis in edge runtime
    const { createClient } = await import('redis')
    const client = createClient({
      url: redisUrl,
      // Disable offline queue per rate-limiter-flexible docs:
      // prevents request storms when Redis reconnects after downtime
      disableOfflineQueue: true,
      socket: {
        connectTimeout: 5000,
      },
    })
    client.on('error', (err: Error) => logger.error({ err }, 'Redis error'))
    await client.connect()
    redisClient = client as unknown as RedisStoreClient
    return client
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis, falling back to memory')
    redisClient = null
    return null
  }
}

async function getLimiter(type: RateLimitType): Promise<AnyLimiter> {
  const cached = limiters.get(type)
  if (cached) return cached

  const cfg = LIMITS[type]

  // Try Redis first if configured
  if (redisUrl) {
    const client = await getRedisClient()
    if (client) {
      const opts = {
        storeClient: client,
        keyPrefix: `rl_${type}`,
        points: cfg.points,
        duration: cfg.duration,
        blockDuration: cfg.blockDuration,
        // useRedisPackage: true — required for redis v5+ package
        // (auto-detection fails because constructor name is "Class" not "Commander")
        useRedisPackage: true,
        // insuranceLimiter: memory fallback when Redis is unreachable
        insuranceLimiter: new RateLimiterMemory({
          keyPrefix: `rl_${type}_backup`,
          points: cfg.points,
          duration: cfg.duration,
        }),
        // Fail-open on Redis errors (network hiccup shouldn't block legit traffic)
        // Block in memory once points are fully consumed to avoid extra Redis round-trips
        inMemoryBlockOnConsumed: cfg.points,
        inMemoryBlockDuration: cfg.blockDuration || 60,
      } as const
      const limiter = new RateLimiterRedis(opts)
      limiters.set(type, limiter)
      return limiter
    }
  }

  // Fallback: in-memory (dev or Redis unreachable)
  const limiter = new RateLimiterMemory({
    keyPrefix: `rl_${type}`,
    points: cfg.points,
    duration: cfg.duration,
  })
  limiters.set(type, limiter)
  return limiter
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetTime: Date
  retryAfter?: number
}

export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = 'api'
): Promise<RateLimitResult> {
  const cfg = LIMITS[type]

  // FIX: timeout global de 3s para checkRateLimit. En Vercel serverless,
  // cada cold start crea una nueva conexión a Redis. Si el TLS handshake
  // + auth tarda >3s (Upstash en otro datacenter, cold start severo),
  // el proxy se cuelga y el request nunca llega al endpoint. Con timeout
  // 3s, fallamos rápido y usamos el fallback de memoria (insuranceLimiter)
  // en lugar de colgar el proxy. El insuranceLimiter ya existe como
  // fallback de RateLimiterRedis.
  const TIMEOUT_MS = 3_000
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('REDIS_TIMEOUT')), TIMEOUT_MS)
  })

  try {
    const limiter = await Promise.race([getLimiter(type), timeoutPromise])
    const res = await limiter.consume(identifier, 1)
    return {
      allowed: true,
      limit: cfg.points,
      remaining: res.remainingPoints,
      resetTime: new Date(Date.now() + res.msBeforeNext),
    }
  } catch (rej) {
    if (rej instanceof RateLimiterRes) {
      return {
        allowed: false,
        limit: cfg.points,
        remaining: 0,
        resetTime: new Date(Date.now() + rej.msBeforeNext),
        retryAfter: Math.ceil(rej.msBeforeNext / 1000),
      }
    }
    if (rej instanceof Error && rej.message === 'REDIS_TIMEOUT') {
      // Redis no respondió en 3s. Usar fallback de memoria para no colgar
      // el proxy. El usuario no nota diferencia (memoria tiene los mismos
      // límites). Log para monitoreo.
      logger.warn({ type }, 'checkRateLimit: Redis timeout, usando fallback de memoria')
      const fallback = new RateLimiterMemory({
        keyPrefix: `rl_${type}_fallback`,
        points: cfg.points,
        duration: cfg.duration,
      })
      try {
        const res = await fallback.consume(identifier, 1)
        return {
          allowed: true,
          limit: cfg.points,
          remaining: res.remainingPoints,
          resetTime: new Date(Date.now() + res.msBeforeNext),
        }
      } catch (fallbackRej) {
        if (fallbackRej instanceof RateLimiterRes) {
          return {
            allowed: false,
            limit: cfg.points,
            remaining: 0,
            resetTime: new Date(Date.now() + fallbackRej.msBeforeNext),
            retryAfter: Math.ceil(fallbackRej.msBeforeNext / 1000),
          }
        }
        throw fallbackRej
      }
    }
    // Redis down / error interno del limiter: fall-open degradado para no
    // tumbar toda la app. Se mantiene 10% capacity como circuit breaker.
    logger.error('[RATE-LIMIT] Internal error — circuit breaker engaged with 10% capacity')
    return {
      allowed: true,
      limit: Math.max(1, Math.floor(cfg.points * 0.1)),
      remaining: 0,
      resetTime: new Date(Date.now() + 60000),
    }
  }
}

export async function resetRateLimit(identifier: string, type: RateLimitType): Promise<void> {
  const limiter = await getLimiter(type)
  try {
    await limiter.delete(identifier)
  } catch {
    // Key may not exist
  }
}
