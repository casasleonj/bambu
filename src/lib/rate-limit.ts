import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes, IRateLimiterStoreOptions } from 'rate-limiter-flexible'

// Configuration:
// - Local/dev: uses in-memory limiter (per-process, fine for single instance)
// - Production (serverless, multi-instance): requires REDIS_URL for distributed rate limit
//   Without Redis in prod, rate limits are per-instance, effectively bypassable.

const isDev = process.env.NODE_ENV === 'development'
const redisUrl = process.env.REDIS_URL

const LIMITS = {
  auth: isDev
    ? { points: 1000, duration: 60 }
    : { points: 10, duration: 15 * 60 }, // 10 per 15 min in prod (stricter brute-force)
  api: { points: 300, duration: 60 },
  page: { points: 600, duration: 60 },
} as const

export type RateLimitType = keyof typeof LIMITS

type AnyLimiter = RateLimiterMemory | RateLimiterRedis
const limiters = new Map<string, AnyLimiter>()

// Lazy Redis client — only imported when REDIS_URL is set
let redisClient: unknown = null
async function getRedisClient() {
  if (redisClient !== null) return redisClient
  if (!redisUrl) return null
  try {
    // Dynamic import avoids bundling redis in edge runtime
    const { createClient } = await import('redis')
    const client = createClient({ url: redisUrl })
    client.on('error', (err: Error) => console.error('Redis error:', err.message))
    await client.connect()
    redisClient = client
    return client
  } catch (err) {
    console.error('Failed to connect to Redis, falling back to memory')
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
      const opts: IRateLimiterStoreOptions = {
        storeClient: client,
        keyPrefix: `rl_${type}`,
        points: cfg.points,
        duration: cfg.duration,
        // Fail-open on Redis errors (network hiccup shouldn't block legit traffic)
        // but still records the failure for observability
        inMemoryBlockOnConsumed: cfg.points + 1,
        inMemoryBlockDuration: 60,
      }
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
    // Real error (Redis down etc): log and fail-open but loudly
    console.error('Rate limiter internal error, failing open')
    return {
      allowed: true,
      limit: cfg.points,
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
  if (pathname.startsWith('/api/auth/')) return 'auth'
  if (pathname.startsWith('/api/')) return 'api'
  return 'page'
}
