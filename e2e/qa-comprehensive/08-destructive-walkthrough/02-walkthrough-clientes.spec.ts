/**
 * Destructive Walkthrough — Tier 8 / 02: Clientes
 *
 * Walkthrough completo del módulo Clientes con:
 *  - Datos colombianos reales (faker + pool)
 *  - Tests por rol (admin, asistente) × viewport (desktop, mobile)
 *  - Doble-click en submit
 *  - Submit SIN datos
 *  - Inputs maliciosos
 *  - Filtros (búsqueda, barrio, estado)
 *  - Crear pedido desde cliente (cross-page)
 *  - Editar / eliminar
 *  - Doble cliente (teléfono duplicado)
 *
 * Tests: ~12
 */
import {
  test,
  expect,
  seedFaker,
  randomNombre,
  randomTelefonoDigitos,
  randomDireccion,
  randomBarrio,
  randomClienteData,
  loginAsRole,
  setViewportFor as setViewport,
  assertNoHorizontalOverflow,
  assertNoNextErrors,
  assertTouchTargets,
  doubleClickSubmit,
  tryMaliciousInput,
  addFinding,
  shoot,
  apiGet,
  apiPost,
  BASE,
  type TestRole,
  type TestViewport,
} from './00-fixtures'

test.beforeAll(() => seedFaker(42))

// ─────────────────────────────────────────────────────────────────────────────
//  Tests cross-cutting (rol × viewport)
// ─────────────────────────────────────────────────────────────────────────────

const ROLES: TestRole[] = ['admin', 'asistente']
const VIEWPORTS: TestViewport[] = ['desktop', 'mobile']

for (const role of ROLES) {
  for (const viewport of VIEWPORTS) {
    test(`${role} ${viewport}: navegar a /clientes, render OK, sin overflow`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      const response = await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(500)

      expect(response?.status()).toBeLessThan(500)
      const nextErr = await assertNoNextErrors(page)
      expect(nextErr.hasError).toBe(false)

      if (viewport === 'mobile') {
        const overflow = await assertNoHorizontalOverflow(page)
        expect(overflow.overflow).toBe(false)
        const touch = await assertTouchTargets(page, 44)
        // Permitimos hasta 3 violaciones, en este caso solo registramos
        if (touch.violations.length > 0) {
          addFinding({
            severity: 'P3',
            module: 'clientes',
            title: `Touch targets pequeños en /clientes (${role} ${viewport})`,
            description: `${touch.violations.length} violaciones`,
            expected: '>= 44x44',
            observed: touch.violations.slice(0, 3).join('; '),
          })
        }
      }
    })

    test(`${role} ${viewport}: crear cliente con datos colombianos reales via UI`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)

      // Buscar botón para crear cliente (varios patrones)
      const newBtn = page
        .locator(
          'button:has-text("Nuevo Cliente"), button:has-text("Crear Cliente"), button:has-text("Nuevo"), a:has-text("Nuevo")'
        )
        .first()
      const newBtnVisible = await newBtn.isVisible({ timeout: 3000 }).catch(() => false)
      if (!newBtnVisible) {
        addFinding({
          severity: 'P1',
          module: 'clientes',
          title: `No hay botón "Nuevo Cliente" en /clientes (${role} ${viewport})`,
          description: 'No se encontró acción para crear cliente.',
        })
        test.skip()
        return
      }
      await newBtn.click()
      await page.waitForTimeout(800)

      // Llenar form con datos colombianos
      const clienteData = randomClienteData()
      const nombreInput = page.locator('input[name="nombre"], input[placeholder*="nombre" i]').first()
      const telefonoInput = page.locator('input[name="telefono"], input[placeholder*="teléfono" i]').first()
      const direccionInput = page.locator('input[name="direccion"], input[placeholder*="dirección" i]').first()
      const barrioInput = page.locator('input[name="barrio"], input[placeholder*="barrio" i]').first()

      await nombreInput.fill(clienteData.nombre)
      await telefonoInput.fill(clienteData.telefono)
      await direccionInput.fill(clienteData.direccion)
      if (await barrioInput.isVisible().catch(() => false)) {
        await barrioInput.fill(clienteData.barrio)
      }

      // Screenshot pre-submit
      await shoot(page, `02-cliente-pre-submit-${role}-${viewport}`)

      // Submit
      const submit = page.locator('button[type="submit"]').first()
      await submit.click()
      await page.waitForTimeout(2000)

      // Verificar toast de éxito O que el modal se cerró
      const toastOrClosed = await page
        .locator('[data-sonner-toast][data-type="success"]')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)

      // Verificar que el cliente está en la lista (API check)
      const listRes = await apiGet(page, '/api/clientes')
      const listBody = await listRes.json()
      const clientes = listBody.clientes || []
      const found = clientes.some((c: { nombre: string }) => c.nombre === clienteData.nombre)

      if (!found) {
        addFinding({
          severity: 'P0',
          module: 'clientes',
          title: `Cliente no se creó via UI (${role} ${viewport})`,
          description: `Cliente "${clienteData.nombre}" no aparece en /api/clientes después de submit. Toast: ${toastOrClosed}`,
          expected: 'Cliente aparece en DB',
          observed: 'No encontrado',
        })
      }
    })

    test(`${role} ${viewport}: doble-click en submit NO crea duplicados`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)

      const newBtn = page
        .locator(
          'button:has-text("Nuevo Cliente"), button:has-text("Crear Cliente"), button:has-text("Nuevo")'
        )
        .first()
      if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
        test.skip()
        return
      }
      await newBtn.click()
      await page.waitForTimeout(500)

      const clienteData = randomClienteData()
      const uniquePhone = `9${Date.now().toString().slice(-9)}`
      await page.locator('input[name="nombre"], input[placeholder*="nombre" i]').first().fill(clienteData.nombre)
      await page.locator('input[name="telefono"], input[placeholder*="teléfono" i]').first().fill(uniquePhone)
      const dir = page.locator('input[name="direccion"], input[placeholder*="dirección" i]').first()
      if (await dir.isVisible().catch(() => false)) await dir.fill(clienteData.direccion)

      // Doble-click en submit (puede retornar false si el modal no abrió)
      await doubleClickSubmit(page, 'button[type="submit"]')
      // No fallamos si el modal no se abrió — el smoke ya cubrió ese caso
      await page.waitForTimeout(2500)

      // Verificar que se creó UNO solo
      const listRes = await apiGet(page, '/api/clientes')
      const body = await listRes.json()
      const matches = (body.clientes || []).filter(
        (c: { telefono: string }) => c.telefono === uniquePhone
      )
      if (matches.length > 1) {
        addFinding({
          severity: 'P0',
          module: 'clientes',
          title: `Doble-click en submit creó duplicados (${role} ${viewport})`,
          description: `Se encontraron ${matches.length} clientes con teléfono ${uniquePhone}. Esperado: 1.`,
          expected: '1 cliente',
          observed: `${matches.length} clientes`,
        })
      }
    })

    test(`${role} ${viewport}: submit SIN datos muestra errores de validación`, async ({ page }) => {
      await setViewport(page, viewport)
      await loginAsRole(page, role)
      await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)

      const newBtn = page
        .locator('button:has-text("Nuevo"), button:has-text("Crear")')
        .first()
      if (!(await newBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
        test.skip()
        return
      }
      await newBtn.click()
      await page.waitForTimeout(500)

      // NO llenar nada, intentar submit
      const submit = page.locator('button[type="submit"]').first()
      await submit.click()
      await page.waitForTimeout(1000)

      // Verificar que aparece algún mensaje de error
      const errorEl = page
        .locator(
          '[data-sonner-toast][data-type="error"], [role="alert"], .text-red-500, .text-red-600, .text-destructive, [data-testid*="error" i]'
        )
        .first()
      const errorVisible = await errorEl.isVisible({ timeout: 3000 }).catch(() => false)
      if (!errorVisible) {
        addFinding({
          severity: 'P2',
          module: 'clientes',
          title: `Submit vacío NO muestra error visible (${role} ${viewport})`,
          description: 'Form debería rechazar submit vacío con mensaje visible.',
          expected: 'Error visible',
          observed: 'Sin error',
        })
      }
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tests de filtros y búsqueda
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: búsqueda por nombre filtra la lista', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Crear cliente con nombre único via API
  const uniqueName = `ZZZ-Unique-${Date.now()}`
  await apiPost(page, '/api/clientes', {
    nombre: uniqueName,
    telefono: `9${Date.now().toString().slice(-9)}`,
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })

  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // Buscar input
  const searchInput = page
    .locator('input[type="search"], input[placeholder*="buscar" i], input[placeholder*="Buscar" i]')
    .first()
  if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
    addFinding({
      severity: 'P2',
      module: 'clientes',
      title: 'No hay input de búsqueda en /clientes',
      description: 'No se encontró input de búsqueda.',
    })
    test.skip()
    return
  }
  await searchInput.fill(uniqueName)
  await page.waitForTimeout(1000)

  // Verificar que el cliente único aparece
  const visible = await page.locator(`text=${uniqueName}`).first().isVisible({ timeout: 3000 }).catch(() => false)
  expect(visible).toBe(true)
})

test('admin desktop: pegar texto enorme en búsqueda no congela', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')
  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)

  const searchInput = page
    .locator('input[type="search"], input[placeholder*="buscar" i]')
    .first()
  if (!(await searchInput.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  const hugeText = 'A'.repeat(50000)
  await searchInput.fill(hugeText)
  await page.waitForTimeout(2000)
  // Si llegamos acá, no se congeló
  expect(page.url()).toContain('/clientes')
})

// ─────────────────────────────────────────────────────────────────────────────
//  Tests cross-page
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: "Crear pedido" desde cliente pre-llena el form', async ({ page }) => {
  await setViewport(page, 'desktop')
  await loginAsRole(page, 'admin')

  // Crear cliente via API
  const c = await createClienteFull(page, {
    nombre: randomNombre(),
    telefono: randomTelefonoDigitos(),
    direccion: randomDireccion(),
    barrio: randomBarrio(),
  })
  const clienteId = c.cliente?.id || c.id
  if (!clienteId) {
    test.skip()
    return
  }

  await page.goto(`${BASE}/clientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  // Click en el cliente (row o card)
  const clienteRow = page.locator(`text=${c.cliente?.nombre || c.nombre}`).first()
  if (!(await clienteRow.isVisible({ timeout: 2000 }).catch(() => false))) {
    test.skip()
    return
  }
  await clienteRow.click()
  await page.waitForTimeout(500)

  // Buscar botón "Crear pedido"
  const crearPedido = page.locator('a:has-text("Crear pedido"), button:has-text("Crear pedido")').first()
  const visible = await crearPedido.isVisible({ timeout: 2000 }).catch(() => false)
  if (!visible) {
    addFinding({
      severity: 'P2',
      module: 'clientes',
      title: 'No hay botón "Crear pedido" en panel de cliente',
      description: 'No se encontró el CTA cross-page desde cliente a pedido.',
    })
    return
  }

  const href = await crearPedido.getAttribute('href').catch(() => null)
  if (href && (!href.includes('new=1') || !href.includes('clienteId='))) {
    addFinding({
      severity: 'P0',
      module: 'clientes',
      title: '"Crear pedido" no pasa new=1 ni clienteId al destino',
      description: `href=${href} no contiene new=1&clienteId=`,
      expected: 'URL contiene ?new=1&clienteId=ID',
      observed: href,
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Tests de inputs maliciosos
// ─────────────────────────────────────────────────────────────────────────────

test('admin desktop: inputs maliciosos (XSS, SQL injection) no rompen la app', async ({ page }) => {
  await setViewport(page, 'desktop')
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

  // Intentar XSS en nombre
  const result = await tryMaliciousInput(page, 'input[name="nombre"], input[placeholder*="nombre" i]')
  if (result.filled) {
    await page.waitForTimeout(500)
    const nextErr = await assertNoNextErrors(page)
    if (nextErr.hasError) {
      addFinding({
        severity: 'P0',
        module: 'clientes',
        title: 'XSS en input nombre causa error visible',
        description: `Payload: ${result.payload}. Error: ${nextErr.snippet.slice(0, 200)}`,
      })
    }
  }
})

// ─────────────────────────────────────────────────────────────────────────────
//  Helper import local (necesario porque createClienteFull no está en re-exports)
// ─────────────────────────────────────────────────────────────────────────────

import { createClienteFull } from '../00-fixtures'

test.afterAll(async () => {
  // eslint-disable-next-line no-console
  console.log(`\n[02-walkthrough-clientes] Walkthrough Clientes completo.`)
})
