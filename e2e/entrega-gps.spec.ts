import { test, expect } from '@playwright/test'
import { loginAs, createEmbarque, apiGet } from './fixtures'

/**
 * Embarque que `/repartidor` va a mostrar: el ABIERTO o EN_RUTA del trabajador.
 * `GET /api/embarques` NO filtra por `trabajadorId` (solo `desde/hasta/all/estado`):
 * pedirlo por query devolvía el primer embarque abierto de CUALQUIER trabajador
 * (los dejan otros specs del shard) y nunca se creaba el del repartidor, así que
 * la página mostraba "Sin embarque abierto" con "Venta Libre" deshabilitado (#413).
 * Se filtra del lado del test.
 */
async function ensureEmbarqueActivo(page: import('@playwright/test').Page, trabajadorId: string) {
  const res = await apiGet(page, '/api/embarques?all=true')
  const body = await res.json()
  const activo = (body.embarques ?? []).find(
    (e: { trabajadorId: string; estado: string }) =>
      e.trabajadorId === trabajadorId && (e.estado === 'ABIERTO' || e.estado === 'EN_RUTA'),
  )
  if (activo) return activo
  const creado = await createEmbarque(page, trabajadorId)
  expect(creado.embarque?.id, 'no se pudo crear el embarque del repartidor').toBeTruthy()
  return creado.embarque
}

test.describe('Entrega con GPS (repartidor)', () => {
  test('captura de GPS aparece en venta libre con geolocalización simulada', async ({ context, page }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 4.65, longitude: -74.05 })

    // Preparar embarque abierto para el trabajador vinculado al usuario repartidor
    await loginAs(page, 'admin')
    const trabajadoresRes = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
    expect(trabajadoresRes.status()).toBe(200)
    const trabajadoresBody = await trabajadoresRes.json()
    // /repartidor muestra el embarque del trabajador vinculado al usuario
    // 'repartidor' (`Trabajador.userId`): 'Yesid Ramírez' en el seed principal,
    // 'Carlos Andrés Vargas' en el seed de tests. Buscar por nombre o tomar el
    // primero elegía a veces un repartidor sin usuario y la página mostraba
    // "Sin embarque abierto" con "Venta Libre" deshabilitado (#413).
    const trabajador = trabajadoresBody.trabajadores?.find((t: { userId?: string | null }) => t.userId)
    expect(trabajador?.id, 'no hay un REPARTIDOR vinculado a un usuario').toBeTruthy()

    const embarque = await ensureEmbarqueActivo(page, trabajador.id)
    expect(embarque?.id).toBeTruthy()

    // Ingresar como repartidor
    await loginAs(page, 'repartidor')
    await page.goto('/repartidor')
    await page.waitForLoadState('domcontentloaded')

    // Abrir modal de venta libre
    // `visible`: en dev, tras el redirect de login a /repartidor + goto, el DOM
    // puede traer una copia oculta del árbol (mismo patrón que menu-reorder).
    const ventaLibreBtn = page.getByTestId('btn-venta-libre').filter({ visible: true }).first()
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
