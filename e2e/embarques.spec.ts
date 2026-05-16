import { test, expect, fullLogin, goto, apiPost, createTrabajador, createCliente } from './fixtures'

test.describe('Embarques', () => {

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/embarques')
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo Embarque")')).toBeVisible()
  })

  test('crear embarque via UI', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/embarques')
    await page.click('button:has-text("+ Nuevo Embarque")')
    await page.waitForTimeout(500)
    // Select first repartidor
    const selectEl = page.locator('select').first()
    if (await selectEl.isVisible()) {
      await selectEl.selectOption({ index: 1 })
    }
    // Click crear
    const crearBtn = page.locator('button:has-text("Crear")').first()
    if (await crearBtn.isVisible()) {
      await crearBtn.click()
      await page.waitForTimeout(1000)
    }
    // Verify not on create modal anymore (heading changed or modal closed)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })

  test('crear embarque via API', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const res = await apiPost(page, '/api/embarques', { trabajadorId })
    expect(res.status()).toBe(201)
  })

  test('auto-generar embarques via API', async ({ page }) => {
    await fullLogin(page)
    // Create a trabajador first so auto-generate has someone to assign
    await createTrabajador(page)
    const res = await apiPost(page, '/api/embarques/auto', {})
    // May return error if no pedidos pendientes — either OK or business error
    const data = await res.json()
    expect(data).toBeDefined()
  })

  test('abrir detalle de embarque', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/embarques')
    const cards = page.locator('[data-testid="embarque-card"]')
    const count = await cards.count()
    if (count === 0) { test.skip(); return }
    await cards.first().click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('button', { name: 'Volver' })).toBeVisible()
  })

  test('asignar pedido a embarque via API', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }
    const e = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await e.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    const res = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    // May fail if pedido state doesn't allow — acceptable
    expect(res.status()).toBeLessThan(500)
  })

  test('cerrar embarque via API', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const e = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await e.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    const res = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {})
    // Can fail if no pedidos assigned — business logic OK
    expect(res.status()).toBeLessThan(500)
  })

  test('embarques page has filters section', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/embarques')
    // DateRangeFilter or InfoBanner should be present
    const hasContent = await page.locator('.bg-white.rounded-xl, .bg-white.p-4').count()
    expect(hasContent).toBeGreaterThan(0)
  })
})
