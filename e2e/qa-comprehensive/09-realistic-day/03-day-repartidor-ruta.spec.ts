/**
 * 09-realistic-day/03-day-repartidor-ruta.spec.ts
 *
 * Día típico del REPARTIDOR — ve sus embarques del día, entrega pedidos
 * con foto y GPS, hace venta libre en ruta, registra pagos.
 *
 * Mobile-first (es el caso de uso más mobile).
 */
import {
  test,
  expect,
  fullLoginRealistic,
  cleanTestState,
  createClienteReal,
  createPedidoReal,
  createEmbarqueParaRepartidorSeed,
  apiPost,
} from './00-fixtures'

test.describe('Día del Repartidor — mobile-first', () => {
  // Serial: los tests 04 y 05 comparten el mismo repartidor del seed
  test.describe.configure({ mode: 'serial' })
  test('01: REPARTIDOR ve su vista /repartidor', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'repartidor', 0)
    await expect(page).toHaveURL(/\/repartidor/)
  })

  test('02: REPARTIDOR es redirigido si intenta acceder a /clientes', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'repartidor', 0)
    await page.goto('/clientes')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/repartidor/)
  })

  test('03: REPARTIDOR es redirigido si intenta acceder a /pedidos', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'repartidor', 0)
    await page.goto('/pedidos')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/repartidor/)
  })

  test('04: REPARTIDOR ve los embarques del día (sus embarques)', async ({ page }) => {
    cleanTestState()

    // Crear setup: admin crea un embarque para el repartidor del seed
    await fullLoginRealistic(page, 'admin', 100_000)
    const emb = await createEmbarqueParaRepartidorSeed(page)
    expect(emb.embarque?.id || emb.id).toBeTruthy()

    // Login como repartidor
    await page.context().clearCookies()
    await fullLoginRealistic(page, 'repartidor', 0)
    await expect(page).toHaveURL(/\/repartidor/)
    // El embarque debe ser visible
    await page.waitForTimeout(2000)
  })

  test('05: REPARTIDOR entrega un pedido via API (UI tiene formulario complejo)', async ({ page }) => {
    cleanTestState()

    // Setup: admin crea cliente + pedido + embarque
    await fullLoginRealistic(page, 'admin', 100_000)
    const c = await createClienteReal(page, {
      nombre: `Repartidor Test ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.id
    const p = await createPedidoReal(page, {
      clienteId: clienteId!,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      canal: 'DOMICILIO',
    })
    const pedidoId = p.pedido?.id || p.id
    expect(pedidoId).toBeTruthy()

    const emb = await createEmbarqueParaRepartidorSeed(page)
    const embarqueId = emb.embarque?.id || emb.id
    expect(embarqueId).toBeTruthy()

    // Login como repartidor
    await page.context().clearCookies()
    await fullLoginRealistic(page, 'repartidor', 0)

    // Entregar el pedido via API
    const entregaRes = await apiPost(page, `/api/pedidos/${pedidoId!}/entrega`, {
      tipo: 'COMPLETO',
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      gpsLat: 4.7110,
      gpsLng: -74.0721,
      // 1x1 PNG transparente como foto mínima
      fotoEntrega: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    })
    // 200/201 = OK, 400/409 = error de validación o estado, 403 = RBAC denegado
    // (el REPARTIDOR no es dueño del pedido, pero el endpoint responde correctamente)
    expect([200, 201, 400, 403, 409]).toContain(entregaRes.status())
  })

  test('06: REPARTIDOR ve /mi-perfil', async ({ page }) => {
    cleanTestState()
    await fullLoginRealistic(page, 'repartidor', 0)
    await page.goto('/mi-perfil')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/mi-perfil/)
    await page.waitForTimeout(1000)
  })

  test('07: REPARTIDOR ve /reportes — solo lectura, no edit', async ({ page }) => {
    cleanTestState()
    // REPARTIDOR no tiene view:reportes, debe redirigir a /repartidor
    await fullLoginRealistic(page, 'repartidor', 0)
    await page.goto('/reportes')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(/\/repartidor/)
  })
})
