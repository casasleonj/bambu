// @ts-check
// F3: Walkthrough general — recorre TODOS los módulos restantes (no prioritarios)
// Para cada uno: login admin → ir a /<modulo> → verificar que renderiza,
// botones principales presentes, no hay errores visibles.

import { test, loginAs, shoot, addFinding, isVisible, BASE, RUN_ID, SCREENSHOTS_DIR } from './walkthrough-helpers'

interface ModuleDef {
  name: string
  path: string
  /** CTAs esperados (botones/links visibles) */
  expectedCTAs?: string[]
  /** Subtarea que el test no requiere pero quiero mencionar */
  notes?: string
}

const MODULES: ModuleDef[] = [
  { name: 'Clientes', path: '/clientes', expectedCTAs: ['Crear', 'Nuevo', 'Buscar'] },
  { name: 'Trabajadores', path: '/trabajadores', expectedCTAs: ['Crear', 'Nuevo'] },
  { name: 'Proveedores', path: '/proveedores', expectedCTAs: ['Crear', 'Nuevo'] },
  { name: 'Insumos', path: '/insumos', expectedCTAs: ['Crear', 'Nuevo'] },
  { name: 'Productos', path: '/productos', expectedCTAs: ['Crear', 'Nuevo'] },
  { name: 'Compras', path: '/compras', expectedCTAs: ['Crear', 'Nuevo', 'Registrar'] },
  { name: 'Gastos', path: '/gastos', expectedCTAs: ['Crear', 'Nuevo', 'Registrar'] },
  { name: 'Nómina', path: '/nomina', expectedCTAs: ['Crear', 'Nuevo', 'Calcular'] },
  { name: 'Reportes', path: '/reportes', expectedCTAs: [] },
  { name: 'Reportes Forecast', path: '/reportes/forecast', expectedCTAs: [] },
  { name: 'Sugerencias', path: '/sugerencias', expectedCTAs: [] },
  { name: 'Configuración', path: '/configuracion', expectedCTAs: [] },
  { name: 'Mi Perfil', path: '/mi-perfil', expectedCTAs: [] },
  { name: 'Rutas', path: '/rutas', expectedCTAs: ['Crear', 'Nueva'] },
  { name: 'Facturas', path: '/facturas', expectedCTAs: [] },
  { name: 'Deudas', path: '/deudas', expectedCTAs: [] },
  { name: 'Casos', path: '/casos', expectedCTAs: [] },
]

test.describe('F3. Walkthrough general — todos los módulos', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  for (const m of MODULES) {
    test(`F3: ${m.name} (${m.path}) renderiza`, async ({ page }) => {
      const url = `${BASE}${m.path}`
      const res = await page.goto(url, { waitUntil: 'domcontentloaded' })
      const status = res?.status() ?? 0
      await page.waitForTimeout(2000)

      if (status >= 400) {
        addFinding({
          severity: 'P0',
          module: m.name.toLowerCase(),
          title: `${m.name} devuelve HTTP ${status}`,
          description: `URL ${url} devolvió ${status}. Probable error de Next.js o ruta rota.`,
        })
        await shoot(page, `F3-${m.name}-HTTP-${status}`)
        return
      }

      const bodyText = (await page.locator('body').textContent()) ?? ''
      if (bodyText.length < 100) {
        addFinding({
          severity: 'P1',
          module: m.name.toLowerCase(),
          title: `${m.name} renderiza con muy poco contenido`,
          description: `Body: ${bodyText.length} chars. Esperado > 100.`,
        })
        await shoot(page, `F3-${m.name}-vacio`)
        return
      }

      // Verificar CTAs esperados
      const ctaResults: string[] = []
      for (const cta of m.expectedCTAs || []) {
        const visible = await isVisible(page, `button:has-text("${cta}"), a:has-text("${cta}")`)
        ctaResults.push(`${cta}: ${visible ? 'OK' : 'FALTA'}`)
      }
      if (ctaResults.some(r => r.endsWith('FALTA'))) {
        addFinding({
          severity: 'P2',
          module: m.name.toLowerCase(),
          title: `CTAs faltantes en ${m.name}`,
          description: `Esperados: ${m.expectedCTAs?.join(', ')}. Resultado: ${ctaResults.join(' | ')}`,
        })
      }

      // Verificar no overflow horizontal
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      if (overflow) {
        addFinding({
          severity: 'P2',
          module: m.name.toLowerCase(),
          title: `Overflow horizontal en ${m.name} (desktop)`,
          description: `scrollWidth > clientWidth en viewport 1280x800`,
        })
      }

      // Verificar no garbage text
      const garbage = ['undefined', 'null', 'NaN', '[object Object]']
      const garbageFound = garbage.filter(g => {
        const re = new RegExp(`\\b${g}\\b`)
        return re.test(bodyText)
      })
      if (garbageFound.length > 0) {
        addFinding({
          severity: 'P1',
          module: m.name.toLowerCase(),
          title: `Texto "basura" visible en ${m.name}`,
          description: `Encontrado en el body: ${garbageFound.join(', ')}`,
        })
      }

      // Verificar no "Error 500" / "Application error"
      if (bodyText.includes('Application error') || bodyText.includes('Internal Server Error') || bodyText.includes('Unhandled Runtime Error')) {
        addFinding({
          severity: 'P0',
          module: m.name.toLowerCase(),
          title: `Error visible en ${m.name}`,
          description: `Body contiene "Application error" o similar`,
        })
      }

      await shoot(page, `F3-${m.name}`)
    })
  }

  // Mobile pass para los módulos principales
  for (const m of ['Dashboard', 'Clientes', 'Pedidos', 'Embarques']) {
    test(`F3 mobile: ${m} renderiza sin overflow`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      // Si el test anterior (admin login) ya navegó, no relogueamos
      // pero seteamos el viewport igual
      const url = m === 'Dashboard' ? '/dashboard' :
                  m === 'Clientes' ? '/clientes' :
                  m === 'Pedidos' ? '/pedidos' : '/embarques'
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      )
      if (overflow) {
        addFinding({
          severity: 'P2',
          module: m.toLowerCase(),
          title: `Overflow horizontal en mobile (375x667) en ${m}`,
          description: `scrollWidth > clientWidth`,
        })
      }
      await shoot(page, `F3-mobile-${m}`)
    })
  }
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[F3] General walkthrough completo. Screenshots: ${SCREENSHOTS_DIR}`)
})
