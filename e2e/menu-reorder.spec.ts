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

  await sourceHandle.hover()
  await page.mouse.down()
  // dnd-kit PointerSensor requiere un pequeño movimiento para activar el drag.
  await page.mouse.move(startX, startY - 5)
  await page.mouse.move(endX, endY, { steps: 25 })
  await page.waitForTimeout(100)
  await page.mouse.up()
}

test.describe('Menú reorganizable', () => {
  test.setTimeout(60000)

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

    // Entrar en modo edición via el botón de opciones del sidebar.
    const optionsBtn = page.getByTestId('sidebar-menu-options')
    await expect(optionsBtn).toBeVisible()
    await optionsBtn.click()

    const personalizeBtn = page.getByRole('menuitem', { name: 'Personalizar menú' })
    await expect(personalizeBtn).toBeVisible()
    await personalizeBtn.click()

    // Aparece el banner de edición.
    await expect(page.getByText('Editando menú')).toBeVisible()

    // En modo edición aparecen los drag handles.
    const handles = page.locator('[data-testid="drag-handle"]')
    await expect(handles.first()).toBeVisible({ timeout: 10000 })

    // Orden inicial: [Dashboard(top), section:Ventas, Clientes, Pedidos, Productos, Incidencias, ...]
    // Mover "Productos" arriba de "Clientes" (ambos son links dentro de Ventas).
    // Productos es el 5to handle (Dashboard, section:Ventas, Clientes, Pedidos, Productos).
    await dragHandleAbove(page, handles.nth(4), handles.nth(2))

    // Salir del modo edición.
    const doneBtn = page.getByTestId('sidebar-menu-done')
    await expect(doneBtn).toBeVisible()
    await doneBtn.click()

    // Verificar inmediatamente que el orden cambió antes de refrescar.
    const nav = page.locator('aside[aria-label="Navegación principal"]')
    let texts = await nav.locator('a').allTextContents()
    let productosIdx = texts.findIndex((t) => t.includes('Productos'))
    let clientesIdx = texts.findIndex((t) => t.includes('Clientes'))
    expect(productosIdx).toBeGreaterThanOrEqual(0)
    expect(clientesIdx).toBeGreaterThanOrEqual(0)
    expect(productosIdx).toBeLessThan(clientesIdx)

    // Verificar que el orden se persistió en localStorage (no depende del
    // drawer en mobile, que se cierra al refrescar).
    const stored = await page.evaluate(() => localStorage.getItem('bambu-app-storage'))
    const parsed = JSON.parse(stored ?? '{}')
    const orders: Record<string, string[]> = parsed.state?.menuOrderByUser ?? {}
    const userOrder = Object.values(orders)[0]
    expect(userOrder).toBeDefined()
    const productosOrderIdx = userOrder.indexOf('/productos')
    const clientesOrderIdx = userOrder.indexOf('/clientes')
    expect(productosOrderIdx).toBeGreaterThanOrEqual(0)
    expect(clientesOrderIdx).toBeGreaterThanOrEqual(0)
    expect(productosOrderIdx).toBeLessThan(clientesOrderIdx)

    // Refrescar y, si estamos en mobile, abrir el drawer con el hamburger.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    const hamburger = page.getByRole('button', { name: /abrir menú/i })
    if (await hamburger.isVisible().catch(() => false)) {
      await hamburger.click()
    }
    await expect(nav).toBeVisible()
    texts = await nav.locator('a').allTextContents()
    productosIdx = texts.findIndex((t) => t.includes('Productos'))
    clientesIdx = texts.findIndex((t) => t.includes('Clientes'))
    expect(productosIdx).toBeLessThan(clientesIdx)
  })

  test('botón Restablecer vuelve al orden por defecto', async ({ page }) => {
    await fullLogin(page)
    await page.goto(`${BASE}/dashboard`)

    // Entrar en modo edición y mover Productos arriba de Clientes.
    await page.getByTestId('sidebar-menu-options').click()
    await page.getByRole('menuitem', { name: 'Personalizar menú' }).click()
    await expect(page.getByTestId('sidebar-menu-done')).toBeVisible({ timeout: 10000 })
    const handles = page.locator('[data-testid="drag-handle"]')
    await expect(handles.first()).toBeVisible({ timeout: 10000 })
    await dragHandleAbove(page, handles.nth(4), handles.nth(2))

    // Salir y verificar que el orden cambió.
    await page.getByTestId('sidebar-menu-done').click()
    const nav = page.locator('aside[aria-label="Navegación principal"]')
    let texts = await nav.locator('a').allTextContents()
    let productosIdx = texts.findIndex((t) => t.includes('Productos'))
    let clientesIdx = texts.findIndex((t) => t.includes('Clientes'))
    expect(productosIdx).toBeLessThan(clientesIdx)

    // Volver a entrar en modo edición y restablecer.
    await page.getByTestId('sidebar-menu-options').click()
    await page.getByRole('menuitem', { name: 'Personalizar menú' }).click()
    await page.getByRole('button', { name: 'Restablecer' }).click()
    await page.getByTestId('sidebar-menu-done').click()

    // El orden debe volver al default: Clientes antes que Productos.
    texts = await nav.locator('a').allTextContents()
    productosIdx = texts.findIndex((t) => t.includes('Productos'))
    clientesIdx = texts.findIndex((t) => t.includes('Clientes'))
    expect(clientesIdx).toBeLessThan(productosIdx)
  })
})
