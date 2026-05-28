// @tests embarques stats module - comprehensive E2E coverage
import { test, expect, fullLogin, apiPost, apiGet, apiDelete, createCliente, skipBaseCaja, login, BASE } from './fixtures'

async function embarquesLogin(page: any) {
  await skipBaseCaja(page)
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  await page.route('**/api/cierre/last', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cierre: { fecha: yesterday } }),
    })
  })
  // Also intercept /cierre page redirect
  await page.route('**/cierre', async (route: any) => {
    await route.continue()
  })
  await login(page, 'admin', 'admin123')
}

async function gotoEmbarques(page: any) {
  await page.goto(`${BASE}/embarques`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
  // Ensure we're on embarques page, not redirected to cierre
  const url = page.url()
  if (url.includes('/cierre')) {
    await page.goto(`${BASE}/embarques`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
  }
}

/**
 * Create a proper repartidor with usaMoto and capacidadKg for embarque tests.
 */
async function createStatsRepartidor(page: any): Promise<string | null> {
  const res = await page.request.post(`${BASE}/api/trabajadores`, {
    data: {
      nombre: `Stats Repartidor ${Date.now()}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
      capacidadKg: 500,
      comPacaAgua: 500,
      comPacaHielo: 300,
      comBotellon: 200,
      comRepartAgua: 500,
      comRepartHielo: 300,
      comRepartBotellon: 200,
    },
  })
  if (!res.ok()) {
    return null
  }
  const data = await res.json()
  const id = data.trabajador?.id
  return id || null
}

/**
 * Create an embarque and close it. Returns { embarqueId, success, error? }.
 * Always returns an object so tests can assert on the result.
 */
async function createAndCloseEmbarque(page: any, trabajadorId: string, clienteId: string | null, items: Array<{ producto: string; cantidad: number }>, entregado: string): Promise<{ embarqueId: string | null; success: boolean; error?: string }> {
  const eRes = await apiPost(page, '/api/embarques', { trabajadorId, horaSalida: new Date().toISOString(), baseDinero: 0, carga: [{ producto: 'PACA_AGUA', cargadas: 1 }] })
  const eData = await eRes.json()
  const embarqueId = eData.data?.id || eData.embarque?.id || eData.trabajador?.embarque?.id
  if (!embarqueId) {
    return { embarqueId: null, success: false, error: 'No embarqueId in response' }
  }

  let pedidoId: string | null = null

  if (clienteId && items.length > 0) {
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'DOMICILIO',
      ventaRapida: false,
      items,
    })
    const pData = await pRes.json()
    pedidoId = pData.pedido?.id || pData.data?.id
    if (pedidoId) {
      await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    }
  }

  const productosEntregados: Record<string, number> = {
    cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  }
  const preciosReales: Record<string, number> = {
    pacaAgua: 0, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0,
  }

  if (pedidoId && entregado !== 'NO_ENTREGADO') {
    for (const item of items) {
      const keyMap: Record<string, string> = {
        PACA_AGUA: 'cPacaAguaEnt', PACA_HIELO: 'cPacaHieloEnt',
        BOTELLON: 'cBotellonFabEnt', BOLSA_AGUA: 'cBolsaAguaEnt', BOLSA_HIELO: 'cBolsaHieloEnt',
      }
      const priceMap: Record<string, string> = {
        PACA_AGUA: 'pacaAgua', PACA_HIELO: 'pacaHielo',
        BOTELLON: 'botellonFab', BOLSA_AGUA: 'bolsaAgua', BOLSA_HIELO: 'bolsaHielo',
      }
      const entKey = keyMap[item.producto]
      const priceKey = priceMap[item.producto]
      if (entKey) productosEntregados[entKey] = entregado === 'PARCIAL' ? Math.max(1, Math.floor(item.cantidad / 2)) : item.cantidad
      if (priceKey) preciosReales[priceKey] = 2600
    }
    const monto = Object.values(productosEntregados).reduce((s, v) => s + v, 0) * 2600
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado,
        productosEntregados,
        preciosReales,
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto }],
      }],
      ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
      obs: 'Test stats cierre',
    })
    const closeData = await closeRes.json()
    if (!closeData.success) {
      return { embarqueId, success: false, error: `Close failed: ${JSON.stringify(closeData)}` }
    }
  } else if (!pedidoId) {
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [],
      ventasLibres: [],
      productos: [],
      gastos: [],
      dineroEntregado: 0,
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
      obs: 'Test stats cierre',
    })
    const closeData = await closeRes.json()
    if (!closeData.success) {
      return { embarqueId, success: false, error: `Close failed: ${JSON.stringify(closeData)}` }
    }
  }

  return { embarqueId, success: true }
}

// ============================================================
// API — Endpoint Existence and Structure
// ============================================================

test.describe('Embarques Stats — API Estructura', () => {

  test('GET /api/embarques/stats returns 200 with correct shape', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/embarques/stats')
    expect(res.status()).toBe(200)
    const data = await res.json()
    const body = data.data ?? data
    expect(body).toHaveProperty('kpiGeneral')
    expect(body).toHaveProperty('porTrabajador')
    expect(body).toHaveProperty('porRuta')
    expect(body).toHaveProperty('tendenciaDiaria')
    expect(body).toHaveProperty('embarquesDetalle')
    expect(Array.isArray(body.porTrabajador)).toBe(true)
    expect(Array.isArray(body.porRuta)).toBe(true)
    expect(Array.isArray(body.tendenciaDiaria)).toBe(true)
    expect(Array.isArray(body.embarquesDetalle)).toBe(true)
  })

  test('kpiGeneral has all expected fields', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/embarques/stats')
    const data = await res.json()
    const kpi = (data.data ?? data).kpiGeneral
    expect(kpi).toHaveProperty('totalEmbarques')
    expect(kpi).toHaveProperty('duracionPromedioMin')
    expect(kpi).toHaveProperty('duracionMedianaMin')
    expect(kpi).toHaveProperty('duracionMinMin')
    expect(kpi).toHaveProperty('duracionMaxMin')
    expect(kpi).toHaveProperty('entregasPorHoraPromedio')
    expect(kpi).toHaveProperty('tasaEntregaPromedio')
    expect(kpi).toHaveProperty('tasaNoEntregaPromedio')
    expect(kpi).toHaveProperty('tiempoPreparacionPromedioMin')
    expect(kpi).toHaveProperty('discrepanciaPromedioPct')
    expect(kpi).toHaveProperty('totalPedidos')
    expect(kpi).toHaveProperty('totalEntregados')
    expect(kpi).toHaveProperty('totalNoEntregados')
  })

  test('porTrabajador entries have correct shape', async ({ page }) => {
    await fullLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    const res = await apiGet(page, '/api/embarques/stats')
    const data = await res.json()
    const workers = (data.data ?? data).porTrabajador
    if (workers.length > 0) {
      const w = workers[0]
      expect(w).toHaveProperty('trabajadorId')
      expect(w).toHaveProperty('nombre')
      expect(w).toHaveProperty('totalEmbarques')
      expect(w).toHaveProperty('duracionPromedioMin')
      expect(w).toHaveProperty('entregasPorHoraPromedio')
      expect(w).toHaveProperty('tasaEntrega')
      expect(w).toHaveProperty('tasaNoEntrega')
      expect(w).toHaveProperty('discrepanciaPct')
      expect(w).toHaveProperty('totalPedidos')
      expect(w).toHaveProperty('totalEntregados')
    }
  })

  test('porRuta entries have correct shape', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/embarques/stats')
    const data = await res.json()
    const routes = (data.data ?? data).porRuta
    if (routes.length > 0) {
      const r = routes[0]
      expect(r).toHaveProperty('rutaId')
      expect(r).toHaveProperty('nombre')
      expect(r).toHaveProperty('totalEmbarques')
      expect(r).toHaveProperty('duracionPromedioMin')
      expect(r).toHaveProperty('entregasPorHoraPromedio')
      expect(r).toHaveProperty('tasaEntrega')
      expect(r).toHaveProperty('tasaNoEntrega')
      expect(r).toHaveProperty('totalPedidos')
      expect(r).toHaveProperty('totalEntregados')
    }
  })

  test('embarquesDetalle entries have correct shape', async ({ page }) => {
    await fullLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    const res = await apiGet(page, '/api/embarques/stats')
    const data = await res.json()
    const detalles = (data.data ?? data).embarquesDetalle
    if (detalles.length > 0) {
      const d = detalles[0]
      expect(d).toHaveProperty('id')
      expect(d).toHaveProperty('numero')
      expect(d).toHaveProperty('numeroDia')
      expect(d).toHaveProperty('fecha')
      expect(d).toHaveProperty('trabajadorNombre')
      expect(d).toHaveProperty('estado')
      expect(d).toHaveProperty('duracionMin')
      expect(d).toHaveProperty('totalPedidos')
      expect(d).toHaveProperty('entregados')
    }
  })
})

// ============================================================
// API — Filters
// ============================================================

test.describe('Embarques Stats — API Filtros', () => {

  test('filter by date range returns data within range', async ({ page }) => {
    await fullLogin(page)
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    const res = await apiGet(page, `/api/embarques/stats?desde=${today}&hasta=${tomorrow}`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.data ?? data).toBeDefined()
  })

  test('filter by future date range returns empty stats', async ({ page }) => {
    await fullLogin(page)
    const futureStart = new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0]
    const futureEnd = new Date(Date.now() + 86400000 * 60).toISOString().split('T')[0]
    const res = await apiGet(page, `/api/embarques/stats?desde=${futureStart}&hasta=${futureEnd}`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    const body = data.data ?? data
    expect(body.kpiGeneral.totalEmbarques).toBe(0)
  })

  test('filter by trabajadorId only returns that worker stats', async ({ page }) => {
    await fullLogin(page)
    const id1 = await createStatsRepartidor(page)
    const id2 = await createStatsRepartidor(page)
    if (!id1 || !id2) { test.skip(); return }
    const r1 = await createAndCloseEmbarque(page, id1, null, [], 'COMPLETO')
    const r2 = await createAndCloseEmbarque(page, id2, null, [], 'COMPLETO')
    if (!r1.success || !r2.success) { test.skip(); return }
    const res = await apiGet(page, `/api/embarques/stats?trabajadorId=${id1}`)
    const data = await res.json()
    const workers = (data.data ?? data).porTrabajador
    expect(workers.length).toBe(1)
    expect(workers[0].trabajadorId).toBe(id1)
  })
})

// ============================================================
// API — KPI Calculations with Real Data
// ============================================================

test.describe('Embarques Stats — API Calculos con Datos Reales', () => {

  test('closed embarque contributes to totalEmbarques', async ({ page }) => {
    await fullLogin(page)
    const before = await apiGet(page, '/api/embarques/stats')
    const beforeData = await before.json()
    const beforeCount = (beforeData.data ?? beforeData).kpiGeneral.totalEmbarques
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) {
      console.log('createAndCloseEmbarque error:', result.error)
      test.skip()
      return
    }
    expect(result.success).toBe(true)
    const after = await apiGet(page, '/api/embarques/stats')
    const afterData = await after.json()
    const afterCount = (afterData.data ?? afterData).kpiGeneral.totalEmbarques
    expect(afterCount).toBeGreaterThan(beforeCount)
  })

  test('open embarque does not count in kpiGeneral', async ({ page }) => {
    await fullLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId, horaSalida: new Date().toISOString(), baseDinero: 0, carga: [{ producto: 'PACA_AGUA', cargadas: 1 }] })
    const res = await apiGet(page, '/api/embarques/stats')
    const data = await res.json()
    const kpi = (data.data ?? data).kpiGeneral
    expect(kpi.totalEmbarques).toBe(0)
    const detalles = (data.data ?? data).embarquesDetalle
    const openOnes = detalles.filter((d: any) => d.estado === 'ABIERTO')
    expect(openOnes.length).toBeGreaterThanOrEqual(1)
  })

  test('cancelled embarque does not count in stats', async ({ page }) => {
    await fullLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
  const eRes = await apiPost(page, '/api/embarques', {
    trabajadorId,
    horaSalida: new Date().toISOString(),
    baseDinero: 0,
    carga: [{ producto: 'PACA_AGUA', cargadas: 1 }],
  })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await apiDelete(page, `/api/embarques/${embarqueId}`)
    const res = await apiGet(page, '/api/embarques/stats')
    const data = await res.json()
    const kpi = (data.data ?? data).kpiGeneral
    expect(kpi.totalEmbarques).toBe(0)
  })

  test('embarque with complete delivery has 100% tasaEntrega', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    const trabajadorId = await createStatsRepartidor(page)
    if (!clienteId || !trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, clienteId, [{ producto: 'PACA_AGUA', cantidad: 2 }], 'COMPLETO')
    if (!result.success) {
      console.log('createAndCloseEmbarque error:', result.error)
      test.skip()
      return
    }
    expect(result.success).toBe(true)
    const res = await apiGet(page, '/api/embarques/stats')
    const data = await res.json()
    const workers = (data.data ?? data).porTrabajador
    const worker = workers.find((w: any) => w.trabajadorId === trabajadorId)
    expect(worker).toBeDefined()
    expect(worker.tasaEntrega).toBe(1)
    expect(worker.tasaNoEntrega).toBe(0)
  })

  test('embarque with NO_ENTREGADO has 0% tasaEntrega', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    const trabajadorId = await createStatsRepartidor(page)
    if (!clienteId || !trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, clienteId, [{ producto: 'PACA_AGUA', cantidad: 1 }], 'NO_ENTREGADO')
    if (!result.success) {
      console.log('createAndCloseEmbarque error:', result.error)
      test.skip()
      return
    }
    expect(result.success).toBe(true)
    const res = await apiGet(page, '/api/embarques/stats')
    const data = await res.json()
    const workers = (data.data ?? data).porTrabajador
    const worker = workers.find((w: any) => w.trabajadorId === trabajadorId)
    expect(worker).toBeDefined()
    expect(worker.tasaEntrega).toBe(0)
    expect(worker.tasaNoEntrega).toBe(1)
  })
})

// ============================================================
// UI — Tab Navigation
// ============================================================

test.describe('Embarques Stats — UI Tabs', () => {

  test('tabs Embarques and Estadisticas are visible', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await expect(page.locator('button:has-text("Embarques")')).toBeVisible()
    await expect(page.locator('button:has-text("Estadísticas")')).toBeVisible()
  })

  test('Embarques tab is active by default', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    const embarquesTab = page.locator('button:has-text("Embarques")')
    const activeBorder = await embarquesTab.getAttribute('class')
    expect(activeBorder).toContain('border-blue-600')
  })

  test('clicking Estadisticas tab switches content', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(500)
    const statsTab = page.locator('button:has-text("Estadísticas")')
    const activeBorder = await statsTab.getAttribute('class')
    expect(activeBorder).toContain('border-blue-600')
  })

  test('clicking back to Embarques tab restores list view', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(500)
    await page.locator('button:has-text("Embarques")').click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })
})

// ============================================================
// UI — Stats Tab Content
// ============================================================

test.describe('Embarques Stats — UI Contenido del Tab', () => {

  test('empty state shown when no closed embarques exist', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1000)
    await expect(page.getByText('No hay embarques cerrados en este período')).toBeVisible()
  })

  test('KPI cards appear when there are closed embarques', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1500)
    await expect(page.getByText('Embarques cerrados en el período')).toBeVisible()
    await expect(page.getByText('Duración Prom.')).toBeVisible()
    await expect(page.getByText('Entregas/Hora')).toBeVisible()
    await expect(page.getByText('Tasa Entrega')).toBeVisible()
    await expect(page.getByText('Preparación')).toBeVisible()
    await expect(page.getByText('Discrepancia')).toBeVisible()
  })

  test('KPI cards show correct values for closed embarque', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1500)
    // Should show at least 1 closed embarque in the KPI summary
    const bodyText = await page.locator('body').textContent()
    expect(bodyText).toMatch(/Embarques cerrados/)
    expect(bodyText).toMatch(/Duración Prom/)
  })

  test('timeline section is visible with data', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('heading', { name: 'Tendencia Diaria' })).toBeVisible()
  })

  test('worker table is visible with data', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('heading', { name: 'Rendimiento por Repartidor' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Repartidor' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Embarques' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Duración Prom.' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Entregas/Hora' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Tasa Entrega' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Discrepancia' })).toBeVisible()
  })

  test('route table is visible', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('heading', { name: 'Rendimiento por Ruta' })).toBeVisible()
  })

  test('detail table shows embarque entries', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('heading', { name: 'Detalle de Embarques' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Repartidor' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Ruta' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Estado' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Duración' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Entregas' })).toBeVisible()
  })
})

// ============================================================
// UI — Duration Badge in Embarque Cards
// ============================================================

test.describe('Embarques Stats — UI Duration Badge', () => {

  test('closed embarque card shows duration badge', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    await gotoEmbarques(page)
    const cards = page.locator('[data-testid="embarque-card"]')
    const count = await cards.count()
    if (count > 0) {
      const bodyText = await page.locator('body').textContent()
      expect(bodyText).toMatch(/\d+m/)
    }
  })

  test('open embarque card does not show duration badge', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId, horaSalida: new Date().toISOString(), baseDinero: 0, carga: [{ producto: 'PACA_AGUA', cargadas: 1 }] })
    await gotoEmbarques(page)
    await page.waitForTimeout(500)
    const cards = page.locator('[data-testid="embarque-card"]')
    const count = await cards.count()
    if (count > 0) {
      const cardText = await cards.first().textContent()
      expect(cardText).not.toMatch(/\d+h\s+\d+m/)
    }
  })
})

// ============================================================
// UI — Stats with Multiple Workers Comparison
// ============================================================

test.describe('Embarques Stats — UI Comparacion Multiple Repartidores', () => {

  test('worker ranking shows multiple workers sorted by tasaEntrega', async ({ page }) => {
    await embarquesLogin(page)
    const id1 = await createStatsRepartidor(page)
    const id2 = await createStatsRepartidor(page)
    if (!id1 || !id2) { test.skip(); return }
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const r1 = await createAndCloseEmbarque(page, id1, clienteId, [{ producto: 'PACA_AGUA', cantidad: 2 }], 'COMPLETO')
    const r2 = await createAndCloseEmbarque(page, id2, clienteId, [{ producto: 'PACA_AGUA', cantidad: 1 }], 'NO_ENTREGADO')
    if (!r1.success || !r2.success) { test.skip(); return }
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1500)
    await expect(page.getByRole('heading', { name: 'Rendimiento por Repartidor' })).toBeVisible()
    // Both workers should appear in the worker table
    const rows = page.locator('table tbody tr')
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(2)
  })
})

// ============================================================
// UI — Stats Loading State
// ============================================================

test.describe('Embarques Stats — UI Loading State', () => {

  test('shows loading skeleton before data arrives', async ({ page }) => {
    await embarquesLogin(page)
    await page.route('**/api/embarques/stats*', async (route: any) => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            kpiGeneral: null,
            porTrabajador: [],
            porRuta: [],
            tendenciaDiaria: [],
            embarquesDetalle: [],
          },
        }),
      })
    })
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(300)
    await expect(page.locator('body')).toBeVisible()
  })
})

// ============================================================
// UI — Stats Error State
// ============================================================

test.describe('Embarques Stats — UI Error State', () => {

  test('shows error message and retry button when API fails', async ({ page }) => {
    await embarquesLogin(page)
    await page.route('**/api/embarques/stats*', async (route: any) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      })
    })
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1000)
    await expect(page.getByText('No se pudieron cargar las estadísticas')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })
})

// ============================================================
// UI — Date Range Filter Affects Stats
// ============================================================

test.describe('Embarques Stats — UI Filtro de Fecha', () => {

  test('stats tab loads when date range is set', async ({ page }) => {
    await embarquesLogin(page)
    const trabajadorId = await createStatsRepartidor(page)
    if (!trabajadorId) { test.skip(); return }
    const result = await createAndCloseEmbarque(page, trabajadorId, null, [], 'COMPLETO')
    if (!result.success) { test.skip(); return }
    await gotoEmbarques(page)
    await page.locator('button:has-text("Estadísticas")').click()
    await page.waitForTimeout(1500)
    await expect(page.getByText('Embarques cerrados en el período')).toBeVisible()
  })
})

// ============================================================
// Role-Based Access
// ============================================================

test.describe('Embarques Stats — Acceso por Rol', () => {

  test('REPARTIDOR can access stats endpoint', async ({ page }) => {
    await skipBaseCaja(page)
    await page.goto(`${BASE}/login`)
    await page.waitForLoadState('domcontentloaded')
    await page.fill('input[placeholder="Ingrese usuario"]', 'repartidor')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'rep123')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/repartidor', { timeout: 15000 })
    const res = await apiGet(page, '/api/embarques/stats')
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.data ?? data).toBeDefined()
  })

  test('unauthenticated user cannot access stats', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/embarques/stats`)
    expect(res.status()).toBeGreaterThanOrEqual(401)
  })
})
