// @tests local — verificar fix del bug "crear cliente se queda guardando"
// Estos tests validan el fix contra el dev server local (localhost:3001).
// NO mockean el POST con page.route (frágil: intercepta también fetchClientes
// en mount). En su lugar crean un cliente real y verifican:
// 1. El toast success aparece (no "guardado en el celular")
// 2. El cliente aparece en la lista tras recargar
// 3. El botón "Crear cliente" no se queda pegado indefinidamente

import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001'

async function localLogin(page: Page) {
  await page.addInitScript(() => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const utc = new Date().toISOString().split('T')[0]
    localStorage.setItem(`baseDia_${hoy}`, '100000')
    localStorage.setItem(`baseDia_${utc}`, '100000')
  })
  await page.goto(`${BASE}/login`, { timeout: 30_000 })
  await page.fill('input[placeholder="Ingrese usuario"]', 'admin')
  await page.fill('input[placeholder="Ingrese contraseña"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: 30_000 })
  await page.waitForTimeout(2000)

  // Cerrar modal base-caja si aparece
  const baseInput = page.locator('#base-dia-input')
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(500)
    if (await baseInput.isVisible().catch(() => false)) {
      await baseInput.fill('100000')
      await baseInput.evaluate((el: HTMLInputElement) => {
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await page.waitForTimeout(200)
      const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /Continuar|Guardar/ })
      await submitBtn.click().catch(() => {})
      await page.waitForTimeout(500)
      break
    }
  }
}

async function cleanupQaClientes(page: Page) {
  try {
    const res = await page.request.get(`${BASE}/api/clientes?all=true`, { timeout: 15_000 })
    if (!res.ok()) return
    const body = await res.json().catch(() => ({}))
    const all = body.clientes || body.data || []
    const qa = all.filter((c: any) => (c.nombre || '').startsWith('QA Fix'))
    for (const c of qa) {
      if (c.id) await page.request.delete(`${BASE}/api/clientes/${c.id}`, { timeout: 15_000 }).catch(() => {})
    }
  } catch {
    // cleanup best-effort
  }
}

test.describe('Fix: crear cliente no dice "guardado en el celular" en desktop online', () => {
  test('POST normal → toast success, cliente creado, no toast "celular"', async ({ page }) => {
    test.setTimeout(60_000)

    await localLogin(page)
    await page.goto(`${BASE}/clientes`, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Abrir modal crear cliente
    await page.getByRole('button', { name: /Nuevo Cliente/ }).click()
    const nameInput = page.getByRole('textbox', { name: /Ej: Juan/ }).or(page.locator('input[placeholder*="Ej: Juan"]'))
    await expect(nameInput).toBeVisible({ timeout: 10_000 })

    // Llenar form con datos únicos
    const stamp = Date.now()
    const clienteName = `QA Fix Test ${stamp}`
    await nameInput.fill(clienteName)
    const phoneInput = page.locator('input[type="tel"]').first()
    await phoneInput.fill(`3${String(stamp).slice(-9)}`)

    // Capturar todos los toasts que aparezcan tras el submit
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    // FIX-1: debe aparecer un toast (cualquier) en 30s (dev server local)
    const anyToast = page.locator('[data-sonner-toast]').first()
    await expect(anyToast).toBeVisible({ timeout: 30_000 })
    const toastText = (await anyToast.textContent()) ?? ''

    // FIX-2: NO debe decir "celular" o "Sin conexión" en desktop online
    expect(toastText).not.toMatch(/celular|Sin conexión|tardó mucho/i)

    // FIX-3: debe ser un mensaje de éxito
    expect(toastText).toMatch(/Cliente creado|Cliente ya estaba creado|exitosamente/i)

    // FIX-4: el cliente debe existir en la lista tras reload
    await page.goto(`${BASE}/clientes`, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    const apiRes = await page.request.get(`${BASE}/api/clientes?all=true`, { timeout: 15_000 })
    let created = false
    if (apiRes.ok()) {
      const body = await apiRes.json().catch(() => ({}))
      const all = body.clientes || body.data || []
      created = !!all.find((c: any) => (c.nombre || '').startsWith('QA Fix Test'))
    }
    expect(created).toBe(true)

    // Cleanup
    await cleanupQaClientes(page)
  })

  test('POST colgado 10s → modal sigue abierto, no toast "celular"', async ({ page }) => {
    test.setTimeout(60_000)

    // Interceptar POST /api/clientes y retardarlo indefinidamente.
    // A diferencia del test anterior que mockeaba fulfillment, acá solo
    // retardamos sin responder — el AbortController de fetchResilient
    // (60s para mutaciones) es el que cancelará. Verificamos solo los
    // primeros 12s para no esperar el timeout completo.
    await page.route('**/api/clientes', async (route) => {
      if (route.request().method() === 'POST') {
        // Dejar colgado: no fulfill ni continue
        await new Promise(() => {})
      } else {
        await route.continue()
      }
    })

    await localLogin(page)
    await page.goto(`${BASE}/clientes`, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: /Nuevo Cliente/ }).click()
    const nameInput = page.getByRole('textbox', { name: /Ej: Juan/ }).or(page.locator('input[placeholder*="Ej: Juan"]'))
    await expect(nameInput).toBeVisible({ timeout: 10_000 })

    const stamp = Date.now()
    await nameInput.fill('QA Fix Hang Test')
    const phoneInput = page.locator('input[type="tel"]').first()
    await phoneInput.fill(`3${String(stamp).slice(-9)}`)

    await page.getByRole('button', { name: 'Crear cliente' }).click()

    // FIX-1: a los 9s (vieja race timeout era 8s) el modal DEBE seguir abierto.
    // Antes del fix, a los 8s el race ganaba y cerraba el modal con toast engañoso.
    await page.waitForTimeout(9_000)
    const modalStillOpen = await nameInput.isVisible().catch(() => false)
    expect(modalStillOpen).toBe(true)

    // FIX-2: NO debe aparecer toast "guardado en el celular" en desktop online.
    // Antes del fix, a los 8s aparecía toast "La conexión tardó mucho. El
    // cliente quedó guardado en el celular..." — engañoso en desktop.
    const anyToast = page.locator('[data-sonner-toast]').first()
    const toastVisible = await anyToast.isVisible().catch(() => false)
    if (toastVisible) {
      const text = (await anyToast.textContent()) ?? ''
      expect(text).not.toMatch(/celular|Sin conexión|tardó mucho/i)
    }
  })
})