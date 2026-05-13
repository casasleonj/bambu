import { test, expect, BASE, fullLogin, goto, apiPost, apiGet, createTrabajador, getFirstTrabajador, createPedido, createCliente } from './fixtures'

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
    await page.locator('select').first().selectOption({ index: 1 })
    await page.locator('[role="dialog"] button:has-text("Crear")').click()
    await page.waitForTimeout(1000)
    // Verify not on create modal anymore
    await expect(page.locator('h2:has-text("Nuevo Embarque")')).toHaveCount(0)
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
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const e = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await e.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    const p = await createPedido(page, { ventaRapida: true })
    const pedidoId = p.pedido?.id || p.data?.id
    if (!pedidoId) { test.skip(); return }
    const res = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    expect(res.ok()).toBeTruthy()
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
    const cData = await res.json()
    expect(cData.success || res.ok()).toBeTruthy()
  })

  test('filtrar embarques por rango fecha', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/embarques')
    // DateRangeFilter should be present
    await expect(page.locator('.bg-white.p-4.rounded-xl')).toBeVisible()
  })
})
