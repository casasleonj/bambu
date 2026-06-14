/**
 * Tier 2: Forms Validation - Cambiar Contraseña
 * Tests: 5
 * Tests the force-password-change flow
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE } from '../00-fixtures'

test.describe('Form Validation - Cambiar Contraseña', () => {
  test('TC-CP-01: Force change requires currentPassword', async ({ page }) => {
    await loginAsAdmin(page)
    // Create a temp user, then login as them
    const newUsername = `cp_test_${Date.now() % 100000}`
    const createRes = await apiPost(page, '/api/users', {
      username: newUsername,
      nombre: 'CP Test',
      rol: 'ASISTENTE',
      password: 'test123',
    })
    expect([200, 201]).toContain(createRes.status())
    const user = (await createRes.json()).user || (await createRes.json())

    // Reset password to set mustChangePassword
    const resetRes = await apiPost(page, `/api/users/${user.id}/reset-password`, {})
    const resetBody = await resetRes.json()
    const newPass = resetBody.password || resetBody.newPassword

    // Login as new user
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="text"]', newUsername)
    await page.fill('input[type="password"]', newPass)
    await page.click('button[type="submit"]')
    // Should redirect to /cambiar-contrasena
    await expect(page).toHaveURL(/\/cambiar-contrasena/, { timeout: 10000 })
  })

  test('TC-CP-02: Force change with new < 6 chars is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/auth/force-password-change', {
      currentPassword: 'test123',
      newPassword: 'abc', // too short
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-CP-03: Force change without currentPassword is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/auth/force-password-change', {
      newPassword: 'newpass123',
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-CP-04: Force change with new = current is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/auth/force-password-change', {
      currentPassword: 'test123',
      newPassword: 'test123', // same
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-CP-05: Force change with wrong current is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/auth/force-password-change', {
      currentPassword: 'wrong',
      newPassword: 'newpass123',
    })
    await expectStatus(res, [400, 401, 403])
  })
})
