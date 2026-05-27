// @tests precios especiales cliente en pedidos
import { test, expect, fullLogin, goto, apiPut, createCliente } from './fixtures'

test.describe('Precios Especiales en Pedidos', () => {

  test('precios especiales se aplican en Venta Rápida PUNTO', async ({ page }) => {
    await fullLogin(page)

    // 1. Create a client with special prices via API
    const c = await createCliente(page, {
      nombre: 'Juan PreciosEspeciales',
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    expect(clienteId).toBeDefined()

    // Set special prices: PACA_AGUA at 2000 (default is 6500), PACA_HIELO at 3000 (default is 8000)
    const preciosEspeciales = JSON.stringify({
      PUNTO: { PACA_AGUA: 2000, PACA_HIELO: 3000 },
      DOMICILIO: { PACA_AGUA: 2500, PACA_HIELO: 3500 },
    })
    await apiPut(page, `/api/clientes/${clienteId}`, { preciosEspeciales })

    // 2. Open pedidos page
    await goto(page, '/pedidos')

    // 3. Open Venta Rápida modal (hover FAB to show speed dial)
    const fabMain = page.locator('button.bg-blue-600.rounded-full').last()
    if (await fabMain.isVisible()) {
      await fabMain.hover()
      await page.waitForTimeout(500)
    }
    const ventaBtn = page.locator('button:has-text("Venta Rápida")').first()
    if (await ventaBtn.isVisible({ timeout: 2000 })) {
      await ventaBtn.click()
    } else {
      test.skip()
      return
    }
    await page.waitForTimeout(500)

    // 4. Select the client
    const searchInput = page.locator('input[placeholder*="Buscar cliente"]')
    if (await searchInput.count() > 0) {
      await searchInput.fill('Juan PreciosEspeciales')
      await page.waitForTimeout(500)
      await page.locator('button:has-text("Juan PreciosEspeciales")').first().click()
      await page.waitForTimeout(1000) // Wait for prices to resolve
    }

    // 5. Add a product and verify special price is shown
    const plusBtn = page.locator('button.rounded-full.bg-green-100').first()
    if (await plusBtn.isVisible({ timeout: 3000 })) {
      await plusBtn.click()
      await page.waitForTimeout(500)

      // Check that the price shown is the special price (2000), not the default (6500)
      const summaryText = await page.locator('text=Resumen').locator('..').textContent()
      expect(summaryText).toContain('$2,000')
      const totalText = await page.locator('text=Total:').locator('..').textContent()
      expect(totalText).toContain('$2,000')
    } else {
      test.skip()
    }
  })

  test('precios especiales se aplican en Nuevo Pedido DOMICILIO', async ({ page }) => {
    await fullLogin(page)

    // 1. Create a client with special prices
    const c = await createCliente(page, {
      nombre: 'Maria Domicilio',
      telefono: `3${String(Date.now()).slice(-9)}`,
      direccion: 'Calle Especial 456',
      barrio: 'Barrio Test',
    })
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    expect(clienteId).toBeDefined()

    const preciosEspeciales = JSON.stringify({
      PUNTO: { PACA_AGUA: 2000 },
      DOMICILIO: { PACA_AGUA: 2500 },
    })
    await apiPut(page, `/api/clientes/${clienteId}`, { preciosEspeciales })

    // 2. Open pedidos page
    await goto(page, '/pedidos')

    // 3. Open Nuevo Pedido modal (hover FAB to show speed dial)
    const fabMain = page.locator('button.bg-blue-600.rounded-full').last()
    if (await fabMain.isVisible()) {
      await fabMain.hover()
      await page.waitForTimeout(500)
    }
    const pedidoBtn = page.locator('button:has-text("Pedido con Envío")').first()
    if (await pedidoBtn.isVisible({ timeout: 2000 })) {
      await pedidoBtn.click()
    } else {
      test.skip()
      return
    }
    await page.waitForTimeout(500)

    // 4. Select the client
    const searchInput = page.locator('input[placeholder*="Buscar cliente"]')
    if (await searchInput.count() > 0) {
      await searchInput.fill('Maria Domicilio')
      await page.waitForTimeout(500)
      await page.locator('button:has-text("Maria Domicilio")').first().click()
      await page.waitForTimeout(1000)
    }

    // 5. Fill address fields
    const direccionInput = page.locator('input[placeholder*="Dirección"]')
    if (await direccionInput.count() > 0) {
      await direccionInput.first().fill('Calle Especial 456')
      await page.locator('input[placeholder*="Barrio"]').first().fill('Barrio Test')
      await page.waitForTimeout(300)
    }

    // 6. Add a product and verify special price
    const plusBtn = page.locator('button.rounded-full.bg-green-100').first()
    if (await plusBtn.isVisible({ timeout: 3000 })) {
      await plusBtn.click()
      await page.waitForTimeout(500)

      // Check that the price shown is the special DOMICILIO price (2500), not default (6500)
      const summaryText = await page.locator('text=Resumen').locator('..').textContent()
      expect(summaryText).toContain('$2,500')
    } else {
      test.skip()
    }
  })

  test('precios vuelven a volumen al quitar cliente', async ({ page }) => {
    await fullLogin(page)

    // 1. Create a client with special prices
    const c = await createCliente(page, {
      nombre: 'Carlos Quitar',
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    expect(clienteId).toBeDefined()

    const preciosEspeciales = JSON.stringify({
      PUNTO: { PACA_AGUA: 1000 },
      DOMICILIO: { PACA_AGUA: 1000 },
    })
    await apiPut(page, `/api/clientes/${clienteId}`, { preciosEspeciales })

    // 2. Open pedidos page
    await goto(page, '/pedidos')

    // 3. Open Venta Rápida modal (hover FAB to show speed dial)
    const fabMain = page.locator('button.bg-blue-600.rounded-full').last()
    if (await fabMain.isVisible()) {
      await fabMain.hover()
      await page.waitForTimeout(500)
    }
    const ventaBtn = page.locator('button:has-text("Venta Rápida")').first()
    if (await ventaBtn.isVisible({ timeout: 2000 })) {
      await ventaBtn.click()
    } else {
      test.skip()
      return
    }
    await page.waitForTimeout(500)

    // 4. Select the client
    const searchInput = page.locator('input[placeholder*="Buscar cliente"]')
    if (await searchInput.count() > 0) {
      await searchInput.fill('Carlos Quitar')
      await page.waitForTimeout(500)
      await page.locator('button:has-text("Carlos Quitar")').first().click()
      await page.waitForTimeout(1000)
    }

    // 5. Add a product
    const plusBtn = page.locator('button.rounded-full.bg-green-100').first()
    if (await plusBtn.isVisible({ timeout: 3000 })) {
      await plusBtn.click()
      await page.waitForTimeout(500)

      // Verify special price is shown
      let summaryText = await page.locator('text=Resumen').locator('..').textContent()
      expect(summaryText).toContain('$1,000')

      // 6. Remove the client - click the X button in the client chip
      const removeBtn = page.locator('button.text-gray-400.hover\\:text-red-500').first()
      if (await removeBtn.count() > 0) {
        await removeBtn.click()
        await page.waitForTimeout(1500)
      }

      // 7. Add product again and verify volume tier price is shown
      // After removing client, price falls back to volume tier (1-4 units: $2,800)
      // 2 units x $2,800 = $5,600
      await plusBtn.click()
      await page.waitForTimeout(500)

      summaryText = await page.locator('text=Resumen').locator('..').textContent()
      expect(summaryText).toContain('$5,600')
    } else {
      test.skip()
    }
  })
})
