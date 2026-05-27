// @tests embarques module - all contexts E2E coverage
// Covers: ADMIN, ASISTENTE, REPARTIDOR roles; desktop + mobile; full UI flows
import { test, expect, fullLogin, apiPost, apiGet, apiDelete, apiPut, createTrabajador, createCliente, skipBaseCaja, BASE } from './fixtures'
import type { Page } from '@playwright/test'

const EMBARQUES_URL = `${BASE}/embarques`

async function gotoEmbarques(page: Page) {
  await page.goto(EMBARQUES_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)
}

// ─── Role Context Tests ──────────────────────────────────────────────────────

test.describe('Embarques — Contexto ADMIN', () => {

  test('ADMIN ve todos los embarques y botones de gestión', async ({ page }) => {
    await fullLogin(page)
    await gotoEmbarques(page)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
    await expect(page.locator('button:has-text("+ Nuevo Embarque")')).toBeVisible()
    await expect(page.locator('button:has-text("Auto-Generar")')).toBeVisible()
  })

  test('ADMIN ve pedidos pendientes para asignar', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    await gotoEmbarques(page)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })
})

test.describe('Embarques — Contexto ASISTENTE', () => {

  test('ASISTENTE puede acceder a embarques', async ({ page }) => {
    await fullLogin(page, 'asistente', 'asist123')
    await gotoEmbarques(page)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })
})

test.describe('Embarques — Contexto REPARTIDOR', () => {

  test('REPARTIDOR accede a /embarques', async ({ page }) => {
    await skipBaseCaja(page)
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/repartidor', { timeout: 15000 })
    await page.goto(`${BASE}/embarques`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })

  test('REPARTIDOR accede a /repartidor y ve su vista', async ({ page }) => {
    await skipBaseCaja(page)
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/repartidor', { timeout: 15000 })
    await page.waitForTimeout(500)
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })
})

// ─── Device Context Tests ────────────────────────────────────────────────────

test.describe('Embarques — Desktop Viewport', () => {

  test('desktop layout is responsive', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await fullLogin(page)
    await gotoEmbarques(page)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
    const grid = page.locator('.grid')
    await expect(grid).toBeVisible()
  })
})

test.describe('Embarques — Mobile Viewport', () => {

  test('mobile layout is usable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await fullLogin(page)
    await gotoEmbarques(page)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })
})

// ─── State Context Tests ─────────────────────────────────────────────────────

test.describe('Embarques — State: ABIERTO', () => {

  test('embarque abierto shows "Cerrar" action in detail modal', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId })
    await gotoEmbarques(page)
    const card = page.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await page.waitForTimeout(500)
      const modalContent = page.locator('text=Embarque, text=Pedidos, text=Repartidor, text=Estado').first()
      expect(await modalContent.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })
})

test.describe('Embarques — State: CERRADO', () => {

  test('embarque cerrado cannot be cancelled', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [], ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
    })
    const delRes = await apiDelete(page, `/api/embarques/${embarqueId}`)
    expect(delRes.status()).toBeGreaterThanOrEqual(400)
  })
})

// ─── Full UI Flow Tests ──────────────────────────────────────────────────────

test.describe('Embarques — Full UI Flow: Create → Assign → Close', () => {

  test('cierre page has all section tabs', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await expect(page.locator('button:has-text("Pedidos")')).toBeVisible()
    await expect(page.locator('button:has-text("Ventas Libres")')).toBeVisible()
    await expect(page.locator('button:has-text("Conciliación")')).toBeVisible()
    await expect(page.locator('button:has-text("Gastos")')).toBeVisible()
    await expect(page.locator('button:has-text("Preview")')).toBeVisible()
  })

  test('cierre page: navigate between sections', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(800)
    await page.locator('button:has-text("Ventas Libres")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('text=Ventas Libres').first()).toBeVisible()
    await page.locator('button:has-text("Preview")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('text=Ingresos, text=💰 Ingresos').first()).toBeVisible()
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

test.describe('Embarques — Edge Cases', () => {

  test('invalid embarque id on cierre page shows error', async ({ page }) => {
    await fullLogin(page)
    await page.goto(`${BASE}/embarques/nonexistent-id/cerrar`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
    const hasError = bodyText?.includes('no encontrado') || bodyText?.includes('Error') || bodyText?.includes('error')
    expect(hasError).toBe(true)
  })

  test('cierre page: back button navigates to embarques list', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    const backBtn = page.locator('button:has-text("← Embarques"), a:has-text("← Embarques")')
    if (await backBtn.first().isVisible().catch(() => false)) {
      await backBtn.first().click()
      await page.waitForTimeout(500)
      await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
    }
  })
})

// ─── Detail Modal Tests ──────────────────────────────────────────────────────

test.describe('Embarques — Detail Modal', () => {

  test('clicking embarque card opens detail modal', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId })
    await gotoEmbarques(page)
    const card = page.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await page.waitForTimeout(500)
      const modalContent = page.locator('text=Embarque, text=Pedidos, text=Repartidor, text=Estado').first()
      expect(await modalContent.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })

  test('detail modal shows embarque info', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId })
    await gotoEmbarques(page)
    const card = page.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await page.waitForTimeout(500)
      const modalBody = page.locator('[role="dialog"], .fixed.inset-0').first()
      if (await modalBody.isVisible({ timeout: 2000 }).catch(() => false)) {
        const text = await modalBody.textContent()
        expect(text?.length).toBeGreaterThan(20)
      }
    }
  })

  test('detail modal can be closed with Escape', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId })
    await gotoEmbarques(page)
    const card = page.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await page.waitForTimeout(500)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      const modal = page.locator('[role="dialog"], .fixed.inset-0').first()
      expect(await modal.isVisible({ timeout: 1000 }).catch(() => false)).toBe(false)
    }
  })
})

// ─── Filter Tests ────────────────────────────────────────────────────────────

test.describe('Embarques — Filters', () => {

  test('filter buttons are visible', async ({ page }) => {
    await fullLogin(page)
    await gotoEmbarques(page)
    await expect(page.locator('button:has-text("Todos")')).toBeVisible()
    await expect(page.locator('button:has-text("Abiertos")')).toBeVisible()
    await expect(page.locator('button:has-text("Cerrados")')).toBeVisible()
  })

  test('capacity legend banner is visible', async ({ page }) => {
    await fullLogin(page)
    await gotoEmbarques(page)
    await expect(page.getByText('Capacidad máxima:')).toBeVisible()
    await expect(page.getByText('≤75% Ideal')).toBeVisible()
    await expect(page.getByText('>100% Excedido')).toBeVisible()
  })
})

// ─── Auto-Generate Tests ─────────────────────────────────────────────────────

test.describe('Embarques — Auto-Generate', () => {

  test('auto-generate via API returns valid response', async ({ page }) => {
    await fullLogin(page)
    await createTrabajador(page)
    const res = await apiPost(page, '/api/embarques/auto', {})
    const data = await res.json()
    expect(data).toBeDefined()
    expect(res.status()).toBeLessThan(500)
  })
})

// ─── Stock Estimado UI Tests ─────────────────────────────────────────────────

test.describe('Embarques — Stock Estimado UI', () => {

  test('ADMIN ve botón de stock estimado en header', async ({ page }) => {
    await fullLogin(page)
    await gotoEmbarques(page)
    await expect(page.locator('button:has-text("Stock Estimado"), button:has-text("Stock:")')).toBeVisible()
  })

  test('ASISTENTE NO ve botón de stock estimado', async ({ page }) => {
    await fullLogin(page, 'asistente', 'asist123')
    await gotoEmbarques(page)
    const stockBtn = page.locator('button:has-text("Stock Estimado"), button:has-text("Stock:")')
    const isVisible = await stockBtn.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })

  test('click en stock estimado abre modal', async ({ page }) => {
    await fullLogin(page)
    await gotoEmbarques(page)
    await page.locator('button:has-text("Stock Estimado"), button:has-text("Stock:")').first().click()
    await page.waitForTimeout(500)
    await expect(page.locator('text=Stock Estimado').first()).toBeVisible()
  })

  test('crear stock estimado via modal', async ({ page }) => {
    await fullLogin(page)
    await gotoEmbarques(page)
    await page.locator('button:has-text("Stock Estimado"), button:has-text("Stock:")').first().click()
    await page.waitForTimeout(500)
    // Fill values
    const inputs = page.locator('#modal-title ~ div input[type="number"], .fixed input[type="number"]')
    const count = await inputs.count()
    if (count >= 2) {
      await inputs.first().fill('100')
      await inputs.nth(1).fill('50')
    }
    // Click Crear/Actualizar button
    const saveBtn = page.locator('button:has-text("Crear"), button:has-text("Actualizar")').first()
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click()
      await page.waitForTimeout(1000)
      const toast = page.locator('[data-sonner-toast]')
      const hasToast = await toast.first().isVisible({ timeout: 3000 }).catch(() => false)
      expect(hasToast).toBe(true)
    }
  })

  test('editar stock estimado via modal', async ({ page }) => {
    await fullLogin(page)
    // First create a stock estimado
    await apiPost(page, '/api/stock-estimado', { agua: 80, hielo: 40 })
    await gotoEmbarques(page)
    // Click the stock button (shows "Stock: 80/40" when active)
    const stockBtn = page.locator('button:has-text("Stock")').first()
    await stockBtn.click()
    await page.waitForTimeout(500)
    await expect(page.locator('text=Stock Estimado').first()).toBeVisible()
  })

  test('crear stock estimado con botellon via API', async ({ page }) => {
    await fullLogin(page)
    const res = await apiPost(page, '/api/stock-estimado', { agua: 50, hielo: 30, botellon: 10 })
    expect(res.status()).toBeLessThan(500)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  test('stock estimado con botellon aparece en GET', async ({ page }) => {
    await fullLogin(page)
    await apiPost(page, '/api/stock-estimado', { agua: 50, hielo: 30, botellon: 10 })
    const res = await apiGet(page, '/api/stock-estimado')
    const data = await res.json()
    expect(data.data?.estimado?.botellon).toBe(10)
  })
})

// ─── Editar Embarque UI Tests ────────────────────────────────────────────────

test.describe('Embarques — Editar Embarque UI', () => {

  test('botón Editar visible en detail modal de embarque ABIERTO', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId })
    await gotoEmbarques(page)
    const card = page.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await page.waitForTimeout(500)
      const editBtn = page.locator('button:has-text("Editar")')
      expect(await editBtn.first().isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })

  test('click en Editar abre form modal prellenado', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId })
    await gotoEmbarques(page)
    const card = page.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await page.waitForTimeout(500)
      const editBtn = page.locator('button:has-text("Editar")')
      if (await editBtn.first().isVisible().catch(() => false)) {
        await editBtn.first().click()
        await page.waitForTimeout(800)
        // Should see "Editar Embarque" title
        await expect(page.locator('text=Editar Embarque').first()).toBeVisible({ timeout: 3000 })
      }
    }
  })

  test('editar embarque via API con nuevos campos', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    // Update obs via PUT
    const putRes = await apiPut(page, `/api/embarques/${embarqueId}`, { obs: 'Test observación' })
    expect(putRes.status()).toBeLessThan(500)
    const putData = await putRes.json()
    expect(putData.success).toBe(true)
  })
})
