// @tests visual/header
// Regresion: header mobile responsive.
// - Sin overflow horizontal (bug original: "Online" + fecha larga + avatar
//   se desbordaban a 390px).
// - Boton hamburguesa, indicador de conectividad y menu de usuario visibles
//   y dentro del viewport.
// - Titulo h1 en una sola linea (antes se partia en 2 por falta de truncate).
// Ver AGENTS.md -> Regresion header mobile 2026-06-10.

import { test, expect } from '@playwright/test'
import { fullLogin, checkHorizontalOverflow } from './fixtures'

// FIX: `test.use` debe estar al top-level del archivo, NO dentro de
// test.describe. Playwright rechaza `test.use` dentro de un describe group
// porque forzaria un nuevo worker. Verificado con `npx playwright test`:
// error: "Cannot use({ defaultBrowserType }) in a describe group, because it
// forces a new worker. Make it top-level in the test file or put in the
// configuration file."
//
// El project `chromium-mobile` en playwright.config.ts provee el viewport
// iPhone 13. Para correr este spec con el project mobile:
//   npx playwright test e2e/mobile-header.spec.ts --project=chromium-mobile
// El `test.use` explicito aca permite correrlo tambien con el project
// default y override el viewport en runtime (util para correr todos los
// specs en una sola invocacion).
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })

test.describe('Header mobile responsive', () => {
  test('header no se desborda horizontalmente en iPhone 13', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // No debe haber overflow horizontal en <html> ni en <body>.
    await checkHorizontalOverflow(page)
  })

  test('todos los elementos del header son visibles en mobile', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // Boton hamburguesa (aria-label incluye "menu" en lowercase).
    const hamburger = page.getByRole('button', { name: /men[uú]/i })
    await expect(hamburger).toBeVisible()

    // Indicador de conectividad (data-testid, siempre en DOM, hidden solo
    // detras del pending counter interno).
    const indicator = page.locator('[data-testid="connectivity-indicator"]')
    await expect(indicator).toBeVisible()

    // Menu de usuario.
    const userMenu = page.getByTestId('user-menu')
    await expect(userMenu).toBeVisible()
  })

  test('titulo h1 esta en una sola linea en mobile', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const h1 = page.getByRole('heading', { name: /Agua Bamb[uú]/ })
    await expect(h1).toBeVisible()

    // La altura del h1 no debe exceder 1.5x el line-height. Si se parte en
    // 2 lineas, la altura seria ~2x line-height.
    const lineCount = await h1.evaluate((el) => {
      const cs = getComputedStyle(el)
      const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
      const height = el.getBoundingClientRect().height
      return height / lineHeight
    })
    expect(lineCount).toBeLessThan(1.5)
  })

  test('fecha se muestra en formato corto en mobile', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // En < sm, debe haber un span con clase sm:hidden (fecha corta "10 jun").
    const fechaCorta = page.locator('header span.sm\\:hidden')
    await expect(fechaCorta).toBeVisible()

    // Y NO debe estar visible el span de fecha larga (hidden sm:inline).
    // Tomamos el span del bloque de fecha, no el del connectivity indicator.
    // El bloque de fecha esta dentro de un div con bg-blue-700/40.
    const fechaLarga = page.locator('header div.bg-blue-700\\/40 span.hidden.sm\\:inline')
    // Esta asercion es de no-visibilidad: el span existe en el DOM (con hidden)
    // pero Playwright "toBeHidden" valida que no este visible.
    await expect(fechaLarga).toBeHidden()
  })

  test('connectivity indicator oculta el label "Online" en mobile', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // El label "Online"/"Offline"/"Sync" tiene clase hidden sm:inline.
    // En mobile (< sm = < 640px) debe estar oculto.
    const label = page.locator('[data-testid="connectivity-indicator"] span.hidden.sm\\:inline')
    await expect(label).toBeHidden()
  })

  test('header no se desborda en viewport pequeno (320x568 — iPhone SE 1ra gen)', async ({ page }) => {
    // Reset viewport override para este test especifico.
    await page.setViewportSize({ width: 320, height: 568 })
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    await checkHorizontalOverflow(page)
  })
})
