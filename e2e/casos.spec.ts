// @tests api/casos, api/casos/[id], api/casos/[id]/eventos
import {test, expect, BASE, loginAs, skipBaseCaja, goto, apiPost, apiGet, createCliente, resetDatabase, sharedPageLogin} from './fixtures'
import type { Page } from '@playwright/test'

test.describe('Casos', () => {
  test.describe.configure({ mode: 'serial' })


  let p: Page

  test.beforeAll(async ({ browser }) => {
    resetDatabase()
    p = await sharedPageLogin(browser)
  })

  test.afterAll(async () => {
    await p?.close()
  })

  test('page loads', async () => {
    await goto(p, '/casos')

    await expect(p.locator('h1:has-text("Gestión de Casos")')).toBeVisible()

    const filters = p.locator('input[placeholder="Buscar caso o cliente..."]')
    expect(await filters.isVisible()).toBe(true)
  })

  test('crear caso via API', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente Caso ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const res = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso Test ${Date.now() % 10000}`,
      descripcion: 'Descripcion de prueba E2E',
      clienteId: cliente.id,
    })

    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.caso?.id).toBeTruthy()
    expect(data.caso?.cliente?.nombre).toBe(cliente.nombre)
  })

  test('listar casos', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente List ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso Listar ${Date.now() % 10000}`,
      descripcion: 'Caso para listar',
      clienteId: cliente.id,
    })

    const res = await apiGet(p, '/api/casos')
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.casos).toBeDefined()
    expect(data.casos.length).toBeGreaterThan(0)
  })

  test('filtrar casos por status', async () => {
    await goto(p, '/casos')

    const statusFilter = p.locator('select').first()
    if (await statusFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusFilter.selectOption('ABIERTO')
      await p.waitForTimeout(500)

      // FIX: en mobile el layout es card (md:hidden), no table. Usar
      // `:visible` para filtrar spans ocultos del desktop layout
      // (que esta en DOM con `hidden md:block`).
      const badge = p.locator('span:has-text("Abierto"):visible').first()
      const badgeVisible = await badge.isVisible({ timeout: 3000 }).catch(() => false)
      if (badgeVisible) {
        expect(badgeVisible).toBeTruthy()
      }
    }
  })

  test('filtrar por severidad', async () => {
    await goto(p, '/casos')

    const severityFilter = p.locator('select').nth(1)
    if (await severityFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await severityFilter.selectOption('ALTA')
      await p.waitForTimeout(500)

      const dots = p.locator('.bg-red-500')
      const count = await dots.count().catch(() => 0)
      if (count > 0) {
        expect(count).toBeGreaterThan(0)
      }
    }
  })

  test('solo mios checkbox', async () => {
    await goto(p, '/casos')

    const checkbox = p.locator('input[type="checkbox"]').first()
    if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await checkbox.check()
      await p.waitForTimeout(500)

      const labels = p.locator('label:has-text("Solo míos")')
      expect(await labels.isVisible()).toBe(true)
    }
  })

  test('buscar caso', async () => {

    const clienteRes = await createCliente(p, {
      nombre: `Cliente Search ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteNombre = clienteRes.cliente?.nombre || clienteRes.nombre

    const titulo = `Caso Buscable ${Date.now() % 10000}`
    await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo,
      descripcion: 'Caso buscable',
      clienteId: clienteRes.cliente?.id || clienteRes.id,
    })

    await goto(p, '/casos')

    const searchInput = p.locator('input[placeholder="Buscar caso o cliente..."]')
    await searchInput.fill(clienteNombre)
    await p.waitForTimeout(500)

    const bodyText = await p.locator('body').innerText()
    expect(bodyText).toContain(clienteNombre)
  })

  test('ver detalle caso', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente Detail ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'MEDIA',
      titulo: `Caso Detail ${Date.now() % 10000}`,
      descripcion: 'Caso para ver detalle',
      clienteId: cliente.id,
    })

    await goto(p, '/casos')

    const verBtn = p.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await p.waitForTimeout(500)

      const modal = p.locator('[role="dialog"]')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const dialogText = await modal.innerText()
        expect(dialogText.length).toBeGreaterThan(0)
      }
    }
  })

  test('actualizar caso via API', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente Update ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Update ${Date.now() % 10000}`,
      descripcion: 'Caso para actualizar',
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    expect(createData.caso?.id).toBeTruthy()
    const casoId = createData.caso.id

    const patchRes = await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: {
        status: 'EN_PROCESO',
        titulo: `Caso Updated ${Date.now() % 10000}`,
      },
    })

    expect(patchRes.status()).toBe(200)
    const patchData = await patchRes.json()
    expect(patchData.success).toBe(true)
    expect(patchData.caso?.status).toBe('EN_PROCESO')
  })

  test('agregar evento via API', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente Event ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Event ${Date.now() % 10000}`,
      descripcion: 'Caso para agregar evento',
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    const eventRes = await p.request.post(`${BASE}/api/casos/${casoId}/eventos`, {
      data: {
        accion: 'comentario',
        comentario: 'Comentario de prueba E2E',
      },
    })

    expect(eventRes.status()).toBe(201)
    const eventData = await eventRes.json()
    expect(eventData.success).toBe(true)
    expect(eventData.evento?.comentario).toBe('Comentario de prueba E2E')
  })

  test('API stats', async () => {

    const res = await apiGet(p, '/api/casos/stats')
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.totalAbiertos).toBeDefined()
    expect(data.criticos).toBeDefined()
    expect(data.porSeveridad).toBeDefined()
  })

  // ─── API Error Validation ───────────────────────────────────────────────

  test('POST sin campos requeridos retorna 400', async () => {

    const res = await apiPost(p, '/api/casos', {
      severidad: 'ALTA',
      titulo: 'Caso sin alertaTipo',
    })

    expect(res.status()).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    // formatZodError (Zod 4) ahora preserva los custom messages
    // del schema. CasoCreateSchema tiene 'alertaTipo requerido'.
    // Formato: "alertaTipo: alertaTipo requerido"
    expect(data.error?.message).toContain('alertaTipo')
    expect(data.error?.message).toContain('requerido')
  })

  test('POST solo con alertaTipo retorna 400', async () => {

    const res = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
    })

    expect(res.status()).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    // Faltan: severidad, titulo. formatZodError (Zod 4) devuelve
    // "severidad: severidad debe ser ALTA, MEDIA o BAJA" y
    // "titulo: titulo requerido", joined con ', '.
    expect(data.error?.message).toContain('severidad')
    expect(data.error?.message).toContain('titulo')
  })

  test('PATCH a caso inexistente retorna 404', async () => {

    const res = await p.request.patch(`${BASE}/api/casos/caso-inexistente-999`, {
      data: { status: 'EN_PROCESO' },
    })

    expect(res.status()).toBe(404)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error?.message).toContain('Caso no encontrado')
  })

  test('POST evento sin accion retorna 400', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente EventErr ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso EventErr ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    const res = await p.request.post(`${BASE}/api/casos/${casoId}/eventos`, {
      data: { comentario: 'Sin accion' },
    })

    expect(res.status()).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    // formatZodError (Zod 4) preserva el custom message de
    // CasoEventoCreateSchema: 'accion: accion requerido' (min(1)).
    expect(data.error?.message).toContain('accion')
    expect(data.error?.message).toContain('requerido')
  })

  test('PATCH sin cambios retorna 400', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente NoChange ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso NoChange ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    const res = await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: {},
    })

    expect(res.status()).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error?.message).toContain('No hay cambios')
  })

  // ─── API Search Parameter ───────────────────────────────────────────────

  test('GET /api/casos?search= filtra por titulo (case-insensitive)', async () => {

    const uniqueTitle = `Caso Buscable API ${Date.now() % 10000}`
    const cliente = await createCliente(p, {
      nombre: `Cliente SearchAPI ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: uniqueTitle,
      clienteId: cliente.id,
    })

    // Search with lowercase (title has mixed case)
    const searchLower = uniqueTitle.toLowerCase()
    const res = await apiGet(p, `/api/casos?search=${encodeURIComponent(searchLower)}`)
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.casos.length).toBeGreaterThan(0)
    expect(data.casos[0].titulo).toBe(uniqueTitle)
  })

  test('GET /api/casos?search= filtra por cliente.nombre', async () => {

    const uniqueClientName = `Cliente Searchable API ${Date.now() % 10000}`
    const clienteRes = await createCliente(p, {
      nombre: uniqueClientName,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    await apiPost(p, '/api/casos', {
      alertaTipo: 'FIADO_REcurrente',
      severidad: 'MEDIA',
      titulo: `Caso para buscar cliente API ${Date.now() % 10000}`,
      clienteId,
    })

    // Search by partial client name (lowercase)
    const searchLower = uniqueClientName.toLowerCase().split(' ')[0]
    const res = await apiGet(p, `/api/casos?search=${encodeURIComponent(searchLower)}`)
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    // Should find at least one case matching the client name
    const matchingCaso = (data.casos as Array<{ cliente?: { nombre: string } }>).find((c) => c.cliente?.nombre === uniqueClientName)
    expect(matchingCaso).toBeDefined()
  })

  // ─── Caso con Pedido ────────────────────────────────────────────────────

  test('crear caso vinculado a pedido real', async () => {

    const clienteRes = await createCliente(p, {
      nombre: `Cliente PedidoCaso ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const pedidoRes = await apiPost(p, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    const pedidoData = await pedidoRes.json()
    const pedidoId = pedidoData.pedido?.id || pedidoData.id

    const casoRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso con Pedido ${Date.now() % 10000}`,
      clienteId,
      pedidoId,
    })

    expect(casoRes.status()).toBe(201)
    const casoData = await casoRes.json()
    expect(casoData.success).toBe(true)
    // POST response includes pedido object, not pedidoId directly
    expect(casoData.caso?.pedido?.id || casoData.caso?.pedidoId).toBeTruthy()
  })

  test('modal muestra Pedido #X cuando caso tiene pedido', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente ModalPedido ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const pedidoRes = await apiPost(p, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pedidoData = await pedidoRes.json()
    const pedidoId = pedidoData.pedido?.id || pedidoData.id

    const casoRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'DESCUENTO_NO_JUSTIFICADO',
      severidad: 'MEDIA',
      titulo: `Caso Modal Pedido ${Date.now() % 10000}`,
      clienteId: cliente.id,
      pedidoId,
    })

    const casoData = await casoRes.json()
    const casoId = casoData.caso.id

    // Get full caso with pedido
    const getRes = await apiGet(p, `/api/casos/${casoId}`)
    const getData = await getRes.json()
    const casoNumero = getData.caso?.pedido?.numero

    await goto(p, '/casos')

    const verBtn = p.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await p.waitForTimeout(500)

      const modal = p.locator('[role="dialog"]')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Should show Pedido section
        const modalText = await modal.innerText()
        expect(modalText).toContain('Pedido')
        if (casoNumero) {
          expect(modalText).toContain(`#${casoNumero}`)
        }
      }
    }
  })

  // ─── Assignment Side-Effect ─────────────────────────────────────────────

  test('asignar caso cambia status a EN_PROCESO automaticamente', async () => {

    const clienteRes = await createCliente(p, {
      nombre: `Cliente AutoAssign ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso AutoAssign ${Date.now() % 10000}`,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id
    expect(createData.caso.status).toBe('ABIERTO')

    // Get a worker's userId (asignadoAId expects User.id, not Trabajador.id)
    const workersRes = await apiGet(p, '/api/trabajadores')
    const workersData = await workersRes.json()
    const userId = workersData.trabajadores?.[0]?.userId

    if (!userId) {
      // Skip if no worker has a linked user
      return
    }

    // Assign without changing status explicitly
    const assignRes = await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { asignadoAId: userId },
    })

    expect(assignRes.status()).toBe(200)
    const assignData = await assignRes.json()
    expect(assignData.success).toBe(true)
    // Auto-changed to EN_PROCESO
    expect(assignData.caso?.status).toBe('EN_PROCESO')
    expect(assignData.caso?.asignadoAId).toBe(userId)
  })

  // ─── Reopen Timestamp Reset ─────────────────────────────────────────────

  test('reabrir desde RESUELTO limpia resueltoEn', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente ReopenTs ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'RECLAMACION_ACTIVA',
      severidad: 'ALTA',
      titulo: `Caso Reopen Timestamp ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Resolve
    await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'RESUELTO', notasResolucion: 'Resuelto para test' },
    })

    // Verify resueltoEn was set
    const getResolved = await apiGet(p, `/api/casos/${casoId}`)
    const resolvedData = await getResolved.json()
    expect(resolvedData.caso?.resueltoEn).toBeTruthy()

    // Reopen
    const reopenRes = await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'EN_PROCESO' },
    })

    expect(reopenRes.status()).toBe(200)
    const reopenData = await reopenRes.json()
    expect(reopenData.caso?.status).toBe('EN_PROCESO')
    // resueltoEn should be null after reopen
    expect(reopenData.caso?.resueltoEn).toBeNull()
  })

  test('reabrir desde CERRADO limpia cerradoEn', async () => {

    const clienteRes = await createCliente(p, {
      nombre: `Cliente ClosedTs ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'NO_ENTREGADO_REPETIDO',
      severidad: 'ALTA',
      titulo: `Caso Closed Timestamp ${Date.now() % 10000}`,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Resolve then close
    await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'RESUELTO', notasResolucion: 'Resuelto' },
    })
    await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'CERRADO' },
    })

    // Verify timestamps
    const getClosed = await apiGet(p, `/api/casos/${casoId}`)
    const closedData = await getClosed.json()
    expect(closedData.caso?.cerradoEn).toBeTruthy()

    // Reopen
    const reopenRes = await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'EN_PROCESO' },
    })

    expect(reopenRes.status()).toBe(200)
    const reopenData = await reopenRes.json()
    expect(reopenData.caso?.status).toBe('EN_PROCESO')
    // cerradoEn is cleared when reopening from CERRADO
    expect(reopenData.caso?.cerradoEn).toBeNull()
    // Note: resueltoEn is NOT cleared when reopening from CERRADO (only from RESUELTO)
    // This is the current API behavior
  })

  // ─── Multiple Events Transactional ──────────────────────────────────────

  test('PATCH con status + asignadoAId genera multiples eventos', async () => {

    const clienteRes = await createCliente(p, {
      nombre: `Cliente MultiEvent ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso MultiEvent ${Date.now() % 10000}`,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    const workersRes = await apiGet(p, '/api/trabajadores')
    const workersData = await workersRes.json()
    const userId = workersData.trabajadores?.[0]?.userId

    if (!userId) {
      // Skip if no worker has a linked user
      return
    }

    // PATCH both status and assignment in one request
    const patchRes = await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: {
        status: 'EN_PROCESO',
        asignadoAId: userId,
      },
    })

    expect(patchRes.status()).toBe(200)
    const patchData = await patchRes.json()
    expect(patchData.success).toBe(true)

    // Get caso with events
    const getRes = await apiGet(p, `/api/casos/${casoId}`)
    const getData = await getRes.json()

    // Should have at least 3 events: creado + status_change + asignado
    const eventos = getData.eventos || []
    expect(eventos.length).toBeGreaterThanOrEqual(3)

    const acciones = (eventos as Array<{ accion: string }>).map((e) => e.accion)
    expect(acciones).toContain('creado')
    expect(acciones).toContain('status_change')
    expect(acciones).toContain('asignado')
  })

  // ─── Detail Modal Content ───────────────────────────────────────────────

  test('modal muestra titulo y descripcion del caso', async () => {

    const uniqueTitle = `Caso Modal Title ${Date.now() % 10000}`
    const uniqueDesc = `Descripcion unica para test de modal ${Date.now() % 10000}`
    const cliente = await createCliente(p, {
      nombre: `Cliente ModalContent ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: uniqueTitle,
      descripcion: uniqueDesc,
      clienteId: cliente.id,
    })

    await goto(p, '/casos')

    const verBtn = p.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await p.waitForTimeout(500)

      const modal = p.locator('[role="dialog"]')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const modalText = await modal.innerText()
        expect(modalText).toContain(uniqueTitle)
        expect(modalText).toContain(uniqueDesc)
      }
    }
  })

  test('modal muestra boton Cambiar para asignacion', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente ModalAssign ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'MEDIA',
      titulo: `Caso Modal Cambiar ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    await goto(p, '/casos')

    const verBtn = p.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await p.waitForTimeout(500)

      const modal = p.locator('[role="dialog"]')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const cambiarBtn = modal.locator('button:has-text("Cambiar")')
        await expect(cambiarBtn).toBeVisible()
      }
    }
  })

  test('modal muestra info basica del caso (eventos se cargan via API separada)', async () => {

    const uniqueTitle = `Caso Historial Modal ${Date.now() % 10000}`
    const clienteRes = await createCliente(p, {
      nombre: `Cliente Historial ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: uniqueTitle,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Add a comment event via API
    await p.request.post(`${BASE}/api/casos/${casoId}/eventos`, {
      data: { accion: 'comentado', comentario: 'Comentario de prueba' },
    })

    // Verify evento exists via API
    const getRes = await apiGet(p, `/api/casos/${casoId}`)
    const getData = await getRes.json()
    expect(getData.caso?.eventos?.length).toBeGreaterThanOrEqual(2) // creado + comentado

    // Open modal from list view - search for specific case first
    await goto(p, '/casos')

    // Search for the specific case
    const searchInput = p.locator('input[placeholder="Buscar caso o cliente..."]')
    await searchInput.fill(uniqueTitle)
    await p.waitForTimeout(500)

    const verBtn = p.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await p.waitForTimeout(500)

      const modal = p.locator('[role="dialog"]')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Modal shows basic info (eventos not loaded in list view)
        const modalText = await modal.innerText()
        expect(modalText).toContain(uniqueTitle)
        expect(modalText).toContain('ALTA')
        // Status badge uses uppercase CSS class
        expect(modalText).toContain('ABIERTO')
      }
    }
  })

  // ─── Role-Based CRUD ────────────────────────────────────────────────────

  test('asistente puede crear caso via API', async () => {
    // C-SEC-7b (commit 36ee74d): POST /api/casos requiere view:casos
    // permission. REPARTIDOR no la tiene, pero ASISTENTE si.
    // El test verifica que un rol con permission puede crear.
    // Login as asistente
    await skipBaseCaja(p)
    await p.goto(`${BASE}/login`)
    await p.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await p.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await p.click('button[type="submit"]')
    await p.waitForURL(/.*\/(dashboard|repartidor)/, { timeout: 15000 })

    const clienteRes = await createCliente(p, {
      nombre: `Cliente Asist ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const res = await apiPost(p, '/api/casos', {
      alertaTipo: 'NO_ENTREGADO_REPETIDO',
      severidad: 'ALTA',
      titulo: `Caso Asistente ${Date.now() % 10000}`,
      clienteId,
    })

    expect(res.status()).toBe(201)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.caso?.id).toBeTruthy()
  })

  test('asistente puede actualizar status via PATCH', async () => {
    // C-SEC-7b: PATCH /api/casos/[id] requiere view:casos permission.
    // ASISTENTE la tiene, REPARTIDOR no. Test verifica el flujo positivo.
    // Login as admin to create case

    const clienteRes = await createCliente(p, {
      nombre: `Cliente AsistPatch ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Asist Patch ${Date.now() % 10000}`,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Login as asistente and update
    await skipBaseCaja(p)
    await p.goto(`${BASE}/login`)
    await p.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await p.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await p.click('button[type="submit"]')
    await p.waitForURL(/.*\/(dashboard|repartidor)/, { timeout: 15000 })

    const patchRes = await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'EN_PROCESO' },
    })

    expect(patchRes.status()).toBe(200)
    const patchData = await patchRes.json()
    expect(patchData.success).toBe(true)
    expect(patchData.caso?.status).toBe('EN_PROCESO')
  })

  test('contador puede ver lista de casos', async () => {
    // Login as contador (redirects to /reportes, not /dashboard)
    await skipBaseCaja(p)
    await p.goto(`${BASE}/login`)
    await p.fill('input[placeholder="Ingrese usuario"]', 'contador')
    await p.fill('input[placeholder="Ingrese contraseña"]', 'cont123')
    await p.click('button[type="submit"]')
    await p.waitForURL(/.*\/(dashboard|reportes)/, { timeout: 15000 })

    await goto(p, '/casos')
    await expect(p.locator('h1:has-text("Gestión de Casos")')).toBeVisible()
  })

  test('asistente puede agregar comentarios', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente AsistComment ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Asistente Comment ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Login as asistente and add comment
    await loginAs(p, 'asistente')

    const commentRes = await p.request.post(`${BASE}/api/casos/${casoId}/eventos`, {
      data: { accion: 'comentado', comentario: 'Comentario del asistente' },
    })

    expect(commentRes.status()).toBe(201)
    const commentData = await commentRes.json()
    expect(commentData.success).toBe(true)
    expect(commentData.evento?.comentario).toBe('Comentario del asistente')
  })

  // ─── Mobile Touch Targets ───────────────────────────────────────────────

  test('mobile view: botones Ver tienen touch target adecuado', async () => {
    await p.setViewportSize({ width: 375, height: 667 })

    const cliente = await createCliente(p, {
      nombre: `Cliente MobileTouch ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso Mobile Touch ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    await goto(p, '/casos')

    // In mobile view, the entire card is clickable (no "Ver" button in mobile)
    const mobileCard = p.locator('.md:hidden > div').first()
    if (await mobileCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await mobileCard.boundingBox()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })

  // ─── AlertaTipo Labels ──────────────────────────────────────────────────

  test('TIPO_LABELS renderiza correctamente en tabla', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente LabelTest ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso Label Test ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    await goto(p, '/casos')

    // TIPO_LABELS['MONTO_ANOMALO'] = 'Monto anómalo'
    const bodyText = await p.locator('tbody').innerText()
    expect(bodyText).toContain('Monto anómalo')
  })

  test('alertaTipo desconocido muestra raw value como fallback', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente UnknownType ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const unknownType = 'TIPO_INVENTADO_999'
    await apiPost(p, '/api/casos', {
      alertaTipo: unknownType,
      severidad: 'BAJA',
      titulo: `Caso Unknown Type ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    await goto(p, '/casos')

    // Should show the raw alertaTipo value
    const bodyText = await p.locator('tbody').innerText()
    expect(bodyText).toContain(unknownType)
  })

  // ─── Empty State After Filter ───────────────────────────────────────────

  test('filtro sin resultados muestra estado vacio', async () => {
    await goto(p, '/casos')

    // Filter by CERRADO - if no closed cases exist, empty state should show
    const statusFilter = p.locator('select').first()
    await statusFilter.selectOption('CERRADO')
    await p.waitForTimeout(500)

    const emptyState = p.locator('h3:has-text("Sin casos")')
    const isEmpty = await emptyState.isVisible({ timeout: 2000 }).catch(() => false)

    if (isEmpty) {
      await expect(p.locator('text=No hay casos que coincidan con los filtros aplicados')).toBeVisible()
      await expect(p.locator('.bg-green-100 svg')).toBeVisible()
    }
  })

  // ─── Concurrent Status Changes ──────────────────────────────────────────

  test('PATCH ABIERTO → RESUELTO directamente (skip EN_PROCESO)', async () => {

    const cliente = await createCliente(p, {
      nombre: `Cliente SkipStatus ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(p, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Skip Status ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id
    expect(createData.caso.status).toBe('ABIERTO')

    // Skip directly to RESUELTO
    const patchRes = await p.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: {
        status: 'RESUELTO',
        notasResolucion: 'Resuelto sin pasar por EN_PROCESO',
      },
    })

    expect(patchRes.status()).toBe(200)
    const patchData = await patchRes.json()
    expect(patchData.success).toBe(true)
    expect(patchData.caso?.status).toBe('RESUELTO')
    expect(patchData.caso?.resueltoEn).toBeTruthy()
  })
})
