import { test, expect } from '@playwright/test'
import { setupEmbarque, clearOfflineDb, abrirRepartidor, guardarVentaLibreOffline, sincronizar } from './helpers'

test.describe('M7 offline venta libre sync', () => {
  test.beforeEach(async ({ page }) => {
    await setupEmbarque(page)
  })

  test.afterEach(async ({ page }) => {
    await clearOfflineDb(page)
  })

  test('crea venta offline en repartidor, espera a online y sincroniza', async ({ page }) => {
    await abrirRepartidor(page)
    await guardarVentaLibreOffline(page)

    // En offline el botón de sync permanece deshabilitado
    await expect(page.getByTestId('btn-sync-repartidor').first()).toBeDisabled()

    await sincronizar(page)
    await expect(page.getByTestId('btn-sync-repartidor').first()).toBeDisabled()

    // Verificar que la cola se vació
    const queue = await page.evaluate(async () => {
      const bambu = (window as any).__bambu
      return await bambu.getRequestQueue()
    })
    expect(queue.length).toBe(0)
  })
})
