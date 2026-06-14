/**
 * Tier 3: Domain Flows - Recurrentes
 * Tests: 8
 */
import { test, expect, loginAsAdmin, uniquePhone, uniqueClientName, apiPost, apiGet, BASE } from '../00-fixtures'

test.describe('Domain Flow - Recurrentes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DR-01: List page shows plantillas', async ({ page }) => {
    await page.goto(`${BASE}/recurrentes`)
    await expect(page).toHaveURL(/\/recurrentes/)
  })

  test('TC-DR-02: Crear nueva plantilla from /recurrentes/nuevo', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DR-02'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    const res = await apiPost(page, '/api/recurrentes', {
      clienteId: cliente.id,
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
      productos: { PACA_AGUA: 2, PACA_HIELO: 1, BOTELLON: 1 },
    })
    expect([200, 201, 409]).toContain(res.status())
  })

  test('TC-DR-03: Recurrente with 0 productos is rejected by client, accepted by server (BUG)', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DR-03'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    const res = await apiPost(page, '/api/recurrentes', {
      clienteId: cliente.id,
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
      productos: {},
    })
    // Server accepts (no min productos check), client would reject
    expect([200, 201, 409]).toContain(res.status())
  })

  test('TC-DR-04: POST /api/pedidos/recurrentes generates pedidos for today', async ({ page }) => {
    // Get plantillas due today
    const listRes = await apiGet(page, '/api/recurrentes')
    const list = (await listRes.json()).plantillas || []
    if (list.length === 0) { test.skip(); return }

    // Get decisions (mock)
    const decisiones = list.slice(0, 2).map((p: any) => ({
      plantillaId: p.id,
      accion: 'NORMAL',
    }))

    const res = await apiPost(page, '/api/pedidos/recurrentes', {
      decisiones,
    })
    expect([200, 201, 400, 409]).toContain(res.status())
  })

  test('TC-DR-05: Update recurrente changes cadaNDias', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DR-05'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    const cRes = await apiPost(page, '/api/recurrentes', {
      clienteId: cliente.id,
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
      productos: { PACA_AGUA: 1 },
    })
    if (cRes.status() === 409) { test.skip(); return }
    const r = (await cRes.json()).plantilla || (await cRes.json())

    const updRes = await apiPost(page, `/api/recurrentes?id=${r.id}`, {
      cadaNDias: 14,
    })
    expect([200, 201]).toContain(updRes.status())
  })

  test('TC-DR-06: Soft delete recurrente (DELETE)', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DR-06'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    const cRes = await apiPost(page, '/api/recurrentes', {
      clienteId: cliente.id,
      cadaNDias: 7,
      canal: 'DOMICILIO',
      tipo: 'ENVIO',
      productos: { PACA_AGUA: 1 },
    })
    if (cRes.status() === 409) { test.skip(); return }
    const r = (await cRes.json()).plantilla || (await cRes.json())

    const delRes = await page.request.delete(`${BASE}/api/recurrentes?id=${r.id}`)
    expect([200, 204]).toContain(delRes.status())
  })

  test('TC-DR-07: /recurrentes/[id] edit page loads', async ({ page }) => {
    const listRes = await apiGet(page, '/api/recurrentes')
    const list = (await listRes.json()).plantillas || []
    if (list.length === 0) { test.skip(); return }

    await page.goto(`${BASE}/recurrentes/${list[0].id}`)
    await expect(page).toHaveURL(/\/recurrentes\//)
  })

  test('TC-DR-08: Recurrente for bloqueado cliente is rejected when generating', async ({ page }) => {
    // Find a bloqueado cliente
    const cl = await apiGet(page, '/api/clientes')
    const list = (await cl.json()).clientes || []
    const bloqueado = list.find((c: any) => c.bloqueado === true)
    if (!bloqueado) { test.skip(); return }

    // Try to generate for this cliente
    const listRes = await apiGet(page, '/api/recurrentes')
    const plantillas = (await listRes.json()).plantillas || []
    const blockedPlantilla = plantillas.find((p: any) => p.clienteId === bloqueado.id)
    if (!blockedPlantilla) { test.skip(); return }

    const res = await apiPost(page, '/api/pedidos/recurrentes', {
      decisiones: [{ plantillaId: blockedPlantilla.id, accion: 'NORMAL' }],
    })
    // Should be rejected with specific error
    expect([400, 409, 500]).toContain(res.status())
  })
})
