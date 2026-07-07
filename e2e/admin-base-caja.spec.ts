import { test, expect } from '@playwright/test'
import { login, resetDatabase, skipBaseCaja, apiPost, BASE } from './fixtures'

test.describe('Admin - Base de caja', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(() => {
    resetDatabase()
  })

  test('muestra card de base de caja para admin', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Sidebar collapsed on mobile')
    await skipBaseCaja(page)
    await login(page, 'admin', 'admin123')

    await expect(page.getByText('Caja base')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /Registrar base|Editar base/i })).toBeVisible()
  })

  test('el modal acepta base de caja 0', async ({ page }) => {
    await login(page, 'admin', 'admin123')

    const input = page.locator('#base-dia-input')
    await expect(input).toBeVisible({ timeout: 10000 })

    await input.fill('0')
    const submitBtn = page.locator('button[type="submit"]').filter({ hasText: /Continuar|Guardar/ })
    await expect(submitBtn).toBeEnabled({ timeout: 3000 })
    await submitBtn.click()

    await expect(input).not.toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL(/\/(dashboard|reportes)/)
  })

  test('el modal pre-llena con la base global configurada', async ({ browser }) => {
    // Use a dedicated context so the init script from skipBaseCaja does not
    // re-seed localStorage on every navigation in the fresh context below.
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await adminPage.goto(`${BASE}/login`)
    await login(adminPage, 'admin', 'admin123')

    const setRes = await apiPost(adminPage, '/api/config', { clave: 'BASE_DIA', valor: '77777' })
    expect(setRes.ok()).toBe(true)

    // Fresh context with no pre-seeded localStorage and no init script.
    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()
    await freshPage.goto(`${BASE}/login`)
    await login(freshPage, 'admin', 'admin123')

    const input = freshPage.locator('#base-dia-input')
    await expect(input).toBeVisible({ timeout: 10000 })
    await expect(input).toHaveValue('77777')

    const submitBtn = freshPage.locator('button[type="submit"]').filter({ hasText: /Continuar|Guardar/ })
    await submitBtn.click()
    await expect(input).not.toBeVisible({ timeout: 5000 })

    await adminContext.close()
    await freshContext.close()
  })

  test('no redirige forzosamente a /cierre cuando hay días sin cerrar', async ({ browser }) => {
    // Use a dedicated context to create a past closing; avoid skipBaseCaja init
    // script leaking into the fresh verification context below.
    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await adminPage.goto(`${BASE}/login`)
    await login(adminPage, 'admin', 'admin123')

    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const fechaPasada = twoDaysAgo.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

    const cierreRes = await apiPost(adminPage, '/api/cierre', {
      fecha: fechaPasada,
      baseDia: 100000,
      stockIniAgua: 0,
      prodAgua: 0,
      stockFinAgua: 0,
      stockIniHielo: 0,
      prodHielo: 0,
      stockFinHielo: 0,
      comisiones: 0,
      salarios: 0,
    })
    expect(cierreRes.ok()).toBe(true)

    // Fresh context with no pre-seeded base: the modal should appear on dashboard.
    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()
    await freshPage.goto(`${BASE}/login`)
    await login(freshPage, 'admin', 'admin123')

    await expect(freshPage.locator('#base-dia-input')).toBeVisible({ timeout: 10000 })
    await expect(freshPage).toHaveURL(/\/dashboard/)

    await adminContext.close()
    await freshContext.close()
  })
})
