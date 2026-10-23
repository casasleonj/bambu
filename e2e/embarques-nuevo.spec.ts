// @tests wizard "Nuevo Embarque" — flujo pedidos-primero (rediseño)
import type { Page } from '@playwright/test'
import { test, expect, loginAs, apiPost, apiGet, createTrabajador, createCliente, BASE } from './fixtures'

async function nuevoEmbarqueLogin(page: Page) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  await page.route('**/api/cierre/last', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cierre: { fecha: yesterday } }) }),
  )
  await loginAs(page, 'admin')
}

async function crearPedido(page: Page, over: Record<string, unknown> = {}) {
  const c = await createCliente(page)
  const clienteId = c.cliente?.id || c.data?.id
  const res = await apiPost(page, '/api/pedidos', {
    clienteId, canal: 'DOMICILIO', ventaRapida: false,
    items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
    ...over,
  })
  const j = await res.json()
  return { id: j.pedido?.id || j.data?.id, numero: j.pedido?.numero as number, clienteId }
}

async function abrirWizard(page: Page) {
  await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
  const boton = page.getByRole('button', { name: /Nuevo Embarque/i }).first()
  const wizard = page.getByTestId('nuevo-embarque-wizard')
  // Con `domcontentloaded` el clic puede llegar antes de que React enganche el
  // handler del botón: no abre y no hay error. Se reintenta solo mientras el modal
  // siga cerrado (un segundo clic con el modal abierto lo cerraría).
  await expect(async () => {
    if (!(await wizard.isVisible())) await boton.click()
    await expect(wizard).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20000 })
}

/** Paso 1 → paso 2 esperando el stock: antes de que llegue, el botón "Crear" aparece habilitado. */
async function irAPasoConfirmar(page: Page) {
  const stock = page.waitForResponse((r) => r.url().includes('/api/embarques') && r.url().includes('stock=true'))
  await page.getByTestId('wizard-siguiente').click()
  await stock
}

/**
 * Habilita "Crear" con la carga ya ingresada. Con stock insuficiente (en CI parte de
 * cero y lo consumen los specs anteriores del shard) el wizard exige confirmar el
 * stock físico; con stock suficiente ese bloque no aparece. Los dos estados son
 * válidos: el test cubre el camino, no el inventario.
 */
async function habilitarCrear(page: Page) {
  const crear = page.getByTestId('wizard-crear')
  const override = page.getByTestId('stock-override')
  await expect.poll(async () => (await crear.isEnabled()) || (await override.isVisible()), { timeout: 15000 }).toBe(true)
  if (!(await crear.isEnabled())) {
    await override.getByRole('checkbox').check()
    const motivo = override.locator('textarea')
    if (await motivo.isVisible()) await motivo.fill('Stock físico verificado (prueba E2E)')
  }
  await expect(crear).toBeEnabled()
}

test.describe('Nuevo Embarque — wizard pedidos-primero', () => {
  test('flujo normal: elegir pedido → confirmar → embarque creado con el pedido asignado', async ({ page }) => {
    await nuevoEmbarqueLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    const p = await crearPedido(page)
    expect(p.id).toBeTruthy()

    await abrirWizard(page)

    // Paso 1: aparece MI pedido (la lista puede traer otros de otros specs), lo
    // selecciono y la carga se deriva.
    await page.getByTestId(`pedido-check-${p.numero}`).check()
    await expect(page.getByTestId('pedidos-resumen')).toContainText('1 pedido · 5 unidades')
    await irAPasoConfirmar(page)

    // Paso 2: la carga derivada llegó pre-llenada.
    await expect(page.getByTestId('carga-PACA_AGUA')).toHaveValue('5')
    await page.getByTestId('confirmar-repartidor').selectOption(trabajadorId as string)
    await habilitarCrear(page)
    await page.getByTestId('wizard-crear').click()

    await expect(page.getByTestId('wizard-ir-detalle')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('wizard-ir-detalle').click()
    await page.waitForURL(/\/embarques\/.+/, { timeout: 15000 })

    // El embarque creado quedó con ESE pedido asignado (#433: antes el PUT de
    // asignación se tomaba por un reintento y no asignaba nada).
    const embarqueId = page.url().match(/\/embarques\/([^/?#]+)/)?.[1]
    expect(embarqueId).toBeTruthy()
    const det = await apiGet(page, `/api/pedidos/${p.id}`)
    expect(det.status()).toBe(200)
    const pedido = (await det.json()).pedido
    expect(pedido.embarqueId).toBe(embarqueId)
  })

  test('crear con 0 pedidos pide confirmación', async ({ page }) => {
    await nuevoEmbarqueLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id

    await abrirWizard(page)
    await irAPasoConfirmar(page)

    await page.getByTestId('confirmar-repartidor').selectOption(trabajadorId as string)
    await page.getByTestId('carga-PACA_AGUA').fill('10')
    await habilitarCrear(page)
    await page.getByTestId('wizard-crear').click()

    await expect(page.getByTestId('confirm-0-pedidos')).toBeVisible()
    await page.getByRole('button', { name: 'Crear igual' }).click()
    await expect(page.getByTestId('wizard-resultado')).toBeVisible({ timeout: 15000 })
  })

  test('capacidad excedida: advierte y deja seguir (no bloquea)', async ({ page }) => {
    await nuevoEmbarqueLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id

    await abrirWizard(page)
    await irAPasoConfirmar(page)
    await page.getByTestId('confirmar-repartidor').selectOption(trabajadorId as string)
    // 90 pacas > 70 unidades máx
    await page.getByTestId('carga-PACA_AGUA').fill('90')

    await expect(page.getByTestId('capacidad-aviso')).toBeVisible()
    // La capacidad solo advierte: lo único que puede bloquear es el stock.
    await habilitarCrear(page)
  })

  test('pedido futuro: oculto por defecto, visible con el toggle', async ({ page }) => {
    await nuevoEmbarqueLogin(page)
    const en8dias = new Date(Date.now() + 8 * 86400000).toISOString()
    await crearPedido(page, { fechaEntrega: en8dias })

    await abrirWizard(page)
    const listaAntes = await page.getByTestId('pedidos-lista').getByRole('checkbox').count()
    await page.getByTestId('ver-futuros').check()
    const listaDespues = await page.getByTestId('pedidos-lista').getByRole('checkbox').count()
    expect(listaDespues).toBeGreaterThan(listaAntes)
  })
})
