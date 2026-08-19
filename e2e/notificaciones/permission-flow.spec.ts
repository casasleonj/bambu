import { test, expect, type Page } from '@playwright/test'

/**
 * Estampa Notification.permission ANTES de que cargue cualquier JS de la
 * página (addInitScript corre en cada navegación subsiguiente del mismo
 * page/context), simulando los 3 estados que expone el navegador real.
 * usePushSubscription() lee Notification.permission de forma síncrona en
 * su lazy initializer al montar, así que no requiere disparar
 * `visibilitychange` para reflejar el estado stubbeado.
 */
async function stubNotificationPermission(page: Page, permission: NotificationPermission) {
  await page.addInitScript((perm) => {
    if (typeof window.Notification === 'undefined') {
      // @ts-expect-error - stub mínimo para navegadores/entornos sin Notification
      window.Notification = function Notification() {}
    }
    Object.defineProperty(window.Notification, 'permission', {
      value: perm,
      configurable: true,
    })
  }, permission)
}

async function login(page: Page) {
  await page.goto('/login')
  await page.fill('input[type="text"]', 'admin')
  await page.fill('input[type="password"]', 'admin123')
  await page.click('button:has-text("Ingresar")')
  await expect(page).toHaveURL('/dashboard', { timeout: 5000 })
}

test.describe('push permission flow en /configuracion', () => {
  test('permission=default muestra estado Inactivas con boton para activar', async ({ page }) => {
    await stubNotificationPermission(page, 'default')
    await login(page)
    await page.goto('/configuracion')

    const settings = page.locator('[data-testid="push-settings"]')
    await expect(settings).toBeVisible()
    await expect(settings).toContainText('Inactivas')
    await expect(settings.getByRole('button', { name: 'Activar notificaciones' })).toBeEnabled()
  })

  test('permission=granted no muestra estado bloqueado', async ({ page }) => {
    await stubNotificationPermission(page, 'granted')
    await login(page)
    await page.goto('/configuracion')

    const settings = page.locator('[data-testid="push-settings"]')
    await expect(settings).toBeVisible()
    await expect(settings).toContainText('Permitido')
    await expect(settings).not.toContainText('Bloqueadas')
    // service workers están bloqueados en Playwright (playwright.config.ts),
    // así que nunca hay una suscripción real activa: el estado determinista
    // es "Inactivas" con el botón para restaurarla (rama granted && !subscribed
    // de getPushState en push-settings.tsx), no "Activas".
    await expect(settings.getByRole('button', { name: 'Restaurar suscripción' })).toBeEnabled()
  })

  test('permission=denied muestra estado Bloqueadas con mini-guia y boton deshabilitado', async ({ page }) => {
    await stubNotificationPermission(page, 'denied')
    await login(page)
    await page.goto('/configuracion')

    const settings = page.locator('[data-testid="push-settings"]')
    await expect(settings).toBeVisible()
    await expect(settings).toContainText('Bloqueadas')
    await expect(settings.getByRole('button', { name: 'Bloqueado' })).toBeDisabled()
  })

  test('mini-guia de permission=denied es especifica segun el dispositivo', async ({ page }, testInfo) => {
    await stubNotificationPermission(page, 'denied')
    await login(page)
    await page.goto('/configuracion')

    const settings = page.locator('[data-testid="push-settings"]')
    await expect(settings).toBeVisible()

    if (testInfo.project.name === 'chromium-mobile') {
      // La UA de este proyecto simula iPhone sin modo standalone
      // (playwright.config.ts) -> getDeniedHint() cae en la rama iOS.
      await expect(settings).toContainText('pantalla de inicio')
    } else {
      // Desktop Chrome real -> rama genérica de escritorio.
      await expect(settings).toContainText('barra de direcciones')
    }
  })

  test('el opt-in toast no aparece cuando el permiso ya fue resuelto (granted)', async ({ page }) => {
    await stubNotificationPermission(page, 'granted')
    await login(page)
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).not.toBeVisible()
  })

  test('el opt-in toast no aparece cuando el permiso esta denegado', async ({ page }) => {
    await stubNotificationPermission(page, 'denied')
    await login(page)
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).not.toBeVisible()
  })
})
