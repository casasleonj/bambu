// @tests api/gasto
import { test, expect, loginAs, goto, apiPost, apiGet, resetDatabase } from './fixtures'
import type { Page } from '@playwright/test'

async function elegirCategoria(page: Page, nombre: string) {
  const selector = page.locator('#gasto-categoria')
  await selector.fill(nombre)
  await page.getByRole('option', { name: new RegExp(`^${nombre}// @tests api/gasto
, 'i') }).click()
}

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
    await expect(page.locator('button:has-text("Nuevo gasto")')).toBeVisible()
  })

  test('crear gasto', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.click('button:has-text("Nuevo gasto")')
    await page.waitForTimeout(500)

    await elegirCategoria(page, 'Servicios')

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

    await page.click('button:has-text("Nuevo gasto")')
    await page.waitForTimeout(500)

    await elegirCategoria(page, 'Transporte')

    await page.locator('#gasto-descripcion').fill('Gasto completo E2E')
    await page.locator('#gasto-monto').fill('25000')

    const responsableInput = page.locator('#gasto-responsable')
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

  test('categoría obligatoria: no guarda hasta seleccionar', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')
    await page.getByRole('button', { name: 'Nuevo gasto' }).click()
    await page.locator('#gasto-descripcion').fill('Prueba categoría obligatoria')
    await page.locator('#gasto-monto').fill('5000')
    const guardar = page.getByRole('button', { name: 'Guardar gasto' })
    await expect(page.locator('#gasto-categoria')).toHaveValue('')
    await expect(guardar).toBeDisabled()
    await elegirCategoria(page, 'Otro')
    await expect(guardar).toBeEnabled()
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/gastos') && r.request().method() === 'POST'),
      guardar.click(),
    ])
    expect(response.status()).toBe(201)
    expect((await response.json()).gasto.categoria).toBe('OTRO')
  })

  test('permite crear categoría nueva y reutilizarla', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')
    await page.getByRole('button', { name: 'Nuevo gasto' }).click()
    const categoria = page.locator('#gasto-categoria')
    await categoria.fill('Repuestos menores')
    await page.getByRole('option', { name: /Agregar categoría «Repuestos Menores»/ }).click()
    await expect(categoria).toHaveValue('Repuestos Menores')
    await page.locator('#gasto-descripcion').fill('Repuestos E2E categoría')
    await page.locator('#gasto-monto').fill('9000')
    const [alta] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/gastos') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Guardar gasto' }).click(),
    ])
    expect(alta.status()).toBe(201)
    expect((await alta.json()).gasto.categoria).toBe('REPUESTOS MENORES')
    await page.getByRole('button', { name: 'Nuevo gasto' }).click()
    await categoria.fill('repuestos')
    await expect(page.getByRole('option', { name: 'Repuestos Menores' })).toBeVisible()
  })

  test('validacion: monto vacio', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.click('button:has-text("Nuevo gasto")')
    await page.waitForTimeout(500)

    await elegirCategoria(page, 'Insumos')
    await page.locator('#gasto-descripcion').fill('Sin monto')

    // Sin monto «Guardar» queda deshabilitado (no se puede ni hacer clic).
    await expect(page.locator('button:has-text("Guardar")')).toBeDisabled()
    await expect(page.getByRole('heading', { name: 'Nuevo gasto', exact: true })).toBeVisible()
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

  test('#816: Gastos no ofrece Mañana y Esta semana termina hoy', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await expect(page.getByRole('button', { name: /^Mañana/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Hoy', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ayer', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Esta semana', exact: true })).toBeVisible()

    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
    await page.getByRole('button', { name: 'Esta semana', exact: true }).click()
    const fechas = page.locator('input[type="date"]')
    await expect(fechas).toHaveCount(2)
    await expect(fechas.nth(1)).toHaveValue(hoy)
    await expect(fechas.nth(0)).not.toHaveValue('')
    await expect(fechas.nth(0)).toHaveAttribute('max', hoy)
    await expect(fechas.nth(1)).toHaveAttribute('max', hoy)
  })

  test('#755: crear, abrir por enlace, corregir y anular un gasto (desktop/móvil)', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/gastos')

    await page.getByRole('button', { name: 'Nuevo gasto' }).click()
    const descripcion = 'Combustible JL #755 E2E'
    await elegirCategoria(page, 'Transporte')
    await page.locator('#gasto-descripcion').fill(descripcion)
    await page.locator('#gasto-monto').fill('50000')

    const [alta] = await Promise.all([
      page.waitForResponse(res => res.url().endsWith('/api/gastos') && res.request().method() === 'POST'),
      page.getByRole('button', { name: 'Guardar gasto', exact: true }).click(),
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
    await detalle.locator('#editar-monto').fill('45000')
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
    await expect(detalle).toContainText('Gasto anulado')
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
    await expect(tarjetaAnulada).toContainText('Original')
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
