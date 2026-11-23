import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { login, resetTestDatabase, skipBaseCaja } from './fixtures'
import type { Page } from '@playwright/test'

const db = new PrismaClient()
type ObservedSession = { authStatus?: string; user?: { id?: string; sessionId?: string; role?: string } }
const readSession = (page: Page): Promise<ObservedSession> => page.evaluate(async () => {
  const response = await fetch('/api/auth/session')
  return response.json()
})

test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

test.beforeAll(() => {
  expect(process.env.SESSION_LIMITS_JSON).toBe('{}')
  expect(['localhost', '127.0.0.1']).toContain(new URL(process.env.DATABASE_URL!).hostname)
})
test.afterAll(() => db.$disconnect())

test.beforeEach(() => {
  resetTestDatabase()
})

const DASHBOARD = '/dashboard'
const REPARTIDOR = '/repartidor'

test('ADMIN admite 2 sesiones y expulsa la menos activa, no necesariamente la primera', async ({ browser }) => {
  const ctx1 = await browser.newContext()
  const ctx2 = await browser.newContext()
  const ctx3 = await browser.newContext()

  const page1 = await ctx1.newPage()
  const page2 = await ctx2.newPage()
  const page3 = await ctx3.newPage()

  try {
    await login(page1, 'admin', 'admin123')
    await login(page2, 'admin', 'admin123')

    await expect(page1).toHaveURL(/\/dashboard/)
    await expect(page2).toHaveURL(/\/dashboard/)

    const first = await readSession(page1)
    const second = await readSession(page2)
    // Unmount pollers before establishing deterministic LRU evidence. A real
    // Provider poll is activity and must not race this fixture.
    await page1.goto('/api/health')
    await page2.goto('/api/health')
    await db.sesionActiva.update({ where: { sessionId: first.user!.sessionId! }, data: { lastActive: new Date() } })
    await db.sesionActiva.update({ where: { sessionId: second.user!.sessionId! }, data: { lastActive: new Date(Date.now() - 120_000) } })

    // Third session is accepted and evicts the least recently active one.
    await login(page3, 'admin', 'admin123')
    await expect(page3).toHaveURL(/\/dashboard/)

    await page2.goto(DASHBOARD)
    await page2.waitForURL(/\/login/, { timeout: 15000 })

    await page1.goto(DASHBOARD)
    await expect(page1).toHaveURL(/\/dashboard/)
  } finally {
    await ctx1.close()
    await ctx2.close()
    await ctx3.close()
  }
})

test('REPARTIDOR solo puede tener 1 sesión; una 2da cierra la primera', async ({ browser }) => {
  const ctx1 = await browser.newContext()
  const ctx2 = await browser.newContext()

  const page1 = await ctx1.newPage()
  const page2 = await ctx2.newPage()

  try {
    await login(page1, 'repartidor', 'rep123')
    await expect(page1).toHaveURL(/\/repartidor/)

    await login(page2, 'repartidor', 'rep123')
    await expect(page2).toHaveURL(/\/repartidor/)

    await page1.goto(REPARTIDOR)
    await page1.waitForURL(/\/login/, { timeout: 15000 })
  } finally {
    await ctx1.close()
    await ctx2.close()
  }
})

test('logout desde un dispositivo no cierra las otras sesiones del mismo usuario', async ({ browser }) => {
  const ctx1 = await browser.newContext()
  const ctx2 = await browser.newContext()

  const page1 = await ctx1.newPage()
  const page2 = await ctx2.newPage()

  try {
    await login(page1, 'admin', 'admin123')
    await login(page2, 'admin', 'admin123')

    await expect(page1).toHaveURL(/\/dashboard/)
    await expect(page2).toHaveURL(/\/dashboard/)

    await skipBaseCaja(page1)
    await page1.goto('/mi-perfil')
    await page1.getByTestId('user-menu').click()
    await page1.getByTestId('logout-button').click()
    await page1.waitForURL(/\/login/, { timeout: 15000 })
    await expect(page1.getByText('Cerraste la sesión en este navegador.')).toBeVisible()

    // page2 should still be valid
    await page2.goto(DASHBOARD)
    await expect(page2).toHaveURL(/\/dashboard/)
  } finally {
    await ctx1.close()
    await ctx2.close()
  }
})

test('revocación actualiza la interfaz y no conserva el Provider antiguo', async ({ page }) => {
  await skipBaseCaja(page)
  await login(page, 'admin', 'admin123')
  await page.goto('/mi-perfil')
  const session = await readSession(page)
  expect(session.user?.sessionId).toBeTruthy()
  await db.sesionActiva.deleteMany({ where: { sessionId: session.user!.sessionId! } })
  await readSession(page)
  await expect(page).toHaveURL(/\/login\?reason=expired/)
  await expect(page.getByText('Tu sesión expiró. Vuelve a iniciar sesión para continuar.')).toBeVisible()
})

test('un fallo de verificación conserva la sesión incluso al recargar', async ({ page }, testInfo) => {
  await skipBaseCaja(page)
  await login(page, 'admin', 'admin123')
  await page.goto('/mi-perfil')
  const before = await readSession(page)
  await db.$executeRaw`ALTER TABLE "SesionActiva" RENAME TO "SesionActiva_760_e2e"`
  try {
    const response = await page.request.get('/api/config')
    expect(response.status()).toBe(503)
    expect((await readSession(page)).authStatus).toBe('unavailable')
    await expect(page.getByText('No pudimos comprobar tu sesión', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/mi-perfil/)
    // A production reload must retain the custom recovery digest even though
    // Next.js sanitizes server error messages and the layout cannot mount.
    await page.reload()
    await expect(page.getByText('No pudimos comprobar tu sesión', { exact: true })).toBeVisible()
    const screenshot = testInfo.outputPath('recuperacion-servidor.png')
    await page.screenshot({ path: screenshot })
    await testInfo.attach('recuperacion-servidor', { path: screenshot, contentType: 'image/png' })
  } finally {
    await db.$executeRaw`ALTER TABLE "SesionActiva_760_e2e" RENAME TO "SesionActiva"`
  }
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByTestId('session-recovery')).toBeHidden()
  expect((await readSession(page)).user?.sessionId).toBe(before.user?.sessionId)
  await page.reload()
  await expect(page.getByTestId('user-menu')).toBeVisible()
})

test('una lectura atrasada termina antes del cierre y del siguiente acceso', async ({ page, context }) => {
  await skipBaseCaja(page)
  await login(page, 'admin', 'admin123')
  await page.goto('/mi-perfil')
  const other = await context.newPage()
  await other.goto('/mi-perfil')
  await expect(other.getByTestId('user-menu')).toBeVisible()
  let release!: () => void
  let arrived!: () => void
  const barrier = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { arrived = resolve })
  await other.route('**/api/auth/session', async route => {
    const response = await route.fetch()
    arrived()
    await barrier
    await route.fulfill({ response })
  })
  const pending = readSession(other)
  try {
    await started
    await page.getByTestId('user-menu').click()
    await page.getByTestId('logout-button').click()
    await expect(page.getByTestId('session-recovery')).toBeVisible()
    await expect(page).toHaveURL(/\/mi-perfil/)
  } finally {
    release()
  }
  await pending
  await expect(page).toHaveURL(/\/login/)
  await other.close()
  await login(page, 'contador', 'cont123')
  expect((await readSession(page)).user?.role).toBe('CONTADOR')
  expect((await page.request.get('/api/config')).status()).toBe(200)
})

test('respuestas de negocio no pueden sobrescribir cookies de otra cuenta', async ({ page }) => {
  await skipBaseCaja(page)
  await login(page, 'admin', 'admin123')
  const response = await page.request.get('/api/config')
  expect(response.status()).toBe(200)
  expect(response.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie')
    .some(header => /authjs\.session-token/.test(header.value))).toBe(false)
})

test('un cierre de A que esperaba su turno no cierra una cuenta B posterior', async ({ page, context }) => {
  await skipBaseCaja(page)
  await login(page, 'admin', 'admin123')
  await page.goto('/mi-perfil')
  await expect(page.getByTestId('user-menu')).toBeVisible()
  const original = await readSession(page)
  const other = await context.newPage()
  await skipBaseCaja(other)
  await login(other, 'contador', 'cont123')
  const replacement = await readSession(other)
  expect(replacement.user?.id).not.toBe(original.user?.id)

  let release!: () => void
  let arrived!: () => void
  const barrier = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { arrived = resolve })
  await page.route('**/api/auth/session', async route => {
    const response = await route.fetch()
    arrived()
    await barrier
    await route.fulfill({ response })
  }, { times: 1 })
  // Hold a real background SDK verification so A's UI still has the original intent
  // when it queues logout behind this cookie lock.
  await page.bringToFront()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await started
  const checked = page.waitForResponse(response => response.url().endsWith('/api/auth/logout-session') && response.status() === 409)
  try {
    await page.getByTestId('user-menu').click()
    await page.getByTestId('logout-button').click()
  } finally {
    release()
  }
  await checked
  await expect(page.getByTestId('user-menu')).toBeVisible()
  expect((await readSession(other)).user?.sessionId).toBe(replacement.user?.sessionId)
  expect((await other.request.get('/api/config')).status()).toBe(200)
})
