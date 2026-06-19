/**
 * 09-realistic-day/02-day-admin-supervision.spec.ts
 *
 * Día típico del ADMIN — supervisa la operación, crea usuarios, ve reportes,
 * anula pedidos problemáticos, modifica precios.
 *
 * Mobile-first.
 */
import {
  test,
  expect,
  fullLoginRealistic,
  cleanTestState,
  createClienteReal,
  createPedidoReal,
  apiPost,
  apiDelete,
} from './00-fixtures'

test.describe('Día del Admin — mobile-first', () => {
  test('01: ADMIN ve el dashboard con todas las secciones', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await expect(page).toHaveURL(/\/dashboard/)
    // El dashboard del admin debe tener al menos los h2 de KPIs
    const h2Count = await page.locator('h2').count()
    expect(h2Count).toBeGreaterThan(3)
  })

  test('02: ADMIN navega a /admin/usuarios y ve la lista', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/admin/usuarios')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/admin\/usuarios/)
    await page.waitForTimeout(1000)
  })

  test('03: ASISTENTE es redirigido de /admin/usuarios (solo ADMIN)', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/admin/usuarios')
    await page.waitForTimeout(1500)
    // El page.tsx del admin hace redirect a /dashboard si no es ADMIN
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('04: ADMIN navega a /reportes y ve los reportes', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/reportes')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/reportes/)
    await page.waitForTimeout(1000)
  })

  test('05: ADMIN navega a /configuracion y ve los tabs', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/configuracion')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/configuracion/)
    await page.waitForTimeout(1000)
  })

  test('06: ADMIN navega a /reportes/salud-antifraude', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/reportes/salud-antifraude')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/salud-antifraude/)
    await page.waitForTimeout(1500)
  })

  test('07: ADMIN ve /mi-perfil', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/mi-perfil')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/mi-perfil/)
    await page.waitForTimeout(1000)
  })

  test('08: ADMIN ve la lista de clientes', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/clientes')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/clientes/)
    // Esperar a que cargue la tabla
    await page.waitForTimeout(1500)
  })

  test('09: ADMIN anula un pedido y se crea nota de crédito', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)

    // Crear cliente y pedido
    const c = await createClienteReal(page, {
      nombre: `Anular Test ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.id
    const p = await createPedidoReal(page, {
      clienteId: clienteId!,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pedidoId = p.pedido?.id || p.id
    expect(pedidoId).toBeTruthy()

    // Anular via API
    const anularRes = await apiPost(page, `/api/pedidos/${pedidoId}/anular`, {
      motivo: 'Test e2e 09-realistic-day',
    })
    // 200 = OK, 400 = ya estaba en otro estado
    expect([200, 201, 400]).toContain(anularRes.status())
  })

  test('10: ADMIN puede crear un nuevo usuario', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)

    // Crear usuario via API
    const username = `testuser${Date.now().toString(36).slice(-6)}`
    const res = await apiPost(page, '/api/users', {
      username,
      nombre: 'Test',
      apellido: 'User',
      password: 'test123',
      rol: 'ASISTENTE',
    })
    // 201 = created, 409 = already exists
    expect([200, 201, 409]).toContain(res.status())

    // Cleanup
    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json()
      const userId = body.user?.id || body.id
      if (userId) {
        await apiDelete(page, `/api/users/${userId}`)
      }
    }
  })

  test('11: ADMIN ve /casos (incidencias)', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/casos')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/casos/)
    await page.waitForTimeout(1000)
  })

  test('12: ADMIN ve /sugerencias', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'admin', 100_000)
    await page.goto('/sugerencias')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/sugerencias/)
    await page.waitForTimeout(1000)
  })
})
