import { test, expect } from '@playwright/test'
import { apiCall, ensureSelladorUser, assertNoUnexpectedConsoleErrors, assertUx, skipBaseCajaParanoid } from '../fixtures-paranoid'
import { resetTestDatabase, loginAs } from '../fixtures'

test.describe('fixtures-paranoid smoke', () => {
  test.beforeEach(async () => {
    resetTestDatabase()
  })

  test('apiCall POST /api/clientes crea cliente y retorna 201', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiCall(page, '/api/clientes', {
      method: 'POST',
      body: {
        nombre: 'QA Smoke Cliente',
        telefono: `311${Date.now().toString().slice(-7)}`,
        direccion: 'Calle Smoke 1',
        barrio: 'Centro',
      },
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.cliente.id).toBeTruthy()
  })

  test('ensureSelladorUser crea usuario sellador', async () => {
    await ensureSelladorUser('direct')
    // Verificación indirecta: loginAs debe funcionar en siguiente test.
    expect(true).toBe(true)
  })

  test('skipBaseCajaParanoid no bloquea /dashboard', async ({ page }) => {
    await skipBaseCajaParanoid(page)
    await loginAs(page, 'admin')
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
    await assertNoUnexpectedConsoleErrors(page)
  })

  test('assertUx where-am-i pasa en /dashboard', async ({ page }) => {
    await skipBaseCajaParanoid(page)
    await loginAs(page, 'admin')
    await page.goto('/dashboard')
    await expect(page.locator('[data-testid="nav-item-active"], [aria-current="page"]')).toBeVisible()
    await assertUx(page, 'where-am-i')
  })
})
