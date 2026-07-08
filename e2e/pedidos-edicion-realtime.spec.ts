import { test, expect, fullLogin, goto, apiPost, createClienteFull, resetDatabase } from './fixtures'

test.describe('Pedidos - edición sobrevive a refetch del padre', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1280, height: 720 } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('edición persiste cantidad, precio y dirección tras refetch realtime', async ({ page }) => {
    test.setTimeout(120000)

    await fullLogin(page)

    // Crear cliente con dirección/barrio para envío a domicilio
    const clienteRes = await createClienteFull(page, {
      nombre: 'Edición',
      apellido: 'Realtime',
      telefono: '3999000001',
      direccion: 'Calle Original 1',
      barrio: 'Centro',
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.data?.id
    if (!clienteId) throw new Error('No se pudo crear cliente de prueba')

    // Crear pedido a domicilio via API
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [],
    })
    const pedidoData = await pedidoRes.json()
    const pedidoId = pedidoData.data?.pedido?.id || pedidoData.pedido?.id
    const pedidoNumero = pedidoData.data?.pedido?.numero || pedidoData.pedido?.numero
    if (!pedidoId || !pedidoNumero) throw new Error('No se pudo crear pedido de prueba')

    await goto(page, '/pedidos')

    // Interceptar PUT para capturar el body enviado
    let putBody: unknown = null
    await page.route('**/api/pedidos/*', async (route) => {
      if (route.request().method() === 'PUT') {
        putBody = JSON.parse(route.request().postData() || '{}')
      }
      await route.continue()
    })

    // Abrir detalle del pedido
    const row = page.locator(`tr:has-text("#${pedidoNumero}")`)
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.locator('button[aria-label="Ver detalle"]').click()

    // Abrir edición
    const editarBtn = page.locator('button:has-text("Editar")').first()
    await expect(editarBtn).toBeVisible({ timeout: 5000 })
    await editarBtn.click()

    // Esperar que el formulario de edición esté visible
    await expect(page.locator('h2:has-text("Editar Pedido")')).toBeVisible({ timeout: 5000 })

    // Cambiar cantidad (primer input numérico del form)
    const cantidadInput = page.locator('input[type="number"]').first()
    await cantidadInput.fill('25')

    // Cambiar dirección
    const direccionInput = page.locator('input[placeholder*="Dirección"]').first()
    await direccionInput.fill('Calle Modificada 123')
    await direccionInput.press('Tab')

    // Esperar más que el debounce de realtime (500ms) para forzar re-renders del padre
    await page.waitForTimeout(1500)

    // Verificar que los inputs siguen con los valores modificados
    await expect(cantidadInput).toHaveValue('25')
    await expect(direccionInput).toHaveValue('Calle Modificada 123')

    // Guardar
    await page.locator('[data-testid="submit-pedido"]').click()
    await expect(page.locator('text=Pedido actualizado')).toBeVisible({ timeout: 10000 })

    // Verificar que el PUT envió los valores NUEVOS
    expect(putBody).toBeTruthy()
    const body = putBody as { items: Array<{ producto: string; cantidad: number }>; actualizarCliente?: { direccion: string } }
    expect(body.items).toBeDefined()
    expect(body.items[0].cantidad).toBe(25)
    expect(body.actualizarCliente).toMatchObject({
      direccion: 'Calle Modificada 123',
    })

    // Verificar que el cliente se actualizó en backend
    const clienteCheck = await page.request.get(`/api/clientes/${clienteId}`)
    const clienteCheckData = await clienteCheck.json()
    expect(clienteCheckData.cliente?.direccion || clienteCheckData.data?.direccion).toBe('Calle Modificada 123')

    // Recargar y verificar persistencia
    await page.reload()
    const rowAfterReload = page.locator(`tr:has-text("#${pedidoNumero}")`)
    await expect(rowAfterReload).toBeVisible({ timeout: 10000 })
    await rowAfterReload.locator('button[aria-label="Ver detalle"]').click()
    await expect(page.locator('text=Calle Modificada 123')).toBeVisible({ timeout: 5000 })
  })
})
