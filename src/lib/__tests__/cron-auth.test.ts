import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { requireCronSecret } from '../cron-auth'

const ORIGINAL_ENV = process.env.CRON_SECRET

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('https://example.com/api/cron/alertas-batch', { headers })
}

describe('requireCronSecret', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
  })

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV
  })

  it('autoriza con x-cron-secret correcto (invocación manual/CI)', () => {
    const req = makeRequest({ 'x-cron-secret': 'test-secret' })
    expect(requireCronSecret(req)).toBeNull()
  })

  it('autoriza con Authorization: Bearer <CRON_SECRET> (formato que usa Vercel Cron)', () => {
    const req = makeRequest({ authorization: 'Bearer test-secret' })
    expect(requireCronSecret(req)).toBeNull()
  })

  it('rechaza si ninguno de los dos headers coincide', async () => {
    const req = makeRequest({ 'x-cron-secret': 'wrong' })
    const res = requireCronSecret(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(401)
  })

  it('rechaza si CRON_SECRET no está configurado', () => {
    delete process.env.CRON_SECRET
    const req = makeRequest({ 'x-cron-secret': 'anything' })
    const res = requireCronSecret(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(401)
  })

  it('sin ningún header, rechaza', () => {
    const req = makeRequest({})
    const res = requireCronSecret(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(401)
  })
})
