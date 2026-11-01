// @tests api/cliente, api/pedido
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

test.describe('Flujo completo de usuario', () => {

  test.beforeEach(async ({ page }) => {
    // Disable connectivity polling to avoid networkidle timeout
    await page.addInitScript(() => {
      window.__PLAYWRIGHT_TEST__ = true
    })
  })

  test('Flujo: login -> dashboard -> navegar por todas las páginas', async ({ page }) => {
    // 1. Login
    await page.goto(`${BASE_URL}/login`)
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    
    // Esperar redirección a dashboard
    await page.waitForURL(/.*dashboard/, { timeout: 30000 })
    await expect(page.locator('body')).toContainText('Dashboard', { timeout: 10000 })

    // Esperar a que todas las requests del dashboard terminen
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // 2. Clientes
    await page.goto(`${BASE_URL}/clientes`)
    await expect(page.locator('body')).toContainText('Clientes', { timeout: 10000 })

    // 3. Pedidos
    await page.goto(`${BASE_URL}/pedidos`)
    await expect(page.locator('body')).toContainText('Pedidos', { timeout: 10000 })

    // 4. Precios
    await page.goto(`${BASE_URL}/productos`)
    await expect(page.locator('body')).toContainText('Gestiona productos y sus precios por volumen', { timeout: 10000 })

    // 5. Producción
    await page.goto(`${BASE_URL}/produccion`)
    await expect(page.locator('body')).toContainText('Producción', { timeout: 10000 })
  })

  test('Acceso sin autenticación redirige a login', async ({ page }) => {
    await page.goto(`${BASE_URL}/pedidos`)
    await page.waitForURL(/.*login.*/, { timeout: 10000 })
    expect(page.url()).toContain('login')
  })

  test('No hay errores de hydration ni consola en flujo principal', async ({ page }) => {
    // Disable connectivity polling
    await page.addInitScript(() => {
      window.__PLAYWRIGHT_TEST__ = true
    })

    const consoleErrors: string[] = []
    const pageErrors: string[] = []
    const respuestas404: string[] = []

    // El navegador registra cada 404 como «Failed to load resource» sin la URL.
    // Hay un 404 esperado: la app consulta `/api/config?clave=BASE_DIA_<fecha>` y
    // responde 404 mientras no se haya fijado la base del día. Se anota la URL de
    // cada 404 para exigir que sean SOLO esa y no esconder otros.
    page.on('response', (res) => {
      if (res.status() === 404) respuestas404.push(new URL(res.url()).pathname + new URL(res.url()).search)
    })

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    // Flujo completo
    await page.goto(`${BASE_URL}/login`)
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    await page.waitForURL(/.*dashboard/, { timeout: 30000 })
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Navegar por páginas clave
    const pages = ['/pedidos', '/clientes', '/facturas', '/cierre', '/productos']
    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`)
      await page.waitForLoadState('networkidle', { timeout: 10000 })
    }

    expect(respuestas404.filter((u) => !u.startsWith('/api/config?clave=BASE_DIA_'))).toEqual([])
    const sin404Esperado = consoleErrors.filter((m) => !/Failed to load resource: the server responded with a status of 404/.test(m))
    expect(sin404Esperado).toHaveLength(0)
    // Playwright bloquea los service workers (`serviceWorkers: 'block'`). Con el build de
    // producción, Serwist accede entonces a `registration.waiting` sin guarda y lanza
    // `Cannot read properties of undefined (reading 'waiting')` (documentado en
    // `src/app/layout.tsx`, que solo lo evita en desarrollo). Es un artefacto de bloquear el
    // SW en el entorno de pruebas; cualquier OTRO error de página sigue contando.
    const erroresDeSerwist = /Cannot read properties of undefined \(reading 'waiting'\)/
    expect(pageErrors.filter((e) => !erroresDeSerwist.test(e))).toHaveLength(0)
  })

  test('Login con credenciales incorrectas permanece en login', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button:has-text("Ingresar")')
    
    // Esperar un momento para que se procese
    await page.waitForTimeout(2000)
    
    // Debe permanecer en la página de login
    expect(page.url()).toContain('/login')
  })
})
