import { test, expect } from '@playwright/test'
import { fullLogin, loginAs, createEmbarque, apiGet } from './fixtures'

async function ensureEmbarqueAbierto(page: import('@playwright/test').Page, trabajadorId: string) {
  const activosRes = await apiGet(page, `/api/embarques?trabajadorId=${trabajadorId}&estado=ABIERTO&all=true`)
  const activosBody = await activosRes.json()
  if (activosBody.embarques?.length > 0) {
    return activosBody.embarques[0]
  }
  const res = await createEmbarque(page, trabajadorId)
  if (res.embarque?.id) return res.embarque
  // Si falló por embarque existente, reintentar lectura
  const retryRes = await apiGet(page, `/api/embarques?trabajadorId=${trabajadorId}&estado=ABIERTO&all=true`)
  const retryBody = await retryRes.json()
  return retryBody.embarques?.[0]
}

test.describe('Entrega con GPS (repartidor)', () => {
  test('captura de GPS aparece en venta libre con geolocalización simulada', async ({ context, page }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 4.65, longitude: -74.05 })

    // Preparar embarque abierto para el trabajador vinculado al usuario repartidor
    await fullLogin(page)
    const trabajadoresRes = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
    expect(trabajadoresRes.status()).toBe(200)
    const trabajadoresBody = await trabajadoresRes.json()
    // El seed vincula el usuario 'repartidor' al trabajador 'Yesid Ramírez'
    const trabajador = trabajadoresBody.trabajadores?.find((t: { nombre: string }) =>
      t.nombre.includes('Yesid')
    ) || trabajadoresBody.trabajadores?.[0]
    expect(trabajador?.id).toBeTruthy()

    const embarque = await ensureEmbarqueAbierto(page, trabajador.id)
    expect(embarque?.id).toBeTruthy()

    // Ingresar como repartidor
    await loginAs(page, 'repartidor')
    await page.goto('/repartidor')
    await page.waitForLoadState('domcontentloaded')

    // Abrir modal de venta libre
    const ventaLibreBtn = page.locator('button:has-text("Venta Libre")')
    await expect(ventaLibreBtn).toBeVisible({ timeout: 10000 })
    await expect(ventaLibreBtn).toBeEnabled({ timeout: 10000 })
    await ventaLibreBtn.click()

    // El botón de captura GPS debe estar visible
    const gpsBtn = page.locator('button:has-text("Capturar GPS")')
    await expect(gpsBtn).toBeVisible({ timeout: 10000 })

    // Simular clic en capturar GPS
    await gpsBtn.click()

    // Verificar que las coordenadas aparecen (formato "4.6500, -74.0500")
    await expect(page.locator('button:has-text("4.65")')).toBeVisible({ timeout: 10000 })
  })
})
