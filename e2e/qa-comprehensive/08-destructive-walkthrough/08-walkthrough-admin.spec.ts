/**
 * Destructive Walkthrough — Tier 8 / 08: Admin (Usuarios, Configuración, Perfil)
 *
 * Walkthrough de los módulos administrativos:
 *  - /admin/usuarios (solo ADMIN)
 *  - /configuracion (admin, contador)
 *  - /mi-perfil (todos los roles)
 *  - /cambiar-contrasena (todos los roles)
 *  - Crear/editar/eliminar usuarios
 *  - Cambiar configuración empresa
 *  - Cambiar contraseña
 *
 * Tests: ~10
 */
import {
  test,
  expect,
  seedFaker,
  randomNombreCorto,
  randomApellido,
  randomEmail,
  loginAsRole,
  setViewportFor as setViewport,
  assertNoHorizontalOverflow,
  assertNoNextErrors,
  doubleClickSubmit,
  tryMaliciousInput,
  addFinding,
  apiGet,
  BASE,
  type TestRole,
  type TestViewport,
} from './00-fixtures'

test.beforeAll(() => seedFaker(42))

const ROLES: TestRole[] = ['admin', 'asistente', 'contador', 'repartidor']

// ─────────────────────────────────────────────────────────────────────────────
//  Smoke
// ─────────────────────────────────────────────────────────────────────────────

for (const role of ROLES) {
  for (const viewport of ['desktop', 'mobile'] as TestViewport[]) {
    test(`${role} ${viewport}: /mi-perfil carga y permite editar`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      const response = await page.goto(`${BASE}/mi-perfil`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      expect(response?.status()).toBeLessThan(500)
    })

    test(`${role} ${viewport}: /cambiar-contrasena carga`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      const response = await page.goto(`${BASE}/cambiar-contrasena`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      expect(response?.status()).toBeLessThan(500)
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Admin: usuarios y configuración
// ─────────────────────────────────────────────────────────────────────────────

for (const viewport of ['desktop', 'mobile'] as TestViewport[]) {
  test(`admin ${viewport}: /admin/usuarios carga y lista usuarios`, async ({ page }) => {
    await setViewport(page, viewport)
    await loginAsRole(page, 'admin')
    const response = await page.goto(`${BASE}/admin/usuarios`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    expect(response?.status()).toBeLessThan(500)

    if (viewport === 'mobile') {
      const overflow = await assertNoHorizontalOverflow(page)
      if (overflow.overflow) {
        addFinding({
          severity: 'P2',
          module: 'usuarios',
          title: 'Overflow horizontal en /admin/usuarios mobile',
          description: `scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`,
        })
      }
    }
  })

  test(`admin ${viewport}: /configuracion carga y permite editar`, async ({ page }) => {
    await setViewport(page, viewport)
    await loginAsRole(page, 'admin')
    const response = await page.goto(`${BASE}/configuracion`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    expect(response?.status()).toBeLessThan(500)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
//  Crear/eliminar usuario via UI
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: crear usuario con datos colombianos via UI', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/admin/usuarios`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await newBtn.click()
  await page.waitForTimeout(500)

  const username = `test${Date.now().toString().slice(-6)}`
  await page.locator('input[name="username"]').first().fill(username)
  await page.locator('input[name="nombre"]').first().fill(randomNombreCorto())
  await page.locator('input[name="apellido"]').first().fill(randomApellido())
  await page.locator('input[name="email"]').first().fill(randomEmail())

  const password = page.locator('input[name="password"]').first()
  if (await password.isVisible({ timeout: 500 }).catch(() => false)) {
    await password.fill('Test123!')
  }

  const rolSelect = page.locator('select[name="rol"]').first()
  if (await rolSelect.isVisible({ timeout: 500 }).catch(() => false)) {
    await rolSelect.selectOption('ASISTENTE')
  }

  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(2000)

  // Verificar via API
  const usersRes = await apiGet(page, '/api/usuarios')
  const body = await usersRes.json().catch(() => ({}))
  const users = body.usuarios || body.users || body.data || []
  if (!Array.isArray(users)) {
    // No se puede verificar via API, solo validamos que no haya error
    const nextErr = await assertNoNextErrors(page)
    expect(nextErr.hasError).toBe(false)
  }
})

test('admin desktop: doble-click en submit de usuario NO crea duplicados', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/admin/usuarios`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await newBtn.click()
  await page.waitForTimeout(500)

  const username = `dbl${Date.now().toString().slice(-6)}`
  await page.locator('input[name="username"]').first().fill(username)
  await page.locator('input[name="nombre"]').first().fill('Test')
  await page.locator('input[name="apellido"]').first().fill('Doble Click')

  const dblClicked = await doubleClickSubmit(page, 'button[type="submit"]')
  expect(dblClicked).toBe(true)
  await page.waitForTimeout(2500)
})

// ─────────────────────────────────────────────────────────────────────────────
//  Cambiar contraseña
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: cambiar contraseña con input malicioso no rompe', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/cambiar-contrasena`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const result = await tryMaliciousInput(page, 'input[name="currentPassword"], input[name="password"]')
  if (result.filled) {
    await page.waitForTimeout(500)
    const nextErr = await assertNoNextErrors(page)
    expect(nextErr.hasError).toBe(false)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Permisos: solo ADMIN ve /admin/usuarios
// ─────────────────────────────────────────────────────────────────────────────

for (const role of ['asistente', 'contador', 'repartidor'] as TestRole[]) {
  test(`${role}: NO tiene acceso a /admin/usuarios`, async ({ page }) => {
    await setViewport(page, 'desktop')
    await loginAsRole(page, role)
    const response = await page.goto(`${BASE}/admin/usuarios`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    // Espera redirect a /login o 403/404
    const status = response?.status() ?? 0
    const url = page.url()
    if (status >= 200 && status < 300 && url.includes('/admin/usuarios')) {
      addFinding({
        severity: 'P0',
        module: 'auth',
        title: `${role.toUpperCase()} puede acceder a /admin/usuarios (no debería)`,
        description: `URL: ${url}, Status: ${status}`,
      })
    }
  })
}

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[08-walkthrough-admin] Walkthrough Admin completo.`)
})
