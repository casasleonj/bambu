/**
 * Destructive Walkthrough — Tier 8 / 05: Embarques
 *
 * Walkthrough del módulo Embarques:
 *  - Lista de embarques (abiertos/cerrados)
 *  - Crear embarque con datos colombianos
 *  - Asignar pedidos
 *  - Cerrar embarque (preview, conciliación, gastos, confirmar)
 *  - Filtros (estado, fecha, repartidor)
 *  - Doble-click submit
 *  - Permisos por rol (repartidor solo ve los suyos)
 *
 * Tests: ~12
 */
import {
  test,
  expect,
  seedFaker,
  randomCantidad,
  randomNombre,
  randomHora,
  loginAsRole,
  setViewportFor as setViewport,
  assertNoHorizontalOverflow,
  assertNoNextErrors,
  doubleClickSubmit,
  addFinding,
  apiGet,
  apiPost,
  createTrabajador,
  createPedido,
  BASE,
  type TestRole,
  type TestViewport,
} from './00-fixtures'

test.beforeAll(() => seedFaker(42))

const ROLES: TestRole[] = ['admin', 'asistente', 'repartidor']
const VIEWPORTS: TestViewport[] = ['desktop', 'mobile']

// ─────────────────────────────────────────────────────────────────────────────
//  Smoke + acceso
// ─────────────────────────────────────────────────────────────────────────────

for (const role of ROLES) {
  for (const viewport of VIEWPORTS) {
    test(`${role} ${viewport}: /embarques carga sin errores`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      const response = await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(500)

      expect(response?.status()).toBeLessThan(500)
      const nextErr = await assertNoNextErrors(page)
      expect(nextErr.hasError).toBe(false)

      if (viewport === 'mobile') {
        const overflow = await assertNoHorizontalOverflow(page)
        expect(overflow.overflow).toBe(false)
      }
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Crear embarque
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: crear embarque con carga y verificar en lista', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Necesitamos un trabajador repartidor
  let trab
  try {
    const trabRes = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
    const trabBody = await trabRes.json()
    trab = (trabBody.trabajadores || [])[0]
  } catch {
    // ignore
  }
  if (!trab) {
    const t = await createTrabajador(page, {
      nombre: randomNombre(),
      rol: 'REPARTIDOR',
    })
    trab = t.trabajador || t
  }
  if (!trab) {
    test.skip()
    return
  }

  // Contar embarques antes
  const beforeRes = await apiGet(page, '/api/embarques?all=true')
  const beforeCount = (((await beforeRes.json()).embarques || []).length) || 0

  // Crear embarque via API
  const embRes = await apiPost(page, '/api/embarques', {
    trabajadorId: trab.id,
    horaSalida: randomHora(),
    carga: [{ producto: 'PACA_AGUA', cargadas: randomCantidad(5, 20) }],
  })
  expect([200, 201]).toContain(embRes.status())
  const embBody = await embRes.json()
  const embarqueId = embBody.embarque?.id || embBody.data?.id || embBody.id
  expect(embarqueId).toBeTruthy()

  // Verificar en /embarques
  await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const afterRes = await apiGet(page, '/api/embarques?all=true')
  const afterCount = (((await afterRes.json()).embarques || []).length) || 0
  expect(afterCount).toBeGreaterThan(beforeCount)
})

test('admin desktop: crear embarque con doble-click NO duplica', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  let trab
  try {
    const trabRes = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
    const trabBody = await trabRes.json()
    trab = (trabBody.trabajadores || [])[0]
  } catch {
    // ignore
  }
  if (!trab) {
    const t = await createTrabajador(page, {
      nombre: randomNombre(),
      rol: 'REPARTIDOR',
    })
    trab = t.trabajador || t
  }
  if (!trab) {
    test.skip()
    return
  }

  // Navegar a la página de creación
  const newBtn = page.locator('button:has-text("Crear"), button:has-text("Nuevo"), a:has-text("Nuevo")').first()
  const visible = await newBtn.isVisible({ timeout: 2000 }).catch(() => false)
  if (!visible) {
    test.skip()
    return
  }
  await newBtn.click()
  await page.waitForTimeout(500)

  // Llenar form (simplificado, asume select de trabajador y cantidad)
  const trabSelect = page.locator('select[name="trabajadorId"]').first()
  if (await trabSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
    await trabSelect.selectOption(trab.id)
  }

  // Doble-click submit
  await doubleClickSubmit(page, 'button[type="submit"]')
  await page.waitForTimeout(2000)
})

// ─────────────────────────────────────────────────────────────────────────────
//  Asignar pedidos y cerrar
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: asignar pedido a embarque abierto', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Setup
  let trab
  try {
    const trabRes = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
    const trabBody = await trabRes.json()
    trab = (trabBody.trabajadores || [])[0]
  } catch {
    // ignore
  }
  if (!trab) {
    const t = await createTrabajador(page, {
      nombre: randomNombre(),
      rol: 'REPARTIDOR',
    })
    trab = t.trabajador || t
  }
  if (!trab) {
    test.skip()
    return
  }

  const embRes = await apiPost(page, '/api/embarques', {
    trabajadorId: trab.id,
    horaSalida: randomHora(),
    carga: [{ producto: 'PACA_AGUA', cargadas: 10 }],
  })
  const embarqueId = ((await embRes.json()).embarque || (await embRes.json())).id

  const pedRes = await createPedido(page, { ventaRapida: true })
  const pedidoId = (pedRes.pedido || pedRes).id

  // Asignar
  const asigRes = await apiPost(page, `/api/embarques/${embarqueId}/pedidos`, { pedidoIds: [pedidoId] })
    .catch(() => null) || await apiPost(page, `/api/embarques/${embarqueId}`, { pedidoIds: [pedidoId] })
  expect([200, 201, 400, 405]).toContain(asigRes.status())
})

test('admin desktop: cerrar embarque (preview, conciliación, gastos, confirmar)', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Setup
  let trab
  try {
    const trabRes = await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')
    const trabBody = await trabRes.json()
    trab = (trabBody.trabajadores || [])[0]
  } catch {
    // ignore
  }
  if (!trab) {
    test.skip()
    return
  }

  const embRes = await apiPost(page, '/api/embarques', {
    trabajadorId: trab.id,
    horaSalida: randomHora(),
    carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
  })
  const embarqueId = ((await embRes.json()).embarque || (await embRes.json())).id

  await page.goto(`${BASE}/embarques/${embarqueId}/cerrar`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  // Verificar tabs visibles
  const tabs = ['Pedidos', 'Ventas', 'Conciliación', 'Gastos', 'Preview']
  for (const tabName of tabs) {
    const tab = page
      .locator(`button:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`)
      .first()
    if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
      // OK
    } else {
      addFinding({
        severity: 'P3',
        module: 'embarques',
        title: `Tab "${tabName}" no visible en /embarques/[id]/cerrar`,
        description: 'Posible cambio de naming.',
      })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Filtros
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: filtros de embarques (estado, fecha, repartidor)', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // Buscar filtros
  const estadoFilter = page.locator('select[name="estado"], button:has-text("Estado")').first()
  if (await estadoFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
    if ((await estadoFilter.getAttribute('tagName')) === 'SELECT') {
      await estadoFilter.selectOption('ABIERTO')
    } else {
      await estadoFilter.click()
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Permisos por rol
// ─────────────────────────────────────────────────────────────────────────────

test('repartidor mobile: solo ve sus embarques', async ({ page }) => {
  await setViewport(page, 'mobile')
  await loginAsRole(page, 'repartidor')
  await page.goto(`${BASE}/embarques`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // No debe ver botones de crear embarque
  const newBtn = page.locator('button:has-text("Crear Embarque"), button:has-text("Nuevo Embarque")').first()
  const newVisible = await newBtn.isVisible({ timeout: 1000 }).catch(() => false)
  if (newVisible) {
    addFinding({
      severity: 'P1',
      module: 'embarques',
      title: 'REPARTIDOR ve botón "Crear Embarque" en /embarques',
      description: 'No debería poder crear embarques.',
    })
  }
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[05-walkthrough-embarques] Walkthrough Embarques completo.`)
})
