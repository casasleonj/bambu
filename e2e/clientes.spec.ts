import { test, expect, type Page } from '@playwright/test'

test.describe('Clientes', () => {
  async function login(page: Page, username: string = 'admin', password: string = 'admin123') {
    await page.goto('/login')
    await page.waitForSelector('input[placeholder="Ingrese usuario"]', { timeout: 10000 })
    await page.fill('input[placeholder="Ingrese usuario"]', username)
    await page.fill('input[placeholder="Ingrese contraseña"]', password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard', { timeout: 10000 })
  }

  async function skipBaseCajaModal(page: Page) {
    await page.waitForTimeout(1000)
    const modalInput = page.locator('input[placeholder="50000"]')
    if (await modalInput.isVisible().catch(() => false)) {
      await modalInput.fill('50000')
      await page.locator('button:has-text("Continuar →")').click()
      await page.waitForTimeout(1000)
    }
  }

  test.beforeEach(async ({ page }) => {
    await login(page)
    await skipBaseCajaModal(page)
  })

  test('page loads with heading and create button', async ({ page }) => {
    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })

    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    await expect(page.locator('button:has-text("+ Nuevo Cliente")')).toBeVisible()
    await expect(page.locator('input[placeholder*="Buscar por nombre"]')).toBeVisible()
  })

  test('create client with basic info', async ({ page }) => {
    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })

    // Open create modal
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForSelector('h2:has-text("Nuevo Cliente")', { timeout: 5000 })

    // Fill basic info
    await page.fill('input[placeholder="Ej: Juan"]', 'Test')
    await page.fill('input[placeholder="Ej: Pérez"]', 'Cliente')
    await page.fill('input[placeholder="Ej: 3111234567"]', '3119998888')
    await page.fill('input[placeholder="Nombre del negocio"]', 'La Bodeguita')
    await page.locator('[role="dialog"] select').selectOption('Tienda')

    // Save
    await page.locator('[role="dialog"] >> button:has-text("Crear cliente")').click()

    // Should show success
    await expect(page.locator('text=Cliente creado exitosamente')).toBeVisible({ timeout: 10000 })
  })

  test('create client with "Otro" business type', async ({ page }) => {
    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })

    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForSelector('h2:has-text("Nuevo Cliente")', { timeout: 5000 })

    await page.fill('input[placeholder="Ej: Juan"]', 'Otro')
    await page.fill('input[placeholder="Ej: Pérez"]', 'Negocio')
    await page.fill('input[placeholder="Ej: 3111234567"]', '3117776666')

    // Select "Otro" from dropdown
    await page.locator('[role="dialog"] select').selectOption('Otro')
    await page.waitForTimeout(300)

    // Additional text input should appear
    const otroInput = page.locator('input[placeholder="¿Qué tipo de negocio es?"]')
    await expect(otroInput).toBeVisible()
    await otroInput.fill('Fábrica de jugos')

    await page.locator('[role="dialog"] >> button:has-text("Crear cliente")').click()
    await expect(page.locator('text=Cliente creado exitosamente')).toBeVisible({ timeout: 10000 })
  })

  test('search and filter clients', async ({ page }) => {
    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })

    // Search by name
    await page.fill('input[placeholder*="Buscar por nombre"]', 'a')
    await page.waitForTimeout(500)

    // Clear search
    await page.fill('input[placeholder*="Buscar por nombre"]', '')
    await page.waitForTimeout(300)

    // Filter by saldo
    await page.click('button:has-text("Con saldo")')
    await page.waitForTimeout(300)

    // Clear all filters
    await page.click('button:has-text("Limpiar filtros")')
    await page.waitForTimeout(300)
  })

  test('view client detail and tabs', async ({ page }) => {
    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })

    // Click first client row
    await page.locator('div[class*="cursor-pointer"]').first().click()

    // Modal should open with actions
    await expect(page.locator('text=Crear Pedido')).toBeVisible()
    await expect(page.locator('text=Llamar')).toBeVisible()

    // Navigate through tabs
    await page.locator('[role="dialog"] >> button:has-text("Historial")').click()
    await page.waitForTimeout(300)
    await page.locator('[role="dialog"] >> button:has-text("Estadísticas")').click()
    await page.waitForTimeout(300)
  })

  test('edit client', async ({ page }) => {
    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })

    // Click first client
    await page.locator('div[class*="cursor-pointer"]').first().click()

    // Click edit
    await page.locator('[role="dialog"] >> button:has-text("Editar")').first().click()
    await page.waitForSelector('h2:has-text("Editar Cliente")', { timeout: 5000 })

    // Change name
    await page.fill('input[placeholder="Ej: Juan"]', 'Nombre Editado')

    // Save
    await page.locator('[role="dialog"] >> button:has-text("Guardar cambios")').click()
    await expect(page.locator('text=Cliente actualizado')).toBeVisible({ timeout: 10000 })
  })

  test('create pedido from client detail', async ({ page }) => {
    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })

    // Click first client
    await page.locator('div[class*="cursor-pointer"]').first().click()

    // Click "Crear Pedido" action
    await page.locator('text=Crear Pedido').click()

    // Should redirect to pedidos page
    await expect(page).toHaveURL(/.*pedidos/)
  })

  test('empty state shows guided steps', async ({ page }) => {
    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })
    await page.fill('input[placeholder*="Buscar por nombre"]', 'XYZ_NONEXISTENT_123')
    await page.waitForTimeout(500)

    await expect(page.locator('text=No hay resultados')).toBeVisible()
  })

  test('asistente can view clients', async ({ page }) => {
    // Navigate to login as asistente
    await page.goto('/login')
    await page.waitForSelector('input[placeholder="Ingrese usuario"]')
    await page.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/dashboard')
    await skipBaseCajaModal(page)

    await page.goto('/clientes')
    await page.waitForSelector('button:has-text("+ Nuevo Cliente")', { timeout: 15000 })

    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  })
})
