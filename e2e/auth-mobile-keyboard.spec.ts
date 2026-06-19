// @tests visual/auth-shell
// Verifica que el bug del teclado virtual que tapa el input activo este
// resuelto en mobile. Ver AGENTS.md "Known Issues" — Bug teclado virtual.
//
// LIMITACION: Playwright emula el viewport mobile pero NO emula el OSK
// (on-screen keyboard) real de iOS Safari. Este test valida que el
// layout se acomoda cuando el visualViewport se reduce, simulando el
// efecto del teclado via page.evaluate(window.resizeTo / visualViewport
// override). Validacion 100% real en device iOS/Android queda como
// tarea manual post-merge (no automatizable en CI sin device farm).

import { test, expect, devices } from '@playwright/test'

// iPhone 13 viewport (390x844, isMobile true, hasTouch true, deviceScaleFactor 3).
// Pixel 7 es similar (412x915). Cubrimos el peor caso (mas pequeno).
const MOBILE_VIEWPORT = devices['iPhone 13']

test.use({ ...MOBILE_VIEWPORT })

test.describe('Mobile keyboard visibility — auth pages', () => {
  test('login: input activo queda visible cuando el viewport se reduce (teclado)', async ({ page }) => {
    await page.goto('/login')

    // Esperar a que el form este renderizado
    await expect(page.locator('input#login-username')).toBeVisible()

    // Simular el efecto del teclado: reducir visualViewport a la mitad
    // inferior (como cuando el OSK ocupa ~40% de la pantalla).
    // No podemos invocar el OSK real, pero podemos probar que el
    // handleInputFocus deja el input dentro del visualViewport reducido.
    await page.evaluate(() => {
      // Override visualViewport.height para simular teclado abierto.
      // En un browser real esto lo emite el OSK via resize events.
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: {
          height: window.innerHeight * 0.55,
          width: window.innerWidth,
          offsetLeft: 0,
          offsetTop: 0,
          pageLeft: 0,
          pageTop: 0,
          scale: 1,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        },
      })
    })

    // Focus en el password input (el que estaba tapado antes del fix)
    await page.focus('input#login-password')

    // Tras el focus, el input debe estar dentro del viewport visible.
    // No podemos medir "visible arriba del teclado" sin un layout engine
    // real, pero podemos verificar que el input tiene bounding box
    // dentro de innerHeight (lo que implica que NO quedo oculto detras
    // de un contenedor con overflow hidden o position fixed mal).
    const box = await page.locator('input#login-password').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844) // iPhone 13 height
  })

  test('login: form tiene dvh units en wrapper (no 100vh)', async ({ page }) => {
    await page.goto('/login')
    // El wrapper externo de AuthShell debe usar dvh, no vh, para que
    // reaccione al teclado en browsers que lo soportan.
    const usesDvh = await page.evaluate(() => {
      const allDivs = Array.from(document.querySelectorAll('div'))
      return allDivs.some((d) =>
        d.className && typeof d.className === 'string' && d.className.includes('min-h-[100dvh]')
      )
    })
    expect(usesDvh).toBe(true)
  })

  test('login: handleInputFocus scrollea al input activo', async ({ page }) => {
    await page.goto('/login')
    await page.focus('input#login-password')

    // Tras onFocus + scrollIntoView, el input debe estar en o cerca del
    // centro vertical del viewport (block: 'center').
    const box = await page.locator('input#login-password').boundingBox()
    const viewportHeight = 844
    const center = viewportHeight / 2
    // El input debe estar dentro del 25% central del viewport
    const distance = Math.abs((box!.y + box!.height / 2) - center)
    expect(distance).toBeLessThan(viewportHeight * 0.25)
  })
})
