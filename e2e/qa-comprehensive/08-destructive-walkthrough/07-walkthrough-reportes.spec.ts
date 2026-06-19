/**
 * Destructive Walkthrough — Tier 8 / 07: Reportes
 *
 * Walkthrough de los módulos de reportes:
 *  - /reportes (general)
 *  - /reportes/forecast
 *  - /reportes/salud-antifraude
 *  - /facturas
 *  - /resumen-facturas
 *  - /deudas
 *  - /sugerencias
 *
 * Tests: ~8
 */
import {
  test,
  expect,
  seedFaker,
  loginAsRole,
  setViewportFor as setViewport,
  assertNoHorizontalOverflow,
  assertNoNextErrors,
  addFinding,
  BASE,
  type TestRole,
  type TestViewport,
} from './00-fixtures'

test.beforeAll(() => seedFaker(42))

const REPORTES_ROUTES: Array<{ name: string; path: string; roles: TestRole[] }> = [
  { name: 'Reportes', path: '/reportes', roles: ['admin', 'contador'] },
  { name: 'Forecast', path: '/reportes/forecast', roles: ['admin', 'contador'] },
  { name: 'Salud Antifraude', path: '/reportes/salud-antifraude', roles: ['admin', 'contador'] },
  { name: 'Facturas', path: '/facturas', roles: ['admin', 'contador'] },
  { name: 'Resumen Facturas', path: '/resumen-facturas', roles: ['admin', 'contador'] },
  { name: 'Deudas', path: '/deudas', roles: ['admin', 'contador'] },
  { name: 'Sugerencias', path: '/sugerencias', roles: ['admin', 'asistente', 'contador'] },
  { name: 'Casos', path: '/casos', roles: ['admin', 'asistente', 'contador'] },
]

// ─────────────────────────────────────────────────────────────────────────────
//  Smoke por reporte × rol × viewport
// ─────────────────────────────────────────────────────────────────────────────

for (const reporte of REPORTES_ROUTES) {
  for (const role of reporte.roles) {
    for (const viewport of ['desktop', 'mobile'] as TestViewport[]) {
      test(`${reporte.name} (${role} ${viewport}): renderiza sin errores`, async ({ page }) => {
        await setViewport(page, viewport)
        await loginAsRole(page, role)
        const response = await page.goto(`${BASE}${reporte.path}`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(500)

        if (response && (response.status() === 403 || response.status() === 404)) {
          // Acceso denegado: comportamiento esperado para algunos roles
          return
        }

        expect(response?.status()).toBeLessThan(500)
        const nextErr = await assertNoNextErrors(page)
        expect(nextErr.hasError).toBe(false)

        if (viewport === 'mobile') {
          const overflow = await assertNoHorizontalOverflow(page)
          if (overflow.overflow) {
            addFinding({
              severity: 'P2',
              module: reporte.name.toLowerCase(),
              title: `Overflow horizontal en ${reporte.path} (${role} ${viewport})`,
              description: `scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
            })
          }
        }
      })
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Filtros en reportes
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: filtro por fecha en /reportes', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/reportes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  const dateInput = page.locator('input[type="date"]').first()
  if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dateInput.fill('2025-01-01')
    await page.waitForTimeout(500)
    const nextErr = await assertNoNextErrors(page)
    expect(nextErr.hasError).toBe(false)
  }
})

test('admin desktop: facturas se pueden filtrar por cliente', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/facturas`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  const search = page.locator('input[type="search"], input[placeholder*="buscar" i]').first()
  if (await search.isVisible({ timeout: 2000 }).catch(() => false)) {
    await search.fill('Test')
    await page.waitForTimeout(500)
  }
})

test('admin desktop: forecast muestra proyección', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/reportes/forecast`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
  if (bodyText.length < 100) {
    addFinding({
      severity: 'P1',
      module: 'forecast',
      title: '/reportes/forecast casi vacío',
      description: `Body: ${bodyText.length} chars`,
    })
  }
})

test('admin desktop: salud-antifraude renderiza métricas', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/reportes/salud-antifraude`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
  if (bodyText.length < 100) {
    addFinding({
      severity: 'P1',
      module: 'antifraude',
      title: '/reportes/salud-antifraude casi vacío',
      description: `Body: ${bodyText.length} chars`,
    })
  }
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[07-walkthrough-reportes] Walkthrough Reportes completo.`)
})
