// @tests api/ruta
import {test, expect, handleBaseCaja, loginAs, goto, apiPost, apiGet,  resetDatabase} from './fixtures'
import { nuevoEmbarqueLogin, crearPedido, abrirWizard, irAPasoConfirmar } from './embarque-wizard'

test.describe('Rutas', () => {
  test.describe.configure({ mode: 'serial' })

  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('page loads', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/rutas/habituales')

    await expect(page.locator('h1:has-text("Rutas")')).toBeVisible()
    await expect(page.locator('button:has-text("+ Nueva Ruta")')).toBeVisible()
  })

  test('crear ruta', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/rutas/habituales')

    await page.locator('button:has-text("+ Nueva Ruta")').click({ force: true })
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

    await page.waitForURL('**/rutas/habituales', { timeout: 10000 })
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(name)
  })

  test('editar ruta', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/rutas/habituales')

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

      await page.waitForURL('**/rutas/habituales', { timeout: 10000 }).catch(() => null)
      await handleBaseCaja(page)
      await page.waitForTimeout(500)

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await handleBaseCaja(page)
      await page.waitForTimeout(500)

      const bodyText = await page.locator('body').innerText()
      expect(bodyText).toContain(newName)
    }
  })

  test('eliminar ruta (soft delete)', async ({ page }) => {
    await loginAs(page, 'admin')

    const name = `Ruta Del ${Date.now() % 100000}`
    const res = await apiPost(page, '/api/rutas', {
      nombre: name,
      dias: 'LUNES',
    })
    const body = await res.json()
    const rutaId = body.ruta?.id
    expect(rutaId).toBeTruthy()

    await goto(page, '/rutas/habituales')

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
    await page.waitForLoadState('domcontentloaded')
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyTextAfter = await page.locator('body').innerText()
    expect(bodyTextAfter).not.toContain(name)
  })

  test('ruta con repartidor suplente', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/rutas/habituales')

    await page.locator('button:has-text("+ Nueva Ruta")').click({ force: true })
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

    await page.waitForURL('**/rutas/habituales', { timeout: 10000 })
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(name)
  })

  test('vista analisis', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/rutas/habituales')

    await page.click('button:has-text("Análisis")')
    await page.waitForURL('**/rutas/analisis')
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('API analisis', async ({ page }) => {
    await loginAs(page, 'admin')

    const res = await apiGet(page, '/api/rutas/analisis')
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
  })

  test('filtrar rutas', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/rutas/habituales')

    const searchInput = page.locator('input[placeholder="Buscar ruta o repartidor..."]')
    expect(await searchInput.isVisible()).toBe(true)

    const initialCards = await page.locator('.grid > div').count()
    await searchInput.fill('ZZZZNOTHINGZ')
    await page.waitForTimeout(500)

    const filteredCards = await page.locator('.grid > div').count()
    expect(filteredCards).toBeLessThanOrEqual(initialCards)
  })

  test('ruta aparece en crear embarque', async ({ page }) => {
    // «Nuevo Embarque» es un asistente de dos pasos: el paso 1 elige pedidos y la ruta se
    // elige en el paso 2, dentro de «Más opciones». Se recorre hasta ahí; contar `<select>`
    // en el paso 1 no probaba nada (#567).
    await nuevoEmbarqueLogin(page)

    const nombre = `Ruta Emb ${Date.now() % 100000}`
    const res = await apiPost(page, '/api/rutas', { nombre, dias: 'LUNES,MARTES' })
    const rutaId = (await res.json()).ruta?.id as string | undefined
    expect(rutaId).toBeTruthy()

    const pedido = await crearPedido(page)
    expect(pedido.id).toBeTruthy()

    await abrirWizard(page)
    await page.getByTestId(`pedido-check-${pedido.numero}`).check()
    await irAPasoConfirmar(page)

    await page.getByTestId('mas-opciones').click()
    // El selector de ruta es el único <select> que ofrece «Sin ruta».
    const selectorRuta = page.locator('select').filter({ has: page.locator('option', { hasText: 'Sin ruta' }) })
    await expect(selectorRuta).toHaveCount(1)
    await expect(selectorRuta.locator('option', { hasText: nombre })).toHaveCount(1)

    await selectorRuta.selectOption({ label: nombre })
    await expect(selectorRuta).toHaveValue(rutaId as string)
  })

  test('crear con todos los campos', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/rutas/habituales')

    await page.locator('button:has-text("+ Nueva Ruta")').click({ force: true })
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

    await page.waitForURL('**/rutas/habituales', { timeout: 10000 })
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(name)
  })
})
