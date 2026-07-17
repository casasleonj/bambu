import { test, expect } from '@playwright/test'
import { setupEmbarque, clearOfflineDb, abrirRepartidor, guardarVentaLibreOffline } from './helpers'

test.describe('M7 session expiry preserve queue', () => {
  test.beforeEach(async ({ page }) => {
    await setupEmbarque(page)
  })

  test.afterEach(async ({ page }) => {
    await clearOfflineDb(page)
  })

  test('401 no purga la cola y redirige a login', async ({ page }) => {
    await page.route('/api/pedidos/venta-libre', async route => {
      await route.fulfill({ status: 401, body: JSON.stringify({ error: 'unauthorized' }) })
    })

    await abrirRepartidor(page)
    await guardarVentaLibreOffline(page)

    await page.context().setOffline(false)
    await page.waitForTimeout(300)
    await page.getByTestId('btn-sync-repartidor').first().click()

    await expect(page).toHaveURL(/\/login\?reason=expired/)

    // Re-login: la cola offline debe persistir (botón de sync habilitado)
    const { loginAs } = await import('../../fixtures-paranoid')
    await loginAs(page, 'repartidor')
    await page.goto('/repartidor')
    await page.waitForSelector('[data-testid="btn-sync-repartidor"]', { state: 'visible' })
    await expect(page.getByTestId('btn-sync-repartidor').first()).toBeEnabled()
  })
})
