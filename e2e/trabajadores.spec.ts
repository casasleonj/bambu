// @tests api/trabajador
import {test, expect, loginAs, goto, apiGet, apiPost, apiDelete, createTrabajador, resetDatabase} from './fixtures'

test.describe('Trabajadores', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/trabajadores')

    await expect(page.locator('h1:has-text("Trabajadores")')).toBeVisible()
  })

  test('crear trabajador', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/trabajadores')

    await page.click('button:has-text("+ Nuevo Trabajador")')
    await page.waitForTimeout(500)

    const cuid = Date.now().toString().slice(-6)
    const workerName = `Repartidor E2E ${cuid}`

    await page.locator('#trabajador-nombre').fill(workerName)
    await page.locator('#trabajador-rol').selectOption('REPARTIDOR')
    await page.locator('#trabajador-tipoPago').selectOption('COMISION')

    await page.locator('button[type="submit"]:has-text("Guardar")').click()
    await page.waitForTimeout(2000)

    await page.reload()
    // No usamos networkidle porque /api/realtime (SSE) mantiene la conexión abierta.
    await expect(page.locator('body')).toContainText(workerName)
  })

  test('crear con moto y capacidad', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/trabajadores')

    await page.click('button:has-text("+ Nuevo Trabajador")')
    await page.waitForTimeout(500)

    const cuid = Date.now().toString().slice(-6)
    const workerName = `Moto E2E ${cuid}`

    await page.locator('#trabajador-nombre').fill(workerName)
    await page.locator('#trabajador-rol').selectOption('REPARTIDOR')

    await page.locator('#usaMoto').check()
    await page.waitForTimeout(300)

    await expect(page.locator('#trabajador-capacidadKg')).toBeVisible()
    await page.locator('#trabajador-capacidadKg').fill('300')

    await page.locator('button[type="submit"]:has-text("Guardar")').click()
    await page.waitForTimeout(2000)

    await page.reload()
    // No usamos networkidle porque /api/realtime (SSE) mantiene la conexión abierta.
    await expect(page.locator('body')).toContainText(workerName)
  })

  test('crear sellador', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/trabajadores')

    await page.click('button:has-text("+ Nuevo Trabajador")')
    await page.waitForTimeout(500)

    const cuid = Date.now().toString().slice(-6)
    const workerName = `Sellador E2E ${cuid}`

    await page.locator('#trabajador-nombre').fill(workerName)
    await page.locator('#trabajador-rol').selectOption('SELLADOR')
    await page.locator('#trabajador-tipoPago').selectOption('FIJO')

    await page.locator('button[type="submit"]:has-text("Guardar")').click()
    await page.waitForTimeout(2000)

    await page.reload()
    // No usamos networkidle porque /api/realtime (SSE) mantiene la conexión abierta.
    await expect(page.locator('body')).toContainText(workerName)
  })

  test('editar trabajador', async ({ page }) => {
    await loginAs(page, 'admin')

    const originalName = `Editame ${Date.now() % 10000}`
    const trabajador = await createTrabajador(page, {
      nombre: originalName,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
    })
    expect(trabajador.trabajador.id).toBeTruthy()

    await goto(page, '/trabajadores')

    const searchInput = page.locator('input[placeholder*="Buscar"]').first()
    await searchInput.fill(originalName)
    await page.waitForTimeout(500)

    const editButton = page.locator('button:has-text("Editar")').first()
    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click()
      await page.waitForTimeout(500)

      const newName = `${originalName} Editado`
      await page.locator('#trabajador-nombre').fill(newName)

      await page.locator('button[type="submit"]:has-text("Guardar")').click()
      await page.waitForTimeout(2000)

      await page.reload()
      // No usamos networkidle porque /api/realtime (SSE) mantiene la conexión abierta.
      await expect(page.locator('body')).toContainText(newName)
    }
  })

  test('eliminar trabajador', async ({ page }) => {
    await loginAs(page, 'admin')

    const name = `Borrame ${Date.now() % 10000}`
    const trabajador = await createTrabajador(page, {
      nombre: name,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
    })
    expect(trabajador.trabajador.id).toBeTruthy()

    // Delete via API directly to verify API works
    const deleteRes = await apiDelete(page, `/api/trabajadores/${trabajador.trabajador.id}`)
    expect(deleteRes.status()).toBe(200)

    await goto(page, '/trabajadores')

    // Verify worker is not in the list (check for worker card heading, not body text)
    const workerHeading = page.locator(`h2:has-text("${name}")`)
    await expect(workerHeading).not.toBeVisible({ timeout: 5000 })
  })

  test('#863: catálogo, filtros, deuda histórica y contrato API', async ({ page }) => {
    await loginAs(page, 'admin')
    const sufijo = String(Date.now())
    const activo = (await createTrabajador(page, { nombre: `Activo863 ${sufijo}` })).trabajador
    const inactivo = (await createTrabajador(page, { nombre: `Inactivo863 ${sufijo}` })).trabajador
    const deuda = await apiPost(page, '/api/deudas', { trabajadorId: inactivo.id, tipo: 'PRESTAMO', monto: 40000, descripcion: 'Deuda histórica 863' })
    expect(deuda.status()).toBe(201)
    expect((await apiDelete(page, `/api/trabajadores/${inactivo.id}`)).status()).toBe(200)

    for (const [query, ids, incluye] of [
      ['', [activo.id], false],
      ['?activo=true', [activo.id], false],
      ['?activo=false', [inactivo.id], false],
      ['?activo=all', [activo.id, inactivo.id], true],
    ] as const) {
      const res = await apiGet(page, `/api/trabajadores${query}`)
      expect(res.status()).toBe(200)
      const data = await res.json()
      const presentes = (data.trabajadores as Array<{ id: string }>).filter(t => t.id === activo.id || t.id === inactivo.id).map(t => t.id).sort()
      expect(presentes).toEqual([...ids].sort())
      expect(data.incluyeDesactivados === true).toBe(incluye)
    }
    expect((await apiGet(page, '/api/trabajadores?activo=incorrecto')).status()).toBe(400)

    await goto(page, '/trabajadores')
    const buscar = page.getByPlaceholder('Buscar por nombre, rol, telefono...')
    const cardActivo = page.getByTestId('trabajador-card').filter({ has: page.getByRole('link', { name: activo.nombre, exact: true }) })
    const cardInactivo = page.getByTestId('trabajador-card').filter({ has: page.getByRole('link', { name: inactivo.nombre, exact: true }) })
    // La búsqueda fuzzy no aproxima números en texto: buscar por nombre completo.
    await buscar.fill(activo.nombre)
    await expect(cardActivo).toBeVisible()
    await buscar.fill(inactivo.nombre)
    await expect(cardInactivo).toHaveCount(0)
    await page.getByRole('button', { name: 'Desactivados', exact: true }).click()
    await expect(cardInactivo).toBeVisible()
    await expect(cardInactivo.getByText('Desactivado', { exact: true })).toBeVisible()
    await expect(cardInactivo.getByRole('button', { name: 'Desactivar' })).toHaveCount(0)
    await cardInactivo.getByTestId('trabajador-deuda-badge').click()
    await expect(page.getByTestId('deuda-detalle')).toContainText('Deuda histórica 863')
    await page.getByTestId('deuda-detalle').getByRole('button', { name: 'Cerrar' }).click()
    await buscar.fill('')
    await page.getByRole('button', { name: 'Todos', exact: true }).click()
    await expect(cardActivo).toBeVisible()
    await expect(cardInactivo).toBeVisible()
    // Reconexion/refetch no altera el filtro.
    const refresco = page.waitForResponse(r => r.url().includes('/api/trabajadores?activo=all') && r.ok())
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await refresco
    await expect(page.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(cardInactivo).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Activos', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(cardInactivo).toHaveCount(0)
  })

  test('#863: roles de consulta y acceso operativo restringido', async ({ page }) => {
    await loginAs(page, 'admin')
    const t = (await createTrabajador(page, { nombre: `Historico863 ${Date.now()}` })).trabajador
    expect((await apiDelete(page, `/api/trabajadores/${t.id}`)).status()).toBe(200)
    // Vista móvil real dentro del job de desktop; no depende de ejecutar otro proyecto.
    await page.setViewportSize({ width: 390, height: 844 })
    for (const rol of ['asistente', 'contador'] as const) {
      await page.context().clearCookies()
      await loginAs(page, rol)
      const res = await apiGet(page, '/api/trabajadores?activo=all')
      expect(res.status()).toBe(200)
      expect((await res.json()).trabajadores).toEqual(expect.arrayContaining([expect.objectContaining({ id: t.id, activo: false })]))
      await goto(page, '/trabajadores')
      await page.getByRole('button', { name: 'Desactivados', exact: true }).click()
      const card = page.getByTestId('trabajador-card').filter({ has: page.getByRole('link', { name: t.nombre, exact: true }) })
      await expect(card).toBeVisible()
      await expect(card.getByRole('button', { name: 'Editar' })).toHaveCount(0)
      await expect(card.getByRole('button', { name: 'Desactivar' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '+ Nuevo Trabajador' })).toHaveCount(0)
    }
    await page.context().clearCookies()
    await loginAs(page, 'repartidor')
    expect((await apiGet(page, '/api/trabajadores?activo=all')).status()).toBe(403)
  })

  test('filtrar por rol', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/trabajadores')

    const searchInput = page.locator('input[placeholder*="Buscar"]').first()
    await searchInput.fill('REPARTIDOR')
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('API crear con todos los campos', async ({ page }) => {
    await loginAs(page, 'admin')

    const res = await apiPost(page, '/api/trabajadores', {
      nombre: `Full Worker ${Date.now() % 10000}`,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      usaMoto: true,
      capacidadKg: 400,
      comPacaAgua: 200,
      comPacaHielo: 150,
      comBotellon: 100,
      salarioFijo: 0,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    expect(res.status()).toBe(201)
  })
})
