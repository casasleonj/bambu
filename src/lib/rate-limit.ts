import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible'
import { logger } from './logger'

// Configuration:
// - Local/dev: uses in-memory limiter (per-process, fine for single instance)
// - Production (serverless, multi-instance): requires REDIS_URL for distributed rate limit
//   Without Redis in prod, rate limits are per-instance, effectively bypassable.

const isDev = process.env.NODE_ENV === 'development'
const redisUrl = process.env.REDIS_URL

const LIMITS = {
  auth: isDev
    ? { points: 1000, duration: 60, blockDuration: 0 }
    : { points: 10, duration: 15 * 60, blockDuration: 30 * 60 }, // 10 per 15 min, block 30 min after exhaustion
  api: { points: 300, duration: 60, blockDuration: 0 },
  page: { points: 600, duration: 60, blockDuration: 0 },
  // SSE realtime: allow a small number of connections per user to prevent
  // runaway consumption from many tabs or aggressive reconnects.
  // Each refresh consumes one point; 2 points per minute is enough for normal
  // use while capping abuse.
  realtime: { points: 2, duration: 60, blockDuration: 0 },
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
  const limiter = await getLimiter(type)

  try {
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
    // FIX Fase 4 §4.1: FAIL-CLOSED para auth, FAIL-OPEN degradado para
    // el resto. OWASP Authentication Cheat Sheet recomienda fail-closed
    // cuando el rate-limiter no está disponible: rechazar es preferible
    // a permitir intentos de credential stuffing sin protección.
    //
    // Para api/page, mantener el comportamiento degradado (10% capacity)
    // es operacional: si Redis cae, no queremos tumbar toda la app.
    if (type === 'auth') {
      logger.error(
        '[RATE-LIMIT auth] Internal error — FAIL-CLOSED. Login rejected. ' +
        'Verificar Redis (production) o insuranceLimiter (fallback).',
      )
      return {
        allowed: false,
        limit: cfg.points,
        remaining: 0,
        resetTime: new Date(Date.now() + 60_000),
        retryAfter: 60,
      }
    }
    // API/page: circuit breaker con 10% capacity (comportamiento previo).
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

export function classifyRequest(pathname: string): RateLimitType {
  // S-2 fix: stricter rate limit only for the login callback (where brute
  // force attacks happen). Other /api/auth/* endpoints (profile,
  // force-password-change) are admin-only and use the more permissive
  // 'api' limit.
  if (
    pathname.startsWith('/api/auth/') &&
    (pathname.includes('/callback/credentials') ||
     pathname.endsWith('/signin') ||
     pathname.endsWith('/signin/credentials'))
  ) {
    return 'auth'
  }
  if (pathname.startsWith('/api/')) return 'api'
  return 'page'
}
