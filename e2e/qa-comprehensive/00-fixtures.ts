/**
 * QA Comprehensive E2E Test Fixtures
 * Shared helpers for the exhaustive test suite.
 * Re-exports from parent fixtures + adds QA-specific utilities.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'crypto'
import {
  login,
  loginAs as loginAsLegacy,
  skipBaseCaja,
  handleBaseCaja,
  fullLogin,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  createCliente,
  createClienteFull,
  createPedido,
  createTrabajador,
  createEmbarque,
  createSellador,
  createProveedor,
  createInsumo,
  createNegocio,
  getFirstCliente,
  getFirstTrabajador,
  getSellador,
  getFirstFacturaConSaldo,
  setupClienteWithPedidos,
  clickButton,
  fillInput,
  selectOption,
  waitForToast,
  setMobileViewport,
  checkTouchTargets,
  checkHorizontalOverflow,
  goto,
  getUniqueFutureDate,
  BASE,
} from '../fixtures'

// ─── Unique ID generators ────────────────────────────────────────────────────

export function uniqueId(): string {
  return randomUUID().split('-')[0]
}

export function uniquePhone(): string {
  return `3${Math.floor(100000000 + Math.random() * 900000000)}`
}

export function uniqueClientName(prefix = 'QA-Test'): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

export function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`
}

// ─── Auth wrappers ───────────────────────────────────────────────────────────

export async function loginAsAdmin(page: Page) {
  await fullLogin(page, 'admin', 'admin123')
}

export async function loginAsAsistente(page: Page) {
  await fullLogin(page, 'asistente', 'asist123')
}

export async function loginAsContador(page: Page) {
  await fullLogin(page, 'contador', 'cont123')
}

export async function loginAsRepartidor(page: Page) {
  await fullLogin(page, 'repartidor', 'rep123')
}

export async function loginAsSellador(page: Page) {
  await fullLogin(page, 'sellador', 'sell123').catch(async () => {
    // Fallback: sellador might not have user account, skip
    console.warn('Sellador login not available — using admin fallback')
    await fullLogin(page, 'admin', 'admin123')
  })
}

export { login, loginAsLegacy as loginAs, fullLogin }

// ─── API helpers with role context ──────────────────────────────────────────

export async function apiAs(page: Page, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, data?: any) {
  const r = page.request
  switch (method) {
    case 'GET': return r.get(`${BASE}${path}`)
    case 'POST': return r.post(`${BASE}${path}`, { data })
    case 'PUT': return r.put(`${BASE}${path}`, { data })
    case 'PATCH': return r.patch(`${BASE}${path}`, { data })
    case 'DELETE': return r.delete(`${BASE}${path}`)
  }
  return r.get(`${BASE}${path}`)
}

export async function expectStatus(response: any, expected: number | number[]) {
  const expectedArr = Array.isArray(expected) ? expected : [expected]
  if (!expectedArr.includes(response.status())) {
    const body = await response.text().catch(() => '<no body>')
    throw new Error(
      `Expected status ${expectedArr.join(' or ')}, got ${response.status()}\n` +
      `Body: ${body.substring(0, 500)}`
    )
  }
}

// ─── Money assertions ────────────────────────────────────────────────────────

/** Compare two money strings/numbers with Decimal tolerance */
export function moneyClose(actual: number | string, expected: number | string, tolerance = 0.01): boolean {
  const a = Number(actual)
  const e = Number(expected)
  return Math.abs(a - e) <= tolerance
}

export function expectMoneyClose(actual: number | string, expected: number | string, tolerance = 0.01) {
  if (!moneyClose(actual, expected, tolerance)) {
    throw new Error(`Money mismatch: actual=${actual}, expected=${expected}, tolerance=${tolerance}`)
  }
}

// ─── Date helpers ────────────────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function todayBogota(): string {
  // Colombia is UTC-5 (no DST)
  const now = new Date()
  const bogota = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  return bogota.toISOString().split('T')[0]
}

export function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export function yesterdayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

export { getUniqueFutureDate }

// ─── Form helpers ────────────────────────────────────────────────────────────

export async function clearAndFill(page: Page, selector: string, value: string) {
  const loc = page.locator(selector).first()
  await loc.click({ clickCount: 3 })
  await loc.fill(value)
}

export async function clearAndType(page: Page, selector: string, value: string) {
  const loc = page.locator(selector).first()
  await loc.click()
  await loc.press('Control+a')
  await loc.press('Delete')
  await loc.type(value)
}

// ─── Toast helpers ───────────────────────────────────────────────────────────

export async function expectToast(page: Page, text: string, type: 'success' | 'error' | 'info' = 'success') {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text })
  await expect(toast).toBeVisible({ timeout: 10000 })
  if (type !== 'success') {
    await expect(toast).toHaveAttribute('data-type', type)
  }
}

export async function expectNoToast(page: Page, text: string, timeoutMs = 2000) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: text })
  await expect(toast).not.toBeVisible({ timeout: timeoutMs })
}

// ─── Wait helpers ────────────────────────────────────────────────────────────

export async function waitForNetworkIdle(page: Page, ms = 500) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

// ─── Audit report helpers ────────────────────────────────────────────────────

export interface BugFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category: 'validation' | 'security' | 'business-logic' | 'ui-ux' | 'performance' | 'consistency'
  title: string
  file?: string
  line?: number
  reproduction: string
  expected: string
  actual: string
  fixSuggestion?: string
  testFile: string
  testName: string
}

const _findings: BugFinding[] = []

export function reportBug(finding: Omit<BugFinding, 'testFile' | 'testName'>) {
  // Get current test info from Playwright
  const testInfo = (test as any).info?.() || {}
  _findings.push({
    ...finding,
    testFile: testInfo.file || 'unknown',
    testName: testInfo.title || 'unknown',
  })
}

export function getAllFindings(): BugFinding[] {
  return [..._findings]
}

export function clearFindings() {
  _findings.length = 0
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export {
  test,
  expect,
  type Page,
  type APIRequestContext,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  createCliente,
  createClienteFull,
  createPedido,
  createTrabajador,
  createEmbarque,
  createSellador,
  createProveedor,
  createInsumo,
  createNegocio,
  getFirstCliente,
  getFirstTrabajador,
  getSellador,
  getFirstFacturaConSaldo,
  setupClienteWithPedidos,
  clickButton,
  fillInput,
  selectOption,
  waitForToast,
  setMobileViewport,
  checkTouchTargets,
  checkHorizontalOverflow,
  goto,
  handleBaseCaja,
  skipBaseCaja,
  BASE,
}
