/**
 * Tier 2: Forms Validation - Compra Form
 * Tests: 6
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, apiGet } from '../00-fixtures'

test.describe('Form Validation - Compra', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-CM-01: Create compra with valid data', async ({ page }) => {
    // Get insumo and proveedor
    const ins = (await (await apiGet(page, '/api/insumos')).json()).insumos?.[0]
    const prov = (await (await apiGet(page, '/api/proveedores')).json()).proveedores?.[0]

    if (!ins || !prov) {
      // Create fresh
      const pRes = await apiPost(page, '/api/proveedores', { nombre: `Prov QA ${Date.now() % 1000}` })
      const iRes = await apiPost(page, '/api/insumos', { nombre: `Insumo QA ${Date.now() % 1000}`, unidad: 'UNIDAD' })
      const prov = (await pRes.json()).proveedor || (await pRes.json())
      const ins = (await iRes.json()).insumo || (await iRes.json())

      const res = await apiPost(page, '/api/compras', {
        proveedorId: prov.id,
        insumoId: ins.id,
        cantidad: 10,
        montoTotal: 50000,
      })
      await expectStatus(res, [200, 201])
    } else {
      const res = await apiPost(page, '/api/compras', {
        proveedorId: prov.id,
        insumoId: ins.id,
        cantidad: 10,
        montoTotal: 50000,
      })
      await expectStatus(res, [200, 201])
    }
  })

  test('TC-CM-02: Compra with zero cantidad is rejected', async ({ page }) => {
    const pRes = await apiPost(page, '/api/proveedores', { nombre: `Prov CM-02 ${Date.now()}` })
    const iRes = await apiPost(page, '/api/insumos', { nombre: `Insumo CM-02 ${Date.now()}`, unidad: 'UNIDAD' })
    const prov = (await pRes.json()).proveedor || (await pRes.json())
    const ins = (await iRes.json()).insumo || (await iRes.json())

    const res = await apiPost(page, '/api/compras', {
      proveedorId: prov.id,
      insumoId: ins.id,
      cantidad: 0,
      montoTotal: 5000,
    })
    await expectStatus(res, 400)
  })

  test('TC-CM-03: Compra with negative monto is rejected', async ({ page }) => {
    const pRes = await apiPost(page, '/api/proveedores', { nombre: `Prov CM-03 ${Date.now()}` })
    const iRes = await apiPost(page, '/api/insumos', { nombre: `Insumo CM-03 ${Date.now()}`, unidad: 'UNIDAD' })
    const prov = (await pRes.json()).proveedor || (await pRes.json())
    const ins = (await iRes.json()).insumo || (await iRes.json())

    const res = await apiPost(page, '/api/compras', {
      proveedorId: prov.id,
      insumoId: ins.id,
      cantidad: 5,
      montoTotal: -1000,
    })
    await expectStatus(res, 400)
  })

  test('TC-CM-04: Compra with non-existent insumo is rejected', async ({ page }) => {
    const pRes = await apiPost(page, '/api/proveedores', { nombre: `Prov CM-04 ${Date.now()}` })
    const prov = (await pRes.json()).proveedor || (await pRes.json())

    const res = await apiPost(page, '/api/compras', {
      proveedorId: prov.id,
      insumoId: 'no-existe',
      cantidad: 1,
      montoTotal: 1000,
    })
    await expectStatus(res, [400, 404, 422, 500])
  })

  test('TC-CM-05: Compra with non-existent proveedor is rejected', async ({ page }) => {
    const iRes = await apiPost(page, '/api/insumos', { nombre: `Insumo CM-05 ${Date.now()}`, unidad: 'UNIDAD' })
    const ins = (await iRes.json()).insumo || (await iRes.json())

    const res = await apiPost(page, '/api/compras', {
      proveedorId: 'no-existe',
      insumoId: ins.id,
      cantidad: 1,
      montoTotal: 1000,
    })
    await expectStatus(res, [400, 404, 422, 500])
  })

  test('TC-CM-06: /compras page loads', async ({ page }) => {
    await page.goto(`${BASE}/compras`)
    await expect(page).toHaveURL(/\/compras/)
    await expect(page.getByRole('heading', { name: /Compras/ })).toBeVisible({ timeout: 5000 })
  })
})
