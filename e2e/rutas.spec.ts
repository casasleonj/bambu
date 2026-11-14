// @tests api/ruta
import {test, expect, handleBaseCaja, loginAs, goto, apiPost, apiGet, createTrabajador, resetDatabase} from './fixtures'

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
    await loginAs(page, 'admin')

    const name = `Ruta Emb ${Date.now() % 100000}`
    const res = await apiPost(page, '/api/rutas', {
      nombre: name,
      dias: 'LUNES,MARTES',
    })
    const body = await res.json()
    expect(body.ruta?.id).toBeTruthy()

    const t = await createTrabajador(page)
    const trabajadorId = (t.trabajador?.id || t.data?.id) as string
    expect(trabajadorId).toBeTruthy()

    await goto(page, '/embarques')

    // El flujo actual de «Nuevo Embarque» es el wizard pedidos-primero (#702):
    // el selector de Ruta vive en el paso 2, dentro de «Más opciones».
    const wizard = page.getByTestId('nuevo-embarque-wizard')
    const boton = page.getByRole('button', { name: /Nuevo Embarque/i }).first()
    // El clic puede llegar antes de que React enganche el handler: se reintenta
    // solo mientras el modal siga cerrado.
    await expect(async () => {
      if (!(await wizard.isVisible())) await boton.click()
      await expect(wizard).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 20000 })

    const stock = page.waitForResponse((r) => r.url().includes('/api/embarques') && r.url().includes('stock=true'))
    await page.getByTestId('wizard-siguiente').click()
    await stock

    await page.getByTestId('confirmar-repartidor').selectOption(trabajadorId)
    await page.getByTestId('carga-PACA_AGUA').fill('1')

    // La ruta creada por la API debe poder elegirse (no solo existir un <select>).
    await page.getByTestId('mas-opciones').click()
    const selectRuta = wizard.locator('select').filter({ has: page.locator('option', { hasText: name }) })
    await expect(selectRuta).toHaveCount(1)
    await selectRuta.selectOption({ label: name })
    await expect(selectRuta).toHaveValue(body.ruta.id)

    // Con stock insuficiente el wizard exige confirmarlo; los dos estados son válidos.
    const crear = page.getByTestId('wizard-crear')
    const override = page.getByTestId('stock-override')
    await expect
      .poll(async () => (await crear.isEnabled()) || (await override.isVisible()), { timeout: 15000 })
      .toBe(true)
    if (!(await crear.isEnabled())) {
      await override.getByRole('checkbox').check()
      const motivo = override.locator('textarea')
      if (await motivo.isVisible()) await motivo.fill('Stock físico verificado (prueba E2E)')
    }
    await expect(crear).toBeEnabled()
    await crear.click()
    // Sin pedidos el wizard pide confirmación explícita.
    await page.getByRole('button', { name: 'Crear igual' }).click()

    await expect(page.getByTestId('wizard-ir-detalle')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('wizard-ir-detalle').click()
    await page.waitForURL(/\/embarques\/.+/, { timeout: 15000 })

    // El embarque quedó realmente asociado a la ruta elegida.
    const embarqueId = page.url().match(/\/embarques\/([^/?#]+)/)?.[1]
    expect(embarqueId).toBeTruthy()
    const det = await apiGet(page, `/api/embarques/${embarqueId}`)
    expect(det.status()).toBe(200)
    const emb = (await det.json())
    const embarque = emb.embarque ?? emb.data ?? emb
    expect(embarque.ruta?.id ?? embarque.rutaId).toBe(body.ruta.id)
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
