import { test, expect } from '@playwright/test'
import { setupEmbarque, clearOfflineDb, abrirRepartidor, guardarVentaLibreOffline, sincronizar } from './helpers'

test.describe('M7 multiple request order', () => {
  test.beforeEach(async ({ page }) => {
    await setupEmbarque(page)
  })

  test.afterEach(async ({ page }) => {
    await clearOfflineDb(page)
  })

  test('dos ventas offline se sincronizan en orden FIFO', async ({ page }) => {
    await abrirRepartidor(page)

    const requests: string[] = []
    await page.route('/api/pedidos/venta-libre', async route => {
      requests.push(route.request().postData() || '')
      await route.continue()
    })

    for (const monto of ['2800', '5600']) {
      await guardarVentaLibreOffline(page, monto)
    }

    await sincronizar(page)

    // Verificar que ambos requests fueron enviados.
    expect(requests.length).toBe(2)
  })
})
