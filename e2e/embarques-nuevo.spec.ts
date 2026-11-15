// @tests wizard "Nuevo Embarque" — flujo pedidos-primero (rediseño)
import { test, expect, apiGet, createTrabajador } from './fixtures'
import { nuevoEmbarqueLogin, crearPedido, abrirWizard, irAPasoConfirmar, habilitarCrear } from './embarque-wizard'

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
