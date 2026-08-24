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

    // FIX: 'networkidle' nunca resuelve de forma confiable en páginas
    // autenticadas -- RealtimeProvider mantiene una conexión SSE persistente
    // a /api/realtime (mismo motivo ya documentado en otros specs, ej.
    // dos-ventas-rapidas-mismo-cliente.spec.ts: "SSE keeps connection
    // open"). Confirmado en CI real: timeout consistente en mobile aunque
    // pasaba la mayoría de las veces en desktop (dependía de timing).
    await page.waitForLoadState('domcontentloaded')

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
    const unexpected404s: string[] = []

    page.on('console', (msg) => {
      // FIX: "Failed to load resource: ..." es el mensaje genérico que
      // Chromium emite para CUALQUIER respuesta no-2xx, sin URL adjunta --
      // incluye los GET /api/config?clave=X que la app usa a propósito como
      // patrón de feature-detection (404 = "clave no configurada todavía",
      // manejado gracefully por el caller: BASE_DIA_hoy -> banner "Sin base
      // registrada", src/app/api/config/route.ts:20-24). No es un error
      // real. Se descarta acá y se valida por separado más abajo vía la
      // respuesta HTTP real (con URL), donde sí se puede distinguir un 404
      // esperado de uno genuinamente inesperado.
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    page.on('response', (res) => {
      if (res.status() === 404 && !res.url().includes('/api/config?clave=')) {
        unexpected404s.push(`${res.status()} ${res.url()}`)
      }
    })

    // Flujo completo
    await page.goto(`${BASE_URL}/login`)
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    await page.waitForURL(/.*dashboard/, { timeout: 30000 })
    // FIX: ver comentario del test anterior -- 'networkidle' no resuelve de
    // forma confiable con la conexión SSE de RealtimeProvider abierta, así
    // que un `await` directo puede colgarse hasta agotar el timeout
    // completo. Pero un timeout fijo corto tampoco alcanza: si se navega a
    // la siguiente página ANTES de que el fetch de datos de la página
    // actual (useEffect post-mount, ej. FacturasPage.fetchFacturas)
    // termine, el navegador aborta ese fetch a mitad de camino -- "TypeError:
    // Failed to fetch" real en consola, no un falso positivo del test.
    // Se usa 'networkidle' igual, pero con un timeout acotado y un catch:
    // si SÍ llega a estar idle (caso común, sin la conexión SSE
    // bloqueando), resuelve rápido; si no, el timeout igual da la misma
    // ventana de asentamiento sin colgar el test.
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {})

    // Navegar por páginas clave
    const pages = ['/pedidos', '/clientes', '/facturas', '/cierre', '/productos']
    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`)
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {})
    }

    expect(consoleErrors).toHaveLength(0)
    expect(pageErrors).toHaveLength(0)
    expect(unexpected404s).toHaveLength(0)
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
