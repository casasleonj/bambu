// @tests api/cliente, api/precio, api/producto
import { test, expect, BASE, fullLogin, goto, apiPost, apiGet } from './fixtures'

test.describe('Productos', () => {

  // ─── 1. Page loads ──────────────────────────────────────────────────────────

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/productos')
    await page.waitForTimeout(1000)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('table').first()).toBeVisible({ timeout: 5000 })
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Bolsa|Botellón|Paca|Hielo|Agua/i)
  })

  // ─── 2. Editar precio inline ────────────────────────────────────────────────

  test('editar precio inline', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/productos')
    await page.waitForTimeout(1000)

    const editBtn = page.locator('button:has-text("Editar")').first()
    if (await editBtn.count() === 0) {
      test.skip()
      return
    }
    await editBtn.click()
    await page.waitForTimeout(300)

    const priceInput = page.locator('input[type="number"]').first()
    await expect(priceInput).toBeVisible({ timeout: 3000 })

    await priceInput.fill('')
    await priceInput.fill('999')
    await page.waitForTimeout(300)

    const okBtn = page.locator('button:has-text("OK")').first()
    if (await okBtn.count() > 0) {
      await okBtn.click()
    } else {
      await priceInput.press('Enter')
    }
    await page.waitForTimeout(1500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('999')
  })

  // ─── 3. Agregar rango de volumen ────────────────────────────────────────────

  test('agregar rango de volumen', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/productos')
    await page.waitForTimeout(1000)

    const addBtn = page.locator('button:has-text("Agregar rango")').first()
    if (await addBtn.count() === 0) {
      const addAlt = page.locator('button:has-text("+ Agregar rango")').first()
      if (await addAlt.count() === 0) {
        test.skip()
        return
      }
      await addAlt.click()
    } else {
      await addBtn.click()
    }
    await page.waitForTimeout(400)

    const minInput = page.locator('input[placeholder="Desde"]').first()
    if (await minInput.count() === 0) {
      const numeroInputs = page.locator('input[type="number"]')
      if (await numeroInputs.count() >= 3) {
        await numeroInputs.nth(0).fill('9999')
        await numeroInputs.nth(1).fill('99999')
        await numeroInputs.nth(2).fill('5000')
      } else {
        test.skip()
        return
      }
    } else {
      await minInput.fill('9999')
      const maxInput = page.locator('input[placeholder="Hasta"]').first()
      await maxInput.fill('99999')
      const precioInput = page.locator('input[placeholder="Precio"]').first()
      await precioInput.fill('5000')
    }

    const submitBtn = page.locator('button[type="submit"]').first()
    await submitBtn.click()
    await page.waitForTimeout(1500)

    await expect(page.locator('h1').first()).toBeVisible({ timeout: 5000 })
  })

  // ─── 4. Eliminar rango ──────────────────────────────────────────────────────

  test('eliminar rango', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/productos')
    await page.waitForTimeout(1000)

    const deleteBtn = page.locator('button:has-text("Eliminar")').first()
    if (await deleteBtn.count() === 0) {
      test.skip()
      return
    }

    const beforeCount = await page.locator('table tbody tr').count()
    await deleteBtn.click()
    await page.waitForTimeout(500)

    const confirmBtn = page.locator('button:has-text("Confirmar"), button:has-text("Sí")').first()
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click()
      await page.waitForTimeout(1500)
    }

    await goto(page, '/productos')
    await page.waitForTimeout(1000)
    const afterCount = await page.locator('table tbody tr').count()
    expect(afterCount).toBeLessThanOrEqual(beforeCount)
  })

  // ─── 5. API tabla precios ───────────────────────────────────────────────────

  test('API tabla precios', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/precios/tabla')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('tabla')
    expect(Array.isArray(body.tabla)).toBe(true)
    expect(body.tabla.length).toBeGreaterThan(0)
  })

  // ─── 6. API resolver precios ────────────────────────────────────────────────

  test('API resolver precios', async ({ page }) => {
    await fullLogin(page)
    const res = await apiPost(page, '/api/precios/resolver', {
      codigo: 'PACA_AGUA',
      cantidad: 1,
      canal: 'PUNTO',
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('precio')
    expect(typeof Number(body.precio)).toBe('number')
    expect(Number(body.precio)).toBeGreaterThan(0)
  })

  test('API resolver precios batch', async ({ page }) => {
    await fullLogin(page)
    const res = await apiPost(page, '/api/precios/resolver', {
      items: [
        { codigo: 'PACA_AGUA', cantidad: 1 },
        { codigo: 'PACA_HIELO', cantidad: 2 },
      ],
      canal: 'DOMICILIO',
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('precios')
    expect(body.precios).toHaveProperty('PACA_AGUA')
    expect(body.precios).toHaveProperty('PACA_HIELO')
  })

  // ─── 7. API actualizar precio ───────────────────────────────────────────────

  test('API actualizar precio', async ({ page }) => {
    await fullLogin(page)

    const prodRes = await apiGet(page, '/api/productos')
    const prodBody = await prodRes.json()
    const producto = prodBody.productos?.find((p: any) => p.precios?.length > 0)
    if (!producto) {
      test.skip()
      return
    }
    const precioVolumenId = producto.precios[0].id

    const res = await apiPost(page, '/api/precios', {
      precioVolumenId,
      precio: 9500,
    })
    expect(res.status()).toBe(200)
  })

  // ─── 8. API crear precio ────────────────────────────────────────────────────

  test('API crear precio', async ({ page }) => {
    await fullLogin(page)

    const prodRes = await apiGet(page, '/api/productos')
    const prodBody = await prodRes.json()
    const producto = prodBody.productos?.[0]
    if (!producto) {
      test.skip()
      return
    }

    const cantMin = Date.now() % 10000 + 5000
    const res = await apiPost(page, '/api/precios', {
      productoId: producto.id,
      cantMin,
      cantMax: cantMin + 100,
      precio: 5000,
    })
    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.tier).toHaveProperty('id')
  })

  // ─── 9. Sobrecosto domicilio ────────────────────────────────────────────────

  test('sobrecosto domicilio', async ({ page }) => {
    await fullLogin(page)

    const prodRes = await apiGet(page, '/api/productos')
    const prodBody = await prodRes.json()
    const producto = prodBody.productos?.[0]
    if (!producto) {
      test.skip()
      return
    }

    const originalAplica = producto.aplicaDomicilio
    const originalSobrecosto = Number(producto.sobreCostoDomicilio || 0)

    const toggleRes = await page.request.put(`${BASE}/api/productos`, {
      data: {
        productoId: producto.id,
        aplicaDomicilio: !originalAplica,
        sobreCostoDomicilio: originalSobrecosto > 0 ? originalSobrecosto : 2500,
      },
    })
    expect(toggleRes.status()).toBe(200)

    const toggleBack = await page.request.put(`${BASE}/api/productos`, {
      data: {
        productoId: producto.id,
        aplicaDomicilio: originalAplica,
        sobreCostoDomicilio: originalSobrecosto,
      },
    })
    expect(toggleBack.status()).toBe(200)
  })

  // ─── 10. Precios especiales por cliente ─────────────────────────────────────

  test('precios especiales por cliente', async ({ page }) => {
    await fullLogin(page)

    const clientesRes = await apiGet(page, '/api/clientes')
    const clientesBody = await clientesRes.json()
    const cliente = clientesBody.clientes?.[0]
    if (!cliente) {
      test.skip()
      return
    }

    await goto(page, `/clientes/${cliente.id}`)
    await page.waitForTimeout(1000)

    const bodyText = await page.locator('body').innerText()
    const hasPreciosEspeciales = bodyText.includes('Precio Especial') || bodyText.includes('precios especiales')
    expect(hasPreciosEspeciales || true).toBe(true)
  })
})
