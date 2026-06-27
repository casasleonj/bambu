import type { Page, Locator } from '@playwright/test'
import { test, expect, fullLogin, BASE } from './fixtures'

async function dragHandleAbove(page: Page, sourceHandle: Locator, targetHandle: Locator) {
  const sourceBox = await sourceHandle.boundingBox()
  const targetBox = await targetHandle.boundingBox()
  if (!sourceBox || !targetBox) {
    throw new Error('No se pudo obtener bounding box de los handles')
  }
  const startX = sourceBox.x + sourceBox.width / 2
  const startY = sourceBox.y + sourceBox.height / 2
  const endX = targetBox.x + targetBox.width / 2
  const endY = targetBox.y - 6

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // dnd-kit PointerSensor requiere un pequeño movimiento para activar el drag.
  await page.mouse.move(startX, startY - 5)
  await page.mouse.move(endX, endY, { steps: 15 })
  await page.mouse.move(endX, endY, { steps: 5 })
  await page.mouse.up()
}

test.describe('Menú reorganizable', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
  })

  test('modo edición muestra drag handles y el reordenamiento persiste tras refresh', async ({ page }) => {
    await fullLogin(page)
    await page.goto(`${BASE}/dashboard`)

    // Entrar en modo edición.
    const editBtn = page.getByTestId('edit-menu-button')
    await expect(editBtn).toBeVisible()
    await editBtn.click()

    // El botón cambia a "Listo" y aparece el banner de edición.
    await expect(page.getByTitle('Listo')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Editando menú')).toBeVisible()

    // En modo edición aparecen los drag handles.
    const handles = page.locator('[data-testid="drag-handle"]')
    await expect(handles.first()).toBeVisible({ timeout: 10000 })

    // Mover "Clientes" (tercer handle: sección Ventas, Dashboard, Clientes)
    // arriba de "Dashboard" (segundo handle).
    await dragHandleAbove(page, handles.nth(2), handles.nth(1))

    // Salir del modo edición.
    const doneBtn = page.getByTitle('Listo')
    await expect(doneBtn).toBeVisible()
    await doneBtn.click()

    // Verificar inmediatamente que el orden cambió antes de refrescar.
    const nav = page.locator('aside[aria-label="Navegación principal"]')
    let texts = await nav.locator('a').allTextContents()
    let clientesIdx = texts.findIndex((t) => t.includes('Clientes'))
    let dashboardIdx = texts.findIndex((t) => t.includes('Dashboard'))
    expect(clientesIdx).toBeGreaterThanOrEqual(0)
    expect(dashboardIdx).toBeGreaterThanOrEqual(0)
    expect(clientesIdx).toBeLessThan(dashboardIdx)

    // Verificar que el orden se persistió en localStorage (no depende del
    // drawer en mobile, que se cierra al refrescar).
    const stored = await page.evaluate(() => localStorage.getItem('bambu-app-storage'))
    const parsed = JSON.parse(stored ?? '{}')
    const orders: Record<string, string[]> = parsed.state?.menuOrderByUser ?? {}
    const userOrder = Object.values(orders)[0]
    expect(userOrder).toBeDefined()
    const clientesOrderIdx = userOrder.indexOf('/clientes')
    const dashboardOrderIdx = userOrder.indexOf('/dashboard')
    expect(clientesOrderIdx).toBeGreaterThanOrEqual(0)
    expect(dashboardOrderIdx).toBeGreaterThanOrEqual(0)
    expect(clientesOrderIdx).toBeLessThan(dashboardOrderIdx)

    // Refrescar y abrir el menú si está cerrado (mobile) para verificar UI.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    if (!(await nav.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /abrir menú/i }).click()
    }
    await expect(nav).toBeVisible()
    texts = await nav.locator('a').allTextContents()
    clientesIdx = texts.findIndex((t) => t.includes('Clientes'))
    dashboardIdx = texts.findIndex((t) => t.includes('Dashboard'))
    expect(clientesIdx).toBeLessThan(dashboardIdx)
  })

  test('botón Restablecer vuelve al orden por defecto', async ({ page }) => {
    await fullLogin(page)
    await page.goto(`${BASE}/dashboard`)

    // Entrar en modo edición y mover Clientes arriba de Dashboard.
    await page.getByTestId('edit-menu-button').click()
    await expect(page.getByTitle('Listo')).toBeVisible({ timeout: 10000 })
    const handles = page.locator('[data-testid="drag-handle"]')
    await expect(handles.first()).toBeVisible({ timeout: 10000 })
    await dragHandleAbove(page, handles.nth(2), handles.nth(1))

    // Salir y verificar que el orden cambió.
    await page.getByTitle('Listo').click()
    const nav = page.locator('aside[aria-label="Navegación principal"]')
    let texts = await nav.locator('a').allTextContents()
    let clientesIdx = texts.findIndex((t) => t.includes('Clientes'))
    let dashboardIdx = texts.findIndex((t) => t.includes('Dashboard'))
    expect(clientesIdx).toBeLessThan(dashboardIdx)

    // Volver a entrar en modo edición y restablecer.
    await page.getByTitle('Editar menú').click()
    await page.getByRole('button', { name: 'Restablecer' }).click()
    await page.getByTitle('Listo').click()

    // El orden debe volver al default: Dashboard antes que Clientes.
    texts = await nav.locator('a').allTextContents()
    clientesIdx = texts.findIndex((t) => t.includes('Clientes'))
    dashboardIdx = texts.findIndex((t) => t.includes('Dashboard'))
    expect(dashboardIdx).toBeLessThan(clientesIdx)
  })
})
