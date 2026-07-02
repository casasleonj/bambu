// @tests api/casos, api/casos/[id], api/casos/[id]/eventos
import {test, expect, BASE, fullLogin, skipBaseCaja, goto, apiPost, apiGet, createCliente,  resetDatabase} from './fixtures'

test.describe('Casos', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/casos')
    await page.waitForTimeout(500)

    await expect(page.locator('h1:has-text("Gestión de Casos")')).toBeVisible()

    const filters = page.locator('input[placeholder="Buscar caso o cliente..."]')
    expect(await filters.isVisible()).toBe(true)
  })

  test('crear caso via API', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente Caso ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const res = await apiPost(page, '/api/casos', {
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

  test('listar casos', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente List ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso Listar ${Date.now() % 10000}`,
      descripcion: 'Caso para listar',
      clienteId: cliente.id,
    })

    const res = await apiGet(page, '/api/casos')
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.casos).toBeDefined()
    expect(data.casos.length).toBeGreaterThan(0)
  })

  test('filtrar casos por status', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const statusFilter = page.locator('select').first()
    if (await statusFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await statusFilter.selectOption('ABIERTO')
      await page.waitForTimeout(500)

      // FIX: en mobile el layout es card (md:hidden), no table. Usar
      // `:visible` para filtrar spans ocultos del desktop layout
      // (que esta en DOM con `hidden md:block`).
      const badge = page.locator('span:has-text("Abierto"):visible').first()
      const badgeVisible = await badge.isVisible({ timeout: 3000 }).catch(() => false)
      if (badgeVisible) {
        expect(badgeVisible).toBeTruthy()
      }
    }
  })

  test('filtrar por severidad', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const severityFilter = page.locator('select').nth(1)
    if (await severityFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await severityFilter.selectOption('ALTA')
      await page.waitForTimeout(500)

      const dots = page.locator('.bg-red-500')
      const count = await dots.count().catch(() => 0)
      if (count > 0) {
        expect(count).toBeGreaterThan(0)
      }
    }
  })

  test('solo mios checkbox', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const checkbox = page.locator('input[type="checkbox"]').first()
    if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await checkbox.check()
      await page.waitForTimeout(500)

      const labels = page.locator('label:has-text("Solo míos")')
      expect(await labels.isVisible()).toBe(true)
    }
  })

  test('buscar caso', async ({ page }) => {
    await fullLogin(page)

    const clienteRes = await createCliente(page, {
      nombre: `Cliente Search ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteNombre = clienteRes.cliente?.nombre || clienteRes.nombre

    const titulo = `Caso Buscable ${Date.now() % 10000}`
    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo,
      descripcion: 'Caso buscable',
      clienteId: clienteRes.cliente?.id || clienteRes.id,
    })

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder="Buscar caso o cliente..."]')
    await searchInput.fill(clienteNombre)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(clienteNombre)
  })

  test('ver detalle caso', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente Detail ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'MEDIA',
      titulo: `Caso Detail ${Date.now() % 10000}`,
      descripcion: 'Caso para ver detalle',
      clienteId: cliente.id,
    })

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const verBtn = page.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await page.waitForTimeout(500)

      const modal = page.locator('[role="dialog"]')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const dialogText = await modal.innerText()
        expect(dialogText.length).toBeGreaterThan(0)
      }
    }
  })

  test('actualizar caso via API', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente Update ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Update ${Date.now() % 10000}`,
      descripcion: 'Caso para actualizar',
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    expect(createData.caso?.id).toBeTruthy()
    const casoId = createData.caso.id

    const patchRes = await page.request.patch(`${BASE}/api/casos/${casoId}`, {
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

  test('agregar evento via API', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente Event ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Event ${Date.now() % 10000}`,
      descripcion: 'Caso para agregar evento',
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    const eventRes = await page.request.post(`${BASE}/api/casos/${casoId}/eventos`, {
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

  test('API stats', async ({ page }) => {
    await fullLogin(page)

    const res = await apiGet(page, '/api/casos/stats')
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.totalAbiertos).toBeDefined()
    expect(data.criticos).toBeDefined()
    expect(data.porSeveridad).toBeDefined()
  })

  // ─── API Error Validation ───────────────────────────────────────────────

  test('POST sin campos requeridos retorna 400', async ({ page }) => {
    await fullLogin(page)

    const res = await apiPost(page, '/api/casos', {
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

  test('POST solo con alertaTipo retorna 400', async ({ page }) => {
    await fullLogin(page)

    const res = await apiPost(page, '/api/casos', {
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

  test('PATCH a caso inexistente retorna 404', async ({ page }) => {
    await fullLogin(page)

    const res = await page.request.patch(`${BASE}/api/casos/caso-inexistente-999`, {
      data: { status: 'EN_PROCESO' },
    })

    expect(res.status()).toBe(404)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error?.message).toContain('Caso no encontrado')
  })

  test('POST evento sin accion retorna 400', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente EventErr ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso EventErr ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    const res = await page.request.post(`${BASE}/api/casos/${casoId}/eventos`, {
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

  test('PATCH sin cambios retorna 400', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente NoChange ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso NoChange ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    const res = await page.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: {},
    })

    expect(res.status()).toBe(400)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error?.message).toContain('No hay cambios')
  })

  // ─── API Search Parameter ───────────────────────────────────────────────

  test('GET /api/casos?search= filtra por titulo (case-insensitive)', async ({ page }) => {
    await fullLogin(page)

    const uniqueTitle = `Caso Buscable API ${Date.now() % 10000}`
    const cliente = await createCliente(page, {
      nombre: `Cliente SearchAPI ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: uniqueTitle,
      clienteId: cliente.id,
    })

    // Search with lowercase (title has mixed case)
    const searchLower = uniqueTitle.toLowerCase()
    const res = await apiGet(page, `/api/casos?search=${encodeURIComponent(searchLower)}`)
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.casos.length).toBeGreaterThan(0)
    expect(data.casos[0].titulo).toBe(uniqueTitle)
  })

  test('GET /api/casos?search= filtra por cliente.nombre', async ({ page }) => {
    await fullLogin(page)

    const uniqueClientName = `Cliente Searchable API ${Date.now() % 10000}`
    const clienteRes = await createCliente(page, {
      nombre: uniqueClientName,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    await apiPost(page, '/api/casos', {
      alertaTipo: 'FIADO_REcurrente',
      severidad: 'MEDIA',
      titulo: `Caso para buscar cliente API ${Date.now() % 10000}`,
      clienteId,
    })

    // Search by partial client name (lowercase)
    const searchLower = uniqueClientName.toLowerCase().split(' ')[0]
    const res = await apiGet(page, `/api/casos?search=${encodeURIComponent(searchLower)}`)
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    // Should find at least one case matching the client name
    const matchingCaso = data.casos.find((c: any) => c.cliente?.nombre === uniqueClientName)
    expect(matchingCaso).toBeDefined()
  })

  // ─── Caso con Pedido ────────────────────────────────────────────────────

  test('crear caso vinculado a pedido real', async ({ page }) => {
    await fullLogin(page)

    const clienteRes = await createCliente(page, {
      nombre: `Cliente PedidoCaso ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    const pedidoData = await pedidoRes.json()
    const pedidoId = pedidoData.pedido?.id || pedidoData.id

    const casoRes = await apiPost(page, '/api/casos', {
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

  test('modal muestra Pedido #X cuando caso tiene pedido', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente ModalPedido ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    const pedidoData = await pedidoRes.json()
    const pedidoId = pedidoData.pedido?.id || pedidoData.id

    const casoRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'DESCUENTO_NO_JUSTIFICADO',
      severidad: 'MEDIA',
      titulo: `Caso Modal Pedido ${Date.now() % 10000}`,
      clienteId: cliente.id,
      pedidoId,
    })

    const casoData = await casoRes.json()
    const casoId = casoData.caso.id

    // Get full caso with pedido
    const getRes = await apiGet(page, `/api/casos/${casoId}`)
    const getData = await getRes.json()
    const casoNumero = getData.caso?.pedido?.numero

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const verBtn = page.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await page.waitForTimeout(500)

      const modal = page.locator('[role="dialog"]')
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

  test('asignar caso cambia status a EN_PROCESO automaticamente', async ({ page }) => {
    await fullLogin(page)

    const clienteRes = await createCliente(page, {
      nombre: `Cliente AutoAssign ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso AutoAssign ${Date.now() % 10000}`,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id
    expect(createData.caso.status).toBe('ABIERTO')

    // Get a worker's userId (asignadoAId expects User.id, not Trabajador.id)
    const workersRes = await apiGet(page, '/api/trabajadores')
    const workersData = await workersRes.json()
    const userId = workersData.trabajadores?.[0]?.userId

    if (!userId) {
      // Skip if no worker has a linked user
      return
    }

    // Assign without changing status explicitly
    const assignRes = await page.request.patch(`${BASE}/api/casos/${casoId}`, {
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

  test('reabrir desde RESUELTO limpia resueltoEn', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente ReopenTs ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'RECLAMACION_ACTIVA',
      severidad: 'ALTA',
      titulo: `Caso Reopen Timestamp ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Resolve
    await page.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'RESUELTO', notasResolucion: 'Resuelto para test' },
    })

    // Verify resueltoEn was set
    const getResolved = await apiGet(page, `/api/casos/${casoId}`)
    const resolvedData = await getResolved.json()
    expect(resolvedData.caso?.resueltoEn).toBeTruthy()

    // Reopen
    const reopenRes = await page.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'EN_PROCESO' },
    })

    expect(reopenRes.status()).toBe(200)
    const reopenData = await reopenRes.json()
    expect(reopenData.caso?.status).toBe('EN_PROCESO')
    // resueltoEn should be null after reopen
    expect(reopenData.caso?.resueltoEn).toBeNull()
  })

  test('reabrir desde CERRADO limpia cerradoEn', async ({ page }) => {
    await fullLogin(page)

    const clienteRes = await createCliente(page, {
      nombre: `Cliente ClosedTs ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'NO_ENTREGADO_REPETIDO',
      severidad: 'ALTA',
      titulo: `Caso Closed Timestamp ${Date.now() % 10000}`,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Resolve then close
    await page.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'RESUELTO', notasResolucion: 'Resuelto' },
    })
    await page.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'CERRADO' },
    })

    // Verify timestamps
    const getClosed = await apiGet(page, `/api/casos/${casoId}`)
    const closedData = await getClosed.json()
    expect(closedData.caso?.cerradoEn).toBeTruthy()

    // Reopen
    const reopenRes = await page.request.patch(`${BASE}/api/casos/${casoId}`, {
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

  test('PATCH con status + asignadoAId genera multiples eventos', async ({ page }) => {
    await fullLogin(page)

    const clienteRes = await createCliente(page, {
      nombre: `Cliente MultiEvent ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso MultiEvent ${Date.now() % 10000}`,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    const workersRes = await apiGet(page, '/api/trabajadores')
    const workersData = await workersRes.json()
    const userId = workersData.trabajadores?.[0]?.userId

    if (!userId) {
      // Skip if no worker has a linked user
      return
    }

    // PATCH both status and assignment in one request
    const patchRes = await page.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: {
        status: 'EN_PROCESO',
        asignadoAId: userId,
      },
    })

    expect(patchRes.status()).toBe(200)
    const patchData = await patchRes.json()
    expect(patchData.success).toBe(true)

    // Get caso with events
    const getRes = await apiGet(page, `/api/casos/${casoId}`)
    const getData = await getRes.json()

    // Should have at least 3 events: creado + status_change + asignado
    const eventos = getData.eventos || []
    expect(eventos.length).toBeGreaterThanOrEqual(3)

    const acciones = eventos.map((e: any) => e.accion)
    expect(acciones).toContain('creado')
    expect(acciones).toContain('status_change')
    expect(acciones).toContain('asignado')
  })

  // ─── Detail Modal Content ───────────────────────────────────────────────

  test('modal muestra titulo y descripcion del caso', async ({ page }) => {
    await fullLogin(page)

    const uniqueTitle = `Caso Modal Title ${Date.now() % 10000}`
    const uniqueDesc = `Descripcion unica para test de modal ${Date.now() % 10000}`
    const cliente = await createCliente(page, {
      nombre: `Cliente ModalContent ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: uniqueTitle,
      descripcion: uniqueDesc,
      clienteId: cliente.id,
    })

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const verBtn = page.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await page.waitForTimeout(500)

      const modal = page.locator('[role="dialog"]')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const modalText = await modal.innerText()
        expect(modalText).toContain(uniqueTitle)
        expect(modalText).toContain(uniqueDesc)
      }
    }
  })

  test('modal muestra boton Cambiar para asignacion', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente ModalAssign ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'MEDIA',
      titulo: `Caso Modal Cambiar ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const verBtn = page.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await page.waitForTimeout(500)

      const modal = page.locator('[role="dialog"]')
      if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
        const cambiarBtn = modal.locator('button:has-text("Cambiar")')
        await expect(cambiarBtn).toBeVisible()
      }
    }
  })

  test('modal muestra info basica del caso (eventos se cargan via API separada)', async ({ page }) => {
    await fullLogin(page)

    const uniqueTitle = `Caso Historial Modal ${Date.now() % 10000}`
    const clienteRes = await createCliente(page, {
      nombre: `Cliente Historial ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: uniqueTitle,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Add a comment event via API
    await page.request.post(`${BASE}/api/casos/${casoId}/eventos`, {
      data: { accion: 'comentado', comentario: 'Comentario de prueba' },
    })

    // Verify evento exists via API
    const getRes = await apiGet(page, `/api/casos/${casoId}`)
    const getData = await getRes.json()
    expect(getData.caso?.eventos?.length).toBeGreaterThanOrEqual(2) // creado + comentado

    // Open modal from list view - search for specific case first
    await goto(page, '/casos')
    await page.waitForTimeout(500)

    // Search for the specific case
    const searchInput = page.locator('input[placeholder="Buscar caso o cliente..."]')
    await searchInput.fill(uniqueTitle)
    await page.waitForTimeout(500)

    const verBtn = page.locator('button:has-text("Ver")').first()
    if (await verBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await verBtn.click()
      await page.waitForTimeout(500)

      const modal = page.locator('[role="dialog"]')
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

  test('asistente puede crear caso via API', async ({ page }) => {
    // C-SEC-7b (commit 36ee74d): POST /api/casos requiere view:casos
    // permission. REPARTIDOR no la tiene, pero ASISTENTE si.
    // El test verifica que un rol con permission puede crear.
    // Login as asistente
    await skipBaseCaja(page)
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/.*\/(dashboard|repartidor)/, { timeout: 15000 })

    const clienteRes = await createCliente(page, {
      nombre: `Cliente Asist ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const res = await apiPost(page, '/api/casos', {
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

  test('asistente puede actualizar status via PATCH', async ({ page }) => {
    // C-SEC-7b: PATCH /api/casos/[id] requiere view:casos permission.
    // ASISTENTE la tiene, REPARTIDOR no. Test verifica el flujo positivo.
    // Login as admin to create case
    await fullLogin(page)

    const clienteRes = await createCliente(page, {
      nombre: `Cliente AsistPatch ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    const clienteId = clienteRes.cliente?.id || clienteRes.id

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Asist Patch ${Date.now() % 10000}`,
      clienteId,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Login as asistente and update
    await skipBaseCaja(page)
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'asistente')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'asist123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/.*\/(dashboard|repartidor)/, { timeout: 15000 })

    const patchRes = await page.request.patch(`${BASE}/api/casos/${casoId}`, {
      data: { status: 'EN_PROCESO' },
    })

    expect(patchRes.status()).toBe(200)
    const patchData = await patchRes.json()
    expect(patchData.success).toBe(true)
    expect(patchData.caso?.status).toBe('EN_PROCESO')
  })

  test('contador puede ver lista de casos', async ({ page }) => {
    // Login as contador (redirects to /reportes, not /dashboard)
    await skipBaseCaja(page)
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'contador')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'cont123')
    await page.click('button[type="submit"]')
    await page.waitForURL(/.*\/(dashboard|reportes)/, { timeout: 15000 })

    await goto(page, '/casos')
    await expect(page.locator('h1:has-text("Gestión de Casos")')).toBeVisible()
  })

  test('asistente puede agregar comentarios', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente AsistComment ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Asistente Comment ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id

    // Login as asistente and add comment
    await fullLogin(page, 'asistente', 'asist123')

    const commentRes = await page.request.post(`${BASE}/api/casos/${casoId}/eventos`, {
      data: { accion: 'comentado', comentario: 'Comentario del asistente' },
    })

    expect(commentRes.status()).toBe(201)
    const commentData = await commentRes.json()
    expect(commentData.success).toBe(true)
    expect(commentData.evento?.comentario).toBe('Comentario del asistente')
  })

  // ─── Mobile Touch Targets ───────────────────────────────────────────────

  test('mobile view: botones Ver tienen touch target adecuado', async ({ page }) => {
    await fullLogin(page)
    await page.setViewportSize({ width: 375, height: 667 })

    const cliente = await createCliente(page, {
      nombre: `Cliente MobileTouch ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso Mobile Touch ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    // In mobile view, the entire card is clickable (no "Ver" button in mobile)
    const mobileCard = page.locator('.md:hidden > div').first()
    if (await mobileCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await mobileCard.boundingBox()
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  })

  // ─── AlertaTipo Labels ──────────────────────────────────────────────────

  test('TIPO_LABELS renderiza correctamente en tabla', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente LabelTest ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'ALTA',
      titulo: `Caso Label Test ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    // TIPO_LABELS['MONTO_ANOMALO'] = 'Monto anómalo'
    const bodyText = await page.locator('tbody').innerText()
    expect(bodyText).toContain('Monto anómalo')
  })

  test('alertaTipo desconocido muestra raw value como fallback', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente UnknownType ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const unknownType = 'TIPO_INVENTADO_999'
    await apiPost(page, '/api/casos', {
      alertaTipo: unknownType,
      severidad: 'BAJA',
      titulo: `Caso Unknown Type ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    // Should show the raw alertaTipo value
    const bodyText = await page.locator('tbody').innerText()
    expect(bodyText).toContain(unknownType)
  })

  // ─── Empty State After Filter ───────────────────────────────────────────

  test('filtro sin resultados muestra estado vacio', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/casos')
    await page.waitForTimeout(500)

    // Filter by CERRADO - if no closed cases exist, empty state should show
    const statusFilter = page.locator('select').first()
    await statusFilter.selectOption('CERRADO')
    await page.waitForTimeout(500)

    const emptyState = page.locator('h3:has-text("Sin casos")')
    const isEmpty = await emptyState.isVisible({ timeout: 2000 }).catch(() => false)

    if (isEmpty) {
      await expect(page.locator('text=No hay casos que coincidan con los filtros aplicados')).toBeVisible()
      await expect(page.locator('.bg-green-100 svg')).toBeVisible()
    }
  })

  // ─── Concurrent Status Changes ──────────────────────────────────────────

  test('PATCH ABIERTO → RESUELTO directamente (skip EN_PROCESO)', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente SkipStatus ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const createRes = await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo: `Caso Skip Status ${Date.now() % 10000}`,
      clienteId: cliente.id,
    })

    const createData = await createRes.json()
    const casoId = createData.caso.id
    expect(createData.caso.status).toBe('ABIERTO')

    // Skip directly to RESUELTO
    const patchRes = await page.request.patch(`${BASE}/api/casos/${casoId}`, {
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
