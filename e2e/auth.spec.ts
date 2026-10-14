// @tests api/auth
import { test, expect } from '@playwright/test'
import { skipBaseCaja } from './fixtures'

test('login page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('button:has-text("Ingresar")')).toBeVisible()
})

test('login page shows app branding', async ({ page }) => {
  await page.goto('/login')
  // Security: test credentials are only visible in NODE_ENV=development
  // In production (including this test env), they must NOT leak
  await expect(page.locator('h1:has-text("Agua Bambú")')).toBeVisible()
  await expect(page.locator('input[type="text"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

test('proxy redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/pedidos')
  await expect(page).toHaveURL(/\/login/)
})

test('login redirects admin to dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("Ingresar")')
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 })
})

test('signOut redirects to login', async ({ page }) => {
  // El objeto de esta prueba es el cierre de sesión, no el modal de Base de
  // Caja (eso lo cubre `admin-base-caja.spec.ts`). Se siembra la base del día
  // para que el modal no aparezca de forma no determinística.
  await skipBaseCaja(page)

  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("Ingresar")')
  await expect(page).toHaveURL('/dashboard', { timeout: 15000 })

  // `isVisible({ timeout })` ignora el timeout (Playwright solo reporta el
  // estado de ese instante), así que no sirve para "esperar a ver si aparece
  // el modal". Se espera un estado observable y estable: el menú de usuario
  // se abre y muestra "Cerrar Sesión". Si el modal de Base de Caja aparece (o
  // reaparece por el polling de sesión) y tapa el menú, se cierra y se
  // reintenta; si nunca aparece, el primer intento ya pasa.
  const menu = page.getByTestId('user-menu')
  const cerrarSesion = page.locator('text=Cerrar Sesión').first()
  await expect(async () => {
    const modalBaseCaja = page.locator('#base-dia-input')
    if (await modalBaseCaja.isVisible()) {
      await page.getByTestId('base-caja-modal-skip').click()
      await expect(modalBaseCaja).toBeHidden()
    }
    await menu.click({ timeout: 2000 })
    await expect(cerrarSesion).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 20000 })

  await cerrarSesion.click()
  // The redirect may use 0.0.0.0 (AUTH_TRUST_HOST) or localhost,
  // so use a regex matcher instead of exact URL.
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
})
