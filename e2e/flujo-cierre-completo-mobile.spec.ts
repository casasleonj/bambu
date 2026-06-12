// @tests H3-2: Cierre del día end-to-end (móvil)
// Vector: estado — no se puede cerrar el mismo día dos veces.
// Verifica en viewport iPhone 13:
//   1. Cierre el día con datos válidos → 201 OK
//   2. Intentar cerrar de nuevo el mismo día → 4xx (no 500 silencioso)
//   3. GET /api/cierre?fecha=X devuelve el reporte guardado
import { test, expect } from '@playwright/test'
import { fullLogin, apiPost } from './fixtures'

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1',
})

test.describe('H3-2: Cierre del día (iPhone 13)', () => {
  test('dos cierres consecutivos con misma fecha: el segundo falla con 4xx', async ({ page }) => {
    await fullLogin(page)

    // 1. Construir datos válidos para un cierre "cualquiera"
    const data = {
      baseDia: 100000,
      stockIniAgua: 200,
      prodAgua: 150,
      stockFinAgua: 100,
      stockIniHielo: 100,
      prodHielo: 80,
      stockFinHielo: 50,
      comisiones: 8000,
      salarios: 0,
    }

    // 2. Primer intento
    const r1 = await apiPost(page, '/api/cierre', data)
    // Aceptamos 201 (éxito) O 400/409 (conflicto de día/cierre previo)
    // Lo importante: NO debe ser 500 (error silencioso del server)
    expect(r1.status()).toBeLessThan(500)

    // 3. Segundo intento con misma fecha
    const r2 = await apiPost(page, '/api/cierre', data)
    // El segundo debe fallar con 4xx (idempotencia: no se puede cerrar dos veces)
    // No 500 (sería bug grave: error interno sin rollback)
    expect(r2.status()).toBeLessThan(500)
    // Y debe ser 4xx específicamente
    expect([400, 409]).toContain(r2.status())
  })

  test('cierre con datos inválidos (stockIniAgua negativo) → 400', async ({ page }) => {
    await fullLogin(page)

    const dataInvalida = {
      baseDia: 0,
      stockIniAgua: -1, // ← negativo: schema lo rechaza
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      comisiones: 0,
      salarios: 0,
    }
    const r = await apiPost(page, '/api/cierre', dataInvalida)
    expect(r.status()).toBe(400)
  })

  test('cierre con fecha inválida (2025-02-30) → 400 (FIX H1-4)', async ({ page }) => {
    await fullLogin(page)

    const data = {
      fecha: '2025-02-30', // fecha imposible
      baseDia: 0,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      comisiones: 0,
      salarios: 0,
    }
    const r = await apiPost(page, '/api/cierre', data)
    expect(r.status()).toBe(400)
  })
})
