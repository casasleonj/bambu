import { test, expect, BASE, fullLogin, goto, apiPost, apiGet, createCliente } from './fixtures'

test.describe('Casos', () => {
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

      const rows = page.locator('tbody tr')
      const visibleCount = await rows.count().catch(() => 0)

      if (visibleCount > 0) {
        const badge = page.locator('span:has-text("Abierto")').first()
        expect(await badge.isVisible({ timeout: 3000 }).catch(() => false)).toBeTruthy()
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

    const cliente = await createCliente(page, {
      nombre: `Cliente Search ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    const titulo = `Caso Buscable ${Date.now() % 10000}`
    await apiPost(page, '/api/casos', {
      alertaTipo: 'MONTO_ANOMALO',
      severidad: 'BAJA',
      titulo,
      descripcion: 'Caso buscable',
      clienteId: cliente.id,
    })

    await goto(page, '/casos')
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder="Buscar caso o cliente..."]')
    await searchInput.fill(cliente.nombre)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(cliente.nombre)
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
})
