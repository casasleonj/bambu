import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import { resolve } from 'path'
import {
  reportBug as reportBugPure,
  getAllFindings,
  clearFindings,
  formatBug,
  type BugFinding,
  type Severity,
  type BugCategory,
} from '@/lib/qa-reportBug'

export { test, expect, getAllFindings, clearFindings, formatBug }
export type { BugFinding, Severity, BugCategory }

export const BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3001'

// ─── Report Helpers ──────────────────────────────────────────────────────────

/**
 * Wrapper Playwright-aware de reportBug.
 * Enriquece la evidencia con file/title del test actual.
 * Safe dentro de test, beforeAll/afterAll.
 */
export function reportBug(finding: BugFinding): void {
  let testFile = 'unknown'
  let testName = 'unknown'
  try {
    const info = test.info()
    testFile = info.file || 'unknown'
    testName = info.title || 'unknown'
  } catch {
    // outside test runtime
  }

  reportBugPure({
    ...finding,
    evidencia: `[${testFile} :: ${testName}] ${finding.evidencia}`,
  })
}

// ─── API Call Helper ─────────────────────────────────────────────────────────

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiCallOptions {
  method?: ApiMethod
  body?: unknown
  headers?: Record<string, string>
  timeout?: number
}

/**
 * Wrapper page.request con headers explícitos.
 * NOTA: en NODE_ENV=development CSRF está bypassed (src/lib/csrf.ts:27-29).
 * Esta helper no intenta inyectar CSRF tokens.
 */
export async function apiCall(
  requestContext: APIRequestContext | Page,
  path: string,
  options: ApiCallOptions = {}
) {
  const { method = 'GET', body, headers = {}, timeout } = options
  const url = `${BASE}${path}`
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  const request = 'request' in requestContext ? requestContext.request : requestContext

  const fetchOptions = {
    headers: defaultHeaders,
    data: body,
    timeout,
  }

  switch (method) {
    case 'GET':
      return request.get(url, { headers: defaultHeaders, timeout })
    case 'POST':
      return request.post(url, fetchOptions)
    case 'PUT':
      return request.put(url, fetchOptions)
    case 'PATCH':
      return request.patch(url, fetchOptions)
    case 'DELETE':
      return request.delete(url, { headers: defaultHeaders, timeout })
    default:
      throw new Error(`Unsupported method: ${method}`)
  }
}

// ─── UX Assertions ─────────────────────────────────────────────────────────

export type UxPattern =
  | 'touch-targets'
  | 'no-horizontal-overflow'
  | 'empty-state-next-action'
  | 'error-retry'
  | 'where-am-i'
  | 'no-overlap'

const DEFAULT_ALLOWLIST = [
  /favicon\.ico/i,
  /Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /service worker/i,
]

export async function assertNoUnexpectedConsoleErrors(
  page: Page,
  allowList: RegExp[] = DEFAULT_ALLOWLIST
): Promise<void> {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (allowList.some((re) => re.test(text))) return
    errors.push(text)
  })
  // dar tiempo a que se acumulen logs del mount inicial
  await page.waitForTimeout(500)
  if (errors.length > 0) {
    throw new Error(`Unexpected console errors:\n${errors.join('\n')}`)
  }
}

export async function assertUx(page: Page, pattern: UxPattern): Promise<void> {
  switch (pattern) {
    case 'touch-targets': {
      const buttons = page.locator('button, [role="button"], a, input[type="submit"]')
      const count = await buttons.count()
      const failures: string[] = []
      for (let i = 0; i < Math.min(count, 50); i++) {
        const box = await buttons.nth(i).boundingBox()
        if (box && (box.width < 44 || box.height < 44)) {
          failures.push(`Element ${i}: ${box.width.toFixed(0)}x${box.height.toFixed(0)}px`)
        }
      }
      if (failures.length > 0) {
        throw new Error(`Touch targets too small (min 44x44px):\n${failures.join('\n')}`)
      }
      break
    }

    case 'no-horizontal-overflow': {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
      if (scrollWidth > clientWidth + 2) {
        throw new Error(`Horizontal overflow: scrollWidth=${scrollWidth}, clientWidth=${clientWidth}`)
      }
      break
    }

    case 'empty-state-next-action': {
      const emptyState = page.locator('[data-testid="empty-state"], [data-testid="sin-resultados"]')
      if (await emptyState.count() > 0) {
        const text = await emptyState.first().textContent()
        const hasNextAction =
          (await emptyState.first().locator('button, a').count()) > 0 || /crear|nuevo|agregar|volver/i.test(text || '')
        if (!hasNextAction) {
          throw new Error(`Empty state sin next-action: "${text}"`)
        }
      }
      break
    }

    case 'error-retry': {
      const errorToast = page.locator('[data-sonner-toast][data-type="error"]')
      if (await errorToast.count() > 0) {
        const text = await errorToast.first().textContent()
        const hasRetry = /reintentar|retry|intentar/i.test(text || '') || (await errorToast.first().locator('button').count()) > 0
        if (!hasRetry) {
          throw new Error(`Error toast sin retry/next-action: "${text}"`)
        }
      }
      break
    }

    case 'where-am-i': {
      const activeNav = page.locator('[data-testid="nav-item-active"], [aria-current="page"]')
      const breadcrumbs = page.locator('[data-testid="breadcrumbs"]')
      if ((await activeNav.count()) === 0 && (await breadcrumbs.count()) === 0) {
        throw new Error('No active nav item or breadcrumbs found (where-am-i)')
      }
      break
    }

    case 'no-overlap': {
      const boxes = await page.locator('[data-testid]').evaluateAll((els) =>
        els.map((el) => {
          const rect = el.getBoundingClientRect()
          return { id: el.getAttribute('data-testid') || '', rect }
        })
      )
      const failures: string[] = []
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].rect
          const b = boxes[j].rect
          if (
            a.width > 0 &&
            a.height > 0 &&
            b.width > 0 &&
            b.height > 0 &&
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top
          ) {
            failures.push(`Overlap: ${boxes[i].id} vs ${boxes[j].id}`)
          }
        }
      }
      if (failures.length > 0) {
        throw new Error(`Element overlap detected:\n${failures.join('\n')}`)
      }
      break
    }

    default:
      throw new Error(`Unknown UX pattern: ${pattern}`)
  }
}

// ─── Audit Helper ────────────────────────────────────────────────────────────

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
})

export async function expectAuditEntry(
  entidad: string,
  accion: string,
  where?: Record<string, unknown>
): Promise<void> {
  const entry = await prisma.historial.findFirst({
    where: {
      entidad,
      accion,
      ...(where || {}),
    },
    orderBy: { fecha: 'desc' },
  })
  if (!entry) {
    throw new Error(`No audit entry found for ${entidad}.${accion}`)
  }
}

// ─── SELLADOR User Helper ────────────────────────────────────────────────────

export async function ensureSelladorUser(method: 'direct' | 'api' = 'direct'): Promise<void> {
  if (method === 'direct') {
    await prisma.user.upsert({
      where: { username: 'sellador' },
      update: {},
      create: {
        username: 'sellador',
        password: 'sell123', // NUNCA se usa en login directo aquí; el helper se usa para crear user.
        rol: 'SELLADOR' as const,
        nombre: 'Sellador',
        apellido: 'Test',
      },
    })
    return
  }

  throw new Error("ensureSelladorUser api method requires page context; use ensureSelladorUserViaApi(page)")
}

export async function ensureSelladorUserViaApi(page: Page): Promise<void> {
  // create trabajador SELLADOR via admin API if needed
  await apiCall(page.request, '/api/users', {
    method: 'POST',
    body: {
      username: 'sellador',
      password: 'sell123',
      rol: 'SELLADOR',
      nombre: 'Sellador',
      apellido: 'Test',
    },
  })
}

// ─── Base Caja Paranoid (3-day window) ───────────────────────────────────────

export async function skipBaseCajaParanoid(page: Page): Promise<void> {
  const today = new Date()
  const dates: string[] = []
  for (let offset = -1; offset <= 1; offset++) {
    const d = new Date(today)
    d.setDate(today.getDate() + offset)
    dates.push(d.toISOString().split('T')[0])
    dates.push(d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }))
  }

  await page.addInitScript(({ allDates }: { allDates: string[] }) => {
    for (const date of allDates) {
      localStorage.setItem(`baseDia_${date}`, '100000')
    }
    ;(window as unknown as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__ = true
  }, { allDates: dates })
}

// ─── Database Reset (re-export) ──────────────────────────────────────────────

export function resetTestDatabase() {
  const root = resolve(__dirname, '..')
  execSync('npx tsx prisma/clean.ts', { cwd: root, stdio: 'ignore' })
  execSync('npx tsx prisma/seed-test.ts', { cwd: root, stdio: 'ignore' })
}

// ─── Screenshot on failure ───────────────────────────────────────────────────

export async function screenshotOnFail(page: Page, name: string): Promise<string> {
  const path = `test-results/qa-${name}-${Date.now()}.png`
  await page.screenshot({ path, fullPage: true })
  return path
}
