// @tests Fase 7 (Reconciliation) — wizard forzado de cierre de embarque.
//
// Cubre lo que los unit tests de wizard-gating.ts NO pueden: la navegación
// real por pasos, el "Siguiente" deshabilitado, el gate del preview y su
// degradación best-effort cuando la red falla.
import type { Page } from '@playwright/test'
import { test, expect, loginAs, apiPost, createTrabajador, createCliente, BASE } from './fixtures'

async function cierreLogin(page: Page) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  await page.route('**/api/cierre/last', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cierre: { fecha: yesterday } }),
    })
  })
  await loginAs(page, 'admin')
}

/** Embarque EN_RUTA con 1 pedido de 3 PACA_AGUA, listo para cerrar por la UI. */
async function seedEmbarqueEnRuta(page: Page, cargadas = 3) {
  const c = await createCliente(page)
  const clienteId = c.cliente?.id || c.data?.id
  const t = await createTrabajador(page)
  const trabajadorId = t.trabajador?.id || t.data?.id
  expect(clienteId, 'cliente creado').toBeTruthy()
  expect(trabajadorId, 'trabajador creado').toBeTruthy()

  const eRes = await apiPost(page, '/api/embarques', {
    trabajadorId,
    horaSalida: '08:00',
    carga: [{ producto: 'PACA_AGUA', cargadas }],
  })
  const eData = await eRes.json()
  const embarqueId = eData.data?.id || eData.embarque?.id
  expect(embarqueId, 'embarque creado').toBeTruthy()

  const pRes = await apiPost(page, '/api/pedidos', {
    clienteId, canal: 'DOMICILIO', ventaRapida: false,
    items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
  })
  const pData = await pRes.json()
  const pedidoId = pData.pedido?.id || pData.data?.id
  expect(pedidoId, 'pedido creado').toBeTruthy()

  await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
  await apiPost(page, `/api/embarques/${embarqueId}/enviar`, {})
  return { embarqueId, pedidoId }
}

test.describe('Cierre — wizard forzado (Fase 7)', () => {
  test('no se puede saltar a un paso futuro; "Siguiente" avanza de a uno', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId } = await seedEmbarqueEnRuta(page)

    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`)
    await page.waitForLoadState('domcontentloaded')

    // Paso 0 activo; los pasos futuros están deshabilitados (no se saltan).
    await expect(page.getByTestId('wizard-step-0')).toBeVisible()
    await expect(page.getByTestId('wizard-step-3')).toBeDisabled()
    await expect(page.getByTestId('wizard-step-4')).toBeDisabled()

    // Avanzar con "Siguiente" hasta el paso 4.
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('siguiente-paso').click()
    }
    // Paso 4 ahora es el actual (habilitado) y "Confirmar Cierre" reemplaza a "Siguiente".
    await expect(page.getByTestId('wizard-step-4')).toBeEnabled()
    await expect(page.getByTestId('confirmar-cierre')).toBeVisible()
    // Ahora sí se puede volver a un paso ya visitado.
    await expect(page.getByTestId('wizard-step-1')).toBeEnabled()
  })

  test('paso Conciliación bloquea el avance ante discrepancia sin justificar', async ({ page }) => {
    await cierreLogin(page)
    // 5 cargadas, el pedido entrega 3 → discrepancia de 2 sin devoluciones.
    const { embarqueId } = await seedEmbarqueEnRuta(page, 5)

    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`)
    await page.waitForLoadState('domcontentloaded')

    // Paso 0 → 1 → 2 (Conciliación).
    await page.getByTestId('siguiente-paso').click()
    await page.getByTestId('siguiente-paso').click()

    // Con discrepancia y sin justificación, "Siguiente" está deshabilitado.
    await expect(page.getByTestId('justificacion-discrepancia')).toBeVisible()
    await expect(page.getByTestId('siguiente-paso')).toBeDisabled()

    // Al justificar, se habilita.
    await page.getByTestId('justificacion-discrepancia').fill('2 pacas quedaron en bodega, no salieron a ruta')
    await expect(page.getByTestId('siguiente-paso')).toBeEnabled()
  })

  test('happy path: preview OK → Confirmar Cierre habilitado → embarque CERRADO', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId } = await seedEmbarqueEnRuta(page)

    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`)
    await page.waitForLoadState('domcontentloaded')
    for (let i = 0; i < 4; i++) await page.getByTestId('siguiente-paso').click()

    // El preview autoritativo habilita "Confirmar Cierre".
    const confirmar = page.getByTestId('confirmar-cierre')
    await expect(confirmar).toBeEnabled({ timeout: 15000 })
    await confirmar.click()

    await page.getByTestId('confirm-modal').getByRole('button', { name: /Confirmar|Cerrando/ }).click()
    await page.waitForURL(/\/embarques(\?|$)/, { timeout: 15000 })

    // El embarque quedó CERRADO.
    const check = await page.request.get(`${BASE}/api/embarques/${embarqueId}`)
    const checkData = await check.json()
    expect(checkData.embarque?.estado || checkData.data?.estado).toBe('CERRADO')
  })

  test('preview best-effort: si /cerrar/preview falla, NO bloquea — muestra advertencia y deja confirmar', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId } = await seedEmbarqueEnRuta(page)

    // Simular red mala solo para el preview (dry-run), no para el cierre real.
    await page.route('**/api/embarques/*/cerrar/preview', (route) => route.abort('failed'))

    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`)
    await page.waitForLoadState('domcontentloaded')
    for (let i = 0; i < 4; i++) await page.getByTestId('siguiente-paso').click()

    // Advertencia ámbar visible, pero "Confirmar Cierre" NO queda bloqueado.
    await expect(page.getByTestId('wizard-advertencia')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('confirmar-cierre')).toBeEnabled()
  })
})
