// @tests produccion.portal.aguabambu.com — smoke + audit no-destructivo
// Corre contra producción real: admin / admin123
// No muta datos. Documenta hallazgos P0-P3 en JSONL.

import { test, expect, type Page } from '@playwright/test'
import { fullLogin, checkHorizontalOverflow } from '../fixtures'
import * as fs from 'fs'
import * as path from 'path'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://portal.aguabambu.com'
const RESULTS_DIR = path.join(process.cwd(), 'test-results', 'produccion')
const FINDINGS_FILE = path.join(RESULTS_DIR, `findings-${Date.now()}.jsonl`)
const BASELINE_DIR = path.join(process.cwd(), 'test-results')

// ─── TIPOS ───────────────────────────────────────────────────────────────────

type Severity = 'P0' | 'P1' | 'P2' | 'P3'

interface Finding {
  severity: Severity
  section: string
  title: string
  description: string
  url?: string
  viewport?: string
  screenshot?: string
  metric?: string
  value?: number
  baseline?: number
}

interface Vitals {
  ttfb: number | null
  lcp: number | null
  inp: number | null
  cls: number | null
}

interface SectionMetrics {
  url: string
  loadTime: number
  vitals: Vitals
  consoleErrors: string[]
  networkErrors: string[]
  pageErrors: string[]
  garbage: string[]
}

interface LcpEntry extends PerformanceEntry {
  startTime: number
  entryType: 'largest-contentful-paint'
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
  entryType: 'layout-shift'
}

interface FirstInputEntry extends PerformanceEntry {
  processingStart: number
  startTime: number
  entryType: 'first-input'
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const findings: Finding[] = []
const sectionMetrics: Record<string, SectionMetrics> = {}

async function addFinding(page: Page | undefined, finding: Finding) {
  if ((finding.severity === 'P0' || finding.severity === 'P1') && page) {
    const screenshotName = `finding-${finding.severity}-${Date.now()}-${finding.section}.png`
    const screenshotPath = path.join(RESULTS_DIR, screenshotName)
    try {
      if (!fs.existsSync(RESULTS_DIR)) {
        fs.mkdirSync(RESULTS_DIR, { recursive: true })
      }
      await page.screenshot({ path: screenshotPath, fullPage: true })
      finding.screenshot = screenshotPath
    } catch {
      // screenshot no es crítico
    }
  }

  findings.push(finding)
  const line = JSON.stringify(finding)
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true })
  }
  fs.appendFileSync(FINDINGS_FILE, `${line}\n`)
}

async function captureErrors(
  page: Page,
  section: string
): Promise<{ consoleErrors: string[]; networkErrors: string[]; pageErrors: string[] }> {
  const consoleErrors: string[] = []
  const networkErrors: string[] = []
  const pageErrors: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      consoleErrors.push(text)
      if (isCriticalError(text)) {
        addFinding(page, {
          severity: 'P0',
          section,
          title: 'Console error crítico',
          description: text.slice(0, 500),
          url: page.url(),
        })
      }
    }
  })

  page.on('requestfailed', async (req) => {
    const url = req.url()
    const failure = req.failure()?.errorText || 'unknown'
    const resp = await req.response().catch(() => null)
    const status = resp?.status()
    const text = `${failure} ${status ? `(${status})` : ''} ${url}`
    networkErrors.push(text)
    if (status && status >= 500) {
      addFinding(page, {
        severity: 'P0',
        section,
        title: 'HTTP 500+ en request',
        description: text.slice(0, 500),
        url: page.url(),
      })
    } else if (status === 403 || status === 401) {
      addFinding(page, {
        severity: 'P0',
        section,
        title: 'Error de autorización',
        description: text.slice(0, 500),
        url: page.url(),
      })
    }
  })

  page.on('pageerror', (err) => {
    const text = err.message
    pageErrors.push(text)
    addFinding(page, {
      severity: 'P0',
      section,
      title: 'Uncaught exception',
      description: text.slice(0, 500),
      url: page.url(),
    })
  })

  return { consoleErrors, networkErrors, pageErrors }
}

function isCriticalError(text: string): boolean {
  const criticalPatterns = [
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'Cannot read properties',
    'Cannot read property',
    'undefined is not',
    'null is not',
    'is not a function',
  ]
  return criticalPatterns.some((p) => text.includes(p))
}

async function captureWebVitals(page: Page): Promise<Vitals> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const result: Vitals = { ttfb: null, lcp: null, inp: null, cls: null }
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
        if (nav) {
          result.ttfb = nav.responseStart - nav.startTime
        }

        let clsSum = 0
        let firstInputDuration: number | null = null

        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
              result.lcp = (entry as LcpEntry).startTime
            } else if (entry.entryType === 'layout-shift' && !(entry as LayoutShiftEntry).hadRecentInput) {
              clsSum += (entry as LayoutShiftEntry).value
              result.cls = clsSum
            } else if (entry.entryType === 'first-input') {
              firstInputDuration = (entry as FirstInputEntry).processingStart - entry.startTime
              result.inp = firstInputDuration
            }
          }
        })

        try {
          obs.observe({ entryTypes: ['largest-contentful-paint', 'layout-shift', 'first-input'] })
        } catch {
          // first-input no siempre está soportado
        }

        setTimeout(() => {
          obs.disconnect()
          resolve(result)
        }, 5000)
      })
  )
}

async function hasGarbageText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const body = document.body.innerText
    const garbage = ['undefined', 'null', 'NaN', '[object Object]', '() =>', 'function(']
    const found: string[] = []
    for (const token of garbage) {
      if (body.includes(token)) {
        found.push(token)
      }
    }
    return found
  })
}

async function checkTouchTargets(page: Page, section: string, viewport: string): Promise<void> {
  const failures = await page.evaluate(() => {
    const interactive = document.querySelectorAll(
      'button, [role="button"], a, input[type="submit"], select, textarea, input, [role="link"]'
    )
    const tooSmall: string[] = []
    interactive.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && (rect.width < 36 || rect.height < 36)) {
        const text = el.textContent?.slice(0, 30).trim() || el.tagName
        tooSmall.push(`${text} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
      }
    })
    return tooSmall.slice(0, 20)
  })

  for (const failure of failures) {
    addFinding(page, {
      severity: 'P1',
      section,
      title: 'Touch target menor a 36px',
      description: failure,
      url: page.url(),
      viewport,
    })
  }
}

async function triggerInteraction(page: Page) {
  // Simula una interacción simple para capturar first-input / INP
  const safe = page.locator('body, header, main').first()
  if (await safe.isVisible().catch(() => false)) {
    await safe.click({ force: true, timeout: 2000 }).catch(() => {})
  }
}

async function dismissInstallBanner(page: Page, section: string, viewport: string) {
  const close = page.locator('button[aria-label="Cerrar banner de instalación"]')
  if (await close.isVisible({ timeout: 3000 }).catch(() => false)) {
    addFinding(page, {
      severity: 'P2',
      section,
      title: 'Banner PWA de instalación visible',
      description: 'El banner de "Instala Agua Bambú" tapa contenido hasta que se cierra',
      url: page.url(),
      viewport,
    })
    await close.click()
    await page.waitForTimeout(500)
  }
}



async function measureNavigation(
  page: Page,
  section: string,
  pathname: string,
  viewport: string
): Promise<SectionMetrics> {
  const start = Date.now()
  const metrics: SectionMetrics = {
    url: `${BASE}${pathname}`,
    loadTime: 0,
    vitals: { ttfb: null, lcp: null, inp: null, cls: null },
    consoleErrors: [],
    networkErrors: [],
    pageErrors: [],
    garbage: [],
  }

  // Escucha errores y requests durante la navegación
  const errorPromise = captureErrors(page, section)

  await page.goto(`${BASE}${pathname}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
  await triggerInteraction(page)

  metrics.loadTime = Date.now() - start
  metrics.vitals = await captureWebVitals(page)
  const errorData = await errorPromise
  metrics.consoleErrors = errorData.consoleErrors
  metrics.networkErrors = errorData.networkErrors
  metrics.pageErrors = errorData.pageErrors
  metrics.garbage = await hasGarbageText(page)

  sectionMetrics[section] = metrics

  // Baseline handling
  compareAgainstBaseline(page, section, metrics, viewport)

  // Garbage text findings
  if (metrics.garbage.length > 0) {
    addFinding(page, {
      severity: 'P1',
      section,
      title: 'Garbage text detectado',
      description: metrics.garbage.join(', '),
      url: page.url(),
      viewport,
    })
  }

  return metrics
}

function getLatestBaseline(): Record<string, { ttfb: number; lcp: number; inp: number; cls: number }> | null {
  if (!fs.existsSync(BASELINE_DIR)) return null
  const files = fs
    .readdirSync(BASELINE_DIR)
    .filter((f) => f.startsWith('baseline-produccion-') && f.endsWith('.json'))
    .sort()
  if (files.length === 0) return null
  const latest = path.join(BASELINE_DIR, files[files.length - 1])
  try {
    return JSON.parse(fs.readFileSync(latest, 'utf-8'))
  } catch {
    return null
  }
}

function compareAgainstBaseline(page: Page, section: string, metrics: SectionMetrics, viewport: string) {
  const baseline = getLatestBaseline()
  if (!baseline) {
    addFinding(page, {
      severity: 'P3',
      section,
      title: 'Baseline no encontrado',
      description: `Se requiere una corrida inicial para establecer baseline de performance en ${viewport}`,
      url: metrics.url,
      viewport,
    })
    return
  }

  const b = baseline[`${section}:${viewport}`]
  if (!b) return

  const tolerance = { ttfb: 1.0, lcp: 0.5, inp: 1.0, cls: 0.1 }

  for (const key of ['ttfb', 'lcp', 'inp', 'cls'] as const) {
    const current = metrics.vitals[key]
    const base = b[key]
    if (current == null || base == null) continue

    const threshold = key === 'cls' ? base + tolerance[key] : base * (1 + tolerance[key])
    if (current > threshold) {
      addFinding(page, {
        severity: 'P2',
        section,
        title: `Performance ${key.toUpperCase()} supera baseline`,
        description: `${key.toUpperCase()}: ${Math.round(current)}ms (baseline: ${Math.round(base)}ms, umbral: ${Math.round(threshold)}ms)`,
        url: metrics.url,
        viewport,
        metric: key,
        value: current,
        baseline: base,
      })
    }
  }
}

function writeBaseline(viewport: string) {
  const baseline: Record<string, { ttfb: number; lcp: number; inp: number; cls: number }> = {}
  for (const [section, metrics] of Object.entries(sectionMetrics)) {
    const key = `${section}:${viewport}`
    baseline[key] = {
      ttfb: metrics.vitals.ttfb ?? 0,
      lcp: metrics.vitals.lcp ?? 0,
      inp: metrics.vitals.inp ?? 0,
      cls: metrics.vitals.cls ?? 0,
    }
  }
  const file = path.join(BASELINE_DIR, `baseline-produccion-${Date.now()}-${viewport}.json`)
  if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true })
  }
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2))
  return file
}

function printSummary() {
  const bySeverity = { P0: 0, P1: 0, P2: 0, P3: 0 }
  for (const f of findings) {
    bySeverity[f.severity]++
  }

  const lines = [
    '',
    '=== PRODUCCION AUDIT SUMMARY ===',
    `P0 (bugs críticos): ${bySeverity.P0}`,
    `P1 (bugs UX):       ${bySeverity.P1}`,
    `P2 (warnings):      ${bySeverity.P2}`,
    `P3 (info):          ${bySeverity.P3}`,
    `Findings file:      ${FINDINGS_FILE}`,
    '',
  ]

  if (findings.length > 0) {
    lines.push('Detalle de hallazgos:')
    for (const f of findings) {
      lines.push(`[${f.severity}] ${f.section}: ${f.title} — ${f.description.slice(0, 120)}`)
    }
  }

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'))
}

// ─── SUITE ───────────────────────────────────────────────────────────────────

test.describe('Produccion — Smoke + Audit @produccion', () => {
  test.describe.configure({ mode: 'parallel' })
  test.use({ storageState: { cookies: [], origins: [] } })
  test.slow()

  const viewportLabel = () => (test.info().project.name === 'mobile' ? 'mobile' : 'desktop')

  test.afterAll(async () => {
    const vp = viewportLabel()
    writeBaseline(vp)
    printSummary()
  })

  // ─── SMOKE ─────────────────────────────────────────────────────────────────

  test('@smoke login admin redirige a dashboard', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())
    await expect(page).toHaveURL(/\/(dashboard|reportes|repartidor)/, { timeout: 30000 })
    const heading = page.getByRole('heading').first()
    await expect(heading).toBeVisible()
  })

  test('@smoke @audit /clientes carga sin errores críticos', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())
    await measureNavigation(page, 'clientes', '/clientes', viewportLabel())
    await expect(page.getByRole('heading', { name: /Clientes/i })).toBeVisible({ timeout: 30000 })
    await expect(page.locator('button:has-text("Nuevo Cliente")')).toBeVisible({ timeout: 10000 })
  })

  test('@smoke @audit /pedidos carga sin errores críticos', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())
    await measureNavigation(page, 'pedidos', '/pedidos', viewportLabel())
    const pedidosTab = page
      .locator('[data-testid="tab-hoy"]')
      .or(page.locator('[role="tab"]'))
      .or(page.locator('button').filter({ hasText: /Hoy|Pedidos/i }))
      .first()
    const isVisible = await pedidosTab.isVisible({ timeout: 30000 }).catch(() => false)
    if (!isVisible) {
      addFinding(page, {
        severity: 'P0',
        section: 'pedidos',
        title: 'Contenido de pedidos no renderiza en mobile',
        description: 'No se detectaron tabs, lista ni contenido de pedidos tras cerrar banner PWA',
        url: `${BASE}/pedidos`,
        viewport: viewportLabel(),
      })
    }
    await expect(pedidosTab).toBeVisible({ timeout: 30000 })
  })

  test('@smoke @audit /recurrentes carga sin errores críticos', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())
    await measureNavigation(page, 'recurrentes', '/recurrentes', viewportLabel())
    await expect(page.getByRole('heading', { name: /Pedidos Recurrentes/i, level: 1 })).toBeVisible({ timeout: 30000 })
  })

  test('@smoke @audit /embarques carga sin errores críticos', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())
    await measureNavigation(page, 'embarques', '/embarques', viewportLabel())
    await expect(page.getByRole('heading', { name: /Embarques/i })).toBeVisible({ timeout: 30000 })
  })

  // ─── AUDIT UX / PERFORMANCE ────────────────────────────────────────────────

  test('@audit navegación sidebar funciona en todas las secciones', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())
    const paths = ['/clientes', '/pedidos', '/recurrentes', '/embarques']
    for (const p of paths) {
      const start = Date.now()
      try {
        await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {})
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        addFinding(page, {
          severity: 'P0',
          section: p.replace('/', ''),
          title: 'Navegación falla o excede timeout',
          description: msg.slice(0, 300),
          url: `${BASE}${p}`,
          viewport: viewportLabel(),
        })
        continue
      }
      const loadTime = Date.now() - start
      if (loadTime > 10000) {
        addFinding(page, {
          severity: 'P2',
          section: p.replace('/', ''),
          title: 'Navegación lenta desde sidebar',
          description: `Load time: ${loadTime}ms`,
          url: `${BASE}${p}`,
          viewport: viewportLabel(),
        })
      }
    }
  })

  test('@audit búsqueda y filtros respondan en clientes, pedidos y embarques', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())

    // Clientes: buscar
    await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const search = page.locator('input[placeholder*="Buscar" i]').first()
    if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
      await search.fill('a')
      await page.waitForTimeout(1000)
      const hasResults = await page.locator('tbody tr, div.grid.cursor-pointer').count()
      if (hasResults === 0) {
        addFinding(page, {
          severity: 'P2',
          section: 'clientes',
          title: 'Búsqueda con "a" no retorna resultados',
          description: 'Probablemente no hay clientes cargados o el filtro es demasiado restrictivo',
          url: `${BASE}/clientes`,
          viewport: viewportLabel(),
        })
      }
    }

    // Pedidos: cambiar tabs
    await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const tabFiados = page.locator('[data-testid="tab-fiados"], button:has-text("Fiados")').first()
    if (await tabFiados.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tabFiados.click()
      await page.waitForTimeout(1500)
      if (await page.getByText('No hay').count() === 0 && (await page.locator('tbody tr').count()) === 0) {
        addFinding(page, {
          severity: 'P3',
          section: 'pedidos',
          title: 'Tab Fiados vacío o no renderiza filas',
          description: 'No se detectaron filas tras cambiar a tab fiados',
          url: `${BASE}/pedidos?tab=fiados`,
          viewport: viewportLabel(),
        })
      }
    }

    // Embarques: filtros de estado
    await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    for (const label of ['Abiertos', 'En Ruta', 'Cerrados']) {
      const pill = page.locator(`button:has-text("${label}")`).first()
      if (await pill.isVisible({ timeout: 3000 }).catch(() => false)) {
        await pill.click()
        await page.waitForTimeout(1000)
      }
    }
  })

  test('@audit detalle de entidades abre sin errores', async ({ page }) => {
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())

    // Cliente
    await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const firstRow = page.locator('tbody tr, div.grid.cursor-pointer').first()
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(1500)
      const detailVisible = await page
        .locator('button:has-text("Volver"), [role="tab"]:has-text("Info"), [role="tab"]:has-text("Historial")')
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false)
      if (!detailVisible) {
        addFinding(page, {
          severity: 'P1',
          section: 'clientes',
          title: 'Detalle de cliente no abre',
          description: 'Click en primera fila no muestra panel/modal de detalle',
          url: `${BASE}/clientes`,
          viewport: viewportLabel(),
        })
      }
    }

    // Pedido
    await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const firstPedido = page.locator('tbody tr').first()
    if (await firstPedido.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstPedido.click()
      await page.waitForTimeout(1500)
      const modalVisible = await page.getByRole('dialog').first().isVisible({ timeout: 5000 }).catch(() => false)
      if (!modalVisible) {
        addFinding(page, {
          severity: 'P1',
          section: 'pedidos',
          title: 'Detalle de pedido no abre',
          description: 'Click en primera fila no muestra modal de detalle',
          url: `${BASE}/pedidos`,
          viewport: viewportLabel(),
        })
      }
    }

    // Embarque
    await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const firstCard = page.locator('[data-testid="embarque-card"]').first()
    if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCard.click()
      await page.waitForTimeout(1500)
      await expect(page).toHaveURL(/\/embarques\/.+/, { timeout: 10000 }).catch(() => {
        addFinding(page, {
          severity: 'P1',
          section: 'embarques',
          title: 'Click en card de embarque no navega al detalle',
          description: 'URL no cambió a /embarques/:id',
          url: `${BASE}/embarques`,
          viewport: viewportLabel(),
        })
      })
    }
  })

  test('@audit mobile: overflow y touch targets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only')
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())

    const paths = ['/clientes', '/pedidos', '/recurrentes', '/embarques']
    for (const p of paths) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(800)

      try {
        await checkHorizontalOverflow(page)
      } catch {
        addFinding(page, {
          severity: 'P1',
          section: p.replace('/', ''),
          title: 'Overflow horizontal en mobile',
          description: 'scrollWidth > clientWidth',
          url: `${BASE}${p}`,
          viewport: 'mobile',
        })
      }

      await checkTouchTargets(page, p.replace('/', ''), 'mobile')
    }
  })

  test('@audit desktop: sidebar persistente y tablas renderizan', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only')
    await fullLogin(page, 'admin', 'admin123')
    await dismissInstallBanner(page, 'general', viewportLabel())

    const paths = ['/clientes', '/pedidos', '/recurrentes', '/embarques']
    for (const p of paths) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(800)

      const sidebar = page.getByRole('complementary', { name: /navegaci[oó]n principal/i })
      const sidebarVisible = await sidebar.isVisible({ timeout: 5000 }).catch(() => false)
      if (!sidebarVisible) {
        addFinding(page, {
          severity: 'P1',
          section: p.replace('/', ''),
          title: 'Sidebar no visible en desktop',
          description: 'El aside de navegación principal no se renderiza',
          url: `${BASE}${p}`,
          viewport: 'desktop',
        })
      }

      try {
        await checkHorizontalOverflow(page)
      } catch {
        addFinding(page, {
          severity: 'P1',
          section: p.replace('/', ''),
          title: 'Overflow horizontal en desktop',
          description: 'scrollWidth > clientWidth',
          url: `${BASE}${p}`,
          viewport: 'desktop',
        })
      }
    }
  })
})
