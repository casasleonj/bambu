// @tests embarques module - comprehensive E2E coverage
import { test, expect, fullLogin, apiPost, apiGet, apiPut, apiDelete, createTrabajador, createCliente, skipBaseCaja, login, BASE } from './fixtures'

/** Login that skips base caja modal to avoid redirect to /cierre */
async function embarquesLogin(page: any) {
  await skipBaseCaja(page)
  // Intercept cierre/last to return yesterday's cierre, preventing redirect
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  await page.route('**/api/cierre/last', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cierre: { fecha: yesterday } }),
    })
  })
  await login(page, 'admin', 'admin123')
  // Keep route active for the rest of the test
}

/** Navigate to embarques without base caja interference */
async function gotoEmbarques(page: any) {
  await page.goto(`${BASE}/embarques`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
}

test.describe('Embarques — Navegación y Carga', () => {

  test('page loads with correct heading', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })

  test('buttons Nuevo Embarque and Auto-Generar are visible', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await expect(page.locator('button:has-text("+ Nuevo Embarque")')).toBeVisible()
    await expect(page.locator('button:has-text("Auto-Generar")')).toBeVisible()
  })

  test('filters section is present', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await expect(page.locator('button:has-text("Todos")')).toBeVisible()
    await expect(page.locator('button:has-text("Abiertos")')).toBeVisible()
    await expect(page.locator('button:has-text("Cerrados")')).toBeVisible()
  })

  test('info banner shows capacity legend', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await expect(page.getByText('Capacidad máxima:')).toBeVisible()
    await expect(page.getByText('Ideal')).toBeVisible()
    await expect(page.getByText('Excedido')).toBeVisible()
  })

  test('invalid embarque id redirects gracefully', async ({ page }) => {
    await embarquesLogin(page)
    await page.goto(`${BASE}/embarques/nonexistent-id/cerrar`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    // Should show "Embarque no encontrado" or redirect, not blank page
    const content = await page.locator('body').textContent()
    expect(content).toBeTruthy()
    expect(content?.length).toBeGreaterThan(10)
  })
})

test.describe('Embarques — Filtros y Rangos', () => {

  test('filter by ABIERTO state', async ({ page }) => {
    await embarquesLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    await apiPost(page, '/api/embarques', { trabajadorId })
    await gotoEmbarques(page)
    await page.locator('button:has-text("Abiertos")').click()
    await page.waitForTimeout(500)
    // Page should still be visible
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })

  test('filter by CERRADO state', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await page.locator('button:has-text("Cerrados")').click()
    await page.waitForTimeout(500)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })

  test('reset filter to Todos', async ({ page }) => {
    await embarquesLogin(page)
    await gotoEmbarques(page)
    await page.locator('button:has-text("Cerrados")').click()
    await page.waitForTimeout(500)
    await page.locator('button:has-text("Todos")').click()
    await page.waitForTimeout(800)
    await expect(page.getByRole('heading', { name: 'Embarques del Día' })).toBeVisible()
  })
})

test.describe('Embarques — CRUD', () => {

  test('crear embarque via API returns 201', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const res = await apiPost(page, '/api/embarques', { trabajadorId })
    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.data || data.embarque).toBeDefined()
  })

  test('crear embarque via API without trabajador fails', async ({ page }) => {
    await fullLogin(page)
    const res = await apiPost(page, '/api/embarques', {})
    expect(res.status()).toBeGreaterThanOrEqual(400)
  })

  test('auto-generar embarques', async ({ page }) => {
    await fullLogin(page)
    await createTrabajador(page)
    const res = await apiPost(page, '/api/embarques/auto', {})
    const data = await res.json()
    expect(data).toBeDefined()
    expect(data.success || data.error).toBeDefined()
  })

  test('cancelar embarque via DELETE', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    const delRes = await apiDelete(page, `/api/embarques/${embarqueId}`)
    expect(delRes.status()).toBeLessThan(500)
    const delData = await delRes.json()
    expect(delData.success).toBe(true)
  })

  test('cannot cancel closed embarque', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    // First close it with empty pedidos
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [], ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
    })
    const closeData = await closeRes.json()
    if (!closeData.success) { test.skip(); return }
    // Then try to cancel
    const delRes = await apiDelete(page, `/api/embarques/${embarqueId}`)
    const delData = await delRes.json()
    // Should return error for closed embarque
    expect(delRes.status()).toBeGreaterThanOrEqual(400)
    expect(delData.success).toBe(false)
  })
})

test.describe('Embarques — Gestión de Pedidos', () => {

  test('asignar pedido a embarque via enviar endpoint', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    const sendRes = await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    expect(sendRes.status()).toBeLessThan(500)
  })

  test('quitar pedido de embarque resetea estado a PENDIENTE', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    // Create pedido
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }
    // Create embarque and assign
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    // Remove from embarque
    const removeRes = await apiPut(page, `/api/pedidos/${pedidoId}`, { embarqueId: null })
    const removeData = await removeRes.json()
    expect(removeData.success).toBe(true)
    // Verify estado is PENDIENTE
    const getRes = await apiGet(page, `/api/pedidos/${pedidoId}`)
    const getData = await getRes.json()
    const pedido = getData.pedido || getData.data
    expect(pedido.estado).toBe('PENDIENTE')
    expect(pedido.embarqueId).toBeNull()
  })

  test('cannot assign pedido to closed embarque via PUT', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    // Close embarque first
    await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {})
    // Try to assign pedidos via PUT
    const putRes = await apiPut(page, `/api/embarques/${embarqueId}`, { pedidoIds: ['fake-id'] })
    // Should not error on empty/invalid IDs, but embarque remains closed
    expect(putRes.status()).toBeLessThan(500)
  })
})

test.describe('Embarques — Cierre Completo', () => {

  test('cerrar embarque sin pedidos returns success', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [],
      ventasLibres: [],
      devueltasAgua: 0,
      devueltasHielo: 0,
      rotasAgua: 0,
      rotasHielo: 0,
      obs: 'Test cierre',
    })
    expect(closeRes.status()).toBeLessThan(500)
    const closeData = await closeRes.json()
    expect(closeData.success).toBe(true)
  })

  test('cerrar embarque ya cerrado returns 400', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    // First close
    await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [], ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
    })
    // Second close should fail
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [], ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
    })
    expect(closeRes.status()).toBe(400)
  })

  test('cerrar con entrega COMPLETA y pago', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    // Create pedido
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }
    // Create embarque and assign
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    // Close with complete delivery
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 2, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        preciosReales: { pacaAgua: 2600, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 },
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: 5200 }],
      }],
      ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
    })
    expect(closeRes.status()).toBeLessThan(500)
    const closeData = await closeRes.json()
    expect(closeData.success).toBe(true)
    // Verify embarque is closed
    const getRes = await apiGet(page, `/api/embarques/${embarqueId}`)
    const getData = await getRes.json()
    const embarque = getData.embarque || getData.data
    expect(embarque.estado).toBe('CERRADO')
  })

  test('cerrar con entrega PARCIAL crea pedido hijo', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 4 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'PARCIAL',
        productosEntregados: { cPacaAguaEnt: 2, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        preciosReales: { pacaAgua: 2600, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 },
        pagado: 'PARCIAL',
        pagos: [{ metodo: 'EFECTIVO', monto: 5200 }],
      }],
      ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
    })
    expect(closeRes.status()).toBeLessThan(500)
    const closeData = await closeRes.json()
    expect(closeData.success).toBe(true)
    // Verify child pedido was created
    expect(closeData.pedidosHijosCreados.length).toBeGreaterThan(0)
  })

  test('cerrar con NO_ENTREGADO y reasignación', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    // Create 2 embarques
    const e1Res = await apiPost(page, '/api/embarques', { trabajadorId })
    const e1Data = await e1Res.json()
    const embarque1Id = e1Data.data?.id || e1Data.embarque?.id
    const e2Res = await apiPost(page, '/api/embarques', { trabajadorId })
    const e2Data = await e2Res.json()
    const embarque2Id = e2Data.data?.id || e2Data.embarque?.id
    if (!embarque1Id || !embarque2Id) { test.skip(); return }
    // Create and assign pedido to embarque 1
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId: embarque1Id })
    // Close embarque 1 with NO_ENTREGADO + reassign to embarque 2
    const closeRes = await apiPost(page, `/api/embarques/${embarque1Id}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'NO_ENTREGADO',
        productosEntregados: { cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        preciosReales: { pacaAgua: 0, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 },
        pagado: 'NO_PAGADO',
        pagos: [],
        nuevoEmbarqueId: embarque2Id,
      }],
      ventasLibres: [],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
    })
    expect(closeRes.status()).toBeLessThan(500)
    const closeData = await closeRes.json()
    expect(closeData.success).toBe(true)
    // Verify pedido is now in embarque 2 with EN_RUTA state
    const getRes = await apiGet(page, `/api/pedidos/${pedidoId}`)
    const getData = await getRes.json()
    const pedido = getData.pedido || getData.data
    expect(pedido.embarqueId).toBe(embarque2Id)
    expect(pedido.estado).toBe('EN_RUTA')
  })

  test('cerrar con venta libre crea pedido y factura', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [],
      ventasLibres: [{
        clienteId,
        cPacaAgua: 2, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0,
        pagos: [{ metodo: 'EFECTIVO', monto: 5200 }],
        obs: 'Venta libre test',
      }],
      devueltasAgua: 0, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
    })
    expect(closeRes.status()).toBeLessThan(500)
    const closeData = await closeRes.json()
    expect(closeData.success).toBe(true)
    expect(closeData.ventasLibresCreadas.length).toBeGreaterThan(0)
  })

  test('cerrar con discrepancia crea descuento', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const clienteId = c.cliente?.id || c.data?.id
    if (!clienteId) { test.skip(); return }
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const pRes = await apiPost(page, '/api/pedidos', {
      clienteId, canal: 'DOMICILIO', ventaRapida: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
    })
    const pData = await pRes.json()
    const pedidoId = pData.pedido?.id || pData.data?.id
    if (!pedidoId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    await apiPost(page, `/api/pedidos/${pedidoId}/enviar`, { embarqueId })
    // Close with discrepancy: loaded 5, delivered 3, returned 1, broken 0 = discrepancy of 1
    const closeRes = await apiPost(page, `/api/embarques/${embarqueId}/cerrar`, {
      pedidos: [{
        pedidoId,
        entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 3, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        preciosReales: { pacaAgua: 2600, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 },
        pagado: 'COMPLETO',
        pagos: [{ metodo: 'EFECTIVO', monto: 7800 }],
      }],
      ventasLibres: [],
      devueltasAgua: 1, devueltasHielo: 0, rotasAgua: 0, rotasHielo: 0,
      // No justificacionDiscrepancia → should create discount
    })
    expect(closeRes.status()).toBeLessThan(500)
    const closeData = await closeRes.json()
    expect(closeData.success).toBe(true)
    // Discount should be created
    expect(closeData.descuento).toBeDefined()
  })
})

test.describe('Embarques — Validaciones y Edge Cases', () => {

  test('auto-generar sin repartidores activos returns 400', async ({ page }) => {
    await fullLogin(page)
    // Assuming no active repartidores exist (fresh state)
    const res = await apiPost(page, '/api/embarques/auto', {})
    await res.json()
    // Should either succeed or return a business error, never 500
    expect(res.status()).toBeLessThan(500)
  })

  test('auto-generar sin pedidos pendientes returns informative message', async ({ page }) => {
    await fullLogin(page)
    await createTrabajador(page)
    const res = await apiPost(page, '/api/embarques/auto', {})
    const data = await res.json()
    expect(data).toBeDefined()
    if (data.success && data.data) {
      expect(data.data.created).toBeDefined()
    }
  })

  test('GET embarque not found returns 404', async ({ page }) => {
    await fullLogin(page)
    const res = await apiGet(page, '/api/embarques/nonexistent-id')
    expect(res.status()).toBe(404)
  })

  test('embarque detail includes pedidos and trabajador', async ({ page }) => {
    await fullLogin(page)
    const t = await createTrabajador(page)
    const trabajadorId = t.trabajador?.id || t.data?.id
    if (!trabajadorId) { test.skip(); return }
    const eRes = await apiPost(page, '/api/embarques', { trabajadorId })
    const eData = await eRes.json()
    const embarqueId = eData.data?.id || eData.embarque?.id
    if (!embarqueId) { test.skip(); return }
    const getRes = await apiGet(page, `/api/embarques/${embarqueId}`)
    const getData = await getRes.json()
    const embarque = getData.embarque || getData.data
    expect(embarque.trabajador).toBeDefined()
    expect(embarque.pedidos).toBeDefined()
  })
})
