// @tests produccion — medir tiempo real de GET /api/pedidos autenticado
// Verifica si el endpoint responde dentro del timeout del hook (30s)
// o si hay otro cuelgue distinto al rate-limit.

import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://portal.aguabambu.com'

test('GET /api/pedidos autenticado — medir tiempo real', async ({ page }) => {
  test.setTimeout(120_000)

  // Login
  await page.addInitScript(() => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const utc = new Date().toISOString().split('T')[0]
    localStorage.setItem(`baseDia_${hoy}`, '100000')
    localStorage.setItem(`baseDia_${utc}`, '100000')
  })
  await page.goto(`${BASE}/login`, { timeout: 60_000 })
  await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
  await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: 60_000 })

  // Medir GET /api/pedidos autenticado (con cookies de sesión del page)
  const measurements: Array<{ url: string; ms: number; status: number | null; error?: string }> = []

  for (let i = 0; i < 3; i++) {
    const url = `${BASE}/api/pedidos?all=true`
    const start = Date.now()
    try {
      const res = await page.request.get(url, { timeout: 45_000 })
      measurements.push({ url, ms: Date.now() - start, status: res.status() })
    } catch (e) {
      measurements.push({ url, ms: Date.now() - start, status: null, error: e instanceof Error ? e.message : String(e) })
    }
  }

  console.log('=== MEDICIONES GET /api/pedidos?all=true (autenticado) ===')
  for (const m of measurements) {
    console.log(`  ${m.status ?? 'TIMEOUT'} en ${m.ms}ms ${m.error ? `error=${m.error}` : ''}`)
  }

  // Al menos una medición debe responder en menos de 30s (timeout del hook)
  const anyFast = measurements.some(m => m.status !== null && m.ms < 30_000)
  expect(anyFast, `Ninguna medición respondió en <30s: ${JSON.stringify(measurements)}`).toBe(true)
})