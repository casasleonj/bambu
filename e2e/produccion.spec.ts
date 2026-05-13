import { test, expect, type Page } from '@playwright/test'

test.describe('Produccion', () => {
  async function login(page: Page, username: string, password: string) {
    await page.goto('/login')
    await page.fill('input[placeholder="Ingrese usuario"]', username)
    await page.fill('input[placeholder="Ingrese contraseña"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
  }

  async function handleBaseCajaModal(page: Page) {
    const baseCajaBtn = page.locator('button:has-text("Continuar →")')
    if (await baseCajaBtn.count() > 0) {
      await page.fill('input[type="number"]', '50000')
      await baseCajaBtn.click()
      await page.waitForTimeout(500)
    }
  }

  async function fillConteos(page: Page, aguaA: number, aguaB: number, hieloA: number, hieloB: number) {
    await page.getByTestId('conteo-agua-a').fill(String(aguaA))
    await page.getByTestId('conteo-agua-b').fill(String(aguaB))
    await page.getByTestId('conteo-hielo-a').fill(String(hieloA))
    await page.getByTestId('conteo-hielo-b').fill(String(hieloB))
  }

  async function navigateToStep3(page: Page) {
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)
    await fillConteos(page, 100, 102, 50, 52)
    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)
  }

  test('page loads with 4-step stepper', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)

    await page.goto('/produccion')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)

    await expect(page.locator('h1:has-text("Registro de Producción")')).toBeVisible()
    await expect(page.getByText('Stock Inicial', { exact: true })).toBeVisible()
    await expect(page.getByText('Conteos', { exact: true })).toBeVisible()
    await expect(page.getByText('Datos del Turno', { exact: true })).toBeVisible()
    await expect(page.getByText('Conciliar', { exact: true })).toBeVisible()
  })

  test('can navigate through all 4 production steps', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)

    await page.goto('/produccion')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)

    // Step 1: Stock inicial
    await expect(page.locator('h2:has-text("¿Con cuánto amanecimos hoy?")')).toBeVisible()
    await page.click('button:has-text("Siguiente →")')

    // Step 2: Conteos
    await page.waitForTimeout(300)
    await expect(page.locator('h2:has-text("¿Cuánto fabricó el sellador?")')).toBeVisible()
    await fillConteos(page, 100, 102, 50, 52)
    await page.click('button:has-text("Siguiente →")')

    // Step 3: Datos del turno
    await page.waitForTimeout(300)
    await expect(page.locator('h2:has-text("¿Cuánto salió y cuánto quedó?")')).toBeVisible()

    // Select worker
    const selladorSelect = page.locator('label:has-text("Sellador")').locator('..').locator('select')
    await selladorSelect.selectOption({ index: 1 })

    // Fill stock fisico
    await page.getByTestId('stock-fisico-agua').fill('65')
    await page.getByTestId('stock-fisico-hielo').fill('48')

    await page.click('button:has-text("Ver resumen →")')

    // Step 4: Conciliar
    await page.waitForTimeout(300)
    await expect(page.locator('h2:has-text("Balance del día")')).toBeVisible()
    await expect(page.locator('h3:has-text("Balance del día")')).toBeVisible()
  })

  test('calculates promedio correctly', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)

    await page.goto('/produccion')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)

    await page.click('button:has-text("Siguiente →")')
    await page.waitForTimeout(300)

    // Agua: 100 + 102 = 202 / 2 = 101
    await fillConteos(page, 100, 102, 0, 0)
    await expect(page.locator('text=Promedio: 101')).toBeVisible()

    // Hielo: 50 + 52 = 102 / 2 = 51
    await fillConteos(page, 100, 102, 50, 52)
    await expect(page.locator('text=Promedio: 51')).toBeVisible()
  })

  test('shows conciliation with difference when stock fisico does not match', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    await handleBaseCajaModal(page)

    await page.goto('/produccion')
    await page.waitForLoadState('networkidle')
    await handleBaseCajaModal(page)

    // Navigate to step 3
    await navigateToStep3(page)

    // Select worker
    const selladorSelect = page.locator('label:has-text("Sellador")').locator('..').locator('select')
    await selladorSelect.selectOption({ index: 1 })

    // Fill stock fisico that doesn't match expected
    await page.getByTestId('stock-fisico-agua').fill('10')
    await page.getByTestId('stock-fisico-hielo').fill('10')

    await page.click('button:has-text("Ver resumen →")')
    await page.waitForTimeout(300)

    // Should show difference row with non-zero values
    const diffRow = page.locator('tr:has-text("Diferencia")')
    await expect(diffRow).toBeVisible()

    // The status section should not say "Todo cuadra"
    await expect(page.locator('text=Todo cuadra')).not.toBeVisible()
  })
})
