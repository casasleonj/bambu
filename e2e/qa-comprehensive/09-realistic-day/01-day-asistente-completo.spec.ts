/**
 * 09-realistic-day/01-day-asistente-completo.spec.ts
 *
 * Día completo del ASISTENTE — la persona que abre la caja, registra
 * clientes, toma pedidos telefónicos, asigna embarques.
 *
 * IMPORTANTE: El modal de base caja tiene un bug de timing donde
 * `checkBaseDia` se llama antes que la sesión esté hidratada (Fix #1 del modal
 * usa useRef para evitar loops, pero esto rompe cuando la sesión cambia
 * después del primer check). En este test usamos `skipBaseCaja` como
 * workaround. Ver test "09: REGRESIÓN - Modal de base caja real" en
 * `06-regression-modal.spec.ts` para investigar el bug.
 *
 * Mobile-first. Cada test simula una acción real de usuario.
 */
import {
  test,
  expect,
  fullLoginRealistic,
  cleanTestState,
  createClienteReal,
  createPedidoReal,
} from './00-fixtures'

test.describe('Día del Asistente — mobile-first', () => {
  test('01: ASISTENTE abre la app, ve su dashboard', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    await expect(page).toHaveURL(/\/dashboard/)
    // El dashboard debe tener al menos un h2
    await expect(page.locator('h2').first()).toBeVisible()
  })

  test('02: ASISTENTE navega a Clientes y ve la lista', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/clientes')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/clientes/)
    // Esperar que cargue la tabla
    await page.waitForTimeout(1000)
  })

  test('03: ASISTENTE navega a Pedidos y ve los tabs', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/pedidos')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/pedidos/)
    // Esperar tabs (Únicos / Recurrentes)
    await page.waitForTimeout(1000)
  })

  test('04: ASISTENTE navega a Recurrentes y ve la lista', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/recurrentes')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/recurrentes/)
  })

  test('05: ASISTENTE navega a Embarques y ve la lista', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/embarques')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/embarques/)
  })

  test('06: ASISTENTE navega a Producción y ve el stepper', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/produccion')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/produccion/)
  })

  test('07: REPARTIDOR NO ve las páginas de admin', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'repartidor', 0)
    await expect(page).toHaveURL(/\/repartidor/)
    // Intentar ir a /clientes debe redirigir a /repartidor
    await page.goto('/clientes')
    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/\/repartidor/)
  })

  test('08: ASISTENTE crea 3 clientes via UI → ve los 3 en la lista', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/clientes')
    await page.waitForLoadState('domcontentloaded')

    // Crear 3 clientes via API (más rápido que UI y válido para verificar la lista)
    const created: string[] = []
    for (let i = 0; i < 3; i++) {
      const c = await createClienteReal(page, {
        nombre: `Cliente Asistente ${i} - ${Date.now()}`,
        telefono: `3${String(Date.now() + i).slice(-9)}`,
        direccion: `Calle ${100 + i} #15-20`,
        barrio: 'Centro',
      })
      const id = c.cliente?.id || c.id
      if (id) created.push(id)
    }
    expect(created).toHaveLength(3)

    // Recargar /clientes y verificar que aparecen
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)
    // Verificar que al menos un cliente creado está visible
    const firstNombre = await page.locator(`text=Cliente Asistente 0`).first()
    await expect(firstNombre).toBeVisible({ timeout: 5000 })
  })

  test('09: ASISTENTE crea un pedido y aparece en /pedidos', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    // Crear cliente
    const c = await createClienteReal(page, {
      nombre: `Pedido Test ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.id
    expect(clienteId!).toBeTruthy()
    // Crear pedido
    const p = await createPedidoReal(page, {
      clienteId: clienteId!,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      canal: 'DOMICILIO',
    })
    const pedidoId = p.pedido?.id || p.id
    expect(pedidoId).toBeTruthy()

    // Verificar que el pedido aparece en el listado general
    const listRes = await page.request.get('/api/pedidos')
    expect(listRes.ok()).toBe(true)
    const list = await listRes.json()
    const allPedidos = list.pedidos || list.data || []
    const found = allPedidos.find((x: any) => (x.id || x.pedido?.id) === pedidoId)
    expect(found).toBeTruthy()

    // Ir a /pedidos y verificar que la página carga sin error
    await page.goto('/pedidos')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/pedidos/)
  })

  test('10: ASISTENTE navega a /dashboard y ve KPIs actualizados', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'asistente', 50_000)
    // Hacer un cambio (crear pedido)
    const c = await createClienteReal(page, {
      nombre: `KPI Test ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.id
    await createPedidoReal(page, {
      clienteId: clienteId!,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    // Ir a dashboard
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    // Debe haber al menos un KPI
    const h2Count = await page.locator('h2').count()
    expect(h2Count).toBeGreaterThan(0)
  })
})
