import { test, expect } from '@playwright/test'

test.describe('push opt-in toast', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // El proyecto chromium-mobile simula un iPhone sin modo standalone
    // (UA en playwright.config.ts). Por diseño (spec §2, §3, usePushOptIn
    // isIosWithoutStandalone) el toast NUNCA se muestra en ese caso — push
    // no funciona en Safari iOS fuera de standalone. Este describe cubre
    // el comportamiento del toast en sí, que solo es observable en
    // dispositivos donde se le permite aparecer.
    test.skip(
      testInfo.project.name === 'chromium-mobile',
      'El opt-in toast no se muestra en iOS sin standalone (comportamiento esperado, no un bug)'
    )
    await page.goto('/login')
    await page.fill('input[type="text"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("Ingresar")')
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 })
  })

  test('muestra el toast de opt-in al iniciar sesion', async ({ page }) => {
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).toBeVisible({ timeout: 2000 })
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).toContainText('Recibí alertas al instante')
  })

  test('el boton Mas tarde oculta el toast', async ({ page }) => {
    await page.click('[data-testid="push-opt-in-later"]')
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).not.toBeVisible()
  })

  test('el toast no vuelve a aparecer en la misma sesion tras "Más tarde"', async ({ page }) => {
    await page.click('[data-testid="push-opt-in-later"]')
    await page.reload()
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).not.toBeVisible()
  })

  test('"Más tarde" no persiste el flag permanente (localStorage)', async ({ page }) => {
    await page.click('[data-testid="push-opt-in-later"]')
    const dismissedFlag = await page.evaluate(() => localStorage.getItem('push-opt-in-dismissed'))
    expect(dismissedFlag).toBeNull()
    const sessionFlag = await page.evaluate(() => sessionStorage.getItem('push-opt-in-shown-this-session'))
    expect(sessionFlag).toBe('1')
  })

  test('el boton Cerrar (X) sí persiste el flag permanente (localStorage)', async ({ page }) => {
    await page.click('[data-testid="push-opt-in-dismiss"]')
    await expect(page.locator('[data-testid="push-opt-in-toast"]')).not.toBeVisible()
    const dismissedFlag = await page.evaluate(() => localStorage.getItem('push-opt-in-dismissed'))
    expect(dismissedFlag).toBe('1')
  })
})
