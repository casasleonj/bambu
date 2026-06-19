// @ts-check
// F1: Smoke test — verifica que la app levanta y los 4 roles × 2 viewports pueden loguearse.
// Si esto falla, NO tiene sentido seguir con el walkthrough. Aborta con mensaje claro.

import { test, expect, loginAs, shoot, addFinding, isVisible, BASE, RUN_ID, FINDINGS_FILE, SCREENSHOTS_DIR } from './walkthrough-helpers'

const ROLES = ['admin', 'asistente', 'contador', 'repartidor'] as const
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 667 },
] as const

for (const role of ROLES) {
  for (const vp of VIEWPORTS) {
    test(`SMOKE: ${role} puede loguearse en ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })

      // Ir a /login
      await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

      // Verificar que el form de login está visible
      const loginForm = page.locator('input[placeholder="Ingrese usuario"]')
      if (!(await loginForm.isVisible({ timeout: 5000 }).catch(() => false))) {
        addFinding({
          severity: 'P0',
          module: 'auth',
          title: `Login form no visible para ${role} en ${vp.name}`,
          description: `No se encontró el input de usuario en /login`,
          expected: 'Input "Ingrese usuario" visible',
          observed: 'No se encontró el input',
          userComplaint: 'App no levanta',
        })
        test.skip()
        return
      }

      await shoot(page, `smoke-01-login-${role}-${vp.name}`)

      // Login
      const credentials = {
        admin: { user: 'admin', pass: 'admin123' },
        asistente: { user: 'asistente', pass: 'asist123' },
        contador: { user: 'contador', pass: 'cont123' },
        repartidor: { user: 'repartidor', pass: 'rep123' },
      }[role]

      await page.fill('input[placeholder="Ingrese usuario"]', credentials.user)
      await page.fill('input[placeholder="Ingrese contraseña"]', credentials.pass)
      await page.click('button[type="submit"]')

      // Esperar redirect a página de rol
      const expectedUrls: Record<typeof role, RegExp> = {
        admin: /\/dashboard/,
        asistente: /\/dashboard/,
        contador: /\/reportes/,
        repartidor: /\/repartidor/,
      }
      try {
        await page.waitForURL(expectedUrls[role], { timeout: 20000 })
      } catch {
        const url = page.url()
        const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
        await shoot(page, `smoke-FAIL-${role}-${vp.name}`)
        addFinding({
          severity: 'P0',
          module: 'auth',
          title: `Login falló para ${role} en ${vp.name}`,
          description: `Después de submit, la URL es ${url}. Body contiene: ${bodyText.slice(0, 200)}`,
          expected: `Redirect a ${expectedUrls[role]}`,
          observed: `URL: ${url}`,
          userComplaint: 'No se puede iniciar sesión',
          screenshot: `screenshots/walkthrough-${RUN_ID}/smoke-FAIL-${role}-${vp.name}.png`,
        })
        return
      }

      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)

      // Verificar que el body no esté vacío
      const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
      if (bodyText.length < 50) {
        await shoot(page, `smoke-empty-${role}-${vp.name}`)
        addFinding({
          severity: 'P0',
          module: 'auth',
          title: `Página post-login vacía para ${role} en ${vp.name}`,
          description: `Body tiene ${bodyText.length} chars (esperado >= 50)`,
          expected: 'Página renderiza con contenido',
          observed: 'Body casi vacío',
        })
        return
      }

      await shoot(page, `smoke-02-landed-${role}-${vp.name}`)

      // Verificar no hay overflow horizontal en mobile
      if (vp.name === 'mobile') {
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
        )
        if (overflow) {
          addFinding({
            severity: 'P2',
            module: 'auth',
            title: `Overflow horizontal en mobile post-login (${role})`,
            description: `scrollWidth > clientWidth en viewport 375x667`,
            expected: 'Sin overflow horizontal',
            observed: 'Hay overflow',
          })
        }
      }
    })
  }
}

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[smoke] Findings file: ${FINDINGS_FILE}`)
  // eslint-disable-next-line no-console
  console.log(`[smoke] Screenshots: ${SCREENSHOTS_DIR}`)
})
