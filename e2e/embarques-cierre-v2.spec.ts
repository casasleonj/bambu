// @tests Épica #447 Fase A — cierre de embarque V2 (detrás de NEXT_PUBLIC_CIERRE_V2).
//
// Correr con el flag en el webServer:
//   NEXT_PUBLIC_CIERRE_V2=true PW_WORKERS=1 npx playwright test e2e/embarques-cierre-v2.spec.ts
// Verifica en la BASE (vía API de lectura), no solo la respuesta de la UI.
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


const V2_ON = process.env.NEXT_PUBLIC_CIERRE_V2 === 'true'

test.describe('Cierre V2 (NEXT_PUBLIC_CIERRE_V2)', () => {
  test.skip(!V2_ON, 'requiere NEXT_PUBLIC_CIERRE_V2=true + webServer fresco')

  test('entrega parcial: exige decidir qué pasa con lo que falta y deja el pedido con pendiente', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId, pedidoId } = await seedEmbarqueEnRuta(page, 3)
    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`, { waitUntil: 'domcontentloaded' })

    const entrega = page.getByLabel('Entrega ahora Paca de agua')
    await expect(entrega).toHaveValue('3')
    await entrega.fill('1')
    await expect(page.getByTestId('estado-derivado')).toContainText('Parcial')
    await expect(page.getByTestId('decision-pendiente')).toBeVisible()
    await expect(page.getByTestId('siguiente-paso')).toBeDisabled()

    await page.getByTestId('decision-pendiente').getByLabel(/ya no quiere el resto/).check()
    await expect(page.getByTestId('siguiente-paso')).toBeEnabled()

    await page.getByTestId('siguiente-paso').click() // ventas libres (vacío)
    await page.getByTestId('siguiente-paso').click() // conciliación
    await page.getByTestId('justificacion-discrepancia').fill('2 pacas no se entregaron, vuelven a bodega')
    await page.getByTestId('siguiente-paso').click() // gastos
    await page.getByTestId('siguiente-paso').click() // confirmar

    const confirmar = page.getByTestId('confirmar-cierre')
    await expect(confirmar).toBeEnabled({ timeout: 15000 })
    await confirmar.click()
    await page.getByTestId('confirm-modal').getByRole('button', { name: /Confirmar|Cerrando/ }).click()
    await page.waitForURL(/\/embarques(\?|$)/, { timeout: 15000 })

    // En la base: se entregó 1, el pedido NO quedó entregado y el total no cambió.
    const p = await (await page.request.get(`${BASE}/api/pedidos/${pedidoId}`)).json()
    const pedido = p.pedido || p.data
    expect(pedido.cPacaAguaEnt).toBe(1)
    expect(pedido.estadoEntrega).not.toBe('ENTREGADO')
    expect(Number(pedido.total)).toBeGreaterThan(0)
    const e = await (await page.request.get(`${BASE}/api/embarques/${embarqueId}`)).json()
    const emb = e.embarque || e.data
    expect(emb.estado).toBe('CERRADO')
    expect(String(emb.obs ?? '')).toMatch(/no quiere/)
  })

  test('venta al paso: bloquea si no se cobra completo y se habilita al cobrar el total', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId } = await seedEmbarqueEnRuta(page, 5)
    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('siguiente-paso').click()

    await page.getByRole('button', { name: '+ Agregar venta' }).click()
    await page.getByTestId('vl-venta-al-paso').click()
    await page.getByLabel('Paca de agua').fill('2')
    await expect(page.getByTestId('vl-motivos')).toContainText('pago completo')
    await expect(page.getByTestId('siguiente-paso')).toBeDisabled()

    await page.getByTestId('vl-cobrar-total').click()
    await expect(page.getByTestId('vl-motivos')).toHaveCount(0)
    await expect(page.getByTestId('siguiente-paso')).toBeEnabled()
  })

  test('móvil de 360 px: ningún paso del asistente se desborda y «Cobrar el total» se puede tocar', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await cierreLogin(page)
    const { embarqueId } = await seedEmbarqueEnRuta(page, 5)
    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`, { waitUntil: 'domcontentloaded' })
    const sinDesborde = async (paso: string) => {
      const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, ancho: document.documentElement.clientWidth }))
      expect(m.scroll, `desborde horizontal en «${paso}»`).toBeLessThanOrEqual(m.ancho + 1)
    }
    await expect(page.getByTestId('siguiente-paso')).toBeVisible()
    await sinDesborde('pedidos')
    await page.getByTestId('siguiente-paso').click()
    await page.getByRole('button', { name: '+ Agregar venta' }).click()
    await page.getByTestId('vl-venta-al-paso').click()
    await page.getByLabel('Paca de agua').fill('2')
    await sinDesborde('venta al paso con fila de pago')
    await page.getByTestId('vl-cobrar-total').click() // tocable: antes lo tapaba el contenido desbordado
    await expect(page.getByTestId('siguiente-paso')).toBeEnabled()
    for (const paso of ['ventas libres', 'conciliación', 'gastos', 'confirmar']) {
      await sinDesborde(paso)
      if (paso !== 'confirmar') await page.getByTestId('siguiente-paso').click()
    }
  })

  test('un rechazo 4xx del preview se muestra con su motivo y bloquea Confirmar (no es «estimado local»)', async ({ page }) => {
    await cierreLogin(page)
    const { embarqueId } = await seedEmbarqueEnRuta(page, 3)
    await page.route('**/api/embarques/*/cerrar/preview', (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'El pedido #1 está cancelado y no se puede entregar.' } }) }),
    )
    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`, { waitUntil: 'domcontentloaded' })
    for (let i = 0; i < 4; i++) await page.getByTestId('siguiente-paso').click()

    await expect(page.getByTestId('preview-rechazo')).toContainText('cancelado', { timeout: 15000 })
    await expect(page.getByTestId('confirmar-cierre')).toBeDisabled()
  })
})
