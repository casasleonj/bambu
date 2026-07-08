import { test, expect, fullLogin, goto, apiPost, createClienteFull, createNegocio, resetDatabase } from './fixtures'

test.describe('Pedidos - display prioriza nombre del negocio', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 720 } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('pedido a negocio muestra el negocio prominente en lista y detalle', async ({ page }) => {
    test.setTimeout(120000)

    await fullLogin(page)

    // Crear cliente Pedro Pérez
    const clienteRes = await createClienteFull(page, {
      nombre: 'Pedro',
      apellido: 'Pérez',
      telefono: '3999000002',
      direccion: 'Calle Pedro 1',
      barrio: 'Centro',
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.data?.id
    if (!clienteId) throw new Error('No se pudo crear cliente de prueba')

    // Crear 3 negocios
    await createNegocio(page, { clienteId, nombre: 'Tienda Norte' })
    await createNegocio(page, { clienteId, nombre: 'Tienda Centro' })
    const neg3 = await createNegocio(page, { clienteId, nombre: 'Tienda Sur' })

    const negocioId = neg3.data?.id || neg3.negocio?.id
    if (!negocioId) throw new Error('No se pudo crear negocio de prueba')

    // Crear pedido al Negocio 3 (Tienda Sur)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId,
      negocioId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      pagos: [],
    })
    const pedidoData = await pedidoRes.json()
    const pedidoNumero = pedidoData.data?.pedido?.numero || pedidoData.pedido?.numero
    if (!pedidoNumero) throw new Error('No se pudo crear pedido de prueba')

    await goto(page, '/pedidos')

    // Verificar lista: nombre del negocio prominente + "de Pedro Pérez" como subtexto
    const row = page.locator(`tr:has-text("#${pedidoNumero}")`)
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row.locator('text=Tienda Sur')).toBeVisible()
    await expect(row.locator('text=de Pedro Pérez')).toBeVisible()

    // Abrir detalle
    await row.locator('button[aria-label="Ver detalle"]').click()
    await expect(page.locator('h2:has-text("Tienda Sur")')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('h2:has-text("de Pedro Pérez")')).toBeVisible()

    // Cerrar detalle
    await page.locator('button[aria-label="Cerrar"]').first().click()
  })
})
