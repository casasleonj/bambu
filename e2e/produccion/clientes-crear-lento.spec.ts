// @tests produccion — reproducible + auditor del bug "crear cliente se queda
// guardando y dice que quedo en el celular aunque estoy online en desktop".
//
// Objetivo: esterilizar el bug reportado por el admin en
// https://portal.aguabambu.com sin tocar el schema/codigo de prod. Genera
// evidencia objetiva (JSONL + screenshots) para decidir el fix en un ticket
// separado.
//
// Criterios del plan aprobado (ver chat de plan):
// - Login CUSTOM sin `__PLAYWRIGHT_TEST__` (solo setea baseDia en localStorage).
//   Razon: el flag apaga el polling del connectivity-indicator (cada 30s) y el
//   sync de la requestQueue en IndexedDB — exactamente lo que diagnosticamos.
//   Usar `fullLogin` de e2e/fixtures.ts invalidaria el reproducible.
// - Observa 30s post-submit midiendo POST real, toast, indicador, modal.
//   Razon: el toast "La conexión tardó mucho" es determinista a los 8s (race),
//   y 30s cubre 1 ciclo de sync del connectivity-indicator (interval 30s).
// - Limpieza best-effort por nombre "QA Test". Si el cleanup falla (page cerrada
//   por timeout), el test NO falla: el objetivo es el hallazgo, no basura.
// - Corre en desktop + mobile.
// - timeout por test: 900s (15min) — cubre login 60s + nav cold-start 60s +
//   observación 30s + cleanup 30s con amplio margen para Vercel Hobby.

import { test, expect, type Page, type TestInfo } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'https://portal.aguabambu.com'
const RESULTS_DIR = path.join(process.cwd(), 'test-results', 'produccion', 'clientes-crear-lento')
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')
const FINDINGS_FILE = path.join(RESULTS_DIR, `findings-${RUN_ID}.jsonl`)

// Tiempos magicos del codigo fuente (sin hardcodear a ciegas):
//   src/lib/fetch-resilient.ts:37  DEFAULT_TIMEOUT_MS = 10_000  (AbortController)
//   clientes-client/index.tsx:573  submitTimeoutMs = 8_000       (Promise.race)
//   connectivity-indicator.tsx:11  SYNC_INTERVAL_MS = 30_000      (sync poll)
const SUBMIT_TIMEOUT_MAGIC_MS = 8_000
const FETCH_ABORT_MAGIC_MS = 10_000
const SYNC_INTERVAL_MAGIC_MS = 30_000
const OBSERVATION_WINDOW_MS = 35_000 // 8s toast + ~1 ciclo de sync + holgura
const CONNECTIVITY_POLL_MS = 5_000

type ToastKind = 'lento' | 'success' | 'offline' | 'sin-conexion' | 'error' | null
type Conclusion = 'BUG_PRESENTE' | 'BUG_RESUELTO' | 'COLD_START_NORMAL' | 'PHANTOM_ENQUEUE' | 'MIXTO' | 'INCONCLUSO'

interface IndicatorSample { atMs: number; label: string }

interface RunFindings {
  viewport: 'desktop' | 'mobile'
  timestampIso: string
  baselineIndicator?: string
  indicatorSeries: IndicatorSample[]
  submitAtMs?: number
  postRequestUrl?: string
  postResponseAtMs?: number
  postTotalMs?: number
  statusCode?: number
  toastShown?: ToastKind
  toastText?: string
  modalClosedAtMs?: number
  clienteCreatedOnServer?: boolean
  pendingQueueSizeAtEnd?: number
  connectivityDisabledOnLoad?: boolean
  consoleErrors: string[]
  networkErrors: string[]
  pageErrors: string[]
  cleanupOk?: boolean
  cleanupDeleted?: number
  conclusion: Conclusion
  conclusionReason: string
}

function ensureResultsDir() {
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true })
}

function writeFinding(f: RunFindings) {
  ensureResultsDir()
  fs.appendFileSync(FINDINGS_FILE, `${JSON.stringify(f)}\n`)
}

function classifyToast(text: string): ToastKind {
  if (text.includes('La conexión tardó mucho')) return 'lento'
  if (text.includes('Sin conexión') || text.includes('guardará')) return 'offline'
  if (text.includes('Error de conexión')) return 'sin-conexion'
  if (text.includes('Cliente creado exitosamente') || text.includes('Cliente ya estaba creado')) return 'success'
  if (text.toLowerCase().includes('error')) return 'error'
  return null
}

function classifyConclusion(ts: ToastKind, created: boolean, pending: number, postMs: number | undefined, status: number | undefined): { conclusion: Conclusion; reason: string } {
  if (ts === 'success' && created) {
    if (postMs && postMs > 15_000) {
      return { conclusion: 'COLD_START_NORMAL', reason: `creado pero POST tardó ${postMs}ms (cold-start Vercel Hobby, no bug funcional)` }
    }
    return { conclusion: 'BUG_RESUELTO', reason: `cliente creado exitosamente en ${postMs ?? 0}ms (status=${status})` }
  }
  if (ts === 'lento' && !created && pending >= 1) {
    return { conclusion: 'BUG_PRESENTE', reason: `toast dice "guardado en el celular" pero no se creó en el server y hay ${pending} item(s) encolados en IndexedDB` }
  }
  if (ts === 'lento' && !created && pending === 0) {
    return { conclusion: 'BUG_PRESENTE', reason: `toast "lento" + modal cerrado + cliente no creado. La request pudo abortarse sin encolar (o IndexedDB no la cuenta)` }
  }
  if (ts === 'lento' && created) {
    return { conclusion: 'PHANTOM_ENQUEUE', reason: `toast "lento" pero el cliente SÍ se creó en el server (status=${status}, postMs=${postMs}): race 8s/10s genera phantom enqueue y UX engañosa` }
  }
  if (ts === 'offline' && !created) {
    return { conclusion: 'BUG_PRESENTE', reason: `toast "offline" pero el test corre en desktop online; la detección de offline es falsa` }
  }
  if (!ts) {
    return { conclusion: 'MIXTO', reason: `no apareció toast en ${OBSERVATION_WINDOW_MS}ms; modalClosedAtMs=?; status=${status}` }
  }
  return { conclusion: 'MIXTO', reason: `toast=${ts}, created=${created}, pending=${pending}, postMs=${postMs}, status=${status}` }
}

/**
 * Login custom. NO setea `window.__PLAYWRIGHT_TEST__` para no apagar el
 * connectivity-indicator polling (30s) ni el sync requestQueue drip.
 * Solo bloquea el modal de base-caja sembrando `localStorage.baseDia_<hoy>`.
 */
async function prodLogin(page: Page, user = 'admin', pass = 'admin123') {
  await page.addInitScript(() => {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const utc = new Date().toISOString().split('T')[0]
    localStorage.setItem(`baseDia_${hoy}`, '100000')
    localStorage.setItem(`baseDia_${utc}`, '100000')
  })
  await page.goto(`${BASE}/login`, { timeout: 60_000 })
  await page.fill('input[placeholder="Ingrese usuario"]', user)
  await page.fill('input[placeholder="Ingrese contraseña"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: 60_000 })
  await page.waitForTimeout(2000)
}

async function readIndicator(page: Page): Promise<string> {
  try {
    const txt = (await page.getByTestId('connectivity-indicator').textContent()) ?? ''
    return txt.trim() || '(empty)'
  } catch {
    return '(no-indicator)'
  }
}

async function readPendingCounter(page: Page): Promise<number> {
  const counter = page.getByTestId('pending-sync-counter')
  if (!(await counter.isVisible().catch(() => false))) return 0
  const txt = (await counter.textContent()) ?? '0'
  return Number(txt) || 0
}

async function detectConnectivityDisabled(page: Page): Promise<boolean> {
  const el = page.getByTestId('connectivity-indicator')
  try {
    const aria = await el.getAttribute('aria-label')
    return (aria || '').toLowerCase().includes('desactivado')
  } catch {
    return false
  }
}

async function cleanupQaClientesBestEffort(page: Page): Promise<{ ok: boolean; deleted: number; found: number; error?: string }> {
  try {
    const res = await page.request.get(`${BASE}/api/clientes?all=true`, { timeout: 30_000 })
    if (!res.ok()) return { ok: false, deleted: 0, found: 0, error: `status=${res.status()}` }
    const body = await res.json().catch(() => ({}))
    const all = body.clientes || body.data || []
    const qa = all.filter((c: any) => (c.nombre || '').startsWith('QA Test'))
    let deleted = 0
    for (const c of qa) {
      if (!c.id) continue
      try {
        if ((await page.request.delete(`${BASE}/api/clientes/${c.id}`, { timeout: 30_000 })).ok()) deleted++
      } catch {
        // continue borrando el resto
      }
    }
    return { ok: true, deleted, found: qa.length }
  } catch (e) {
    return { ok: false, deleted: 0, found: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Escenario completo. Reusado por desktop y mobile.
 */
async function runScenario(page: Page, viewport: 'desktop' | 'mobile', testInfo: TestInfo) {
  test.setTimeout(900_000)
  const findings: RunFindings = {
    viewport,
    timestampIso: new Date().toISOString(),
    indicatorSeries: [],
    consoleErrors: [],
    networkErrors: [],
    pageErrors: [],
    conclusion: 'INCONCLUSO',
    conclusionReason: 'No se ejecutó el escenario',
  }

  page.on('console', (msg) => { if (msg.type() === 'error') findings.consoleErrors.push(msg.text().slice(0, 500)) })
  page.on('requestfailed', (req) => findings.networkErrors.push(`${req.failure()?.errorText || 'unknown'} ${req.url()}`))
  page.on('pageerror', (err) => findings.pageErrors.push(err.message.slice(0, 500)))

  await test.step('login custom sin __PLAYWRIGHT_TEST__', async () => {
    await prodLogin(page)
  })

  await test.step('navegar a /clientes y capturar baseline', async () => {
    await page.goto(`${BASE}/clientes`, { timeout: 120_000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    findings.baselineIndicator = await readIndicator(page)
    findings.connectivityDisabledOnLoad = await detectConnectivityDisabled(page)
    testInfo.annotations.push({ type: 'baselineIndicator', description: findings.baselineIndicator })
    testInfo.annotations.push({ type: 'connectivityDisabledOnLoad', description: String(findings.connectivityDisabledOnLoad) })
  })

  await page.screenshot({ path: path.join(RESULTS_DIR, `baseline-${viewport}.png`), fullPage: true })

  await test.step('abrir modal "Crear cliente"', async () => {
    const btn = page.getByRole('button', { name: /Nuevo Cliente/ })
    await expect(btn).toBeVisible({ timeout: 30_000 })
    await btn.click()
    const nameInput = page.getByRole('textbox', { name: /Ej: Juan/ }).or(page.locator('input[placeholder*="Ej: Juan"]'))
    await expect(nameInput).toBeVisible({ timeout: 30_000 })
  })

  await test.step('llenar form con QA Test y unico telefono', async () => {
    const stamp = new Date().getTime()
    const nameInput = page.getByRole('textbox', { name: /Ej: Juan/ }).or(page.locator('input[placeholder*="Ej: Juan"]'))
    await nameInput.fill(`QA Test ${stamp}`)
    const phoneInput = page.locator('input[type="tel"]').first().or(page.locator('input[placeholder*="3111234567"]'))
    await phoneInput.fill(`3${String(stamp).slice(-9)}`)
  })

  await test.step('instrumentar POST /api/clientes y clic "Crear cliente"', async () => {
    let postStartedAt: number | null = null
    page.on('request', (req) => {
      if (req.url().endsWith('/api/clientes') && req.method() === 'POST' && postStartedAt === null) {
        postStartedAt = Date.now()
        findings.postRequestUrl = req.url()
      }
    })
    page.on('response', (res) => {
      if (res.url().endsWith('/api/clientes') && res.request().method() === 'POST') {
        findings.statusCode = res.status()
        findings.postResponseAtMs = Date.now()
        if (postStartedAt) findings.postTotalMs = findings.postResponseAtMs - postStartedAt
      }
    })

    findings.submitAtMs = Date.now()
    const startedAt = findings.submitAtMs
    await page.getByRole('button', { name: 'Crear cliente' }).click()

    // Poll del indicador en background
    const stopRef = { stopped: false }
    const indicatorLoop = (async () => {
      while (!stopRef.stopped) {
        const elapsedMs = Date.now() - startedAt
        if (elapsedMs > OBSERVATION_WINDOW_MS) break
        findings.indicatorSeries.push({ atMs: elapsedMs, label: await readIndicator(page) })
        await page.waitForTimeout(CONNECTIVITY_POLL_MS)
      }
    })()

    // Detectar toast
    try {
      const toast = page.locator('[data-sonner-toast]').first()
      await toast.waitFor({ state: 'visible', timeout: OBSERVATION_WINDOW_MS })
      const text = (await toast.textContent()) ?? ''
      findings.toastText = text.slice(0, 500)
      findings.toastShown = classifyToast(text)
    } catch {
      findings.toastShown = null
    }

    // Detectar cierre del modal
    try {
      const nameInputAfter = page.getByRole('textbox', { name: /Ej: Juan/ }).or(page.locator('input[placeholder*="Ej: Juan"]'))
      await nameInputAfter.waitFor({ state: 'hidden', timeout: OBSERVATION_WINDOW_MS })
      findings.modalClosedAtMs = Date.now() - startedAt
    } catch {
      findings.modalClosedAtMs = undefined
    }

    // Esperar fin de ventana
    while (Date.now() - startedAt < OBSERVATION_WINDOW_MS) await page.waitForTimeout(1000)
    stopRef.stopped = true
    await indicatorLoop
  })

  findings.pendingQueueSizeAtEnd = await readPendingCounter(page)

  await test.step('verificar persistencia via API (autoritativo)', async () => {
    try {
      const apiRes = await page.request.get(`${BASE}/api/clientes?all=true`, { timeout: 30_000 })
      if (apiRes.ok()) {
        const body = await apiRes.json().catch(() => ({}))
        const all = body.clientes || body.data || []
        findings.clienteCreatedOnServer = !!all.find((c: any) => (c.nombre || '').startsWith('QA Test'))
      }
    } catch (e) {
      findings.clienteCreatedOnServer = false
      findings.networkErrors.push(`apiCheck: ${e instanceof Error ? e.message : String(e)}`)
    }
  })

  await test.step('clasificar conclusion', async () => {
    const c = classifyConclusion(findings.toastShown ?? null, !!findings.clienteCreatedOnServer, findings.pendingQueueSizeAtEnd ?? 0, findings.postTotalMs, findings.statusCode)
    findings.conclusion = c.conclusion
    findings.conclusionReason = c.reason
    testInfo.annotations.push({ type: 'conclusion', description: findings.conclusion })
    testInfo.annotations.push({ type: 'conclusionReason', description: findings.conclusionReason })
    testInfo.annotations.push({ type: 'submitTimeoutMagicMs', description: String(SUBMIT_TIMEOUT_MAGIC_MS) })
    testInfo.annotations.push({ type: 'fetchAbortMagicMs', description: String(FETCH_ABORT_MAGIC_MS) })
    testInfo.annotations.push({ type: 'syncIntervalMagicMs', description: String(SYNC_INTERVAL_MAGIC_MS) })
    // Serie temporal del indicador como annotation compacta
    const seriesCompact = findings.indicatorSeries.map(s => `${s.atMs}ms:${s.label}`).join(' | ')
    testInfo.annotations.push({ type: 'indicatorSeries', description: seriesCompact })
  })

  await test.step('captura final + cleanup best-effort', async () => {
    try {
      await page.screenshot({ path: path.join(RESULTS_DIR, `post-submit-${viewport}.png`), fullPage: true })
    } catch {
      // page puede estar cerrada por timeout
    }
    const cleanup = await cleanupQaClientesBestEffort(page)
    findings.cleanupOk = cleanup.ok
    findings.cleanupDeleted = cleanup.deleted
    testInfo.annotations.push({ type: 'cleanup', description: `ok=${cleanup.ok} deleted=${cleanup.deleted} found=${cleanup.found}${cleanup.error ? ` error=${cleanup.error}` : ''}` })
  })

  writeFinding(findings)
  testInfo.annotations.push({ type: 'findingsFile', description: FINDINGS_FILE })

  expect(findings.conclusion).not.toEqual('INCONCLUSO')
}

test.describe('Reproducible: crear cliente se queda "Guardando..."', () => {
  test('desktop — admin crea cliente de QA, observa sintomas', async ({ page }, testInfo) => {
    await runScenario(page, 'desktop', testInfo)
  })

  test.describe('mobile — viewport iPhone 13', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 3,
    })

    test('admin crea cliente de QA en mobile, observa sintomas', async ({ page }, testInfo) => {
      await runScenario(page, 'mobile', testInfo)
    })
  })
})