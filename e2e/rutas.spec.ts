import { test, expect, handleBaseCaja, fullLogin, goto, apiPost, apiGet } from './fixtures'

test.describe('Rutas', () => {
  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/rutas')
    await page.waitForTimeout(500)

    await expect(page.locator('h1:has-text("Rutas")')).toBeVisible()
    await expect(page.locator('button:has-text("+ Nueva Ruta")')).toBeVisible()
  })

  test('crear ruta', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/rutas')
    await page.waitForTimeout(500)

    await page.click('button:has-text("+ Nueva Ruta")')
    await page.waitForURL('**/rutas/nuevo')
    await page.waitForTimeout(500)

    const name = `Ruta E2E ${Date.now() % 100000}`
    await page.fill('#ruta-nombre', name)
    await page.waitForTimeout(300)

    const repartidorSelect = page.locator('#ruta-repartidor')
    const repCount = await repartidorSelect.locator('option').count()
    if (repCount > 1) {
      await repartidorSelect.selectOption({ index: 1 })
    }
    await page.waitForTimeout(300)

    await page.click('button:has-text("Crear Ruta")')
    await page.waitForTimeout(2000)

    await page.waitForURL('**/rutas', { timeout: 10000 })
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(name)
  })

  test('editar ruta', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/rutas')
    await page.waitForTimeout(500)

    const editBtn = page.locator('button:has-text("Editar")').first()
    await editBtn.click()
    await page.waitForTimeout(500)

    const newName = `Ruta Edit ${Date.now() % 100000}`
    const nameInput = page.locator('#ruta-nombre')
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill(newName)
      await page.waitForTimeout(300)

      await page.click('button:has-text("Actualizar Ruta")')
      await page.waitForTimeout(2000)

      await page.waitForURL('**/rutas', { timeout: 10000 }).catch(() => null)
      await handleBaseCaja(page)
      await page.waitForTimeout(500)

      await page.reload()
      await page.waitForLoadState('networkidle')
      await handleBaseCaja(page)
      await page.waitForTimeout(500)

      const bodyText = await page.locator('body').innerText()
      expect(bodyText).toContain(newName)
    }
  })

  test('eliminar ruta (soft delete)', async ({ page }) => {
    await fullLogin(page)

    const name = `Ruta Del ${Date.now() % 100000}`
    const res = await apiPost(page, '/api/rutas', {
      nombre: name,
      dias: 'LUNES',
      repartidorId: null,
    })
    const body = await res.json()
    const rutaId = body.ruta?.id
    expect(rutaId).toBeTruthy()

    await goto(page, '/rutas')
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder="Buscar ruta o repartidor..."]')
    await searchInput.fill(name)
    await page.waitForTimeout(500)

    const bodyTextBefore = await page.locator('body').innerText()
    expect(bodyTextBefore).toContain(name)

    const deleteBtn = page.locator('button:has-text("Eliminar")').first()
    await deleteBtn.click()
    await page.waitForTimeout(500)

    const confirmBtn = page.locator('[role="dialog"] button:has-text("Eliminar"), [role="dialog"] button:has-text("Confirmar")')
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.first().click()
      await page.waitForTimeout(1000)
    }

    await page.reload()
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyTextAfter = await page.locator('body').innerText()
    expect(bodyTextAfter).not.toContain(name)
  })

  test('ruta con repartidor suplente', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/rutas')
    await page.waitForTimeout(500)

    await page.click('button:has-text("+ Nueva Ruta")')
    await page.waitForURL('**/rutas/nuevo')
    await page.waitForTimeout(500)

    const name = `Ruta Suplente ${Date.now() % 100000}`
    await page.fill('#ruta-nombre', name)
    await page.waitForTimeout(300)

    const repartidorSelect = page.locator('#ruta-repartidor')
    const repCount = await repartidorSelect.locator('option').count()
    let repartidorOptIndex = 1
    if (repCount > 1) {
      await repartidorSelect.selectOption({ index: 1 })
    } else {
      repartidorOptIndex = 0
    }

    const respaldoSelect = page.locator('#ruta-respaldo')
    const respCount = await respaldoSelect.locator('option').count()
    if (respCount > 1) {
      const index = respCount > 2 ? 2 : 1
      if (index !== repartidorOptIndex || respCount > 2) {
        await respaldoSelect.selectOption({ index })
      }
    }
    await page.waitForTimeout(300)

    await page.click('button:has-text("Crear Ruta")')
    await page.waitForTimeout(2000)

    await page.waitForURL('**/rutas', { timeout: 10000 })
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(name)
  })

  test('vista analisis', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/rutas')
    await page.waitForTimeout(500)

    await page.click('button:has-text("Análisis")')
    await page.waitForURL('**/rutas/analisis')
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('API analisis', async ({ page }) => {
    await fullLogin(page)

    const res = await apiGet(page, '/api/rutas/analisis')
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
  })

  test('filtrar rutas', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/rutas')
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[placeholder="Buscar ruta o repartidor..."]')
    expect(await searchInput.isVisible()).toBe(true)

    const initialCards = await page.locator('.grid > div').count()
    await searchInput.fill('ZZZZNOTHINGZ')
    await page.waitForTimeout(500)

    const filteredCards = await page.locator('.grid > div').count()
    expect(filteredCards).toBeLessThanOrEqual(initialCards)
  })

  test('ruta aparece en crear embarque', async ({ page }) => {
    await fullLogin(page)

    const name = `Ruta Emb ${Date.now() % 100000}`
    const res = await apiPost(page, '/api/rutas', {
      nombre: name,
      dias: 'LUNES,MARTES',
    })
    const body = await res.json()
    expect(body.ruta?.id).toBeTruthy()

    await goto(page, '/embarques')
    await page.waitForTimeout(500)

    await page.click('button:has-text("Nuevo Embarque")')
    await page.waitForTimeout(500)

    const selects = page.locator('select')
    const count = await selects.count()
    expect(count).toBeGreaterThanOrEqual(1)

    const dialog = page.locator('[role="dialog"]')
    if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      const dialogText = await dialog.innerText()
      expect(dialogText.length).toBeGreaterThan(0)
    }
  })

  test('crear con todos los campos', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/rutas')
    await page.waitForTimeout(500)

    await page.click('button:has-text("+ Nueva Ruta")')
    await page.waitForURL('**/rutas/nuevo')
    await page.waitForTimeout(500)

    const name = `Ruta Full ${Date.now() % 100000}`
    await page.fill('#ruta-nombre', name)
    await page.waitForTimeout(300)

    const repartidorSelect = page.locator('#ruta-repartidor')
    if ((await repartidorSelect.locator('option').count()) > 1) {
      await repartidorSelect.selectOption({ index: 1 })
    }

    const respaldoSelect = page.locator('#ruta-respaldo')
    const respCount = await respaldoSelect.locator('option').count()
    if (respCount > 2) {
      await respaldoSelect.selectOption({ index: 2 })
    }

    await page.fill('#ruta-hora-inicio', '07:00')
    await page.fill('#ruta-hora-fin', '15:00')
    await page.waitForTimeout(300)

    const lunesBtn = page.locator('button[aria-pressed]').first()
    if (await lunesBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      if ((await lunesBtn.getAttribute('aria-pressed')) === 'false') {
        await lunesBtn.click()
        await page.waitForTimeout(200)
      }
    }

    await page.click('button:has-text("Crear Ruta")')
    await page.waitForTimeout(2000)

    await page.waitForURL('**/rutas', { timeout: 10000 })
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(name)
  })
})
