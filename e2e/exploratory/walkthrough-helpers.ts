// @ts-check
// Helpers compartidos para el walkthrough exploratorio multi-rol × multi-viewport.
// Los hallazgos se vuelcan a un archivo JSON para consolidación posterior.

import { test as base, expect, type Page } from '@playwright/test'
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

export const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'
export const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
export const FINDINGS_FILE = join(process.cwd(), 'reports', `walkthrough-${RUN_ID}.jsonl`)
export const SCREENSHOTS_DIR = join(process.cwd(), 'screenshots', `walkthrough-${RUN_ID}`)
export const CRON_SECRET = process.env.CRON_SECRET || 'dev-cron-secret-change-in-production'

// ─── Findings registry ────────────────────────────────────────────────────

/**
 * @typedef {Object} Finding
 * @property {string} id          ID estable (F-001, F-002, ...)
 * @property {'P0'|'P1'|'P2'|'P3'} severity
 * @property {string} module      Módulo (clientes, embarques, ...)
 * @property {string} title       Resumen corto (1 línea)
 * @property {string} description Detalle
 * @property {string} [steps]     Pasos para reproducir
 * @property {string} [expected]  Comportamiento esperado
 * @property {string} [observed]  Comportamiento observado
 * @property {string} [screenshot] Path al screenshot (relativo a cwd)
 * @property {string} [userComplaint] Queja del usuario que motivó la búsqueda
 * @property {string} [featureGap] 'EXISTS' | 'GAP' | 'BROKEN' | 'CONFUSING'
 * @property {string} timestamp
 */

let findingsCounter = 0

function ensureDirs() {
  if (!existsSync(join(process.cwd(), 'reports'))) mkdirSync(join(process.cwd(), 'reports'), { recursive: true })
  if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true })
}

/**
 * Registra un hallazgo. Devuelve el ID para correlación.
 * @param {Omit<Finding, 'id' | 'timestamp'>} f
 */
export function addFinding(f) {
  ensureDirs()
  findingsCounter += 1
  const id = `F-${String(findingsCounter).padStart(3, '0')}`
  const finding = { ...f, id, timestamp: new Date().toISOString() }
  appendFileSync(FINDINGS_FILE, JSON.stringify(finding) + '\n', 'utf-8')
  // eslint-disable-next-line no-console
  console.log(`[${id}] [${f.severity}] [${f.module}] ${f.title}`)
  return id
}

/** Devuelve el total de hallazgos. */
export function getFindingsCount() {
  return findingsCounter
}

// ─── Auth helpers ─────────────────────────────────────────────────────────

export const CREDENTIALS = {
  admin: { user: 'admin', pass: 'admin123' },
  asistente: { user: 'asistente', pass: 'asist123' },
  contador: { user: 'contador', pass: 'cont123' },
  repartidor: { user: 'repartidor', pass: 'rep123' },
  sellador: { user: 'sellador', pass: 'sell123' },
}

export async function skipBaseCaja(page) {
  const today = new Date().toISOString().split('T')[0]
  await page.addInitScript(({ date }) => {
    // Setear AMBAS keys para cubrir las dos variantes (fixtures usan baseDiaDate, código usa baseDia_YYYY-MM-DD)
    localStorage.setItem('baseDiaDate', date)
    localStorage.setItem('baseDia', '100000')
    localStorage.setItem(`baseDia_${date}`, '100000')
    // @ts-ignore
    window.__PLAYWRIGHT_TEST__ = true
  }, { date: today })
}

export async function loginAs(page, role) {
  const creds = CREDENTIALS[role]
  if (!creds) throw new Error(`Unknown role: ${role}`)
  await skipBaseCaja(page)
  await page.goto(`${BASE}/login`)
  await page.fill('input[placeholder="Ingrese usuario"]', creds.user)
  await page.fill('input[placeholder="Ingrese contraseña"]', creds.pass)
  await page.click('button[type="submit"]')
  await page.waitForURL(/.*\/(dashboard|repartidor|reportes)/, { timeout: 20000 })
}

// ─── Screenshot helpers ───────────────────────────────────────────────────

export async function shoot(page, name) {
  ensureDirs()
  const path = join(SCREENSHOTS_DIR, `${name}.png`)
  await page.screenshot({ path, fullPage: true }).catch(() => {})
  return `screenshots/walkthrough-${RUN_ID}/${name}.png`
}

// ─── Assertion helpers (no rompen el test) ────────────────────────────────

/** Verifica visibilidad. Retorna true/false. NO falla el test. */
export async function isVisible(page, selector) {
  try {
    return await page.locator(selector).first().isVisible({ timeout: 2000 })
  } catch {
    return false
  }
}

export async function getText(page, selector) {
  try {
    return (await page.locator(selector).first().textContent({ timeout: 2000 })) ?? ''
  } catch {
    return ''
  }
}

export async function countElements(page, selector) {
  try {
    return await page.locator(selector).count()
  } catch {
    return 0
  }
}

/** Verifica si hay overflow horizontal. */
export async function hasHorizontalOverflow(page) {
  return await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  })
}

/** Verifica si hay "basura" en el texto: undefined, null, NaN, [object Object]. */
export async function hasGarbageText(page) {
  const bodyText = await page.locator('body').textContent().catch(() => '')
  const garbagePatterns = [/\bundefined\b/, /\bnull\b/, /\bNaN\b/, /\[object Object\]/]
  const matches = []
  for (const p of garbagePatterns) {
    const m = bodyText.match(p)
    if (m) matches.push(m[0])
  }
  return matches.length > 0 ? matches : null
}

// ─── DB helpers (psql) ────────────────────────────────────────────────────

export function dbCount(table, where = '') {
  try {
    const out = execSync(
      `PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu -t -c "SELECT count(*) FROM \\"${table}\\" ${where ? 'WHERE ' + where : ''};" 2>/dev/null`,
      { encoding: 'utf-8' }
    ).trim()
    return parseInt(out, 10) || 0
  } catch {
    return -1
  }
}

export function dbQuery(sql) {
  try {
    return execSync(
      `PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu -t -A -c "${sql.replace(/"/g, '\\"')}" 2>/dev/null`,
      { encoding: 'utf-8' }
    ).trim()
  } catch {
    return ''
  }
}

// ─── Test fixture (extiende Playwright test) ──────────────────────────────

export const test = base
export { expect }

// Helper: tag todos los tests de un describe con un módulo
export function moduleDescribe(module, fn) {
  return test.describe(`[${module}]`, fn)
}
