/**
 * Tier 2: Forms Validation - Admin User Form
 * Tests: 8
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE } from '../00-fixtures'

test.describe('Form Validation - Admin User', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-AU-01: Create user with valid data', async ({ page }) => {
    const res = await apiPost(page, '/api/users', {
      username: `qatest_${Date.now() % 100000}`,
      nombre: 'QA Test User',
      apellido: 'Test',
      rol: 'ASISTENTE',
      password: 'test123',
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-AU-02: User with duplicate username is rejected (409)', async ({ page }) => {
    const username = `dup_${Date.now() % 100000}`
    const r1 = await apiPost(page, '/api/users', {
      username,
      nombre: 'Dup 1',
      rol: 'ASISTENTE',
      password: 'test123',
    })
    await expectStatus(r1, [200, 201])

    const r2 = await apiPost(page, '/api/users', {
      username,
      nombre: 'Dup 2',
      rol: 'ASISTENTE',
      password: 'test123',
    })
    await expectStatus(r2, 409)
  })

  test('TC-AU-03: User with short password (<6) is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/users', {
      username: `qa_${Date.now() % 100000}`,
      nombre: 'Test',
      rol: 'ASISTENTE',
      password: '123', // too short
    })
    await expectStatus(res, 400)
  })

  test('TC-AU-04: User with short username (<3) is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/users', {
      username: 'ab', // too short
      nombre: 'Test',
      rol: 'ASISTENTE',
      password: 'test123',
    })
    await expectStatus(res, 400)
  })

  test('TC-AU-05: User with invalid rol is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/users', {
      username: `qa_${Date.now() % 100000}`,
      nombre: 'Test',
      rol: 'NOEXISTE',
      password: 'test123',
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-AU-06: User with all valid roles', async ({ page }) => {
    const roles = ['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR', 'SELLADOR']
    for (const rol of roles) {
      const res = await apiPost(page, '/api/users', {
        username: `qa_${rol}_${Date.now() % 100000}_${Math.random()}`,
        nombre: `Test ${rol}`,
        rol,
        password: 'test123',
      })
      await expectStatus(res, [200, 201])
    }
  })

  test('TC-AU-07: /admin/usuarios page loads', async ({ page }) => {
    await page.goto(`${BASE}/admin/usuarios`)
    await expect(page).toHaveURL(/\/admin\/usuarios/)
    await expect(page.getByRole('heading', { name: /Usuarios/ })).toBeVisible({ timeout: 5000 })
  })

  test('TC-AU-08: Reset password generates new password', async ({ page }) => {
    // Get any user
    const listRes = await page.request.get(`${BASE}/api/users`)
    const users = (await listRes.json()).users || []
    if (users.length === 0) { test.skip(); return }
    const user = users.find((u: any) => u.username !== 'admin') // Don't reset admin

    if (!user) { test.skip(); return }

    const res = await apiPost(page, `/api/users/${user.id}/reset-password`, {})
    expect([200, 201]).toContain(res.status())
    const body = await res.json()
    expect(body.password || body.newPassword).toBeDefined()
  })
})
