// @tests #630 F1-B1b: QA real de navegador, escritorio y móvil, datos sintéticos.
// Nunca confirma el cierre: prueba el flujo visible y su validación sin tocar
// datos históricos ni ejecutar operaciones económicas de producción.
import type { Page } from '@playwright/test'
import { test, expect, loginAs, apiPost, createTrabajador, createCliente, BASE } from './fixtures'

async function abrirVentasLibres(page: Page) {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0]
  await page.route('**/api/cierre/last', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cierre: { fecha: yesterday } }) }),
  )
  await loginAs(page, 'admin')

  const c = await createCliente(page)
  const clienteId = c.cliente?.id || c.data?.id
  const t = await createTrabajador(page)
  const trabajadorId = t.trabajador?.id || t.data?.id
  expect(clienteId, 'cliente sintético creado').toBeTruthy()
  expect(trabajadorId, 'repartidor sintético creado').toBeTruthy()

  const e = await apiPost(page, '/api/embarques', {
    trabajadorId,
    horaSalida: '08:00',
    carga: [{ producto: 'PACA_AGUA', cargadas: 3 }],
  })
  const ej = await e.json()
  const embarqueId = ej.data?.id || ej.embarque?.id
  expect(embarqueId, 'embarque sintético creado').toBeTruthy()

  const p = await apiPost(page, '/api/pedidos', {
    clienteId, canal: 'DOMICILIO', ventaRapida: false,
    items: [{ producto: 'PACA_AGUA', cantidad: 3 }],
  })
  const pj = await p.json()
  const pedidoId = pj.pedido?.id || pj.data?.id
  expect(pedidoId, 'pedido sintético creado').toBeTruthy()

  const asignado = await apiPost(page, '/api/pedidos/' + pedidoId + '/enviar', { embarqueId })
  expect(asignado.ok()).toBeTruthy()
  const enviado = await apiPost(page, '/api/embarques/' + embarqueId + '/enviar', {})
  expect(enviado.ok()).toBeTruthy()

  await page.goto(BASE + '/embarques/' + embarqueId + '/cerrar', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('siguiente-paso')).toBeEnabled({ timeout: 15_000 })
  await page.getByTestId('siguiente-paso').click()
  await page.getByRole('button', { name: '+ Agregar venta' }).click()
  const declaracion = page.getByTestId('vl-fecha-declarada-0')
  await expect(declaracion).toBeVisible()
  await declaracion.getByRole('button', { name: /cuándo ocurrió esta venta/i }).click()
  return declaracion
}

test.describe('#630 F1-B1b · fecha declarada en cierre (no certificada)', () => {
  test('escritorio: desconocida → día sin hora → fecha y hora → desconocida', async ({ page }) => {
    const d = await abrirVentasLibres(page)
    await expect(d.getByLabel('No conozco el momento')).toBeChecked()

    await d.getByLabel('Conozco el día', { exact: true }).check()
    await d.getByLabel('Día de la venta (declarado)').fill('2020-05-03')
    await d.getByRole('button', { name: 'Confirmar declaración' }).click()
    await expect(d.getByRole('status')).toContainText('Se guardará únicamente cuando confirmes el cierre')
    await expect(d.getByText(/no certificado/i)).toBeVisible()

    await d.getByLabel('Conozco día y hora').check()
    await d.getByLabel('Hora declarada').fill('23:58')
    await d.getByRole('button', { name: 'Confirmar declaración' }).click()
    await expect(d.getByRole('status')).toContainText('Se guardará únicamente')
    await d.getByLabel('No conozco el momento').check()
    await expect(d.getByLabel('Día de la venta (declarado)')).toHaveCount(0)
    await d.getByRole('button', { name: 'Confirmar declaración' }).click()
    await expect(d.getByRole('status')).toContainText('Sin fecha conocida')
  })

  test('móvil 360 px: fecha futura no se acepta y el formulario no se desborda', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    const d = await abrirVentasLibres(page)

    await d.getByLabel('Conozco día y hora').check()
    await d.getByLabel('Día de la venta (declarado)').fill('3000-01-01')
    await d.getByLabel('Hora declarada').fill('23:58')
    await d.getByRole('button', { name: 'Confirmar declaración' }).click()
    await expect(d.getByRole('alert')).toContainText(/futuro/i)

    await d.getByLabel('Día de la venta (declarado)').fill('2020-05-03')
    await d.getByRole('button', { name: 'Confirmar declaración' }).click()
    await expect(d.getByRole('status')).toContainText('Se guardará únicamente')

    const ancho = await page.evaluate(() => ({
      contenido: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }))
    expect(ancho.contenido, 'sin desborde horizontal en 360 px').toBeLessThanOrEqual(ancho.viewport + 1)
  })
})
