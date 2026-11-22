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

  test('sin categoria elegida el gasto se registra como OTRO (categoria por defecto)', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.click('button:has-text("Nuevo Gasto")')
    await page.waitForTimeout(500)

    // La categoría arranca en «OTRO»: ya no hay error por no elegir una.
    await expect(page.locator('#gasto-categoria')).toHaveValue('OTRO')
    await page.locator('#gasto-descripcion').fill('Test sin categoria')
    await page.locator('#gasto-monto').fill('5000')

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/gastos') && r.request().method() === 'POST'),
      page.locator('button:has-text("Guardar")').click(),
    ])
    expect(response.status()).toBe(201)
    expect((await response.json()).gasto.categoria).toBe('OTRO')
  })

  test('validacion: monto vacio', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.click('button:has-text("Nuevo Gasto")')
    await page.waitForTimeout(500)

    await page.locator('#gasto-descripcion').fill('Sin monto')

    // Sin monto «Guardar» queda deshabilitado (no se puede ni hacer clic).
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

  test('#755: crear, abrir por enlace, corregir y anular un gasto (desktop/móvil)', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.getByRole('button', { name: 'Nuevo Gasto' }).click()
    const descripcion = 'Combustible JL #755 E2E'
    await page.locator('#gasto-categoria').selectOption('TRANSPORTE')
    await page.locator('#gasto-descripcion').fill(descripcion)
    await page.locator('#gasto-monto').fill('50000')

    const [alta] = await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/api/gastos') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Guardar', exact: true }).click(),
    ])
    expect(alta.status()).toBe(201)
    const gastoId: string = (await alta.json()).gasto.id
    expect(gastoId).toBeTruthy()

    // El mismo detalle sirve para enlaces compartidos desde Cierre.
    await goto(page, `/gastos?openGasto=${gastoId}`)
    const detalle = page.getByTestId('gasto-detalle')
    await expect(detalle).toContainText(descripcion)
    await expect(detalle).toContainText('50.000')
    await detalle.getByRole('button', { name: 'Corregir', exact: true }).click()
    await detalle.locator('#editar-monto-gasto').fill('45000')
    await detalle.locator('#gasto-motivo-ajuste').fill('Comprobante inicial mal digitado')

    const [correccion] = await Promise.all([
      page.waitForResponse(res => res.url().endsWith(`/api/gastos/${gastoId}`) && res.request().method() === 'PATCH'),
      detalle.getByRole('button', { name: 'Guardar corrección' }).click(),
    ])
    expect(correccion.status()).toBe(200)
    await expect(detalle).toContainText('45.000')

    await detalle.getByRole('button', { name: 'Anular registro' }).click()
    await detalle.locator('#gasto-motivo-origen').selectOption('REGISTRO_DUPLICADO')
    await detalle.locator('#gasto-motivo-ajuste').fill('Se registró dos veces el mismo comprobante')
    await detalle.getByRole('checkbox').check()

    const [anulacion] = await Promise.all([
      page.waitForResponse(res => res.url().endsWith(`/api/gastos/${gastoId}`) && res.request().method() === 'PATCH'),
      detalle.getByRole('button', { name: 'Confirmar anulación' }).click(),
    ])
    expect(anulacion.status()).toBe(200)
    await expect(detalle).toContainText('fue anulado')
    await expect(detalle).toContainText('45.000')
    await expect(detalle.getByRole('button', { name: 'Corregir', exact: true })).toHaveCount(0)

    const final = await apiGet(page, `/api/gastos/${gastoId}`)
    expect(final.status()).toBe(200)
    const gasto = (await final.json()).gasto
    expect(Number(gasto.monto)).toBe(0)
    expect(Number(gasto.montoAntesAnular)).toBe(45000)
    expect(gasto.anuladoAt).toBeTruthy()
    expect(gasto.version).toBe(2)
    await goto(page, '/gastos')
    const tarjetaAnulada = page.getByTestId(`gasto-${gastoId}`)
    await expect(tarjetaAnulada).toContainText('Anulado')
    await expect(tarjetaAnulada).toContainText('Original: ')
    await expect(tarjetaAnulada).toContainText('45.000')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
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
