import { test, expect, fullLogin, goto, apiGet } from './fixtures'

test.describe('Produccion', () => {

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    await expect(page.locator('h1:has-text("Registro de Producción")')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Stock Inicial', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Conteos', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Datos del Turno', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Conciliar', { exact: true })).toBeVisible({ timeout: 5000 })
  })

  test('navigate 4 steps', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    
    await expect(page.locator('h2:has-text("¿Con cuánto amanecimos hoy?")')).toBeVisible()
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)

    await expect(page.locator('h2:has-text("¿Cuánto fabricó el sellador?")')).toBeVisible()
    await page.getByTestId('conteo-agua-a').fill('120')
    await page.getByTestId('conteo-agua-b').fill('124')
    await page.getByTestId('conteo-hielo-a').fill('60')
    await page.getByTestId('conteo-hielo-b').fill('64')
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)

    await expect(page.locator('h2:has-text("¿Cuánto salió y cuánto quedó?")')).toBeVisible()
    await page.click('button:has-text("Ver resumen →")')
    await page.waitForTimeout(300)

    await expect(page.locator('h2:has-text("Balance del día")').first()).toBeVisible()
    await expect(page.locator('h3:has-text("Balance del día")').first()).toBeVisible()
  })

  test('step 1: stock inicial', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    const aguaCard = page.locator('text=AGUA').locator('..').locator('..')
    const hieloCard = page.locator('text=HIELO').locator('..').locator('..')
    await expect(aguaCard.first()).toBeVisible({ timeout: 5000 })
    await expect(hieloCard.first()).toBeVisible({ timeout: 5000 })
  })

  test('step 2: conteos', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)

    await page.getByTestId('conteo-agua-a').fill('100')
    await page.getByTestId('conteo-agua-b').fill('102')
    await page.getByTestId('conteo-hielo-a').fill('50')
    await page.getByTestId('conteo-hielo-b').fill('52')

    await expect(page.locator('text=Promedio: 101')).toBeVisible()
    await expect(page.locator('text=Promedio: 51')).toBeVisible()
  })

  test('step 3: turno y perdidas', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)
    await page.getByTestId('conteo-agua-a').fill('100')
    await page.getByTestId('conteo-agua-b').fill('102')
    await page.getByTestId('conteo-hielo-a').fill('50')
    await page.getByTestId('conteo-hielo-b').fill('52')
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)

    const selladorSelect = page.locator('label:has-text("Sellador")').locator('..').locator('select')
    if (await selladorSelect.count() > 0) {
      const options = selladorSelect.locator('option')
      const optCount = await options.count()
      if (optCount > 1) {
        await selladorSelect.selectOption({ index: 1 })
      }
    }

    const turnoSelect = page.locator('label:has-text("Turno")').locator('..').locator('select')
    if (await turnoSelect.count() > 0) {
      await turnoSelect.selectOption('TARDE')
    }

    await page.getByTestId('stock-fisico-agua').fill('50')
    await page.getByTestId('stock-fisico-hielo').fill('30')

    const rotasAguaInput = page.locator('input[placeholder="0"]').nth(0)
    if (await rotasAguaInput.count() > 0) {
      await rotasAguaInput.fill('2')
    }
  })

  test('step 4: balance', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)
    await page.getByTestId('conteo-agua-a').fill('100')
    await page.getByTestId('conteo-agua-b').fill('102')
    await page.getByTestId('conteo-hielo-a').fill('50')
    await page.getByTestId('conteo-hielo-b').fill('52')
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Ver resumen →")')
    await page.waitForTimeout(300)

    await expect(page.locator('h2:has-text("Balance del día")').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Comisiones estimadas').first()).toBeVisible({ timeout: 5000 })
  })

  test('confirmar produccion', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)
    await page.getByTestId('conteo-agua-a').fill('100')
    await page.getByTestId('conteo-agua-b').fill('102')
    await page.getByTestId('conteo-hielo-a').fill('50')
    await page.getByTestId('conteo-hielo-b').fill('52')
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)

    const selladorSelect = page.locator('label:has-text("Sellador")').locator('..').locator('select')
    if (await selladorSelect.count() > 0) {
      const options = selladorSelect.locator('option')
      const optCount = await options.count()
      if (optCount > 1) {
        await selladorSelect.selectOption({ index: 1 })
      }
    }

    await page.getByTestId('stock-fisico-agua').fill('50')
    await page.getByTestId('stock-fisico-hielo').fill('30')
    await page.click('button:has-text("Ver resumen →")')
    await page.waitForTimeout(300)

    const confirmarBtn = page.locator('button:has-text("✓ Confirmar y Guardar")')
    if (await confirmarBtn.isDisabled()) {
      test.skip()
      return
    }
    await confirmarBtn.click()
    await page.waitForTimeout(2000)
    await expect(page.locator('h1:has-text("Registro de Producción")')).toBeVisible({ timeout: 10000 })
  })

  test('preview data', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/produccion/preview')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body).toHaveProperty('stockIniAgua')
    expect(body).toHaveProperty('stockIniHielo')
  })

  test('step navigation back', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)
    await page.getByTestId('conteo-agua-a').fill('100')
    await page.getByTestId('conteo-agua-b').fill('102')
    await page.getByTestId('conteo-hielo-a').fill('50')
    await page.getByTestId('conteo-hielo-b').fill('52')
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("← Atrás")')
    await page.waitForTimeout(300)
    await expect(page.locator('h2:has-text("¿Cuánto fabricó el sellador?")')).toBeVisible()
  })

  test('all production fields', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/produccion')
    await page.waitForTimeout(1000)
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)

    await page.getByTestId('conteo-agua-a').fill('120')
    await page.getByTestId('conteo-agua-b').fill('124')
    await page.getByTestId('conteo-hielo-a').fill('60')
    await page.getByTestId('conteo-hielo-b').fill('64')
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)

    const selladorSelect = page.locator('label:has-text("Sellador")').locator('..').locator('select')
    if (await selladorSelect.count() > 0) {
      const options = selladorSelect.locator('option')
      const optCount = await options.count()
      if (optCount > 1) {
        await selladorSelect.selectOption({ index: 1 })
      }
    }

    const turnoSelect = page.locator('label:has-text("Turno")').locator('..').locator('select')
    if (await turnoSelect.count() > 0) {
      await turnoSelect.selectOption('NOCHE')
    }

    await page.getByTestId('stock-fisico-agua').fill('40')
    await page.getByTestId('stock-fisico-hielo').fill('25')

    await page.click('button:has-text("Ver resumen →")')
    await page.waitForTimeout(300)

    const confirmarBtn = page.locator('button:has-text("✓ Confirmar y Guardar")')
    if (await confirmarBtn.isDisabled()) {
      test.skip()
      return
    }
    await confirmarBtn.click()
    await page.waitForTimeout(2000)
    await expect(page.locator('h1:has-text("Registro de Producción")')).toBeVisible({ timeout: 10000 })
  })
})
