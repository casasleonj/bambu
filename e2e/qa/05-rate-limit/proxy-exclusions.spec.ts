// @tests M5 — proxy exclusions + light load (no 429)

import { test, expect, fullLogin, apiCall } from '../../fixtures-paranoid'

test.describe('M5: proxy rate-limit exclusions', () => {
  test('RL-E2E-01: /api/health no consume rate limit', async ({ page }) => {
    const results: number[] = []
    for (let i = 0; i < 50; i++) {
      const res = await apiCall(page, '/api/health')
      results.push(res.status())
    }
    expect(results).not.toContain(429)
    expect(results.every((s) => s === 200)).toBe(true)
  })

  test('RL-E2E-02: /api/cron/* no consume rate limit', async ({ page }) => {
    const results: number[] = []
    for (let i = 0; i < 50; i++) {
      const res = await apiCall(page, '/api/cron/cleanup-sessions', { method: 'POST' })
      results.push(res.status())
    }
    expect(results).not.toContain(429)
    expect(results.every((s) => s === 401)).toBe(true)
  })

  test('RL-E2E-03: carga normal no dispara 429', async ({ page }) => {
    await fullLogin(page)
    const results: number[] = []
    for (let i = 0; i < 10; i++) {
      const res = await apiCall(page, '/api/productos')
      results.push(res.status())
    }
    expect(results).not.toContain(429)
    expect(results.every((s) => s === 200)).toBe(true)
  })
})
