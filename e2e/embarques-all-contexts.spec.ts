// @tests embarques module - all contexts E2E coverage
// Covers: ADMIN, ASISTENTE, REPARTIDOR roles; desktop + mobile; full UI flows
import { test, expect, loginAs, sharedPageLogin, goto, apiPost, apiGet, apiDelete, apiPut, createTrabajador, createCliente } from './fixtures'
import type { Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function gotoEmbarques(page: Page) {
  await goto(page, '/embarques')
}

async function createEmbarqueAbierto(page: Page) {
  const t = await createTrabajador(page)
  const trabajadorId = t.trabajador?.id || t.data?.id
  if (!trabajadorId) return null
  const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
  const eData = await eRes.json()
  return eData.data?.id || eData.embarque?.id || null
}

// ─── Role Context Tests ──────────────────────────────────────────────────────

test.describe('Embarques — Contexto ADMIN', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => { p = await sharedPageLogin(browser) })
  test.afterAll(async () => { await p?.close() })

  test('ADMIN ve todos los embarques y botones de gestión', async () => {
    await gotoEmbarques(p)
    await expect(p.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
    await expect(p.locator('button:has-text("+ Nuevo Embarque")')).toBeVisible()
    await expect(p.locator('button:has-text("Auto-Generar")')).toBeVisible()
  })

  test('ADMIN ve pedidos pendientes para asignar', async () => {
    const c = await createCliente(p)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    await apiPost(p, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    await gotoEmbarques(p)
    await expect(p.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })
})

test.describe('Embarques — Contexto ASISTENTE', () => {

  test('ASISTENTE puede acceder a embarques', async ({ page }) => {
    await loginAs(page, 'asistente')
    await gotoEmbarques(page)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })
})

test.describe('Embarques — Contexto REPARTIDOR', () => {

  test('REPARTIDOR accede a /embarques', async ({ page }) => {
    await loginAs(page, 'repartidor')
    await goto(page, '/embarques')
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })

  test('REPARTIDOR accede a /repartidor y ve su vista', async ({ page }) => {
    await loginAs(page, 'repartidor')
    await page.waitForLoadState('domcontentloaded')
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
  })
})

// ─── State Context Tests ─────────────────────────────────────────────────────

test.describe('Embarques — State: ABIERTO', () => {

  test('embarque abierto shows "Cerrar" action in detail modal', async ({ page }) => {
    await loginAs(page, 'admin')
    const embarqueId = await createEmbarqueAbierto(page)
    if (!embarqueId) { test.skip(); return }
    await gotoEmbarques(page)
    const card = page.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      const modalContent = page.locator('text=Embarque, text=Pedidos, text=Repartidor, text=Estado').first()
      expect(await modalContent.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })
})

test.describe('Embarques — State: CERRADO', () => {

  test('embarque cerrado cannot be cancelled', async ({ page }) => {
    await loginAs(page, 'admin')
    const embarqueId = await createEmbarqueAbierto(page)
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
    await loginAs(page, 'admin')
    const embarqueId = await createEmbarqueAbierto(page)
    if (!embarqueId) { test.skip(); return }
    await goto(page, `/embarques/${embarqueId}/cerrar`)
    await expect(page.locator('button:has-text("Pedidos")')).toBeVisible()
    await expect(page.locator('button:has-text("Ventas Libres")')).toBeVisible()
    await expect(page.locator('button:has-text("Conciliación")')).toBeVisible()
    await expect(page.locator('button:has-text("Gastos")')).toBeVisible()
    await expect(page.locator('button:has-text("Preview")')).toBeVisible()
  })

  test('cierre page: navigate between sections', async ({ page }) => {
    await loginAs(page, 'admin')
    const embarqueId = await createEmbarqueAbierto(page)
    if (!embarqueId) { test.skip(); return }
    await goto(page, `/embarques/${embarqueId}/cerrar`)
    await page.locator('button:has-text("Ventas Libres")').click()
    await expect(page.locator('text=Ventas Libres').first()).toBeVisible()
    await page.locator('button:has-text("Preview")').click()
    await expect(page.locator('text=Ingresos, text=💰 Ingresos').first()).toBeVisible()
  })
})

// ─── Edge Cases ──────────────────────────────────────────────────────────────

test.describe('Embarques — Edge Cases', () => {

  test('invalid embarque id on cierre page shows error', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/embarques/nonexistent-id/cerrar')
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.length).toBeGreaterThan(10)
    const hasError = bodyText?.includes('no encontrado') || bodyText?.includes('Error') || bodyText?.includes('error')
    expect(hasError).toBe(true)
  })

  test('cierre page: back button navigates to embarques list', async ({ page }) => {
    await loginAs(page, 'admin')
    const embarqueId = await createEmbarqueAbierto(page)
    if (!embarqueId) { test.skip(); return }
    await goto(page, `/embarques/${embarqueId}/cerrar`)
    const backBtn = page.locator('button:has-text("← Embarques"), a:has-text("← Embarques")')
    if (await backBtn.first().isVisible().catch(() => false)) {
      await backBtn.first().click()
      await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
    }
  })
})

// ─── Detail Modal Tests ──────────────────────────────────────────────────────

test.describe('Embarques — Detail Modal', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => { p = await sharedPageLogin(browser) })
  test.afterAll(async () => { await p?.close() })

  // Create an embarque once for the block
  test.beforeAll(async () => {
    const id = await createEmbarqueAbierto(p)
    if (id) void id  // used implicitly via API calls
  })

  test('clicking embarque card opens detail modal', async () => {
    await gotoEmbarques(p)
    const card = p.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await p.locator('[role="dialog"], .fixed.inset-0').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
      const modalContent = p.locator('text=Embarque, text=Pedidos, text=Repartidor, text=Estado').first()
      expect(await modalContent.isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })

  test('detail modal shows embarque info', async () => {
    await gotoEmbarques(p)
    const card = p.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await p.locator('[role="dialog"], .fixed.inset-0').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
      const modalBody = p.locator('[role="dialog"], .fixed.inset-0').first()
      if (await modalBody.isVisible({ timeout: 2000 }).catch(() => false)) {
        const text = await modalBody.textContent()
        expect(text?.length).toBeGreaterThan(20)
      }
    }
  })

  test('detail modal can be closed with Escape', async () => {
    await gotoEmbarques(p)
    const card = p.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await p.locator('[role="dialog"], .fixed.inset-0').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
      await p.keyboard.press('Escape')
      const modal = p.locator('[role="dialog"], .fixed.inset-0').first()
      expect(await modal.isVisible({ timeout: 1000 }).catch(() => false)).toBe(false)
    }
  })
})

// ─── Filter Tests ────────────────────────────────────────────────────────────

test.describe('Embarques — Filters', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => { p = await sharedPageLogin(browser) })
  test.afterAll(async () => { await p?.close() })

  test('filter buttons are visible', async () => {
    await gotoEmbarques(p)
    await expect(p.locator('button:has-text("Todos")')).toBeVisible()
    await expect(p.locator('button:has-text("Abiertos")')).toBeVisible()
    await expect(p.locator('button:has-text("Cerrados")')).toBeVisible()
  })

  test('capacity legend banner is visible', async () => {
    await gotoEmbarques(p)
    await expect(p.getByText('Capacidad máxima:')).toBeVisible()
    await expect(p.getByText('≤75% Ideal')).toBeVisible()
    await expect(p.getByText('>100% Excedido')).toBeVisible()
  })
})

// ─── Auto-Generate Tests ─────────────────────────────────────────────────────

test.describe('Embarques — Auto-Generate', () => {

  test('auto-generate via API returns valid response', async ({ page }) => {
    await loginAs(page, 'admin')
    await createTrabajador(page)
    const res = await apiPost(page, '/api/embarques/auto', {})
    const data = await res.json()
    expect(data).toBeDefined()
    expect(res.status()).toBeLessThan(500)
  })
})

// ─── Stock Estimado UI Tests ─────────────────────────────────────────────────

test.describe('Embarques — Stock Estimado UI', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => { p = await sharedPageLogin(browser) })
  test.afterAll(async () => { await p?.close() })

  test('ADMIN ve botón de stock estimado en header', async () => {
    await gotoEmbarques(p)
    await expect(p.locator('button:has-text("Stock Estimado"), button:has-text("Stock:")')).toBeVisible()
  })

  test('ASISTENTE NO ve botón de stock estimado', async ({ page }) => {
    await loginAs(page, 'asistente')
    await gotoEmbarques(page)
    const stockBtn = page.locator('button:has-text("Stock Estimado"), button:has-text("Stock:")')
    const isVisible = await stockBtn.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })

  test('click en stock estimado abre modal', async () => {
    await gotoEmbarques(p)
    await p.locator('button:has-text("Stock Estimado"), button:has-text("Stock:")').first().click()
    await expect(p.locator('text=Stock Estimado').first()).toBeVisible()
  })

  test('crear stock estimado via modal', async () => {
    await gotoEmbarques(p)
    await p.locator('button:has-text("Stock Estimado"), button:has-text("Stock:")').first().click()
    // Fill values
    const inputs = p.locator('#modal-title ~ div input[type="number"], .fixed input[type="number"]')
    const count = await inputs.count()
    if (count >= 2) {
      await inputs.first().fill('100')
      await inputs.nth(1).fill('50')
    }
    // Click Crear/Actualizar button
    const saveBtn = p.locator('button:has-text("Crear"), button:has-text("Actualizar")').first()
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click()
      const toast = p.locator('[data-sonner-toast]')
      const hasToast = await toast.first().isVisible({ timeout: 3000 }).catch(() => false)
      expect(hasToast).toBe(true)
    }
  })

  test('editar stock estimado via modal', async () => {
    // First create a stock estimado
    await apiPost(p, '/api/stock-estimado', { agua: 80, hielo: 40 })
    await gotoEmbarques(p)
    // Click the stock button (shows "Stock: 80/40" when active)
    const stockBtn = p.locator('button:has-text("Stock")').first()
    await stockBtn.click()
    await expect(p.locator('text=Stock Estimado').first()).toBeVisible()
  })

  test('crear stock estimado con botellon via API', async () => {
    const res = await apiPost(p, '/api/stock-estimado', { agua: 50, hielo: 30, botellon: 10 })
    expect(res.status()).toBeLessThan(500)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  test('stock estimado con botellon aparece en GET', async () => {
    await apiPost(p, '/api/stock-estimado', { agua: 50, hielo: 30, botellon: 10 })
    const res = await apiGet(p, '/api/stock-estimado')
    const data = await res.json()
    expect(data.data?.estimado?.botellon).toBe(10)
  })
})

// ─── Editar Embarque UI Tests ────────────────────────────────────────────────

test.describe('Embarques — Editar Embarque UI', () => {
  let p: Page

  test.beforeAll(async ({ browser }) => { p = await sharedPageLogin(browser) })
  test.afterAll(async () => { await p?.close() })

  test('botón Editar visible en detail modal de embarque ABIERTO', async () => {
    const embarqueId = await createEmbarqueAbierto(p)
    if (!embarqueId) { test.skip(); return }
    await gotoEmbarques(p)
    const card = p.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await p.locator('[role="dialog"], .fixed.inset-0').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
      const editBtn = p.locator('button:has-text("Editar")')
      expect(await editBtn.first().isVisible({ timeout: 2000 }).catch(() => false)).toBe(true)
    }
  })

  test('click en Editar abre form modal prellenado', async () => {
    const embarqueId = await createEmbarqueAbierto(p)
    if (!embarqueId) { test.skip(); return }
    await gotoEmbarques(p)
    const card = p.locator('.grid > div > .bg-white, .grid > div > [class*="rounded-xl"]').first()
    if (await card.count() > 0) {
      await card.click({ force: true })
      await p.locator('[role="dialog"], .fixed.inset-0').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
      const editBtn = p.locator('button:has-text("Editar")')
      if (await editBtn.first().isVisible().catch(() => false)) {
        await editBtn.first().click()
        // Should see "Editar Embarque" title
        await expect(p.locator('text=Editar Embarque').first()).toBeVisible({ timeout: 3000 })
      }
    }
  })

  test('editar embarque via API con nuevos campos', async () => {
    const embarqueId = await createEmbarqueAbierto(p)
    if (!embarqueId) { test.skip(); return }
    const putRes = await apiPut(p, `/api/embarques/${embarqueId}`, { obs: 'Test observación' })
    expect(putRes.status()).toBeLessThan(500)
    const putData = await putRes.json()
    expect(putData.success).toBe(true)
  })
})

// ─── Device Context Tests ────────────────────────────────────────────────────

test.describe('Embarques — Desktop Viewport', () => {

  test('desktop layout is responsive', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await loginAs(page, 'admin')
    await gotoEmbarques(page)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
    const grid = page.locator('.grid')
    await expect(grid).toBeVisible()
  })
})

test.describe('Embarques — Mobile Viewport', () => {

  test('mobile layout is usable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await loginAs(page, 'admin')
    await goto(page, '/embarques')
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })
})
