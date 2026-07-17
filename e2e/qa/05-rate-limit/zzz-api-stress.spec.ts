// @tests M5 — API rate-limit stress (429)
// Usa x-forwarded-for único por test para aislar la clave del limiter.
// Si Playwright request no permite setear x-forwarded-for, este test puede
// requerir fallback con IP real (ver reporte M5).

import { test, expect, fullLogin, BASE } from '../../fixtures-paranoid'

test.describe.configure({ mode: 'serial', retries: 0 })

test.describe('M5: API rate-limit stress', () => {
  test.slow()

  test('RL-E2E-04: 300+ requests al mismo IP disparan 429', async ({ page, context }) => {
    await fullLogin(page)
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    const uniqueIp = `1.2.3.${Math.floor(Math.random() * 254) + 1}`

    const reqContext = context.request
    const res = await reqContext.get(`${BASE}/api/productos`, {
      headers: {
        Cookie: cookieHeader,
        'x-forwarded-for': uniqueIp,
      },
    })
    // Sanity: la primera request autentica OK
    expect(res.status()).toBe(200)

    let rateLimited = false
    let totalRequests = 0
    const maxRequests = 400

    for (let i = 0; i < maxRequests; i++) {
      const r = await reqContext.get(`${BASE}/api/productos`, {
        headers: {
          Cookie: cookieHeader,
          'x-forwarded-for': uniqueIp,
        },
      })
      totalRequests++
      const status = r.status()
      if (status === 429) {
        rateLimited = true
        const retryAfter = r.headers()['retry-after']
        expect(retryAfter).toBeTruthy()
        break
      }
    }

    expect(rateLimited).toBe(true)
    expect(totalRequests).toBeGreaterThanOrEqual(300)
  })
})
