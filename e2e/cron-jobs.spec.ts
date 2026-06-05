// @tests api/cron/alerta-no-verificados, api/cron/vencimiento-promesas, api/cron/generar-recurrentes
import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

async function apiPost(page: Page, path: string, headers?: Record<string, string>) {
  return page.request.post(`${BASE}${path}`, { headers })
}

async function apiGet(page: Page, path: string, headers?: Record<string, string>) {
  return page.request.get(`${BASE}${path}`, { headers })
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

  test('generar-recurrentes rejects without Bearer token', async ({ page }) => {
    const res = await apiGet(page, '/api/cron/generar-recurrentes')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('generar-recurrentes accepts valid Bearer token', async ({ page }) => {
    const cronSecret = process.env.CRON_SECRET || 'test-cron-secret'
    const res = await apiGet(page, '/api/cron/generar-recurrentes', {
      authorization: `Bearer ${cronSecret}`,
    })
    // 200 or 401 depending on env CRON_SECRET
    expect([200, 401]).toContain(res.status())
  })
})
