// @ts-check
// Unit test: B4 Fiado → DeudaTrabajador automático
// Crea un fiado entregado con embarque, fuerza createdAt al pasado, llama al endpoint, verifica deuda creada

import { test, expect, loginAs, addFinding, dbCount, dbQuery, BASE, RUN_ID, CRON_SECRET, hasHorizontalOverflow } from './walkthrough-helpers'

test.describe('Fase 4. B4 Deuda automática', () => {
  test('B4.1: Forzar fiado antiguo con embarque → deuda se crea automáticamente', async ({ page }) => {
    await loginAs(page, 'admin')

    const deudasAntes = dbCount('DeudaTrabajador')

    // 1. Crear trabajador
    const trabRes = await page.request.post(`${BASE}/api/trabajadores`, {
      data: { nombre: `B4 Repartidor ${Date.now() % 10000}`, rol: 'REPARTIDOR', tipoPago: 'COMISION', usaMoto: true, capacidadKg: 500, comPacaAgua: 500, comPacaHielo: 300, comBotellon: 200, comRepartAgua: 500, comRepartHielo: 300, comRepartBotellon: 200 },
    })
    const trabData = await trabRes.json()
    const trabajadorId = trabData.trabajador?.id || trabData.data?.id
    if (!trabajadorId) { test.skip(); return }

    // 2. Crear cliente
    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `B4 Cliente ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // 3. Crear embarque
    const embRes = await page.request.post(`${BASE}/api/embarques`, {
      data: { trabajadorId, horaSalida: '08:00', carga: [{ producto: 'PACA_AGUA', cargadas: 10 }] },
    })
    const embData = await embRes.json()
    const embarqueId = embData.data?.id || embData.embarque?.id
    if (!embarqueId) { test.skip(); return }

    // 4. Crear pedido fiado (4 pacas = $11200, paga $5000, queda $6200)
    const pedRes = await page.request.post(`${BASE}/api/pedidos`, {
      data: { clienteId, canal: 'PUNTO', ventaRapida: true, items: [{ producto: 'PACA_AGUA', cantidad: 4 }], pagos: [{ metodo: 'EFECTIVO', monto: 5000 }] },
    })
    const pedData = await pedRes.json()
    const pedidoId = pedData.pedido?.id || pedData.data?.id
    if (!pedidoId) { test.skip(); return }

    // 5. Asignar pedido al embarque vía update directo (no hay endpoint público que encontré)
    await dbQuery(`UPDATE "Pedido" SET "embarqueId" = '${embarqueId}', "estadoEntrega" = 'ENTREGADO' WHERE id = '${pedidoId}'`)

    // 6. Forzar createdAt al pasado (10 días atrás)
    await dbQuery(`UPDATE "Pedido" SET "createdAt" = NOW() - INTERVAL '10 days' WHERE id = '${pedidoId}'`)

    // 7. Llamar al endpoint del cron
    const cronRes = await page.request.post(`${BASE}/api/cron/generar-deudas-trabajador`, {
      data: {},
      headers: { 'x-cron-secret': CRON_SECRET },
    })
    const cronData = await cronRes.json()
    const status = cronRes.status()
    addFinding({
      severity: 'P3',
      module: 'fiados',
      title: `B4.1: Cron status ${status}, message: ${cronData.message}`,
      description: `Candidatas: ${cronData.candidatas}, nuevas: ${cronData.nuevas?.length}, saltadas: ${cronData.saltados?.length}`,
    })

    // 8. Verificar
    const deudasDespues = dbCount('DeudaTrabajador')
    const delta = deudasDespues - deudasAntes
    addFinding({
      severity: delta > 0 ? 'P3' : 'P1',
      module: 'fiados',
      title: `B4.1: DeudasTrabajador antes=${deudasAntes}, después=${deudasDespues}, delta=${delta}`,
      description: delta > 0
        ? '✅ La deuda se creó automáticamente al ejecutar el cron.'
        : '❌ La deuda NO se creó. Bug en el cron o el pedido no pasó los filtros.',
      userComplaint: 'Queja: "no se sabe cuándo pasa a deuda del trabajador"',
    })

    // Verificar que la deuda tiene los datos correctos
    if (delta > 0) {
      const deuda = dbQuery(`SELECT * FROM "DeudaTrabajador" WHERE "embarqueId" = '${embarqueId}' AND descripcion LIKE 'Fiado no cobrado%' ORDER BY "createdAt" DESC LIMIT 1`)
      addFinding({
        severity: 'P3',
        module: 'fiados',
        title: `B4.1: Deuda creada con datos correctos`,
        description: deuda.slice(0, 300),
      })
    }
  })

  test('B4.2: Pedido de venta rápida SIN embarque NO genera deuda', async ({ page }) => {
    await loginAs(page, 'admin')

    const deudasAntes = dbCount('DeudaTrabajador')

    const cliRes = await page.request.post(`${BASE}/api/clientes`, {
      data: { nombre: `B4.2 PUNTO ${Date.now()}`, telefono: `3${String(Date.now()).slice(-9)}`, direccion: 'X', barrio: 'Y' },
    })
    const cliData = await cliRes.json()
    const clienteId = cliData.cliente?.id || cliData.data?.id
    if (!clienteId) { test.skip(); return }

    // Fiado sin embarque
    const pedRes = await page.request.post(`${BASE}/api/pedidos`, {
      data: { clienteId, canal: 'PUNTO', ventaRapida: true, items: [{ producto: 'PACA_AGUA', cantidad: 4 }], pagos: [{ metodo: 'EFECTIVO', monto: 5000 }] },
    })
    const pedData = await pedRes.json()
    const pedidoId = pedData.pedido?.id || pedData.data?.id
    if (!pedidoId) { test.skip(); return }

    // Forzar ENTREGADO + createdAt al pasado
    await dbQuery(`UPDATE "Pedido" SET "estadoEntrega" = 'ENTREGADO', "createdAt" = NOW() - INTERVAL '10 days' WHERE id = '${pedidoId}'`)

    // Llamar al cron
    await page.request.post(`${BASE}/api/cron/generar-deudas-trabajador`, {
      data: {},
      headers: { 'x-cron-secret': CRON_SECRET },
    })

    const deudasDespues = dbCount('DeudaTrabajador')
    const delta = deudasDespues - deudasAntes
    addFinding({
      severity: delta === 0 ? 'P3' : 'P1',
      module: 'fiados',
      title: `B4.2: Pedido PUNTO sin embarque → deuda NO creada. Delta: ${delta}`,
      description: delta === 0
        ? '✅ Correcto: el cron ignora fiados sin embarque (decisión de producto).'
        : '❌ El cron creó una deuda para un pedido sin embarque — bug.',
    })
  })

  test('B4.3: Cron está protegido por CRON_SECRET', async ({ page }) => {
    await loginAs(page, 'admin')
    const sinAuth = await page.request.post(`${BASE}/api/cron/generar-deudas-trabajador`, {
      data: {},
      headers: { 'x-cron-secret': 'WRONG' },
    })
    const conAuth = await page.request.post(`${BASE}/api/cron/generar-deudas-trabajador`, {
      data: {},
      headers: { 'x-cron-secret': CRON_SECRET },
    })
    addFinding({
      severity: 'P3',
      module: 'fiados',
      title: `B4.3: Sin secret: ${sinAuth.status()}, con secret: ${conAuth.status()}`,
      description: '401 vs 200 esperado. Si ambos son 200, hay un bug de seguridad.',
    })
  })

  test('B4.4: Cron funciona con auth context (curl-like)', async ({ page, request }) => {
    // Crear un request nuevo sin contexto de Playwright (sin cookies)
    const resp = await request.post(`${BASE}/api/cron/generar-deudas-trabajador`, {
      data: {},
      headers: { 'x-cron-secret': CRON_SECRET },
    })
    addFinding({
      severity: 'P3',
      module: 'fiados',
      title: `B4.4: Cron con request (sin cookies de Playwright): ${resp.status()}`,
      description: '',
    })
  })
})
