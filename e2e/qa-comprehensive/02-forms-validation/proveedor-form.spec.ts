/**
 * Tier 2: Forms Validation - Proveedor Form
 * Tests: 6
 */
import { test, loginAsAdmin, apiPost, expectStatus } from '../00-fixtures'

test.describe('Form Validation - Proveedor', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-PV-01: Create proveedor with valid data', async ({ page }) => {
    const res = await apiPost(page, '/api/proveedores', {
      nombre: `Proveedor QA ${Date.now() % 10000}`,
      telefono: '3001234567',
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-PV-02: Proveedor with empty nombre is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/proveedores', { nombre: '' })
    await expectStatus(res, 400)
  })

  test('TC-PV-03: Proveedor with invalid email is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/proveedores', {
      nombre: `Proveedor ${Date.now() % 10000}`,
      email: 'not-an-email',
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-PV-04: Proveedor with all fields', async ({ page }) => {
    const res = await apiPost(page, '/api/proveedores', {
      nombre: `Proveedor Full ${Date.now() % 10000}`,
      telefono: '3001234567',
      email: `test${Date.now()}@example.com`,
      direccion: 'Calle 123',
      tipoProducto: 'Materia prima',
      observaciones: 'Test observation',
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-PV-05: Proveedor with long nombre (100 chars) accepted', async ({ page }) => {
    const res = await apiPost(page, '/api/proveedores', {
      nombre: 'P'.repeat(100),
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-PV-06: Proveedor with nombre > 100 chars rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/proveedores', {
      nombre: 'P'.repeat(101),
    })
    await expectStatus(res, 400)
  })
})
