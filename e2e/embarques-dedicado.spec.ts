import { test, expect, fullLogin, apiPost, createCliente, createTrabajador, createEmbarque, resetDatabase } from './fixtures'

test.describe('Embarques: ruta dedicada /embarques/[id]', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })
  test.setTimeout(60000)


  test.beforeAll(() => {
    resetDatabase()
  })

  test('muestra pedidos asignados y permite navegar al pedido', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only')
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    expect(pedidoRes.status()).toBeLessThan(500)
    const pedidoBody = await pedidoRes.json()
    const pedidoId = pedidoBody.pedido?.id
    const pedidoNumero = pedidoBody.pedido?.numero

    const trabajador = await createTrabajador(page)
    const embarqueRes = await createEmbarque(page, trabajador.trabajador.id)
    const embarqueId = embarqueRes.embarque.id

    const enviarRes = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    expect(enviarRes.status()).toBeLessThan(500)

    await page.goto(`/embarques/${embarqueId}`)
    await page.waitForSelector(`text=Embarque #`, { timeout: 10000 })
    await expect(page.locator(`text=#${pedidoNumero}`).first()).toBeVisible()

    const verPedidoLink = page.locator('a[href^="/pedidos?openPedido="]').first()
    await expect(verPedidoLink).toBeVisible({ timeout: 10000 })
    await verPedidoLink.click()
    await page.waitForURL(`**/pedidos?openPedido=${pedidoId}`, { timeout: 10000 })
    await expect(page.locator(`text=#${pedidoNumero}`).first()).toBeVisible({ timeout: 10000 })
  })

  test('remueve pedido del embarque y vuelve a PENDIENTE', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only')
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pedidoBody = await pedidoRes.json()
    const pedidoId = pedidoBody.pedido?.id
    const pedidoNumero = pedidoBody.pedido?.numero

    const trabajador = await createTrabajador(page)
    const embarqueRes = await createEmbarque(page, trabajador.trabajador.id)
    const embarqueId = embarqueRes.embarque.id

    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })

    await page.goto(`/embarques/${embarqueId}`)
    await page.waitForSelector(`text=#${pedidoNumero}`, { timeout: 10000 })

    await page.click('button:has-text("Quitar")')
    await page.locator('[role="dialog"] button:has-text("Quitar")').click()

    await page.waitForSelector(`text=Pedido #${pedidoNumero} removido`, { timeout: 10000 })
    await expect(page.locator(`tr:has-text("#${pedidoNumero}")`).first()).not.toBeVisible()
  })

  test('detalle de pedido muestra link al embarque', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only')
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pedidoBody = await pedidoRes.json()
    const pedidoId = pedidoBody.pedido?.id
    const pedidoNumero = pedidoBody.pedido?.numero

    const trabajador = await createTrabajador(page)
    const embarqueRes = await createEmbarque(page, trabajador.trabajador.id)
    const embarqueId = embarqueRes.embarque.id

    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })

    await page.goto(`/pedidos?openPedido=${pedidoId}`)
    await page.waitForSelector(`text=#${pedidoNumero}`, { timeout: 10000 })
    await page.locator(`a[href="/embarques/${embarqueId}"]`).click()
    await page.waitForURL(`**/embarques/${embarqueId}`, { timeout: 10000 })
    await expect(page.locator('text=Pedidos asignados')).toBeVisible()
  })

  test('tab Clientes muestra resumen por cliente y abre historial con evento de embarque', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only')
    await fullLogin(page)

    const cliente = await createCliente(page)
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pedidoBody = await pedidoRes.json()
    const pedidoId = pedidoBody.pedido?.id

    const trabajador = await createTrabajador(page)
    const embarqueRes = await createEmbarque(page, trabajador.trabajador.id)
    const embarqueId = embarqueRes.embarque.id

    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })

    await page.goto(`/embarques/${embarqueId}`)
    await page.waitForSelector(`text=#${pedidoBody.pedido?.numero}`, { timeout: 10000 })

    await page.click('[data-testid="tab-clientes"]')
    await expect(page.locator('text=Sin clientes asignados')).not.toBeVisible()
    await expect(page.locator('[data-testid="cliente-historial-button"]').first()).toBeVisible()

    await page.click('[data-testid="cliente-historial-button"]')
    await expect(page.locator('[data-testid="cliente-historial-modal"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: `Historial de ${cliente.cliente.nombre}` }).first()).toBeVisible()

    await page.click('button:has-text("Embarques")')
    await expect(page.locator('text=Embarque #').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator(`a[href="/embarques/${embarqueId}"]`).first()).toBeVisible()
  })
})
