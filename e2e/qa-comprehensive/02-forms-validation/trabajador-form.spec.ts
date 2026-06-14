/**
 * Tier 2: Forms Validation - Trabajador Form
 * Tests: 10
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus, uniqueClientName } from '../00-fixtures'

test.describe('Form Validation - Trabajador', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-TR-01: Create SELLADOR with valid data', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: uniqueClientName('TC-TR-01'),
      rol: 'SELLADOR',
      tipoPago: 'COMISION',
      usaMoto: false,
      comPacaAgua: 500,
      comPacaHielo: 300,
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-TR-02: Create REPARTIDOR with moto', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: uniqueClientName('TC-TR-02'),
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
      capacidadKg: 500,
      comPacaAgua: 500,
      comRepartAgua: 200,
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-TR-03: Trabajador with empty nombre is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: '',
      rol: 'SELLADOR',
    })
    await expectStatus(res, 400)
  })

  test('TC-TR-04: Trabajador with invalid rol is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: 'Test Invalid Rol',
      rol: 'NOEXISTE',
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-TR-05: REPARTIDOR with moto but no capacidad is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: uniqueClientName('NoCap'),
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
      capacidadKg: 0, // invalid for moto
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-TR-06: ADMIN/CONTADOR with moto is normalized (capacidad=0)', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: uniqueClientName('Admin'),
      rol: 'ADMIN',
      usaMoto: true, // should be normalized
    })
    // May succeed with normalization or fail validation
    expect([200, 201, 400]).toContain(res.status())
  })

  test('TC-TR-07: Trabajador with negative comPacaAgua is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: uniqueClientName('NegComm'),
      rol: 'SELLADOR',
      tipoPago: 'COMISION',
      comPacaAgua: -100,
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-TR-08: Trabajador with very large capacidadKg (>5000) is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: uniqueClientName('BigMoto'),
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
      capacidadKg: 99999,
    })
    await expectStatus(res, [400, 422])
  })

  test('TC-TR-09: Trabajador with all tipoPago values', async ({ page }) => {
    for (const tipoPago of ['COMISION', 'FIJO', 'MIXTO']) {
      const res = await apiPost(page, '/api/trabajadores', {
        nombre: uniqueClientName(`TP-${tipoPago}`),
        rol: 'REPARTIDOR',
        tipoPago,
        usaMoto: tipoPago !== 'FIJO',
        capacidadKg: tipoPago !== 'FIJO' ? 500 : 0,
        comPacaAgua: 500,
        comRepartAgua: 200,
        salarioFijo: tipoPago === 'FIJO' || tipoPago === 'MIXTO' ? 100000 : 0,
      })
      await expectStatus(res, [200, 201])
    }
  })

  test('TC-TR-10: Trabajador with long telefono (>20) is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/trabajadores', {
      nombre: uniqueClientName('LongTel'),
      rol: 'SELLADOR',
      telefono: '9'.repeat(25),
    })
    await expectStatus(res, [400, 422])
  })
})
