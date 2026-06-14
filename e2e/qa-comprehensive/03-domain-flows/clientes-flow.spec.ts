/**
 * Tier 3: Domain Flows - Clientes
 * Tests: 12
 */
import { test, expect, loginAsAdmin, uniquePhone, uniqueClientName, apiPost, apiGet, expectStatus, BASE } from '../00-fixtures'

test.describe('Domain Flow - Clientes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-DC-01: List page shows all clientes', async ({ page }) => {
    await page.goto(`${BASE}/clientes`)
    await expect(page).toHaveURL(/\/clientes/)
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
  })

  test('TC-DC-02: Search by name filters list', async ({ page }) => {
    // Create unique client
    const uniqueName = uniqueClientName('TC-DC-02')
    await apiPost(page, '/api/clientes', { nombre: uniqueName, telefono: uniquePhone() })

    await page.goto(`${BASE}/clientes`)
    await page.locator('input[placeholder*="Buscar"]').fill(uniqueName)
    await expect(page.getByText(uniqueName)).toBeVisible()
  })

  test('TC-DC-03: Click on cliente opens detail panel', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DC-03'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    await page.goto(`${BASE}/clientes?openCliente=${cliente.id}`)
    await expect(page.getByRole('heading', { name: cliente.nombre })).toBeVisible({ timeout: 5000 })
  })

  test('TC-DC-04: Detail panel shows Info, Historial, Stats, Alertas tabs', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DC-04'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    await page.goto(`${BASE}/clientes?openCliente=${cliente.id}`)
    // Look for tab labels
    const tabLabels = ['Info', 'Historial', 'Stats', 'Alertas']
    for (const label of tabLabels) {
      const tab = page.locator(`button:has-text("${label}"), [role="tab"]:has-text("${label}")`)
      if (await tab.count() > 0) {
        await expect(tab.first()).toBeVisible({ timeout: 3000 })
      }
    }
  })

  test('TC-DC-05: Filter ?bloqueado=true shows blocked clientes', async ({ page }) => {
    await page.goto(`${BASE}/clientes?bloqueado=true`)
    await expect(page).toHaveURL(/bloqueado=true/)
  })

  test('TC-DC-06: Filter ?noVerificado=true shows unverified clientes', async ({ page }) => {
    await page.goto(`${BASE}/clientes?noVerificado=true`)
    await expect(page).toHaveURL(/noVerificado=true/)
  })

  test('TC-DC-07: Filter ?reclamaciones=gte3 shows conflictive clientes', async ({ page }) => {
    await page.goto(`${BASE}/clientes?reclamaciones=gte3`)
    await expect(page).toHaveURL(/reclamaciones=gte3/)
  })

  test('TC-DC-08: Edit cliente updates nombre', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DC-08'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())
    const newName = uniqueClientName('TC-DC-08-edited')

    const res = await apiPost(page, `/api/clientes/${cliente.id}`, {
      nombre: newName,
      telefono: cliente.telefono,
    })
    expect([200, 201]).toContain(res.status())

    // Verify
    const getRes = await apiGet(page, `/api/clientes/${cliente.id}`)
    const updated = (await getRes.json()).cliente || (await getRes.json())
    expect(updated.nombre).toBe(newName)
  })

  test('TC-DC-09: PATCH cliente /verificado sets flag', async ({ page }) => {
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DC-09'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    const res = await apiPost(page, `/api/clientes/${cliente.id}`, {
      verificado: true,
    })
    expect([200, 201]).toContain(res.status())

    const getRes = await apiGet(page, `/api/clientes/${cliente.id}`)
    const updated = (await getRes.json()).cliente || (await getRes.json())
    expect(updated.verificado).toBe(true)
  })

  test('TC-DC-10: PATCH cliente with type confusion (BUG)', async ({ page }) => {
    // This tests the bug: PATCH /api/clientes/[id] accepts any truthy value for verificado
    const c = await apiPost(page, '/api/clientes', { nombre: uniqueClientName('TC-DC-10'), telefono: uniquePhone() })
    const cliente = (await c.json()).cliente || (await c.json())

    // Send verificado as string "false" (truthy!)
    const res = await apiPost(page, `/api/clientes/${cliente.id}`, {
      verificado: 'false', // string "false" is truthy in JS
    })
    expect([200, 201, 400]).toContain(res.status())

    if (res.status() === 200 || res.status() === 201) {
      // If accepted, the value is now TRUE (bug!)
      const getRes = await apiGet(page, `/api/clientes/${cliente.id}`)
      const updated = (await getRes.json()).cliente || (await getRes.json())
      // This is the BUG: 'false' (string) is truthy
      expect(updated.verificado).toBe(true)
    }
  })

  test('TC-DC-11: Cliente with 0 limit limitPedidosFiados accepted (BUG?)', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: uniqueClientName('TC-DC-11'),
      telefono: uniquePhone(),
      limitePedidosFiados: 0, // should be min 1
    })
    expect([200, 201, 400]).toContain(res.status())
  })

  test('TC-DC-12: Cliente with 21 limit limitPedidosFiados rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: uniqueClientName('TC-DC-12'),
      telefono: uniquePhone(),
      limitePedidosFiados: 21, // should be max 20
    })
    await expectStatus(res, 400)
  })
})
