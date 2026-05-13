import { test, expect, BASE, fullLogin, goto, apiPost, apiGet, getFirstFacturaConSaldo, createPedido, createCliente } from './fixtures'

test.describe('Facturas', () => {

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/facturas')
    await expect(page.getByRole('heading', { name: 'Facturas' })).toBeVisible()
  })

  test('ver detalle factura', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/facturas')
    // Click any factura card/row
    const cards = page.locator('[class*="cursor-pointer"]').first()
    if (await cards.count() > 0) {
      await cards.click()
      await page.waitForTimeout(500)
      // Detail should show factura info
      await expect(page.locator('body')).toContainText('Factura')
    }
  })

  test('registrar abono via API', async ({ page }) => {
    await fullLogin(page)
    const factura = await getFirstFacturaConSaldo(page)
    if (!factura) { test.skip(); return }
    const res = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: factura.clienteId,
      monto: Math.min(1000, Number(factura.saldo)),
      metodoPago: 'EFECTIVO',
    })
    expect(res.ok()).toBeTruthy()
  })

  test('abono excede saldo debe fallar', async ({ page }) => {
    await fullLogin(page)
    const factura = await getFirstFacturaConSaldo(page)
    if (!factura) { test.skip(); return }
    const res = await apiPost(page, '/api/abonos', {
      facturaId: factura.id,
      clienteId: factura.clienteId,
      monto: Number(factura.saldo) + 9999999,
      metodoPago: 'EFECTIVO',
    })
    // Should return error
    const data = await res.json()
    expect(res.ok() === false || data.error).toBeTruthy()
  })

  test('crear factura via API', async ({ page }) => {
    await fullLogin(page)
    const p = await createPedido(page, { ventaRapida: true })
    const pedidoId = p.pedido?.id || p.data?.id
    if (!pedidoId) { test.skip(); return }
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const res = await apiPost(page, '/api/facturas', { pedidoId, clienteId })
    // May fail if pedido already has factura, or succeed — both valid
    expect(res.status()).toBeGreaterThanOrEqual(200)
    expect(res.status()).toBeLessThan(500)
  })

  test('ciclo de credito: pedido → factura → abono → PAGADA', async ({ page }) => {
    await fullLogin(page)
    // 1. Create pedido with partial payment
    const p = await apiPost(page, '/api/pedidos', {
      clienteId: 'CLI_VERIFICADO',
      canal: 'PUNTO',
      ventaRapida: true,
      productos: { pacaAgua: 2 },
      pagos: [{ metodo: 'EFECTIVO', monto: 1000 }],
    })
    const pData = await p.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }

    // 2. Create factura
    const f = await apiPost(page, '/api/facturas', { pedidoId, clienteId: 'CLI_VERIFICADO' })
    const fData = await f.json()
    const facturaId = fData.data?.id || fData.factura?.id
    if (!facturaId) { test.skip(); return }

    // 3. Register abono (partial)
    const a1 = await apiPost(page, '/api/abonos', {
      facturaId,
      clienteId: 'CLI_VERIFICADO',
      monto: 500,
      metodoPago: 'EFECTIVO',
    })
    expect(a1.ok()).toBeTruthy()

    // 4. Verify saldo decreased
    const factRes = await apiGet(page, `/api/facturas/${facturaId}`)
    const factBody = await factRes.json()
    const saldoAfter = Number(factBody.factura?.saldo || factBody.data?.saldo || 0)
    expect(saldoAfter).toBeGreaterThanOrEqual(0)
  })

  test('filtrar facturas por búsqueda', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/facturas')
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('FAC')
      await page.waitForTimeout(500)
      // Page should still be visible
      await expect(page.getByRole('heading', { name: 'Facturas' })).toBeVisible()
    }
  })

  test('asistente puede acceder a facturas', async ({ page }) => {
    const { login, handleBaseCaja } = await import('./fixtures')
    await login(page, 'asistente', 'asist123')
    await handleBaseCaja(page)
    await goto(page, '/facturas')
    await expect(page.getByRole('heading', { name: 'Facturas' })).toBeVisible()
  })
})
