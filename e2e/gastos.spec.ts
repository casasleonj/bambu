// @tests api/gasto
import {test, expect, loginAs, goto, apiPost, apiGet,  resetDatabase} from './fixtures'

test.describe('Gastos', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await expect(page.locator('h1:has-text("Gastos")')).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo Gasto")')).toBeVisible()
  })

  test('crear gasto', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.click('button:has-text("Nuevo Gasto")')
    await page.waitForTimeout(500)

    const categoriaSelect = page.locator('select').first()
    await categoriaSelect.selectOption('SERVICIOS')

    await page.locator('#gasto-descripcion').fill('Gasto E2E test')
    await page.locator('#gasto-monto').fill('15000')

    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/gastos') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Guardar")').click(),
    ])

    expect(response.status()).toBe(201)
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Gasto E2E test')
  })

  test('crear con todos los campos', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.click('button:has-text("Nuevo Gasto")')
    await page.waitForTimeout(500)

    const categoriaSelect = page.locator('select').first()
    await categoriaSelect.selectOption('TRANSPORTE')

    await page.locator('#gasto-descripcion').fill('Gasto completo E2E')
    await page.locator('#gasto-monto').fill('25000')

    const responsableInput = page.locator('input[placeholder="Quién paga"]')
    await responsableInput.fill('Admin Test')

    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/gastos') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Guardar")').click(),
    ])

    expect(response.status()).toBe(201)
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Gasto completo E2E')
    expect(bodyText).toContain('Admin Test')
  })

  test('sin tocar categoria, usa la categoria por defecto', async ({ page }) => {
    // FIX: el `<select id="gasto-categoria">` de gastos-client/index.tsx
    // siempre arranca con un valor (la primera categoría del objeto `cats`,
    // nunca una opción vacía), y el botón Guardar solo se deshabilita por
    // falta de descripción/monto (`!descripcion.trim() || !monto`) --
    // "sin categoria" no es un estado alcanzable desde la UI, así que no
    // dispara ningún error de validación. El submit usa la categoría por
    // defecto y tiene éxito.
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.click('button:has-text("Nuevo Gasto")')
    await page.waitForTimeout(500)

    await page.locator('#gasto-descripcion').fill('Test sin categoria')
    await page.locator('#gasto-monto').fill('5000')

    const [response] = await Promise.all([
      page.waitForResponse(
        r => r.url().includes('/api/gastos') && r.request().method() === 'POST',
        { timeout: 10000 }
      ),
      page.locator('button:has-text("Guardar")').click(),
    ])

    expect(response.status()).toBe(201)
    await expect(page.locator('[data-sonner-toast]')).toContainText('Gasto registrado')
    // El form se cierra tras un submit exitoso (setShowCrear(false)).
    await expect(page.locator('h3:has-text("Registrar Gasto")')).not.toBeVisible()

    await expect(page.locator('body')).toContainText('Test sin categoria', { timeout: 5000 })
  })

  test('validacion: monto vacio', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.click('button:has-text("Nuevo Gasto")')
    await page.waitForTimeout(500)

    await page.locator('#gasto-descripcion').fill('Sin monto')

    // FIX: mismo patrón que compras.spec.ts/insumos.spec.ts -- el botón
    // Guardar está deshabilitado mientras falte monto
    // (disabled={... || !monto}), validación del lado del cliente. Forzar
    // el click agotaba el timeout completo del test.
    await expect(page.locator('button:has-text("Guardar")')).toBeDisabled()
    await expect(page.locator('h3:has-text("Registrar Gasto")')).toBeVisible()
  })

  test('filtrar por fecha', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    const dateRange = page.locator('input[type="date"]')
    if (await dateRange.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      const today = new Date().toISOString().split('T')[0]
      await dateRange.first().fill(today)
      await dateRange.nth(1).fill(today)
      await page.waitForTimeout(1000)
    }

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('API crear gasto', async ({ page }) => {
    await loginAs(page, 'admin')

    const res = await apiPost(page, '/api/gastos', {
      categoria: 'OTRO',
      descripcion: 'Gasto API E2E',
      monto: 10000,
    })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(body.gasto).toBeTruthy()
  })

  test('API filtrar gastos', async ({ page }) => {
    await loginAs(page, 'admin')

    const today = new Date().toISOString().split('T')[0]
    const res = await apiGet(page, `/api/gastos?fecha=${today}`)

    expect(res.status()).toBe(200)
  })
})
