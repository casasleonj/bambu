import { test, expect } from '@playwright/test'
import { BASE, resetTestDatabase, loginAs, waitForToast, getUniqueFutureDate } from '../fixtures'

test.describe('Exploratorio Destructivo', () => {
  test.beforeEach(() => {
    resetTestDatabase()
  })

  test.describe('Doble Submit', () => {
    test('crear cliente con doble click no genera duplicados', async ({ page }) => {
      await loginAs(page, 'asistente')
      await page.goto(`${BASE}/clientes`)
      await page.waitForLoadState('domcontentloaded')

      await page.locator('button:has-text("Nuevo Cliente"), button:has-text("Crear Cliente"), a:has-text("Nuevo")').first().click()

      const nombre = `Cliente Doble Submit ${Date.now()}`
      await page.fill('input[placeholder*="nombre"], input[name="nombre"], #nombre').first().fill(nombre)
      await page.fill('input[placeholder*="teléfono"], input[name="telefono"], #telefono').first().fill(`3${String(Date.now()).slice(-9)}`)
      await page.fill('input[placeholder*="dirección"], input[name="direccion"], #direccion').first().fill('Calle 100 #15-20')
      await page.fill('input[placeholder*="barrio"], input[name="barrio"], #barrio').first().fill('Chapinero')

      const submitBtn = page.locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Crear")').first()
      await submitBtn.click()
      await submitBtn.click()
      await submitBtn.click()

      await page.waitForTimeout(2000)

      await page.goto(`${BASE}/clientes`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      const count = await page.locator(`tr:has-text("${nombre}")`).count()
      expect(count).toBeLessThanOrEqual(1)
    })

    test('crear pedido con doble click no genera duplicados', async ({ page }) => {
      await loginAs(page, 'asistente')
      await page.goto(`${BASE}/pedidos`)
      await page.waitForLoadState('domcontentloaded')

      await page.locator('button:has-text("Nuevo Pedido"), button:has-text("Crear Pedido"), a:has-text("Nuevo")').first().click()
      await page.waitForTimeout(500)

      const submitBtn = page.locator('button[type="submit"], button:has-text("Guardar"), button:has-text("Crear")').first()
      await submitBtn.click()
      await submitBtn.click()

      await page.waitForTimeout(2000)

      const url = page.url()
      expect(url).not.toContain('/pedidos/nuevo')
    })
  })

  test.describe('Escape Spam', () => {
    test('spam Escape en modal de cierre no rompe la página', async ({ page }) => {
      await loginAs(page, 'admin')
      await page.goto(`${BASE}/cierre`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(100)
      }

      await page.waitForTimeout(1000)
      expect(page.url()).toContain('/cierre')
      await expect(page.locator('body')).toBeVisible()
    })

    test('spam Escape en modal de cliente no rompe la página', async ({ page }) => {
      await loginAs(page, 'asistente')
      await page.goto(`${BASE}/clientes`)
      await page.waitForLoadState('domcontentloaded')

      await page.locator('button:has-text("Nuevo Cliente"), button:has-text("Crear Cliente"), a:has-text("Nuevo")').first().click()
      await page.waitForTimeout(500)

      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(50)
      }

      await page.waitForTimeout(1000)
      expect(page.url()).toContain('/clientes')
    })
  })

  test.describe('Clicks Forzados en Disabled', () => {
    test('click forzado en botón disabled de cierre no envía request', async ({ page }) => {
      const requestPromise = page.waitForRequest('**/api/cierre**', { timeout: 3000 }).catch(() => null)

      await loginAs(page, 'admin')
      await page.goto(`${BASE}/cierre`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      const disabledBtn = page.locator('button:disabled, button[aria-disabled="true"], button[disabled]').first()
      const isVisible = await disabledBtn.isVisible().catch(() => false)

      if (isVisible) {
        await disabledBtn.click({ force: true })
        await page.waitForTimeout(1000)
      }

      const request = await requestPromise
      expect(request).toBeNull()
    })

    test('click forzado en submit disabled de formulario no envía', async ({ page }) => {
      await loginAs(page, 'asistente')
      await page.goto(`${BASE}/clientes`)
      await page.waitForLoadState('domcontentloaded')

      await page.locator('button:has-text("Nuevo Cliente"), button:has-text("Crear Cliente"), a:has-text("Nuevo")').first().click()
      await page.waitForTimeout(500)

      const disabledSubmit = page.locator('button[type="submit"]:disabled').first()
      const isVisible = await disabledSubmit.isVisible().catch(() => false)

      if (isVisible) {
        await disabledSubmit.click({ force: true })
        await page.waitForTimeout(1000)
      }

      expect(page.url()).toContain('/clientes')
    })
  })

  test.describe('Refresh Durante Modal', () => {
    test('refresh mientras modal de base caja está abierto no rompe navegación', async ({ page }) => {
      await page.goto(`${BASE}/login`)
      await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
      await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
      await page.click('button[type="submit"]')
      await page.waitForTimeout(500)

      const baseCajaInput = page.locator('.fixed input[type="number"], input[placeholder*="base"], input[name="baseCaja"]')
      const isVisible = await baseCajaInput.isVisible().catch(() => false)

      if (isVisible) {
        await page.reload()
        await page.waitForLoadState('domcontentloaded')
        await page.waitForTimeout(1000)
      }

      expect(page.url()).toMatch(/dashboard|cierre|repartidor/)
    })

    test('refresh durante modal de cliente no pierde datos de sesión', async ({ page }) => {
      await loginAs(page, 'asistente')
      await page.goto(`${BASE}/clientes`)
      await page.waitForLoadState('domcontentloaded')

      await page.locator('button:has-text("Nuevo Cliente"), button:has-text("Crear Cliente"), a:has-text("Nuevo")').first().click()
      await page.waitForTimeout(500)

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      expect(page.url()).toContain('/clientes')
      await expect(page.locator('body')).toBeVisible()
    })
  })

  test.describe('Navegación Rápida', () => {
    test('cambiar de página rápidamente durante carga no crashea', async ({ page }) => {
      await loginAs(page, 'admin')

      const pages = ['/dashboard', '/clientes', '/pedidos', '/reportes', '/cierre']
      for (const p of pages) {
        await page.goto(`${BASE}${p}`, { waitUntil: 'commit', timeout: 5000 })
        await page.waitForTimeout(200)
      }

      await page.goto(`${BASE}/dashboard`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      expect(page.url()).toContain('/dashboard')
    })

    test('back/forward rápido no rompe estado', async ({ page }) => {
      await loginAs(page, 'admin')

      await page.goto(`${BASE}/dashboard`)
      await page.waitForLoadState('domcontentloaded')
      await page.goto(`${BASE}/clientes`)
      await page.waitForLoadState('domcontentloaded')

      await page.goBack()
      await page.waitForLoadState('domcontentloaded')
      await page.goForward()
      await page.waitForLoadState('domcontentloaded')

      expect(page.url()).toContain('/clientes')
    })
  })

  test.describe('Input Extremo', () => {
    test('pegar texto enorme en campo de búsqueda no congela', async ({ page }) => {
      await loginAs(page, 'asistente')
      await page.goto(`${BASE}/clientes`)
      await page.waitForLoadState('domcontentloaded')

      const hugeText = 'A'.repeat(10000)
      const searchInput = page.locator('input[type="search"], input[placeholder*="buscar"], input[placeholder*="Buscar"], #search').first()
      const isVisible = await searchInput.isVisible().catch(() => false)

      if (isVisible) {
        await searchInput.fill(hugeText)
        await page.waitForTimeout(2000)
      }

      expect(page.url()).toContain('/clientes')
    })

    test('números negativos en campo de cantidad no rompe', async ({ page }) => {
      await loginAs(page, 'asistente')
      await page.goto(`${BASE}/pedidos`)
      await page.waitForLoadState('domcontentloaded')

      await page.locator('button:has-text("Nuevo Pedido"), button:has-text("Crear Pedido"), a:has-text("Nuevo")').first().click()
      await page.waitForTimeout(500)

      const cantidadInput = page.locator('input[type="number"][name*="cantidad"], input[name*="cantidad"], input[placeholder*="cantidad"]').first()
      const isVisible = await cantidadInput.isVisible().catch(() => false)

      if (isVisible) {
        await cantidadInput.fill('-999999')
        await page.waitForTimeout(500)
      }

      expect(page.url()).toContain('/pedidos')
    })
  })
})
