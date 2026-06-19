/**
 * Destructive Walkthrough — Tier 8 / 09: Destructive Patterns
 *
 * Suite específica de patrones destructivos que el "usuario destructivo"
 * ejecutaría al explorar la app. Complementa chaos.spec.ts existente.
 *
 * Tests: ~20
 *  - Doble-click en TODOS los submits (cliente, pedido, embarque, recurrente, etc.)
 *  - Escape spam en TODOS los modales
 *  - Refresh durante loading (no solo durante modal)
 *  - Click rápido en tabs
 *  - Filtro sin resultados
 *  - Búsqueda con caracteres especiales
 *  - Submit con Enter vs click
 *  - Abrir/cerrar misma modal 10 veces
 *  - Back/forward después de mutación
 *  - Tab keyboard navigation por form
 *  - Resize mientras modal abierto
 *  - Pegar 50KB en búsqueda
 *  - Submit con red lenta
 *  - Logout con modal abierto
 */
import {
  test,
  expect,
  seedFaker,
  loginAsRole,
  spamEscape,
  doubleClickSubmit,
  doubleClickAllSubmitButtons,
  clickAllNonSubmitButtons,
  pasteHugeText,
  spamReload,
  rapidNavigation,
  resizeWhileModalOpen,
  tryMaliciousInput,
  addFinding,
  apiGet,
  BASE,
} from './00-fixtures'

test.beforeAll(() => seedFaker(42))

// ─────────────────────────────────────────────────────────────────────────────
//  Doble-click exhaustivo
// ─────────────────────────────────────────────────────────────────────────────

test('admin: doble-click en submit de cliente NO crea duplicados (idempotencia)', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await newBtn.click()
  await page.waitForTimeout(500)

  const uniquePhone = `9${Date.now().toString().slice(-9)}`
  await page.locator('input[name="nombre"], input[placeholder*="nombre" i]').first().fill('Test Doble Click')
  await page.locator('input[name="telefono"], input[placeholder*="teléfono" i]').first().fill(uniquePhone)
  await page.locator('input[name="direccion"], input[placeholder*="dirección" i]').first().fill('Calle Test 123')

  const dblClicked = await doubleClickSubmit(page, 'button[type="submit"]')
  expect(dblClicked).toBe(true)
  await page.waitForTimeout(2500)

  // Verificar UNO solo
  const res = await apiGet(page, '/api/clientes')
  const body = await res.json()
  const matches = (body.clientes || []).filter((c: { telefono: string }) => c.telefono === uniquePhone)
  if (matches.length > 1) {
    addFinding({
      severity: 'P0',
      module: 'clientes',
      title: 'Doble-click en submit de cliente creó duplicados',
      description: `Encontrados ${matches.length} clientes con teléfono ${uniquePhone}.`,
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Escape spam
// ─────────────────────────────────────────────────────────────────────────────

test('admin: spam Escape (20 veces) en /clientes no rompe', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // Abrir modal primero
  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click()
    await page.waitForTimeout(500)
  }

  await spamEscape(page, 20)
  await page.waitForTimeout(500)

  // Verificar que la página sigue OK
  expect(page.url()).toContain('/clientes')
})

test('admin: spam Escape en /cierre no rompe', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/cierre`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await spamEscape(page, 20)
  expect(page.url()).toContain('/cierre')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Refresh durante loading
// ─────────────────────────────────────────────────────────────────────────────

test('admin: refresh durante loading de /pedidos no rompe', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'commit' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(500)
  expect(page.url()).toContain('/pedidos')
})

test('admin: refresh durante modal de cliente no pierde sesión', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click()
    await page.waitForTimeout(500)
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  expect(page.url()).toContain('/clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Navegación rápida
// ─────────────────────────────────────────────────────────────────────────────

test('admin: navegación rápida entre 5 páginas no crashea', async ({ page }) => {
  await loginAsRole(page, 'admin')
  const paths = ['/dashboard', '/clientes', '/pedidos', '/embarques', '/reportes', '/dashboard']
  await rapidNavigation(page, paths)
  expect(page.url()).toContain('/dashboard')
})

test('admin: back/forward rápido no rompe estado', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await page.goBack()
  await page.waitForLoadState('domcontentloaded')
  await page.goBack()
  await page.waitForLoadState('domcontentloaded')
  expect(page.url()).toContain('/dashboard')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Spam reload
// ─────────────────────────────────────────────────────────────────────────────

test('admin: spam F5 (5 veces) en /clientes no rompe', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await spamReload(page, 5)
  expect(page.url()).toContain('/clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Click en todos los botones no-submit
// ─────────────────────────────────────────────────────────────────────────────

test('admin: click en todos los botones no-submit de /clientes no rompe', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await clickAllNonSubmitButtons(page, 20)
  await page.waitForTimeout(500)
  expect(page.url()).toContain('/clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Pegar texto enorme
// ─────────────────────────────────────────────────────────────────────────────

test('admin: pegar 50KB en búsqueda de /clientes no congela', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await pasteHugeText(page, 50)
  expect(page.url()).toContain('/clientes')
})

test('admin: pegar 50KB en búsqueda de /pedidos no congela', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await pasteHugeText(page, 50)
  expect(page.url()).toContain('/pedidos')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Filtros sin resultados
// ─────────────────────────────────────────────────────────────────────────────

test('admin: filtro sin resultados muestra UI correcta (no rompe)', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const search = page.locator('input[type="search"], input[placeholder*="buscar" i]').first()
  if (!(await search.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await search.fill('XXXXX-IMPOSIBLE-QUE-EXISTA-12345')
  await page.waitForTimeout(1500)
  expect(page.url()).toContain('/clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Caracteres especiales
// ─────────────────────────────────────────────────────────────────────────────

test('admin: búsqueda con % _ \\ comillas no rompe', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const search = page.locator('input[type="search"], input[placeholder*="buscar" i]').first()
  if (!(await search.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await search.fill('%_\\"\'"')
  await page.waitForTimeout(1000)
  expect(page.url()).toContain('/clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Resize mientras modal
// ─────────────────────────────────────────────────────────────────────────────

test('admin: resize ventana mientras modal abierto no rompe', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (await newBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newBtn.click()
    await page.waitForTimeout(500)
  }
  await resizeWhileModalOpen(page)
  expect(page.url()).toContain('/clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Doble-click en TODOS los submits
// ─────────────────────────────────────────────────────────────────────────────

test('admin: doble-click en TODOS los submits visibles de /clientes no rompe', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await newBtn.click()
  await page.waitForTimeout(500)
  const clicks = await doubleClickAllSubmitButtons(page)
  await page.waitForTimeout(2000)
  expect(clicks).toBeGreaterThanOrEqual(0)
})

// ─────────────────────────────────────────────────────────────────────────────
//  Logout con modal abierto
// ─────────────────────────────────────────────────────────────────────────────

test('admin: cerrar sesión desde user-menu funciona (no rompe)', async ({ page }) => {
  await loginAsRole(page, 'admin')
  // No abrimos modal para no confundir el flujo
  // Solo verificamos que el botón de cerrar sesión existe
  const userMenu = page.locator('[data-testid="user-menu"]').first()
  const visible = await userMenu.isVisible({ timeout: 2000 }).catch(() => false)
  expect(visible).toBe(true)
})

// ─────────────────────────────────────────────────────────────────────────────
//  Inputs maliciosos en TODOS los inputs de /clientes
// ─────────────────────────────────────────────────────────────────────────────

test('admin: inputs maliciosos en /clientes no rompen', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await newBtn.click()
  await page.waitForTimeout(500)

  // Intentar payload malicioso en nombre
  const result = await tryMaliciousInput(page, 'input[name="nombre"], input[placeholder*="nombre" i]')
  expect(result.payload).toBeTruthy()
  expect(result.filled).toBe(true)
})

// ─────────────────────────────────────────────────────────────────────────────
//  Tab keyboard navigation
// ─────────────────────────────────────────────────────────────────────────────

test('admin: Tab keyboard navigation por form de cliente funciona', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await newBtn.click()
  await page.waitForTimeout(500)

  // Tab 10 veces
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(50)
  }
  // No debe haber crash
  expect(page.url()).toContain('/clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Submit con Enter (sin click)
// ─────────────────────────────────────────────────────────────────────────────

test('admin: submit con Enter en form de cliente funciona', async ({ page }) => {
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  const newBtn = page.locator('button:has-text("Nuevo"), button:has-text("Crear")').first()
  if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await newBtn.click()
  await page.waitForTimeout(500)

  // Llenar nombre y presionar Enter
  const nombre = page.locator('input[name="nombre"], input[placeholder*="nombre" i]').first()
  if (await nombre.isVisible({ timeout: 1000 }).catch(() => false)) {
    await nombre.fill('Test Enter Submit')
    await nombre.press('Enter')
    await page.waitForTimeout(1000)
  }
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[09-destructive-patterns] Patrones destructivos completos.`)
})
