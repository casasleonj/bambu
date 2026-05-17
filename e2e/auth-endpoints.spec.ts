// @tests api/auth/profile, api/auth/force-password-change
import { test, expect, type Page } from '@playwright/test'

const BASE = 'http://localhost:3000'

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[placeholder="Ingrese usuario"]', user)
  await page.fill('input[placeholder="Ingrese contraseña"]', pass)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

async function apiGetAuth(page: Page, path: string) {
  return page.request.get(`${BASE}${path}`)
}

async function apiPutAuth(page: Page, path: string, data: any) {
  return page.request.put(`${BASE}${path}`, { data })
}

test.describe('Auth Endpoints', () => {
  test('profile GET requires authentication', async ({ page }) => {
    const res = await apiGetAuth(page, '/api/auth/profile')
    expect(res.status()).toBe(401)
  })

  test('profile PUT requires authentication', async ({ page }) => {
    const res = await apiPutAuth(page, '/api/auth/profile', { nombre: 'Test' })
    expect(res.status()).toBe(401)
  })

  test('profile GET returns user data when authenticated', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    const res = await apiGetAuth(page, '/api/auth/profile')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.user).toBeDefined()
    expect(body.user.username).toBe('admin')
  })

  test('profile PUT updates display name', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    const res = await apiPutAuth(page, '/api/auth/profile', {
      nombre: 'Admin',
      apellido: 'Test',
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.user.nombre).toBe('Admin')
    expect(body.user.apellido).toBe('Test')
  })

  test('force-password-change requires authentication', async ({ page }) => {
    const res = await apiPutAuth(page, '/api/auth/force-password-change', {
      newPassword: 'newpass123',
      confirmNewPassword: 'newpass123',
    })
    expect(res.status()).toBe(401)
  })

  test('force-password-change rejects when mustChangePassword is false', async ({ page }) => {
    await login(page, 'admin', 'admin123')
    const res = await apiPutAuth(page, '/api/auth/force-password-change', {
      newPassword: 'newpass123',
      confirmNewPassword: 'newpass123',
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('No se requiere cambio')
  })
})
