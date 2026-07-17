import { test, expect } from '@playwright/test'
import { setupEmbarque, clearOfflineDb, abrirRepartidor, guardarVentaLibreOffline, sincronizar } from './helpers'

test.describe('M7 queue persistence', () => {
  test.beforeEach(async ({ page }) => {
    await setupEmbarque(page)
  })

  test.afterEach(async ({ page }) => {
    await clearOfflineDb(page)
  })

  test('la cola persiste tras reload de página', async ({ page }) => {
    await abrirRepartidor(page)
    await guardarVentaLibreOffline(page)

    // Volver online antes de reload para evitar ERR_INTERNET_DISCONNECTED
    await page.context().setOffline(false)
    await page.reload()

    await page.waitForSelector('[data-testid="btn-venta-libre"]', { state: 'visible' })
    await expect(page.getByTestId('btn-venta-libre').first()).toBeEnabled()
    await expect(page.getByTestId('btn-sync-repartidor').first()).toBeEnabled()

    await sincronizar(page)
    await expect(page.getByTestId('btn-sync-repartidor').first()).toBeDisabled()
  })
})
