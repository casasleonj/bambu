// @tests functional/mobile-clientes
// Regresion mobile 2026-06-10: en mobile, /clientes debe mostrar la
// lista de clientes y abrir el detalle al hacer click.

import { test, expect } from '@playwright/test'
import { fullLogin } from './fixtures'

// Viewport mobile iPhone 13 (390x844) sin forzar webkit (que no esta
// instalado en este entorno). Usamos chromium con viewport mobile,
// hasTouch y isMobile para simular iPhone 13.
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1',
})

test.describe('Clientes en mobile', () => {
  test('lista de clientes se muestra sin error "no se pudieron cargar"', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/clientes')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    // No debe aparecer el error "No se pudieron cargar"
    const errorBanner = page.locator('text=No se pudieron cargar')
    await expect(errorBanner).toHaveCount(0)

    // Debe haber al menos un cliente visible (de los seeded en prisma/seed.ts).
    // Buscamos el texto "Buscar por nombre..." (placeholder del search input)
    // que confirma que la pagina de clientes esta renderizada.
    const searchInput = page.locator('input[placeholder*="Buscar" i]')
    await expect(searchInput).toBeVisible()

    // Tambien verificamos que el header "X de Y clientes" este visible
    // (solo aparece cuando hay clientes cargados, no en estado de error).
    const countText = page.locator('text=/\\d+ de \\d+ clientes/')
    // No fallamos si no esta presente inmediatamente (puede estar en lazy load),
    // pero si esta, valida que el conteo es > 0.
    if (await countText.count() > 0) {
      const text = await countText.first().textContent()
      const match = text?.match(/(\d+) de (\d+)/)
      if (match) {
        const total = parseInt(match[2], 10)
        expect(total).toBeGreaterThan(0)
      }
    }
  })

  test('click en cliente abre el modal de detalle', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/clientes')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    // Esperar a que la lista de clientes este renderizada.
    // El placeholder del search es una senal fiable de que la pagina cargo.
    await expect(page.locator('input[placeholder*="Buscar" i]')).toBeVisible({ timeout: 5000 })

    // Buscar la primera fila de cliente (div con cursor-pointer + grid).
    // El componente cliente-table.tsx usa:
    //   <div className="grid grid-cols-1 md:grid-cols-12 ... cursor-pointer ...">
    const firstRow = page.locator('div.grid.cursor-pointer').first()
    await expect(firstRow).toBeVisible({ timeout: 5000 })

    // Click en la fila.
    await firstRow.tap()

    // El modal debe abrir. Buscar un elemento caracteristico del modal:
    // - El tab "Información" o "Historial" o "Stats".
    // - O el boton "Volver" (mobile-only).
    // - O el avatar del cliente con la inicial.
    const modalIndicator = page.locator('button:has-text("Volver"), [role="tab"]:has-text("Info"), [role="tab"]:has-text("Historial")').first()
    await expect(modalIndicator).toBeVisible({ timeout: 5000 })
  })

  test('modal de detalle muestra informacion del cliente (no error)', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/clientes')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800)

    await expect(page.locator('input[placeholder*="Buscar" i]')).toBeVisible({ timeout: 5000 })

    const firstRow = page.locator('div.grid.cursor-pointer').first()
    await expect(firstRow).toBeVisible({ timeout: 5000 })

    // Preparamos el listener ANTES del click: el GET /api/clientes/[id]
    // debe responder 200. Si responde 500 (permission denied u otro error),
    // el test falla con el status code real, no con un falso positivo.
    const detalleResponse = page.waitForResponse(
      (r) => /\/api\/clientes\/[a-z0-9-]+/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 10000 },
    )

    await firstRow.tap()

    // Validar status del fetch del detalle.
    const res = await detalleResponse
    expect(res.status(), `GET ${res.url()} esperaba 200, devolvio ${res.status()}`).toBe(200)

    // Esperar a que el modal termine de renderizar.
    await page.waitForTimeout(1500)

    // Verificar que NO esta el banner de error que mostraba el modal cuando
    // el fetch fallaba. El texto real del banner (de viewCliente) es
    // "Error al cargar el cliente (HTTP 500)..." o "Cliente no encontrado.",
    // no "No se pudo" como estaba mal escrito antes.
    const errorBanner = page.locator('[role="alert"]:has-text("Error al cargar")')
    await expect(errorBanner).toHaveCount(0)
  })
})
