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
  return { id: j.pedido?.id || j.data?.id, clienteId }
}

async function abrirWizard(page: Page) {
  await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Nuevo Embarque/i }).first().click()
  await expect(page.getByTestId('nuevo-embarque-wizard')).toBeVisible()
}

test.describe('Nuevo Embarque — wizard pedidos-primero', () => {
  test('flujo normal: elegir pedido → confirmar → embarque creado con el pedido asignado', async ({ page }) => {
    await nuevoEmbarqueLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    const p = await crearPedido(page)
    expect(p.id).toBeTruthy()

    await abrirWizard(page)

    // Paso 1: aparece el pedido, lo selecciono, la carga se deriva.
    const check = page.getByTestId('pedidos-lista').getByRole('checkbox').first()
    await check.check()
    await expect(page.getByTestId('pedidos-resumen')).toContainText('5 unidades')
    await page.getByTestId('wizard-siguiente').click()

    // Paso 2: la carga derivada llegó pre-llenada.
    await expect(page.getByTestId('carga-PACA_AGUA')).toHaveValue('5')
    await page.getByTestId('confirmar-repartidor').selectOption(trabajadorId as string)
    await page.getByTestId('wizard-crear').click()

    await expect(page.getByTestId('wizard-ir-detalle')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('wizard-ir-detalle').click()
    await page.waitForURL(/\/embarques\/.+/, { timeout: 15000 })

    // El embarque quedó con el pedido asignado.
    const list = await apiGet(page, '/api/embarques?all=true')
    const data = await list.json()
    const emb = (data.embarques || data.data || [])[0]
    expect(emb).toBeTruthy()
    const nPedidos = emb.pedidos?.length ?? emb._count?.pedidos ?? 0
    expect(nPedidos).toBeGreaterThanOrEqual(1)
  })

  test('crear con 0 pedidos pide confirmación', async ({ page }) => {
    await nuevoEmbarqueLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id

    await abrirWizard(page)
    await page.getByTestId('wizard-siguiente').click()

    await page.getByTestId('confirmar-repartidor').selectOption(trabajadorId as string)
    await page.getByTestId('carga-PACA_AGUA').fill('10')
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
    await page.getByTestId('wizard-siguiente').click()
    await page.getByTestId('confirmar-repartidor').selectOption(trabajadorId as string)
    // 90 pacas > 70 unidades máx
    await page.getByTestId('carga-PACA_AGUA').fill('90')

    await expect(page.getByTestId('capacidad-aviso')).toBeVisible()
    await expect(page.getByTestId('wizard-crear')).toBeEnabled()
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
