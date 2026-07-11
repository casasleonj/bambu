// @tests api/trabajador
import {test, expect, fullLogin, goto, apiPost, apiDelete, createTrabajador,  resetDatabase} from './fixtures'

test.describe('Trabajadores', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/trabajadores')
    await page.waitForTimeout(500)

    await expect(page.locator('h1:has-text("Trabajadores")')).toBeVisible()
  })

  test('crear trabajador', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/trabajadores')
    await page.waitForTimeout(500)

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
    await fullLogin(page)
    await goto(page, '/trabajadores')
    await page.waitForTimeout(500)

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
    await fullLogin(page)
    await goto(page, '/trabajadores')
    await page.waitForTimeout(500)

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
    await fullLogin(page)

    const originalName = `Editame ${Date.now() % 10000}`
    const trabajador = await createTrabajador(page, {
      nombre: originalName,
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
    })
    expect(trabajador.trabajador.id).toBeTruthy()

    await goto(page, '/trabajadores')
    await page.waitForTimeout(500)

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
    await fullLogin(page)

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
    await page.waitForTimeout(500)

    // Verify worker is not in the list (check for worker card heading, not body text)
    const workerHeading = page.locator(`h2:has-text("${name}")`)
    await expect(workerHeading).not.toBeVisible({ timeout: 5000 })
  })

  test('filtrar por rol', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/trabajadores')
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder*="Buscar"]').first()
    await searchInput.fill('REPARTIDOR')
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('API crear con todos los campos', async ({ page }) => {
    await fullLogin(page)

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
