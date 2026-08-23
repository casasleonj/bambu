// @tests M5 — API rate-limit stress (429)
// Usa x-forwarded-for único por test para aislar la clave del limiter.
// Si Playwright request no permite setear x-forwarded-for, este test puede
// requerir fallback con IP real (ver reporte M5).

import { test, expect, fullLogin, BASE } from '../../fixtures-paranoid'
import { CI_API_RATE_LIMIT_POINTS } from '../../ci-rate-limit-config'

test.describe.configure({ mode: 'serial', retries: 0 })

test.describe('M5: API rate-limit stress', () => {
  test.slow()

  test('RL-E2E-04: N+ requests al mismo IP disparan 429', async ({ page, context }) => {
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

    // FIX: playwright.config.ts relaja API_RATE_LIMIT_POINTS a
    // CI_API_RATE_LIMIT_POINTS (ver e2e/ci-rate-limit-config.ts) SOLO en CI,
    // para que el balde compartido por IP real del runner (127.0.0.1, todo
    // tráfico de browser en E2E sin x-forwarded-for propio) no agote el
    // límite de producción (300/60s) con el volumen agregado de cientos de
    // tests seriales -- ver src/lib/rate-limit.ts. Este test usa su propia
    // IP sintética aislada (no comparte balde con nada más), pero el límite
    // de puntos del limiter es global por tipo, no por key -- se ve
    // afectado igual. Se deriva el umbral real esperado de la misma
    // constante (import, no env var: webServer.env no llega al proceso de
    // Playwright) en vez de hardcodear 300, para no romper este test cada
    // vez que se ajuste el override de CI.
    const effectiveLimit = process.env.CI ? CI_API_RATE_LIMIT_POINTS : 300
    test.setTimeout(Math.max(90_000, effectiveLimit * 300))

    let rateLimited = false
    let totalRequests = 0
    const maxRequests = effectiveLimit + 100

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
    expect(totalRequests).toBeGreaterThanOrEqual(effectiveLimit)
  })
})
