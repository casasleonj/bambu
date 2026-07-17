import { test, expect } from '@playwright/test'
import { setupEmbarque, clearOfflineDb, abrirRepartidor, guardarVentaLibreOffline } from './helpers'

test.describe('M7 DLQ 4xx', () => {
  test.beforeEach(async ({ page }) => {
    await setupEmbarque(page)
  })

  test.afterEach(async ({ page }) => {
    await clearOfflineDb(page)
  })

  test('4xx mueve pedido a DLQ y muestra badge', async ({ page }) => {
    await page.route('/api/pedidos/venta-libre', async route => {
      await route.fulfill({ status: 400, body: JSON.stringify({ error: 'bad request' }) })
    })

    await abrirRepartidor(page)
    await guardarVentaLibreOffline(page)

    await page.context().setOffline(false)
    await page.waitForTimeout(300)
    await page.getByTestId('btn-sync-repartidor').first().click()

    // El contador de DLQ vive en connectivity-indicator; recargar fuerza re-lectura.
    await page.reload()
    await page.waitForSelector('[data-testid="failed-sync-counter"]', { state: 'visible' })
  })
})
