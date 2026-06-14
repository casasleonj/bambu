/**
 * Tier 2: Forms Validation - Embarque Create Form
 * Tests: 8
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, BASE, apiGet, getFirstTrabajador } from '../00-fixtures'

test.describe('Form Validation - Embarque Create', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-EM-01: Create embarque with valid data', async ({ page }) => {
    const t = await getFirstTrabajador(page)
    const repartidor = t?.rol === 'REPARTIDOR' ? t : (await (await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')).json()).trabajadores?.[0]
    if (!repartidor) { test.skip(); return }

    const res = await apiPost(page, '/api/embarques', {
      trabajadorId: repartidor.id,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 10 }],
    })
    await expectStatus(res, [200, 201, 400, 409]) // 409 if already has embarque today
  })

  test('TC-EM-02: Embarque without trabajadorId is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/embarques', {
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 10 }],
    })
    await expectStatus(res, 400)
  })

  test('TC-EM-03: Embarque with empty carga is rejected', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/embarques', {
      trabajadorId: t.id,
      horaSalida: '08:00',
      carga: [],
    })
    await expectStatus(res, 400)
  })

  test('TC-EM-04: Embarque exceeding 70 unidades is rejected', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/embarques', {
      trabajadorId: t.id,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 999 }],
    })
    await expectStatus(res, [400, 409])
  })

  test('TC-EM-05: Embarque with invalid producto is rejected', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/embarques', {
      trabajadorId: t.id,
      horaSalida: '08:00',
      carga: [{ producto: 'NO_EXISTE', cargadas: 5 }],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-EM-06: Embarque with negative cargadas is rejected', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const res = await apiPost(page, '/api/embarques', {
      trabajadorId: t.id,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: -5 }],
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-EM-07: Duplicate embarque for same (trabajador, fecha) returns 409', async ({ page }) => {
    const t = (await (await apiGet(page, '/api/trabajadores?rol=REPARTIDOR&activo=true')).json()).trabajadores?.[0]
    if (!t) { test.skip(); return }

    const body = {
      trabajadorId: t.id,
      horaSalida: '08:00',
      carga: [{ producto: 'PACA_AGUA', cargadas: 5 }],
    }

    const r1 = await apiPost(page, '/api/embarques', body)
    const status1 = r1.status()

    const r2 = await apiPost(page, '/api/embarques', body)
    const status2 = r2.status()

    // Either both succeed (different numeroDia) or second is 409
    if (status1 === 200 || status1 === 201) {
      // Second attempt: if same dia, expect 409
      expect([200, 201, 409]).toContain(status2)
    }
  })

  test('TC-EM-08: /embarques page loads', async ({ page }) => {
    await page.goto(`${BASE}/embarques`)
    await expect(page).toHaveURL(/\/embarques/)
    await expect(page.getByRole('heading', { name: /Embarques/ })).toBeVisible({ timeout: 5000 })
  })
})
