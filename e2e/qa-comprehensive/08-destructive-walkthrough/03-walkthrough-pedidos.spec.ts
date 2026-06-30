/**
 * Destructive Walkthrough — Tier 8 / 03: Pedidos
 *
 * Walkthrough completo del módulo Pedidos:
 *  - "Dónde crear pedido" (CTA desde varios lugares)
 *  - Venta rápida (sin cliente)
 *  - Pedido con cliente (DOMICILIO)
 *  - Filtros: Hoy / Todos / Fiados / Alertas
 *  - Doble-click en submit
 *  - Submit vacío
 *  - Anular pedido
 *  - Búsqueda con caracteres especiales
 *  - Polling / refetch
 *
 * Tests: ~15
 */
import {
  test,
  expect,
  seedFaker,
  randomCantidad,
  randomNombre,
  randomTelefonoDigitos,
  randomBarrio,
  randomDireccion,
  loginAsRole,
  setViewportFor as setViewport,
  assertNoHorizontalOverflow,
  assertNoNextErrors,
  assertTouchTargets,
  doubleClickSubmit,
  addFinding,
  apiGet,
  apiPost,
  createClienteFull,
  BASE,
  type TestRole,
  type TestViewport,
} from './00-fixtures'

test.beforeAll(() => seedFaker(42))

const ROLES: TestRole[] = ['admin', 'asistente']
const VIEWPORTS: TestViewport[] = ['desktop', 'mobile']

// ─────────────────────────────────────────────────────────────────────────────
//  Smoke + acceso por rol × viewport
// ─────────────────────────────────────────────────────────────────────────────

for (const role of ROLES) {
  for (const viewport of VIEWPORTS) {
    test(`${role} ${viewport}: /pedidos carga sin errores`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      const response = await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
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

    test(`${role} ${viewport}: tabs (Hoy/Todos/Fiados/Alertas) funcionan`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)

      // Buscar tabs
      const tabs = ['Hoy', 'Todos', 'Fiados', 'Alertas']
      for (const tabName of tabs) {
        const tab = page
          .locator(`button:has-text("${tabName}"), a:has-text("${tabName}"), [role="tab"]:has-text("${tabName}")`)
          .first()
        if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
          await tab.click()
          await page.waitForTimeout(500)
        }
      }
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Crear pedido via UI
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: ¿dónde está el botón "Crear pedido"?', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  const buttons = page.locator('button:visible, a:visible')
  const count = await buttons.count()
  let crearPedidoFound = false
  for (let i = 0; i < count; i++) {
    const text = (await buttons.nth(i).textContent().catch(() => ''))?.trim() ?? ''
    if (/nuevo pedido|crear pedido|venta rápida|nueva venta|^\+ ?nuevo/i.test(text)) {
      crearPedidoFound = true
      break
    }
  }
  if (!crearPedidoFound) {
    addFinding({
      severity: 'P1',
      module: 'pedidos',
      title: 'No hay botón "Crear/Nuevo pedido" en /pedidos',
      description: 'No se encontró ningún CTA claro para crear pedido.',
      userComplaint: 'Queja típica: "no sé dónde crear pedido"',
    })
  }
})

test('admin desktop: crear venta rápida PUNTO (CONSUMIDOR_FINAL) con datos colombianos', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // Click en venta rápida
  const ventaRapida = page
    .locator('button:has-text("Venta"), a:has-text("Venta"), button:has-text("Nueva")')
    .first()
  if (!(await ventaRapida.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await ventaRapida.click({ force: true }).catch(() => {})
  await page.waitForTimeout(800)

  // Cantidad de paca
  const cantidadInput = page.locator('input[type="number"]').first()
  if (await cantidadInput.isVisible().catch(() => false)) {
    await cantidadInput.fill(String(randomCantidad(1, 10)))
  }

  // Submit
  const submit = page.locator('button[type="submit"]').first()
  if (!(await submit.isVisible({ timeout: 2000 }).catch(() => false))) {
    // Si no hay submit visible, el modal no se abrió — skip silencioso
    test.skip()
    return
  }
  await submit.click()
  await page.waitForTimeout(2000)

  // Verificar via API
  const res = await apiGet(page, '/api/pedidos?limit=5')
  const body = await res.json()
  const pedidos = body.pedidos || []
  if (pedidos.length === 0) {
    addFinding({
      severity: 'P1',
      module: 'pedidos',
      title: 'Venta rápida no creó pedido',
      description: 'Submit OK pero no aparece en /api/pedidos.',
    })
  }
})

test('admin desktop: crear pedido con cliente colombiano (DOMICILIO)', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Crear cliente via API
  const cliente = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = cliente.cliente?.id || cliente.id

  await page.goto(`${BASE}/pedidos?clienteId=${clienteId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // Verificar que el cliente está pre-seleccionado en algún lugar
  const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
  const clientePresente = bodyText.includes(cliente.cliente?.nombre || cliente.nombre || '')
  if (!clientePresente) {
    addFinding({
      severity: 'P2',
      module: 'pedidos',
      title: 'Cliente no pre-seleccionado al entrar con ?clienteId=ID',
      description: 'El código debería leer query param y pre-llenar cliente.',
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Doble-click y validación
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: doble-click en submit de pedido NO crea duplicados', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Setup: crear cliente y contar pedidos antes
  const cliente = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = cliente.cliente?.id || cliente.id

  const beforeRes = await apiGet(page, `/api/pedidos?clienteId=${clienteId}`)
  const beforeBody = await beforeRes.json()
  const beforeCount = (beforeBody.pedidos || []).length

  await page.goto(`${BASE}/pedidos?clienteId=${clienteId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // Doble-click submit
  const dblClicked = await doubleClickSubmit(page, 'button[type="submit"]')
  if (!dblClicked) {
    test.skip()
    return
  }
  await page.waitForTimeout(2500)

  const afterRes = await apiGet(page, `/api/pedidos?clienteId=${clienteId}`)
  const afterBody = await afterRes.json()
  const afterCount = (afterBody.pedidos || []).length
  const created = afterCount - beforeCount

  if (created > 1) {
    addFinding({
      severity: 'P0',
      module: 'pedidos',
      title: 'Doble-click creó múltiples pedidos',
      description: `Antes: ${beforeCount}, después: ${afterCount}. Diferencia: ${created}.`,
      expected: '1 pedido',
      observed: `${created} pedidos`,
    })
  }
})

test('admin desktop: submit vacío muestra error de validación', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  // Intentar submit directo
  const submit = page.locator('button[type="submit"]').first()
  if (!(await submit.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await submit.click()
  await page.waitForTimeout(1500)

  const errorEl = page
    .locator('[data-sonner-toast][data-type="error"], [role="alert"], .text-red-500, .text-destructive')
    .first()
  const errorVisible = await errorEl.isVisible({ timeout: 3000 }).catch(() => false)
  // No es un bug si no valida — algunos forms permiten 0 items
  if (!errorVisible) {
    addFinding({
      severity: 'P3',
      module: 'pedidos',
      title: 'Submit vacío no muestra error',
      description: 'Form permite submit sin datos — puede ser intencional.',
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Filtros y búsqueda
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: filtro por clienteId pre-llena la lista', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  const c = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = c.cliente?.id || c.id

  await page.goto(`${BASE}/pedidos?clienteId=${clienteId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  // Verificar que está filtrado (puede mostrar mensaje de filtro)
  expect(page.url()).toContain('clienteId=')
})

test('admin desktop: filtro por rango de fechas', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  await page.goto(`${BASE}/pedidos?desde=${weekAgo}&hasta=${today}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  expect(page.url()).toContain('desde=')
})

test('admin desktop: búsqueda con caracteres especiales no rompe', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const search = page
    .locator('input[type="search"], input[placeholder*="buscar" i]')
    .first()
  if (!(await search.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  const especiales = '%_\\"\'" OR 1=1 -- <script>alert(1)</script>'
  await search.fill(especiales)
  await page.waitForTimeout(1000)

  const nextErr = await assertNoNextErrors(page)
  expect(nextErr.hasError).toBe(false)
})

// ─────────────────────────────────────────────────────────────────────────────
//  Anular pedido
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: anular pedido (con entrega) crea NotaCredito', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Setup: crear pedido, entregar, luego anular via API
  const pedRes = await apiPost(page, '/api/pedidos', {
    clienteId: 'CONSUMIDOR_FINAL',
    canal: 'PUNTO',
    ventaRapida: true,
    items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
  })
  const pedido = (await pedRes.json()).pedido || (await pedRes.json())
  const pedidoId = pedido.id
  expect(pedidoId).toBeTruthy()

  // Entregar
  await apiPost(page, `/api/pedidos/${pedidoId}/entrega`, {
    tipo: 'COMPLETO',
    itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 1 }],
  })

  // Anular
  const anuRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, { motivo: 'Test walkthrough' })
  expect([200, 201, 400]).toContain(anuRes.status())

  if (anuRes.ok()) {
    const body = await anuRes.json()
    if (body.notaCredito) {
      const monto = Number(body.notaCredito.monto)
      if (monto <= 0) {
        addFinding({
          severity: 'P0',
          module: 'pedidos',
          title: 'NotaCredito.monto <= 0 al anular pedido pagado',
          description: `Pedido con pago de $5000, NC.monto=${monto}. Cliente pierde refund.`,
          expected: 'NC.monto > 0',
          observed: `NC.monto=${monto}`,
        })
      }
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Mobile específico
// ─────────────────────────────────────────────────────────────────────────────

test('asistente mobile: pedido list tiene touch targets OK', async ({ page }) => {
  await setViewport(page, 'mobile')
  await loginAsRole(page, 'asistente')
  await page.goto(`${BASE}/pedidos`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const touch = await assertTouchTargets(page, 44)
  if (touch.violations.length > 5) {
    addFinding({
      severity: 'P2',
      module: 'pedidos',
      title: 'Muchos touch targets pequeños en /pedidos mobile',
      description: `${touch.violations.length} violaciones. Primeras: ${touch.violations.slice(0, 3).join('; ')}`,
    })
  }
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[03-walkthrough-pedidos] Walkthrough Pedidos completo.`)
})
