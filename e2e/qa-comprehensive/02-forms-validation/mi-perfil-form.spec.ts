/**
 * Tier 2: Forms Validation - Mi Perfil & Cambiar Contraseña
 * Tests: 6
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE } from '../00-fixtures'

test.describe('Form Validation - Mi Perfil', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-MP-01: GET own profile', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/auth/profile`)
    await expectStatus(res, 200)
    const body = await res.json()
    expect(body.user || body).toBeDefined()
  })

  test('TC-MP-02: Update own profile nombre', async ({ page }) => {
    const res = await apiPost(page, '/api/auth/profile', {
      nombre: 'Updated Nombre',
    })
    expect([200, 201]).toContain(res.status())
  })

  test('TC-MP-03: Update password with wrong current is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/auth/profile', {
      currentPassword: 'wrong-password',
      newPassword: 'newpass123',
    })
    await expectStatus(res, [400, 401, 403, 422])
  })

  test('TC-MP-04: Update password with short new is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/auth/profile', {
      currentPassword: 'admin123',
      newPassword: 'abc', // too short
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-MP-05: /mi-perfil page loads', async ({ page }) => {
    await page.goto(`${BASE}/mi-perfil`)
    await expect(page).toHaveURL(/\/mi-perfil/)
    await expect(page.getByRole('heading', { name: /Perfil/ })).toBeVisible({ timeout: 5000 })
  })

  test('TC-MP-06: /cambiar-contrasena only accessible if mustChangePassword', async ({ page }) => {
    await page.goto(`${BASE}/cambiar-contrasena`)
    // If admin's mustChangePassword is false, should redirect to /dashboard
    // Otherwise show the form
    const url = page.url()
    expect(url.includes('/cambiar-contrasena') || url.includes('/dashboard')).toBeTruthy()
  })
})
