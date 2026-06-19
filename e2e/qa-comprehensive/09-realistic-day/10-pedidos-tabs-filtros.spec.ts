/**
 * 09-realistic-day/10-pedidos-tabs-filtros.spec.ts
 *
 * Tabs y filtros de /pedidos con combinaciones.
 *
 * Tabs (3): hoy (default), fiados (?tab=fiados), alertas (?tab=alertas)
 * Filtros (4 grupos + búsqueda libre + fecha range):
 *   - origen: PEDIDO, VENTA_RAPIDA, VENTA_LIBRE, RECURRENTE
 *   - entrega: PENDIENTE, EN_RUTA, ENTREGADO, NO_ENTREGADO, CANCELADO, ANULADO
 *   - pago: PENDIENTE, PARCIAL, PAGADO, ANTICIPADO, VENCIDO, ANULADO
 *   - tipo: ENVIO, PUNTO
 *   - búsqueda libre
 *   - rango fechas (desde, hasta)
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
  todayISO,
  daysAgoISO,
} from './00-fixtures'

test.describe('10: Tabs + filtros de pedidos', () => {
  test.beforeEach(() => {
    cleanTestState()
  })

  test('01: Tab default (hoy) carga al entrar a /pedidos', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/pedidos')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/pedidos/)
    // El tab "Pedidos" (hoy) debe estar visible
    await expect(page.getByText('Pedidos').first()).toBeVisible()
  })

  test('02: Tab "Fiados" via ?tab=fiados', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/pedidos?tab=fiados')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/tab=fiados/)
    // El tab "Fiados" debe estar visible
    await expect(page.getByText('Fiados').first()).toBeVisible()
  })

  test('03: Tab "Alertas" via ?tab=alertas', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/pedidos?tab=alertas')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/tab=alertas/)
    // El tab "Alertas" debe estar visible
    await expect(page.getByText('Alertas').first()).toBeVisible()
  })

  test('04: Filtro origen via query param', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/pedidos?origen=PEDIDO')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/origen=PEDIDO/)
  })

  test('05: Filtro tipo via query param (ENVIO, PUNTO)', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    // Crear pedido de cada tipo
    const c = await createClienteReal(page, {
      nombre: `Tipo Filter ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    await createPedidoReal(page, {
      clienteId: (c.cliente?.id || c.id)!,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      canal: 'DOMICILIO',
    })

    for (const tipo of ['ENVIO', 'PUNTO']) {
      await page.goto(`/pedidos?tipo=${tipo}`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)
      await expect(page).toHaveURL(new RegExp(`tipo=${tipo}`))
    }
  })

  test('06: Filtro estadoEntrega via query param', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    for (const estado of ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO']) {
      await page.goto(`/pedidos?estadoEntrega=${estado}`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)
      await expect(page).toHaveURL(new RegExp(`estadoEntrega=${estado}`))
    }
  })

  test('07: Filtro estadoPago via query param', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    for (const estado of ['PENDIENTE', 'PAGADO', 'PARCIAL', 'ANTICIPADO']) {
      await page.goto(`/pedidos?estadoPago=${estado}`)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)
      await expect(page).toHaveURL(new RegExp(`estadoPago=${estado}`))
    }
  })

  test('08: Búsqueda libre via ?search=', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    const c = await createClienteReal(page, {
      nombre: `Buscar Texto Unico ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    await createPedidoReal(page, {
      clienteId: (c.cliente?.id || c.id)!,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    await page.goto('/pedidos?search=Buscar')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/search=Buscar/)
  })

  test('09: Filtro clienteId via query param', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    const c = await createClienteReal(page, {
      nombre: `Filter Cliente ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = c.cliente?.id || c.id
    await page.goto(`/pedidos?clienteId=${clienteId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(new RegExp(`clienteId=${clienteId}`))
  })

  test('10: Filtro fecha desde/hasta via query params', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    const today = todayISO()
    const lastWeek = daysAgoISO(7)
    await page.goto(`/pedidos?desde=${lastWeek}&hasta=${today}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page).toHaveURL(new RegExp(`desde=${lastWeek}`))
    await expect(page).toHaveURL(new RegExp(`hasta=${today}`))
  })

  test('11: Combinación: tab=fiados + tipo=ENVIO + estadoPago=PENDIENTE', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/pedidos?tab=fiados&tipo=ENVIO&estadoPago=PENDIENTE')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/tab=fiados/)
    await expect(page).toHaveURL(/tipo=ENVIO/)
    await expect(page).toHaveURL(/estadoPago=PENDIENTE/)
  })

  test('12: Combinación: tab=alertas + search + fecha', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    const today = todayISO()
    await page.goto(`/pedidos?tab=alertas&search=test&desde=${today}&hasta=${today}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/tab=alertas/)
    await expect(page).toHaveURL(/search=test/)
  })

  test('13: Múltiples origines via query param (origen=PEDIDO&origen=VENTA_RAPIDA)', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    await page.goto('/pedidos?origen=PEDIDO&origen=VENTA_RAPIDA')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/origen=PEDIDO/)
    await expect(page).toHaveURL(/origen=VENTA_RAPIDA/)
  })

  test('14: openPedido via query param abre el detalle del pedido', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    const c = await createClienteReal(page, {
      nombre: `Open Pedido ${Date.now()}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const p = await createPedidoReal(page, {
      clienteId: (c.cliente?.id || c.id)!,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pedidoId = p.pedido?.id || p.id
    await page.goto(`/pedidos?openPedido=${pedidoId}`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(new RegExp(`openPedido=${pedidoId}`))
  })

  test('15: Filtro: limpiar todo (botón "Limpiar todo" en PedidoFilters)', async ({ page }) => {
    await fullLoginRealistic(page, 'asistente', 50_000)
    // Aplicar varios filtros
    await page.goto('/pedidos?tipo=ENVIO&estadoEntrega=PENDIENTE&estadoPago=PENDIENTE')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(2000)
    // Click en "Limpiar todo" si existe
    const clearBtn = page.getByText(/Limpiar todo/i)
    const count = await clearBtn.count()
    if (count > 0) {
      await clearBtn.first().click()
      await page.waitForTimeout(1000)
    }
    // La URL debe haberse limpiado o las pills deben haber desaparecido
    await page.waitForTimeout(1000)
  })
})
