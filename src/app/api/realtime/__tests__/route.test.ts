// @tests /api/realtime SSE rate_limited contract (M5)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from '@/app/api/realtime/route'

async function readResponseBody(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: (Uint8Array | string)[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks.map((c) => (typeof c === 'string' ? c : new TextDecoder().decode(c))).join('')
}

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/realtime', () => ({
  getRealtimeChannel: vi.fn(() => 'bambu:events'),
}))

import { auth } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'

describe('M5: /api/realtime rate-limit contract', () => {
  const mockedAuth = vi.mocked(auth as unknown as () => Promise<any>)
  const mockedCheckRateLimit = vi.mocked(checkRateLimit)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('retorna 401 cuando no hay sesión', async () => {
    mockedAuth.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/api/realtime'))
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Unauthorized')
  })

  it('retorna 503 cuando no hay REDIS_URL y rate limit permite', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      limit: 6,
      remaining: 5,
      resetTime: new Date(),
    })
    vi.stubEnv('REDIS_URL', '')

    const res = await GET(new Request('http://localhost/api/realtime'))
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('Realtime not configured')
  })

  it('retorna 200 SSE con evento rate_limited cuando checkRateLimit bloquea', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      limit: 6,
      remaining: 0,
      resetTime: new Date(Date.now() + 60_000),
      retryAfter: 60,
    })

    const res = await GET(new Request('http://localhost/api/realtime'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Connection')).toBe('close')
    expect(res.headers.get('Retry-After')).toBe('60')

    const body = await readResponseBody(res)
    expect(body).toContain('event: rate_limited')
    expect(body).toContain('"retryAfter":60')
  })

  it('usa user.id como identificador de rate limit', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'user-42' } } as any)
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      limit: 6,
      remaining: 0,
      resetTime: new Date(Date.now() + 30_000),
      retryAfter: 30,
    })

    await GET(new Request('http://localhost/api/realtime'))
    expect(mockedCheckRateLimit).toHaveBeenCalledWith('user-42', 'realtime')
  })
})
