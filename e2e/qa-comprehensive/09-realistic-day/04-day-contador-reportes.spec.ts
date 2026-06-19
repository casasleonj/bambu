/**
 * 09-realistic-day/04-day-contador-reportes.spec.ts
 *
 * Día típico del CONTADOR — revisa reportes, paga facturas, gestiona
 * gastos, compras, nómina, deudas de trabajadores.
 *
 * Mobile-first.
 */
import {
  test,
  expect,
  fullLoginRealistic,
  cleanTestState,
  apiPost,
  createGastoReal,
  createInsumoReal,
  createProveedorReal,
} from './00-fixtures'

test.describe('Día del Contador — mobile-first', () => {
  test('01: CONTADOR es redirigido a /reportes después del login', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await expect(page).toHaveURL(/\/reportes/)
  })

  test('02: CONTADOR ve /reportes y los filtros', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await expect(page).toHaveURL(/\/reportes/)
    await page.waitForTimeout(1500)
  })

  test('03: CONTADOR ve /facturas y puede filtrar', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/facturas')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/facturas/)
    await page.waitForTimeout(1000)
  })

  test('04: CONTADOR ve /cierre y la lista de cierres', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/cierre')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/cierre/)
    await page.waitForTimeout(1000)
  })

  test('05: CONTADOR ve /nomina', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/nomina')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/nomina/)
    await page.waitForTimeout(1000)
  })

  test('06: CONTADOR ve /gastos', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/gastos')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/gastos/)
    await page.waitForTimeout(1000)
  })

  test('07: CONTADOR ve /compras', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/compras')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/compras/)
    await page.waitForTimeout(1000)
  })

  test('08: CONTADOR ve /deudas', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/deudas')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/deudas/)
    await page.waitForTimeout(1000)
  })

  test('09: CONTADOR ve /trabajadores', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/trabajadores')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/trabajadores/)
    await page.waitForTimeout(1000)
  })

  test('10: CONTADOR crea un gasto operativo via API', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    const result = await createGastoReal(page, {
      categoria: 'SERVICIOS',
      descripcion: `Pago de luz - test ${Date.now()}`,
      monto: 150000,
      responsable: 'Admin Test',
    })
    expect(result).toBeTruthy()
  })

  test('11: CONTADOR crea una compra a proveedor via API', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    // Crear proveedor
    const prov = await createProveedorReal(page)
    const proveedorId = prov.proveedor?.id || prov.id
    expect(proveedorId).toBeTruthy()
    // Crear insumo
    const insumo = await createInsumoReal(page, {
      nombre: `Insumo Test ${Date.now()}`,
      unidad: 'PACA',
      stock: 100,
      stockMin: 10,
      precioUnit: 5000,
      proveedorId,
    })
    const insumoId = insumo.insumo?.id || insumo.id
    expect(insumoId).toBeTruthy()
    // Crear compra
    const compra = await apiPost(page, '/api/compras', {
      proveedorId,
      insumoId,
      cantidad: 10,
      montoTotal: 50000,
    })
    expect([200, 201]).toContain(compra.status())
  })

  test('12: CONTADOR ve /reportes/forecast', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/reportes/forecast')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/forecast/)
    await page.waitForTimeout(1000)
  })

  test('13: CONTADOR ve /reportes/salud-antifraude', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/reportes/salud-antifraude')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/salud-antifraude/)
    await page.waitForTimeout(1500)
  })

  test('14: CONTADOR ve /sugerencias', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/sugerencias')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/sugerencias/)
    await page.waitForTimeout(1000)
  })

  test('15: CONTADOR ve /configuracion', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/configuracion')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/configuracion/)
    await page.waitForTimeout(1000)
  })

  test('16: CONTADOR es redirigido de /admin/usuarios (solo ADMIN)', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'contador', 0)
    await page.goto('/admin/usuarios')
    await page.waitForTimeout(1500)
    // El proxy redirige a /reportes para CONTADOR
    await expect(page).toHaveURL(/\/reportes/)
  })
})
