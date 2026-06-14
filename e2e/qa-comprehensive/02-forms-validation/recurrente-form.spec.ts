/**
 * Tier 2: Forms Validation - Recurrente Form
 * Tests: 10
 */
import { test, expect, loginAsAdmin, apiPost, apiGet, apiPut, expectStatus, BASE, getFirstCliente, uniqueClientName, uniquePhone } from '../00-fixtures'

test.describe('Form Validation - Recurrente', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-RC-01: Create recurrente with valid data', async ({ page }) => {
    const cliente = await getFirstCliente(page)
    const clienteId = cliente?.id
    if (!clienteId) {
      test.skip()
      return
    }

    const res = await apiPost(page, '/api/recurrentes', {
      clienteId,
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
      productos: { PACA_AGUA: 2, PACA_HIELO: 1 },
    })
    // May conflict if cliente already has plantilla
    await expectStatus(res, [200, 201, 409])
  })

  test('TC-RC-02: Recurrente without clienteId is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/recurrentes', {
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-RC-03: Recurrente with invalid cadaNDias (0) is rejected', async ({ page }) => {
    const cliente = await getFirstCliente(page)
    const clienteId = cliente?.id
    if (!clienteId) { test.skip(); return }

    const res = await apiPost(page, '/api/recurrentes', {
      clienteId,
      cadaNDias: 0,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
    })
    await expectStatus(res, [400, 422, 500])
  })

  test('TC-RC-04: Recurrente with negative cadaNDias is rejected', async ({ page }) => {
    const cliente = await getFirstCliente(page)
    const clienteId = cliente?.id
    if (!clienteId) { test.skip(); return }

    const res = await apiPost(page, '/api/recurrentes', {
      clienteId,
      cadaNDias: -1,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
    })
    await expectStatus(res, [400, 422, 500])
  })

  test('TC-RC-05: Recurrente with invalid canal is rejected', async ({ page }) => {
    const cliente = await getFirstCliente(page)
    const clienteId = cliente?.id
    if (!clienteId) { test.skip(); return }

    const res = await apiPost(page, '/api/recurrentes', {
      clienteId,
      cadaNDias: 7,
      canal: 'INVALIDO',
      tipo: 'ENVIO',
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-RC-06: Duplicate cliente plantilla is rejected with 409', async ({ page }) => {
    // Create first
    const cRes = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('DupPlantilla'), telefono: uniquePhone() })
    const cliente = (await cRes.json()).cliente || (await cRes.json())
    const clienteId = cliente.id

    const r1 = await apiPost(page, '/api/recurrentes', {
      clienteId,
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
      productos: { PACA_AGUA: 1 },
    })
    // First should succeed (or skip if cliente already has one)
    if (r1.status() === 409) {
      // Already has plantilla — test that second is also 409
      const r2 = await apiPost(page, '/api/recurrentes', {
        clienteId,
        cadaNDias: 7,
        canal: 'DOMICILIO',
        tipo: 'ENVIO',
        productos: { PACA_AGUA: 1 },
      })
      await expectStatus(r2, 409)
    } else {
      // Second should fail
      const r2 = await apiPost(page, '/api/recurrentes', {
        clienteId,
        cadaNDias: 7,
        canal: 'DOMICILIO',
        tipo: 'ENVIO',
        productos: { PACA_AGUA: 1 },
      })
      await expectStatus(r2, 409)
    }
  })

  test('TC-RC-07: Recurrente can be updated', async ({ page }) => {
    // Get first recurrente
    const listRes = await apiGet(page, '/api/recurrentes')
    const list = (await listRes.json()).plantillas || []
    if (list.length === 0) {
      test.skip()
      return
    }
    const r = list[0]
    const updRes = await apiPut(page, `/api/recurrentes?id=${r.id}`, {
      cadaNDias: 14,
      notas: 'Updated by QA test',
    })
    await expectStatus(updRes, [200, 201])
  })

  test('TC-RC-08: Recurrente can be soft-deleted', async ({ page }) => {
    // Create one
    const cRes = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('DelPlantilla'), telefono: uniquePhone() })
    const cliente = (await cRes.json()).cliente || (await cRes.json())
    const clienteId = cliente.id

    const rRes = await apiPost(page, '/api/recurrentes', {
      clienteId,
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
      productos: { PACA_AGUA: 1 },
    })
    if (rRes.status() === 409) {
      test.skip()
      return
    }
    const r = (await rRes.json()).plantilla || (await rRes.json())

    // Delete
    // (delRes discarded — fallback POST con _method=DELETE; el resultado se
    // valida en delRes2 abajo)
    await apiPost(page, `/api/recurrentes?id=${r.id}`, { _method: 'DELETE' })
    // DELETE might be implemented as POST with action=delete or actual DELETE
    // Try DELETE
    const delRes2 = await page.request.delete(`${BASE}/api/recurrentes?id=${r.id}`)
    expect([200, 204]).toContain(delRes2.status())
  })

  test('TC-RC-09: Recurrente UI page /recurrentes loads', async ({ page }) => {
    await page.goto(`${BASE}/recurrentes`)
    await expect(page).toHaveURL(/\/recurrentes/)
    await expect(page.getByRole('heading', { name: /Recurrentes/ })).toBeVisible({ timeout: 5000 })
  })

  test('TC-RC-10: /recurrentes/nuevo form loads', async ({ page }) => {
    await page.goto(`${BASE}/recurrentes/nuevo`)
    await expect(page).toHaveURL(/\/recurrentes\/nuevo/)
    // Form should have sections
    await expect(page.locator('text=Cliente, text=Cliente:').first()).toBeVisible({ timeout: 5000 })
  })
})
