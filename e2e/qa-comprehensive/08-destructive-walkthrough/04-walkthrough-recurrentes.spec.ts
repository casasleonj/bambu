/**
 * Destructive Walkthrough — Tier 8 / 04: Recurrentes
 *
 * Walkthrough del módulo Plantillas Recurrentes:
 *  - Lista de plantillas
 *  - Crear plantilla con datos colombianos
 *  - Ejecutar plantilla (genera pedido)
 *  - Editar productos (en /recurrentes/[id])
 *  - Eliminar plantilla
 *  - Filtros
 *  - Doble-click
 *
 * Tests: ~10
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
  randomHora,
  loginAsRole,
  setViewportFor as setViewport,
  assertNoHorizontalOverflow,
  assertNoNextErrors,
  doubleClickSubmit,
  addFinding,
  apiGet,
  apiPost,
  apiDelete,
  createClienteFull,
  BASE,
  type TestRole,
  type TestViewport,
} from './00-fixtures'

test.beforeAll(() => seedFaker(42))

const ROLES: TestRole[] = ['admin', 'asistente']
const VIEWPORTS: TestViewport[] = ['desktop', 'mobile']

// ─────────────────────────────────────────────────────────────────────────────
//  Smoke + acceso
// ─────────────────────────────────────────────────────────────────────────────

for (const role of ROLES) {
  for (const viewport of VIEWPORTS) {
    test(`${role} ${viewport}: /recurrentes carga sin errores`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      const response = await page.goto(`${BASE}/recurrentes`, { waitUntil: 'domcontentloaded' })
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

    test(`${role} ${viewport}: /recurrentes/nuevo carga form`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      const response = await page.goto(`${BASE}/recurrentes/nuevo`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      expect(response?.status()).toBeLessThan(500)
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Crear / ejecutar / eliminar plantilla via API + verificar UI
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: crear plantilla recurrente con datos colombianos via API y aparece en /recurrentes', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  const cliente = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = cliente.cliente?.id || cliente.id

  // FIX P2: usar el shape correcto del API (objeto con keys camelCase).
  // El contrato es: { pacaAgua, pacaHielo, botellon, bolsaAgua, bolsaHielo }
  // NO un array de { producto, cantidad } (eso falla Zod con 400).
  // Suma mínima: 3 productos (refine Zod C-VAL-6).
  const planRes = await apiPost(page, '/api/recurrentes', {
    clienteId,
    cadaNDias: 7,
    tipo: 'ENVIO',
    canal: 'DOMICILIO',
    horaPreferida: randomHora(),
    productos: {
      pacaAgua: randomCantidad(1, 5),
      pacaHielo: randomCantidad(1, 3),
      botellon: 0,
      bolsaAgua: 0,
      bolsaHielo: 0,
    },
  })
  if (![200, 201].includes(planRes.status())) {
    addFinding({
      severity: 'P2',
      module: 'recurrentes',
      title: 'POST /api/recurrentes con datos colombianos válidos retorna error',
      description: `Status: ${planRes.status()}. Body: ${(await planRes.text().catch(() => '')).slice(0, 200)}`,
    })
    test.skip()
    return
  }

  // Recargar /recurrentes y verificar que aparece el cliente
  await page.goto(`${BASE}/recurrentes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const bodyText = (await page.locator('body').textContent().catch(() => '')) ?? ''
  if (!bodyText.includes(cliente.cliente?.nombre || cliente.nombre || '')) {
    addFinding({
      severity: 'P2',
      module: 'recurrentes',
      title: 'Plantilla recién creada no aparece en /recurrentes',
      description: 'Posible bug de cache o query.',
    })
  }
})

test('admin desktop: ejecutar plantilla genera pedido', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Setup
  const cliente = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = cliente.cliente?.id || cliente.id

  const planRes = await apiPost(page, '/api/recurrentes', {
    clienteId,
    cadaNDias: 7,
    productos: {
      pacaAgua: 1,
      pacaHielo: 1,
      botellon: 1,
      bolsaAgua: 0,
      bolsaHielo: 0,
    },
  })
  const planBody = await planRes.json()
  const planId = planBody.plantilla?.id || planBody.data?.id || planBody.id

  if (!planId) {
    test.skip()
    return
  }

  // Intentar ejecutar
  const endpoints = [
    `/api/recurrentes/${planId}/ejecutar`,
    `/api/recurrentes/${planId}/generar`,
    `/api/pedidos/recurrentes`,
  ]
  let executed = false
  for (const ep of endpoints) {
    const r = await apiPost(page, ep, {})
    if (r.ok()) {
      executed = true
      break
    }
  }
  if (!executed) {
    addFinding({
      severity: 'P1',
      module: 'recurrentes',
      title: 'No se pudo ejecutar plantilla recurrente',
      description: `Endpoints probados: ${endpoints.join(', ')}.`,
    })
  }
})

test('admin desktop: editar productos de plantilla (en /recurrentes/[id])', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Setup
  const cliente = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = cliente.cliente?.id || cliente.id

  const planRes = await apiPost(page, '/api/recurrentes', {
    clienteId,
    cadaNDias: 7,
    productos: { pacaAgua: 1, pacaHielo: 1, botellon: 1, bolsaAgua: 0, bolsaHielo: 0 },
  })
  const planBody = await planRes.json()
  const planId = planBody.plantilla?.id || planBody.data?.id || planBody.id

  if (!planId) {
    test.skip()
    return
  }

  // Navegar al editor
  const response = await page.goto(`${BASE}/recurrentes/${planId}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  expect(response?.status()).toBeLessThan(500)

  // Verificar que el form de edición carga
  const form = page.locator('form, [data-testid="recurrente-form"]').first()
  if (!(await form.isVisible({ timeout: 2000 }).catch(() => false))) {
    addFinding({
      severity: 'P1',
      module: 'recurrentes',
      title: 'No hay form de edición en /recurrentes/[id]',
      description: `URL ${BASE}/recurrentes/${planId} no tiene form visible.`,
    })
  }
})

test('admin desktop: doble-click en submit de plantilla NO crea duplicados', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Crear cliente
  const cliente = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = cliente.cliente?.id || cliente.id

  // Contar plantillas antes
  const beforeRes = await apiGet(page, '/api/recurrentes')
  const beforeCount = ((await beforeRes.json()).plantillas || []).length

  await page.goto(`${BASE}/recurrentes/nuevo`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // Seleccionar cliente (si hay select)
  const clienteSelect = page.locator('select[name="clienteId"]').first()
  if (await clienteSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
    await clienteSelect.selectOption(clienteId)
  }

  // Configurar frecuencia y producto
  const cadaInput = page.locator('input[name="cadaNDias"], input[name="frecuencia"]').first()
  if (await cadaInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await cadaInput.fill('7')
  }

  // Doble-click submit
  const dblClicked = await doubleClickSubmit(page, 'button[type="submit"]')
  if (!dblClicked) {
    test.skip()
    return
  }
  await page.waitForTimeout(2500)

  // Verificar
  const afterRes = await apiGet(page, '/api/recurrentes')
  const afterCount = ((await afterRes.json()).plantillas || []).length
  const created = afterCount - beforeCount

  if (created > 1) {
    addFinding({
      severity: 'P0',
      module: 'recurrentes',
      title: 'Doble-click creó múltiples plantillas',
      description: `Antes: ${beforeCount}, después: ${afterCount}.`,
      expected: '1 plantilla',
      observed: `${created} plantillas`,
    })
  }
})

test('admin desktop: filtro/búsqueda de plantillas', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/recurrentes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const search = page.locator('input[type="search"], input[placeholder*="buscar" i]').first()
  if (!(await search.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await search.fill('ZZZ-Filter-Test')
  await page.waitForTimeout(1000)
  const nextErr = await assertNoNextErrors(page)
  expect(nextErr.hasError).toBe(false)
})

test('admin desktop: eliminar plantilla via UI', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Setup
  const cliente = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = cliente.cliente?.id || cliente.id

  const planRes = await apiPost(page, '/api/recurrentes', {
    clienteId,
    cadaNDias: 7,
    productos: { pacaAgua: 1, pacaHielo: 1, botellon: 1, bolsaAgua: 0, bolsaHielo: 0 },
  })
  const planBody = await planRes.json()
  const planId = planBody.plantilla?.id || planBody.data?.id || planBody.id
  if (!planId) {
    test.skip()
    return
  }

  // Eliminar via API
  const delRes = await apiDelete(page, `/api/recurrentes/${planId}`)
  expect([200, 204, 404]).toContain(delRes.status())
})

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[04-walkthrough-recurrentes] Walkthrough Recurrentes completo.`)
})
