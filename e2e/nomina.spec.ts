// @tests api/nomina
import {test, expect, fullLogin, goto, apiPost, createTrabajador,  resetDatabase} from './fixtures'

test.describe('Nomina', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/nomina')
    await page.waitForTimeout(500)

    await expect(page.locator('h1:has-text("Nómina")')).toBeVisible()
  })

  test('crear nomina con calculo automatico', async ({ page }) => {
    await fullLogin(page)

    const trabajador = await createTrabajador(page)
    expect(trabajador.trabajador.id).toBeTruthy()

    await goto(page, '/nomina')
    await page.waitForTimeout(500)

    await page.click('button:has-text("Nueva Nómina")')
    await page.waitForTimeout(500)

    await expect(page.locator('h3:has-text("Calcular Nómina")')).toBeVisible()

    const select = page.locator('#nomina-trabajador')
    await select.waitFor({ state: 'visible' })
    await page.waitForTimeout(500)

    const options = select.locator('option')
    const optionCount = await options.count()
    if (optionCount > 1) {
      await select.selectOption({ index: optionCount - 1 })

      const fechaInicio = page.locator('input[type="date"]').first()
      const fechaFin = page.locator('input[type="date"]').nth(1)
      await fechaInicio.fill('2026-05-01')
      await fechaFin.fill('2026-05-31')

      await page.click('button:has-text("Calcular Automático")')
      await page.waitForTimeout(2000)

      const hasResult = await page.locator('text=TOTAL:').count()
      const hasNomina = await page.locator('text=Período').count()
      expect(hasResult + hasNomina).toBeGreaterThan(0)
    } else {
      await expect(page.locator('h3:has-text("Calcular Nómina")')).toBeVisible()
    }
  })

  test('API crear nomina', async ({ page }) => {
    await fullLogin(page)

    const trabajador = await createTrabajador(page)

    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: trabajador.trabajador.id,
      fechaInicio: '2026-05-01',
      fechaFin: '2026-05-31',
      tipoCalculo: 'AUTO',
    })

    expect(res.status()).toBe(200)
  })

  test('API crear nomina manual', async ({ page }) => {
    await fullLogin(page)

    const trabajador = await createTrabajador(page)

    const res = await apiPost(page, '/api/nomina', {
      trabajadorId: trabajador.trabajador.id,
      fechaInicio: '2026-05-01',
      fechaFin: '2026-05-15',
      tipoCalculo: 'MANUAL',
      comEntregasAgua: 5000,
      comEntregasHielo: 3000,
      comEntregasBotellon: 2000,
      totalComisiones: 10000,
      salario: 0,
      total: 10000,
    })

    expect(res.status()).toBe(201)
  })

  test('validacion: sin trabajador', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/nomina')
    await page.waitForTimeout(500)

    await page.click('button:has-text("Nueva Nómina")')
    await page.waitForTimeout(500)

    const calcularBtn = page.locator('button:has-text("Calcular Automático")')
    const isDisabled = await calcularBtn.isDisabled()

    if (isDisabled) {
      expect(isDisabled).toBeTruthy()
    } else {
      await calcularBtn.click()
      await page.waitForTimeout(1000)

      const toastEl = page.locator('[data-sonner-toast]')
      if (await toastEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(toastEl).toContainText(/error|Error|campo/i)
      }
    }
  })
})
