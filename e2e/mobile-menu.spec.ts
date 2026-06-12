// @tests functional/sidebar-mobile
// Regresion: drawer (menu lateral) en mobile.
// - En estado inicial (< sm), el <aside> NO esta en el DOM (render-condicional).
// - Al tocar el boton hamburguesa UNA sola vez, el <aside> aparece y es visible.
// - Al tocar el scrim, el <aside> desaparece.
// - Desktop no se ve afectado: el <aside> siempre esta en el DOM con width
//   controlado por desktopCollapsed.
// Ver AGENTS.md -> Regresion header mobile 2026-06-10.

import { test, expect } from '@playwright/test'
import { fullLogin } from './fixtures'

// FIX: `test.use` debe estar al top-level del archivo, NO dentro de
// test.describe. Ver e2e/mobile-header.spec.ts para el rationale completo.
// El project `chromium-mobile` en playwright.config.ts provee el viewport
// iPhone 13. Este `test.use` explicito permite override en runtime.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })

test.describe('Drawer (menu lateral) mobile', () => {
  test('aside NO esta en el DOM en estado inicial mobile', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // drawAside = isDesktop || mobileDrawerOpen. En mobile con drawer cerrado,
    // el <aside> no se rinde.
    const aside = page.getByRole('complementary', { name: /navegaci[oó]n principal/i })
    await expect(aside).toHaveCount(0)
  })

  test('primer tap en hamburguesa abre el drawer', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const hamburger = page.getByRole('button', { name: /abrir men[uú]/i })
    await expect(hamburger).toBeVisible()

    // Un solo tap (no doble).
    await hamburger.tap()

    // Tras el tap, el aside debe estar visible.
    const aside = page.getByRole('complementary', { name: /navegaci[oó]n principal/i })
    await expect(aside).toBeVisible()

    // Y debe tener un ancho util (w-64 = 256px). Permitimos tolerancia de 4px
    // por sub-pixel rounding.
    const width = await aside.evaluate((el) => el.getBoundingClientRect().width)
    expect(width).toBeGreaterThan(200)
    expect(width).toBeLessThan(280)
  })

  test('tap en el scrim cierra el drawer', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // Abrir el drawer.
    await page.getByRole('button', { name: /abrir men[uú]/i }).tap()
    const aside = page.getByRole('complementary', { name: /navegaci[oó]n principal/i })
    await expect(aside).toBeVisible()

    // FIX: el scrim esta en z-30 y el aside en z-40 (drawer por encima del
    // scrim para que los items sean clickeables). El aside cubre los
    // primeros 256px (w-64) del viewport. El centroid del scrim cae DENTRO
    // del area del aside, asi que un tap() sin position es interceptado.
    // Solucion: tap con position explicita en el area visible del scrim
    // (x=350 > 256 = fuera del aside, viewport width 390).
    await page.locator('div.fixed.bg-black\\/50').tap({ position: { x: 350, y: 400 } })

    // El aside debe haber desaparecido del DOM.
    await expect(aside).toHaveCount(0)
  })

  test('hamburguesa toggle: abrir y cerrar con el mismo boton', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const hamburger = page.getByRole('button', { name: /men[uú]/i })
    const aside = page.getByRole('complementary', { name: /navegaci[oó]n principal/i })

    // Inicial: cerrado.
    await expect(aside).toHaveCount(0)

    // 1er tap: abre.
    await hamburger.tap()
    await expect(aside).toBeVisible()

    // 2do tap: cierra.
    await hamburger.tap()
    await expect(aside).toHaveCount(0)
  })

  test('navegar a otra ruta cierra el drawer automaticamente', async ({ page }) => {
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    // Abrir el drawer.
    await page.getByRole('button', { name: /abrir men[uú]/i }).tap()
    const aside = page.getByRole('complementary', { name: /navegaci[oó]n principal/i })
    await expect(aside).toBeVisible()

    // FIX: el primer link del aside es "Dashboard" con href /dashboard.
    // Como ya estamos en /dashboard, clickearlo no navega (y waitForURL
    // puede pasar inmediatamente sin que el pathname cambie, dejando el
    // test en estado invalido). Recorremos los links en orden y elegimos
    // el primero cuyo href != pathname actual.
    const currentPath = new URL(page.url()).pathname
    const navLinks = aside.getByRole('link')
    const linkCount = await navLinks.count()
    let targetHref: string | null = null
    for (let i = 0; i < linkCount; i++) {
      const link = navLinks.nth(i)
      const href = await link.getAttribute('href')
      if (href && href !== '#' && href !== currentPath && !href.startsWith('#')) {
        targetHref = href
        await link.tap()
        break
      }
    }
    expect(targetHref).toBeTruthy()

    // Tras la navegacion REAL, el drawer debe cerrarse.
    await page.waitForURL(new RegExp(targetHref!.replace(/\//g, '\\/')), { timeout: 5000 })
    // FIX: en Next.js 16 App Router con client navigation, despues de
    // `waitForURL` el pathname ya cambio en `window.history` PERO el
    // Server Component de la nueva ruta todavia esta renderizando y el
    // Client Component hidratando. Durante esta transicion, el Sidebar
    // del LAYOUT (que es persistente) ve el pathname viejo y el nuevo
    // aun no monto. El useEffect con deps [pathname, isDesktop] se
    // ejecuta cuando el nuevo layout hidrate. Sin `networkidle` +
    // `waitForTimeout`, el test checkea contra el Sidebar viejo que
    // todavia tiene mobileDrawerOpen=true.
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    await expect(aside).toHaveCount(0)
  })
})

test.describe('Drawer desktop (no regresion)', () => {
  test('aside esta en el DOM y visible en desktop (>= 768px)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await fullLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)

    const aside = page.getByRole('complementary', { name: /navegaci[oó]n principal/i })
    await expect(aside).toBeVisible()
  })
})
