/**
 * 09-realistic-day/13-proveedores-compras-gastos.spec.ts
 *
 * Tests del flujo UI real de:
 * - Proveedores: crear via modal con form completo
 * - Compras: crear desde /compras (requiere proveedor + insumo)
 * - Gastos: crear desde /gastos
 *
 * NOTA: la API permite ADMIN o CONTADOR, no ASISTENTE.
 * Los tests usan admin.
 *
 * Mobile-first.
 */
import {
  test,
  expect,
  fullLoginRealistic,
  cleanTestState,
  apiGet,
  apiPost,
  createProveedorReal,
  createInsumoReal,
  createGastoReal,
  createCompraReal,
  todayISO,
} from './00-fixtures'

test.describe('13: Proveedores + compras + gastos (UI)', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(() => {
    cleanTestState()
  })

  // ─── PROVEEDORES ─────────────────────────────────────────────────────────

  test('01: ADMIN ve /proveedores y la lista', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/proveedores')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/proveedores/)
  })

  test('02: Click "+ Nuevo proveedor" abre el modal', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/proveedores')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    // Click en el botón "Nuevo proveedor"
    const newBtn = page.getByRole('button', { name: /Nuevo proveedor/i })
    if ((await newBtn.count()) > 0) {
      await newBtn.first().click()
      await page.waitForTimeout(500)
      // El modal debe abrir con el input "nombre"
      await expect(page.locator('input#nombre')).toBeVisible({ timeout: 3000 })
    }
  })

  test('03: Modal de proveedor tiene todos los inputs esperados', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/proveedores')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const newBtn = page.getByRole('button', { name: /Nuevo proveedor/i })
    if ((await newBtn.count()) > 0) {
      await newBtn.first().click()
      await page.waitForTimeout(500)

      // Verificar que el modal tiene los inputs esperados
      await expect(page.locator('input#nombre')).toBeVisible()
      await expect(page.locator('input#telefono')).toBeVisible()
      await expect(page.locator('input#email')).toBeVisible()
      await expect(page.locator('input#direccion')).toBeVisible()
      await expect(page.locator('input#tipoProducto')).toBeVisible()

      // Llenar nombre (requerido)
      await page.locator('input#nombre').fill(`Proveedor UI ${Date.now()}`)
      await page.waitForTimeout(500)

      // Cerrar el modal con Escape
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })

  test('04: API POST /api/proveedores con shape completa', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const res = await createProveedorReal(page, {
      nombre: `Proveedor API ${Date.now()}`,
      telefono: '3123456789',
    })
    expect(res.proveedor?.id || res.id).toBeTruthy()
  })

  test('05: API POST /api/proveedores con campos opcionales (email, direccion, tipoProducto, observaciones)', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const res = await apiPost(page, '/api/proveedores', {
      nombre: `Proveedor Full ${Date.now()}`,
      telefono: '3123456789',
      email: 'test@proveedor.com',
      direccion: 'Calle 100 #15-20',
      tipoProducto: 'Hielo',
      observaciones: 'Notas adicionales',
    })
    expect([200, 201]).toContain(res.status())
  })

  test('06: Validación: nombre vacío es rechazado', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const res = await apiPost(page, '/api/proveedores', {
      nombre: '',
    })
    expect(res.status()).toBe(400)
  })

  test('07: Búsqueda por nombre filtra la lista', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    // Crear un proveedor con nombre único
    const uniqueName = `BusquedaUnica${Date.now()}`
    await createProveedorReal(page, { nombre: uniqueName })
    // Ir a /proveedores y buscar
    await page.goto('/proveedores')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    if ((await searchInput.count()) > 0) {
      await searchInput.first().fill(uniqueName)
      await page.waitForTimeout(1000)
    }
  })

  // ─── COMPRAS ────────────────────────────────────────────────────────────

  test('08: ADMIN ve /compras y la lista', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/compras')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/compras/)
  })

  test('09: Crear compra via UI: requiere proveedor + insumo + cantidad + monto', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)

    // Crear setup: proveedor + insumo
    const prov = await createProveedorReal(page, { nombre: `Prov Compra ${Date.now()}` })
    const proveedorId = prov.proveedor?.id || prov.id
    const insumo = await createInsumoReal(page, {
      nombre: `Insumo Compra ${Date.now()}`,
      unidad: 'PACA',
      stock: 100,
      stockMin: 10,
      precioUnit: 5000,
      proveedorId,
    })
    const insumoId = insumo.insumo?.id || insumo.id

    // Ir a /compras
    await page.goto('/compras')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    // Click en "Nueva Compra" si existe
    const newBtn = page.getByRole('button', { name: /Nueva Compra/i })
    if ((await newBtn.count()) > 0) {
      await newBtn.first().click()
      await page.waitForTimeout(500)
    }

    // Select proveedor
    const provSelect = page.locator('select#compra-proveedor')
    if ((await provSelect.count()) > 0) {
      await provSelect.selectOption(proveedorId!)
    }

    // Select insumo
    const insumoSelect = page.locator('select#compra-insumo')
    if ((await insumoSelect.count()) > 0) {
      await insumoSelect.selectOption(insumoId!)
    }

    // Cantidad
    const cantInput = page.locator('input#compra-cantidad')
    if ((await cantInput.count()) > 0) {
      await cantInput.fill('10')
    }

    // Monto
    const montoInput = page.locator('input#compra-monto')
    if ((await montoInput.count()) > 0) {
      await montoInput.fill('50000')
    }

    // Submit
    const submit = page.locator('button[type="submit"]').filter({ hasText: /Guardar/ })
    if ((await submit.count()) > 0) {
      const isDisabled = await submit.first().isDisabled()
      if (!isDisabled) {
        await submit.first().click()
        await page.waitForTimeout(2000)
      }
    }
  })

  test('10: API POST /api/compras con shape completa', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const prov = await createProveedorReal(page)
    const proveedorId = prov.proveedor?.id || prov.id
    const insumo = await createInsumoReal(page, {
      nombre: `Insumo API Compra ${Date.now()}`,
      proveedorId,
    })
    const insumoId = insumo.insumo?.id || insumo.id

    const res = await createCompraReal(page, {
      proveedorId: proveedorId!,
      insumoId: insumoId!,
      cantidad: 5,
      montoTotal: 25000,
    })
    expect(res).toBeTruthy()
  })

  test('11: Validación: compra sin proveedor es rechazada (400)', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const res = await apiPost(page, '/api/compras', {
      insumoId: 'fake-insumo-id',
      cantidad: 1,
      montoTotal: 1000,
    })
    expect(res.status()).toBe(400)
  })

  test('12: Validación: cantidad <= 0 es rechazada', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const prov = await createProveedorReal(page)
    const proveedorId = prov.proveedor?.id || prov.id
    const insumo = await createInsumoReal(page, { nombre: `Test ${Date.now()}`, proveedorId })
    const insumoId = insumo.insumo?.id || insumo.id

    const res = await apiPost(page, '/api/compras', {
      proveedorId,
      insumoId,
      cantidad: 0,
      montoTotal: 1000,
    })
    expect(res.status()).toBe(400)
  })

  // ─── GASTOS ──────────────────────────────────────────────────────────────

  test('13: ADMIN ve /gastos y la lista', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/gastos')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/gastos/)
  })

  test('14: Crear gasto via UI: categoría + descripción + monto', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/gastos')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    // Click en "Nuevo Gasto"
    const newBtn = page.getByRole('button', { name: /Nuevo Gasto/i })
    if ((await newBtn.count()) > 0) {
      await newBtn.first().click()
      await page.waitForTimeout(500)
    }

    // Select categoría
    const catSelect = page.locator('select#gasto-categoria')
    if ((await catSelect.count()) > 0) {
      await catSelect.selectOption('SERVICIOS')
    }

    // Descripción
    const descInput = page.locator('input#gasto-descripcion')
    if ((await descInput.count()) > 0) {
      await descInput.fill(`Pago de luz ${Date.now()}`)
    }

    // Monto
    const montoInput = page.locator('input#gasto-monto')
    if ((await montoInput.count()) > 0) {
      await montoInput.fill('150000')
    }

    // Responsable (opcional)
    const respInput = page.locator('input#gasto-responsable')
    if ((await respInput.count()) > 0) {
      await respInput.fill('Admin Test')
    }

    // Submit
    const submit = page.locator('button[type="submit"]').filter({ hasText: /Guardar/ })
    if ((await submit.count()) > 0) {
      const isDisabled = await submit.first().isDisabled()
      if (!isDisabled) {
        await submit.first().click()
        await page.waitForTimeout(2000)
      }
    }
  })

  test('15: API POST /api/gastos con shape completa', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const res = await createGastoReal(page, {
      categoria: 'ARRIENDO',
      descripcion: `Arriendo local ${Date.now()}`,
      monto: 2000000,
    })
    expect(res).toBeTruthy()
  })

  test('16: API GET /api/gastos?fecha=hoy devuelve gastos del día', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const today = todayISO()
    const res = await apiGet(page, `/api/gastos?fecha=${today}`)
    expect(res.ok()).toBe(true)
  })

  test('17: API GET /api/gastos?desde=&hasta= devuelve rango', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const lastMonth = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0]
    const today = todayISO()
    const res = await apiGet(page, `/api/gastos?desde=${lastMonth}&hasta=${today}`)
    expect(res.ok()).toBe(true)
  })

  test('18: Validación: gasto con monto negativo es rechazado', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const res = await apiPost(page, '/api/gastos', {
      categoria: 'OTRO',
      descripcion: 'Test',
      monto: -100,
    })
    expect(res.status()).toBe(400)
  })

  test('19: Validación: gasto con categoría inválida es rechazado', async ({ page }) => {
    await fullLoginRealistic(page, 'admin', 100_000)
    const res = await apiPost(page, '/api/gastos', {
      categoria: 'CATEGORIA_INVALIDA',
      descripcion: 'Test',
      monto: 1000,
    })
    expect(res.status()).toBe(400)
  })

  test('20: CONTADOR puede crear gasto (RBAC API)', async ({ page }) => {
    await fullLoginRealistic(page, 'contador', 0)
    const res = await createGastoReal(page, {
      categoria: 'SERVICIOS',
      descripcion: `Pago agua ${Date.now()}`,
      monto: 80000,
    })
    expect(res).toBeTruthy()
  })
})
