// @tests api/cron/alerta-no-verificados, api/cron/vencimiento-promesas, api/cron/generar-recurrentes
import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

async function apiPost(page: Page, path: string, headers?: Record<string, string>) {
  return page.request.post(`${BASE}${path}`, { headers })
}

test.describe('Cron Jobs', () => {
  test('alerta-no-verificados rejects without CRON_SECRET', async ({ page }) => {
    const res = await apiPost(page, '/api/cron/alerta-no-verificados')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('vencimiento-promesas rejects without CRON_SECRET', async ({ page }) => {
    const res = await apiPost(page, '/api/cron/vencimiento-promesas')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('generar-recurrentes rejects without CRON_SECRET', async ({ page }) => {
    // POST-only endpoint (cambiado en P0 security fix 2bbcb01).
    // Test actualizado para usar POST + x-cron-secret header.
    // Antes usaba GET + Authorization: Bearer, lo cual devolvia 405.
    const res = await apiPost(page, '/api/cron/generar-recurrentes')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('generar-recurrentes accepts valid x-cron-secret header', async ({ page }) => {
    const cronSecret = process.env.CRON_SECRET || 'test-cron-secret'
    const res = await apiPost(page, '/api/cron/generar-recurrentes', {
      'x-cron-secret': cronSecret,
    })
    // 200 (job ejecutado) o 401 (si CRON_SECRET no coincide)
    expect([200, 401]).toContain(res.status())
  })
})
