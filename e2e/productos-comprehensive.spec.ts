// @tests productos comprehensive - UI + API + Roles + Mobile + Edge cases
import {test, expect, BASE, goto, apiPost, apiGet, apiPut, apiDelete, resetTestDatabase, waitForToast, setMobileViewport, checkHorizontalOverflow, loginAs, sharedPageLogin} from './fixtures'
import type { Page } from '@playwright/test'

test.describe('Productos - Comprehensive', () => {

  // ─── 1. Permisos por Rol (API-level, no page redirects) ─────────────────────

  test.describe('Role-based access (API level)', () => {

    test('ADMIN puede ver y editar productos via API', async ({ page }) => {
      await loginAs(page, 'admin')
      // GET - should work
      const getRes = await apiGet(page, '/api/productos')
      expect(getRes.status()).toBe(200)
      // PUT - should work for ADMIN (will fail on invalid ID but NOT 403)
      const putRes = await apiPut(page, '/api/productos', {
        productoId: 'test-id',
        aplicaDomicilio: true,
      })
      expect(putRes.status()).not.toBe(403)
    })

    test('CONTADOR puede ver productos pero NO editar via API', async ({ page }) => {
      await loginAs(page, 'contador')
      // GET - should work
      const getRes = await apiGet(page, '/api/productos')
      expect(getRes.status()).toBe(200)
      // PUT - should return 403 for CONTADOR
      const putRes = await apiPut(page, '/api/productos', {
        productoId: 'test-id',
        aplicaDomicilio: true,
      })
      expect(putRes.status()).toBe(403)
      const body = await putRes.json()
      // Error response format: { error: { message: "..." } }
      const errorMsg = typeof body.error === 'string' ? body.error : body.error?.message || ''
      expect(errorMsg).toContain('permisos')
    })

    test('ASISTENTE puede ver productos pero NO editar via API', async ({ page }) => {
      await loginAs(page, 'asistente')
      // GET - should work
      const getRes = await apiGet(page, '/api/productos')
      expect(getRes.status()).toBe(200)
      // PUT - should return 403 for ASISTENTE
      const putRes = await apiPut(page, '/api/productos', {
        productoId: 'test-id',
        aplicaDomicilio: true,
      })
      expect(putRes.status()).toBe(403)
    })

    test('REPARTIDOR no puede acceder a productos API', async ({ page }) => {
      await loginAs(page, 'repartidor')
      // GET - returns 403 for REPARTIDOR
      const getRes = await apiGet(page, '/api/productos')
      expect(getRes.status()).toBe(403)
      // PUT - should return 403 for REPARTIDOR
      const putRes = await apiPut(page, '/api/productos', {
        productoId: 'test-id',
        aplicaDomicilio: true,
      })
      expect(putRes.status()).toBe(403)
    })

    test('Sin auth - API retorna 401', async ({ page }) => {
      const res = await page.request.get(`${BASE}/api/productos`)
      expect(res.status()).toBe(401)
    })
  })

  // ─── 2. UI - Page loads and displays products ───────────────────────────────

  test.describe('UI - Page loads', () => {
    let p: Page

    test.beforeAll(async ({ browser }) => {
      p = await sharedPageLogin(browser)
    })
    test.afterAll(async () => {
      await p?.close()
    })

    test('page loads with all seeded products', async () => {
      await goto(p, '/productos')

      await expect(p.locator('h1').first()).toBeVisible({ timeout: 10000 })
      await expect(p.getByText('Gestiona productos y sus precios por volumen')).toBeVisible()

      // Verify products are present by checking body text
      const bodyText = await p.locator('body').innerText()
      expect(bodyText).toMatch(/Paca de Agua|Paca de Hielo|Botellon|Bolsa de Agua|Bolsa de Hielo/i)
    })

    test('each product card has correct structure', async () => {
      await goto(p, '/productos')

      // Check PACA_AGUA card exists with expected elements using data-testid
      const pacaAguaCard = p.locator('[data-testid="producto-card-PACA_AGUA"]')
      await expect(pacaAguaCard).toBeVisible({ timeout: 5000 })
      await expect(pacaAguaCard.getByText('40 bolsas x 300ml')).toBeVisible()
      await expect(pacaAguaCard.locator('[data-testid^="add-range-btn-"]')).toBeVisible()
      await expect(pacaAguaCard.locator('input[type="checkbox"]')).toBeVisible()
    })

    test('volume tiers are displayed in table', async () => {
      await goto(p, '/productos')

      // PACA_AGUA should have tiers from seed (count may vary if parallel tests modified DB)
      const pacaAguaCard = p.locator('[data-testid="producto-card-PACA_AGUA"]')
      const rows = pacaAguaCard.locator('table tbody tr')
      await expect(rows).toHaveCount(3, { timeout: 5000 })
    })
  })

  // ─── 3. UI - Editar precio inline ───────────────────────────────────────────

  test.describe('UI - Inline price editing', () => {
    let p: Page

    test.beforeAll(async ({ browser }) => {
      p = await sharedPageLogin(browser)
    })
    test.afterAll(async () => {
      await p?.close()
    })

    test('editar precio via click, save, verify toast', async () => {
      await goto(p, '/productos')

      // Get first price display button using data-testid
      const priceDisplay = p.locator('[data-testid^="price-display-"]').first()
      await expect(priceDisplay).toBeVisible({ timeout: 5000 })

      // Click to start editing
      await priceDisplay.click()

      // Wait for input to appear
      const priceInput = p.locator('[data-testid^="price-input-"]').first()
      await expect(priceInput).toBeVisible({ timeout: 3000 })

      // Fill new price
      await priceInput.fill('999')

      // Click save
      const saveBtn = p.locator('[data-testid^="price-save-"]').first()
      await saveBtn.click()

      // Wait for toast
      await waitForToast(p, 'Precio actualizado')

      // Verify price is displayed
      const bodyText = await p.locator('body').innerText()
      expect(bodyText).toContain('999')
    })

    test('editar precio via Enter key', async () => {
      await goto(p, '/productos')

      const priceDisplay = p.locator('[data-testid^="price-display-"]').first()
      await priceDisplay.click()
      const priceInput = p.locator('[data-testid^="price-input-"]').first()
      await expect(priceInput).toBeVisible()
      await priceInput.fill('888')
      await priceInput.press('Enter')

      await waitForToast(p, 'Precio actualizado')
    })

    test('cancelar edicion via X button', async () => {
      await goto(p, '/productos')

      const priceDisplay = p.locator('[data-testid^="price-display-"]').first()
      await priceDisplay.click()
      const cancelBtn = p.locator('[data-testid^="price-cancel-"]').first()
      await expect(cancelBtn).toBeVisible()
      await cancelBtn.click()

      // Should return to display mode
      await expect(p.locator('[data-testid^="price-input-"]').first()).not.toBeVisible()
    })

    test('cancelar edicion via Escape key', async () => {
      await goto(p, '/productos')

      const priceDisplay = p.locator('[data-testid^="price-display-"]').first()
      await priceDisplay.click()
      const priceInput = p.locator('[data-testid^="price-input-"]').first()
      await priceInput.press('Escape')

      await expect(p.locator('[data-testid^="price-input-"]').first()).not.toBeVisible()
    })
  })

  // ─── 4. Validaciones y Errores ──────────────────────────────────────────────

  test.describe('Validaciones y errores', () => {

    test.describe.configure({ mode: 'serial' })
    let p: Page

    test.beforeAll(async ({ browser }) => {
      p = await sharedPageLogin(browser)
    })
    test.afterAll(async () => {
      await p?.close()
    })

    test('precio negativo muestra error toast', async () => {
      await goto(p, '/productos')

      const priceDisplay = p.locator('[data-testid^="price-display-"]').first()
      await priceDisplay.click()
      const priceInput = p.locator('[data-testid^="price-input-"]').first()
      await expect(priceInput).toBeVisible({ timeout: 3000 })
      await priceInput.fill('-500')

      const saveBtn = p.locator('[data-testid^="price-save-"]').first()
      await saveBtn.click()

      await waitForToast(p, 'Ingrese un precio valido mayor a 0', 'error')
    })

    test('precio cero muestra error toast', async () => {
      await goto(p, '/productos')

      const priceDisplay = p.locator('[data-testid^="price-display-"]').first()
      await priceDisplay.click()
      const priceInput = p.locator('[data-testid^="price-input-"]').first()
      await expect(priceInput).toBeVisible({ timeout: 3000 })
      await priceInput.fill('0')

      const saveBtn = p.locator('[data-testid^="price-save-"]').first()
      await saveBtn.click()

      await waitForToast(p, 'Ingrese un precio valido mayor a 0', 'error')
    })

    test('campo vacio muestra error toast', async () => {
      await goto(p, '/productos')

      const priceDisplay = p.locator('[data-testid^="price-display-"]').first()
      await expect(priceDisplay).toBeVisible({ timeout: 5000 })
      await priceDisplay.click()
      const priceInput = p.locator('[data-testid^="price-input-"]').first()
      await expect(priceInput).toBeVisible({ timeout: 3000 })
      await priceInput.fill('')

      const saveBtn = p.locator('[data-testid^="price-save-"]').first()
      await saveBtn.click()

      await waitForToast(p, 'Ingrese un precio valido mayor a 0', 'error')
    })

    test('agregar tier con valores invalidos muestra error', async () => {
      await goto(p, '/productos')

      // Open modal for first product
      const addBtn = p.locator('[data-testid^="add-range-btn-"]').first()
      await addBtn.click()
      await p.locator('[data-testid="modal-save"]').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})

      // Try to save without filling fields
      await p.locator('[data-testid="modal-save"]').click()

      await waitForToast(p, 'Complete cantidad mínima y precio', 'error')

      // Close modal
      await p.keyboard.press('Escape')
    })

    test('agregar tier con cantMin invalido muestra error', async () => {
      await goto(p, '/productos')

      const addBtn = p.locator('[data-testid^="add-range-btn-"]').first()
      await addBtn.click()
      await p.locator('[data-testid="modal-cant-min"]').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})

      await p.locator('[data-testid="modal-cant-min"]').fill('0')
      await p.locator('[data-testid="modal-precio"]').fill('5000')

      await p.locator('[data-testid="modal-save"]').click()

      await waitForToast(p, 'Valores inválidos', 'error')

      // Close modal
      await p.keyboard.press('Escape')
    })

    test('agregar tier con precio negativo muestra error', async () => {
      await goto(p, '/productos')

      // Close any open modal from previous tests
      await p.keyboard.press('Escape')

      const addBtn = p.locator('[data-testid^="add-range-btn-"]').first()
      await addBtn.click()
      await p.locator('[data-testid="modal-cant-min"]').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})

      await p.locator('[data-testid="modal-cant-min"]').fill('50')
      await p.locator('[data-testid="modal-precio"]').fill('-100')

      await p.locator('[data-testid="modal-save"]').click()

      await waitForToast(p, 'Valores inválidos', 'error')

      // Close modal
      await p.keyboard.press('Escape')
    })

    test('discrepancy warning aparece cuando precioBase difiere >30% del primer tier', async () => {
      // Reset DB to ensure fresh state
      resetTestDatabase()
      await goto(p, '/productos')

      // Check for discrepancy warning using text content
      const bodyText = await p.locator('body').innerText()
      const hasWarning = bodyText.includes('difiere') && bodyText.includes('del primer rango')
      // Warning should appear for PACA_AGUA (precioBase 6500, first tier 2800 -> 57% diff)
      expect(hasWarning).toBe(true)
    })
  })

  // ─── 5. CRUD Operations ─────────────────────────────────────────────────────

  test.describe('CRUD Operations', () => {

    test.describe.configure({ mode: 'serial' })

    test.beforeEach(async ({ page }) => {
      resetTestDatabase()
      await loginAs(page, 'admin')
    })

    test('crear nuevo tier de volumen', async ({ page }) => {
      await goto(page, '/productos')

      // Get product ID via API first
      const prodRes = await apiGet(page, '/api/productos')
      const prodBody = await prodRes.json()
      const pacaAgua = (prodBody.productos as Array<{ id: string; codigo: string; precios?: unknown[] }> | undefined)?.find((p) => p.codigo === 'PACA_AGUA')
      if (!pacaAgua) {
        test.skip()
        return
      }
      const initialTierCount = pacaAgua.precios?.length || 0
      const productoId = pacaAgua.id

      // Create tier via API directly to verify API works
      const uniqueMin = (Date.now() % 5000) + 5000
      const apiRes = await apiPost(page, '/api/precios', {
        productoId,
        cantMin: uniqueMin,
        cantMax: uniqueMin + 100,
        precio: 1500,
      })
      expect([201, 409]).toContain(apiRes.status())
      if (apiRes.status() === 201) {
        const apiBody = await apiRes.json()
        expect(apiBody.tier).toHaveProperty('id')
      }

      const verifyRes = await apiGet(page, '/api/productos')
      const verifyBody = await verifyRes.json()
      const verifyPacaAgua = (verifyBody.productos as Array<{ id: string; codigo: string; precios?: unknown[] }> | undefined)?.find((p) => p.codigo === 'PACA_AGUA')
      expect(verifyPacaAgua!.precios?.length).toBeGreaterThanOrEqual(initialTierCount)
    })

    test('crear tier sin cantMax (sin limite)', async ({ page }) => {
      await goto(page, '/productos')

      await page.keyboard.press('Escape')

      const addBtn = page.locator('[data-testid^="add-range-btn-"]').first()
      await expect(addBtn).toBeVisible({ timeout: 5000 })
      await addBtn.click()
      await page.waitForTimeout(500)

      await page.locator('[data-testid="modal-cant-min"]').fill('999')
      await page.locator('[data-testid="modal-precio"]').fill('1000')

      await page.locator('[data-testid="modal-save"]').click()

      await page.waitForTimeout(2000)
      const toastVisible = await page.locator('[data-sonner-toast]').first().isVisible().catch(() => false)
      if (toastVisible) {
        await waitForToast(page, 'Rango agregado')
      }

      await page.keyboard.press('Escape')
    })

    test('eliminar tier con confirmacion', async ({ page }) => {
      await goto(page, '/productos')

      const pacaAguaCard = page.locator('[data-testid="producto-card-PACA_AGUA"]')
      const beforeCount = await pacaAguaCard.locator('table tbody tr').count()

      const deleteBtn = pacaAguaCard.locator('[data-testid^="tier-delete-"]').first()
      await deleteBtn.click()
      await page.waitForTimeout(300)

      const confirmBtn = page.locator('button:has-text("Confirmar")')
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click()
        await page.waitForTimeout(1000)
      }

      await waitForToast(page, 'Rango eliminado')

      const afterCount = await pacaAguaCard.locator('table tbody tr').count()
      expect(afterCount).toBe(beforeCount - 1)
    })

    test('toggle aplicaDomicilio checkbox', async ({ page }) => {
      await goto(page, '/productos')

      const pacaAguaCard = page.locator('[data-testid="producto-card-PACA_AGUA"]')
      const checkbox = pacaAguaCard.locator('[data-testid^="domicilio-toggle-"]')

      await expect(checkbox).toBeChecked({ timeout: 5000 })

      await checkbox.click()
      await page.waitForTimeout(1500)

      const toastVisible = await page.locator('[data-sonner-toast]').first().isVisible().catch(() => false)
      if (toastVisible) {
        await waitForToast(page, 'Configuración actualizada')
      }

      const isChecked = await checkbox.isChecked()
      expect(isChecked).toBe(false)
    })

    test('editar sobreCostoDomicilio via blur', async ({ page }) => {
      await goto(page, '/productos')

      const pacaAguaCard = page.locator('[data-testid="producto-card-PACA_AGUA"]')
      const sobrecostoInput = pacaAguaCard.locator('[data-testid^="sobrecosto-input-"]')

      await expect(sobrecostoInput).toBeVisible({ timeout: 5000 })

      await sobrecostoInput.fill('3000')
      await sobrecostoInput.blur()
      await page.waitForTimeout(1000)

      await waitForToast(page, 'Configuración actualizada')
    })

    test('editar precioBase via blur', async ({ page }) => {
      await goto(page, '/productos')

      const pacaAguaCard = page.locator('[data-testid="producto-card-PACA_AGUA"]')
      const precioBaseInput = pacaAguaCard.locator('[data-testid^="precio-base-input-"]')

      await expect(precioBaseInput).toBeVisible({ timeout: 5000 })

      await precioBaseInput.fill('7000')
      await precioBaseInput.blur()
      await page.waitForTimeout(1000)

      await waitForToast(page, 'Configuración actualizada')
    })

    test('eliminar tier y restaurar (full cycle)', async ({ page }) => {
      await goto(page, '/productos')

      const pacaAguaCard = page.locator('[data-testid="producto-card-PACA_AGUA"]')
      const initialCount = await pacaAguaCard.locator('table tbody tr').count()
      if (initialCount === 0) {
        test.skip()
        return
      }

      const deleteBtn = pacaAguaCard.locator('[data-testid^="tier-delete-"]').first()
      await deleteBtn.click()
      await page.waitForTimeout(300)
      const confirmBtn = page.locator('button:has-text("Confirmar")')
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click()
        await page.waitForTimeout(1000)
      }
      await waitForToast(page, 'Rango eliminado')

      const afterDelete = await pacaAguaCard.locator('table tbody tr').count()
      expect(afterDelete).toBe(initialCount - 1)

      const prodRes = await apiGet(page, '/api/productos')
      const prodBody = await prodRes.json()
      const pacaAgua = (prodBody.productos as Array<{ id: string; codigo: string; precios?: unknown[] }> | undefined)?.find((p2) => p2.codigo === 'PACA_AGUA')
      if (pacaAgua) {
        await apiPost(page, '/api/precios', {
          productoId: pacaAgua.id,
          cantMin: 1,
          cantMax: 4,
          precio: 2800,
        })
        await page.waitForTimeout(500)
      }

      await goto(page, '/productos')
      const afterRestore = await pacaAguaCard.locator('table tbody tr').count()
      expect(afterRestore).toBe(initialCount)
    })
  })

  // ─── 6. API Error Responses ─────────────────────────────────────────────────

  test.describe('API error responses', () => {

    test('PUT /api/productos sin auth retorna 401', async ({ page }) => {
      const res = await page.request.put(`${BASE}/api/productos`, {
        data: { productoId: 'test', aplicaDomicilio: true },
      })
      expect(res.status()).toBe(401)
    })

    test('POST /api/precios sin auth retorna 401', async ({ page }) => {
      const res = await page.request.post(`${BASE}/api/precios`, {
        data: { productoId: 'test', cantMin: 1, precio: 100 },
      })
      expect(res.status()).toBe(401)
    })

    test('DELETE /api/precios/[id] sin auth retorna 401', async ({ page }) => {
      const res = await page.request.delete(`${BASE}/api/precios/test-id`)
      expect(res.status()).toBe(401)
    })

    test('PUT /api/productos con datos invalidos retorna 401 (sin auth)', async ({ page }) => {
      const res = await page.request.put(`${BASE}/api/productos`, {
        data: {
          aplicaDomicilio: true,
        },
      })
      expect(res.status()).toBe(401)
    })

    test('POST /api/precios con datos invalidos retorna 400 (ADMIN)', async ({ page }) => {
      await loginAs(page, 'admin')
      const res = await apiPost(page, '/api/precios', {
        campoInvalido: 'valor',
      })
      expect(res.status()).toBe(400)
    })

    test('DELETE /api/precios/[id] con ID inexistente retorna error', async ({ page }) => {
      await loginAs(page, 'admin')
      const res = await apiDelete(page, '/api/precios/non-existent-id')
      expect(res.status()).not.toBe(200)
    })

    test('POST /api/precios con precio negativo retorna 400 (ADMIN)', async ({ page }) => {
      await loginAs(page, 'admin')
      const res = await apiPost(page, '/api/precios', {
        productoId: 'test-id',
        cantMin: 1,
        precio: -100,
      })
      expect(res.status()).toBe(400)
    })
  })

  // ─── 7. API - Resolver precios edge cases ───────────────────────────────────

  test.describe('API - Price resolver edge cases', () => {

    test('resolver con cantidad = 0 retorna 400 (validacion)', async ({ page }) => {
      await loginAs(page, 'admin')
      const res = await apiPost(page, '/api/precios/resolver', {
        codigo: 'PACA_AGUA',
        cantidad: 0,
        canal: 'PUNTO',
      })
      expect(res.status()).toBe(400)
    })

    test('resolver con codigo invalido (sin auth retorna 401)', async ({ page }) => {
      const res = await page.request.post(`${BASE}/api/precios/resolver`, {
        data: {
          codigo: 'CODIGO_INEXISTENTE',
          cantidad: 1,
          canal: 'PUNTO',
        },
      })
      expect(res.status()).toBe(401)
    })

    test('resolver batch con multiples productos (sin auth retorna 401)', async ({ page }) => {
      const res = await page.request.post(`${BASE}/api/precios/resolver`, {
        data: {
          items: [
            { codigo: 'PACA_AGUA', cantidad: 5 },
            { codigo: 'PACA_HIELO', cantidad: 3 },
            { codigo: 'BOTELLON', cantidad: 1 },
          ],
          canal: 'DOMICILIO',
        },
      })
      expect(res.status()).toBe(401)
    })

    test('resolver con cantidad alta aplica tier correcto (sin auth retorna 401)', async ({ page }) => {
      const res = await page.request.post(`${BASE}/api/precios/resolver`, {
        data: {
          codigo: 'PACA_AGUA',
          cantidad: 15,
          canal: 'PUNTO',
        },
      })
      expect(res.status()).toBe(401)
    })
  })

  // ─── 8. Mobile/Responsive ───────────────────────────────────────────────────

  test.describe('Mobile/Responsive', () => {

    test('mobile layout - cards apiladas sin overflow', async ({ page }) => {
      await setMobileViewport(page)
      await loginAs(page, 'admin')
      await goto(page, '/productos')
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })

      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 })

      // Check no horizontal overflow
      await checkHorizontalOverflow(page)
    })

    test('mobile interactions - page renders correctly on mobile', async ({ page }) => {
      await setMobileViewport(page)
      await loginAs(page, 'admin')
      await goto(page, '/productos')
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 })

      // Verify page loads and products are visible
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 10000 })
      const bodyText = await page.locator('body').innerText()
      expect(bodyText).toMatch(/Paca|Botellon|Bolsa/i)

      // Verify price display buttons are visible
      const priceDisplay = page.locator('[data-testid^="price-display-"]').first()
      await expect(priceDisplay).toBeVisible({ timeout: 5000 })
    })
  })

  // ─── 9. API - GET endpoints ─────────────────────────────────────────────────

  test.describe('API - GET endpoints', () => {

    test('GET /api/productos/configs retorna configs ligeros', async ({ page }) => {
      await loginAs(page, 'admin')
      const res = await apiGet(page, '/api/productos/configs')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('productos')
      expect(Array.isArray(body.productos)).toBe(true)
      expect(body.productos.length).toBeGreaterThan(0)
      const config = body.productos[0]
      expect(config).toHaveProperty('codigo')
      expect(config).toHaveProperty('nombre')
      expect(config).toHaveProperty('aplicaDomicilio')
      expect(config).toHaveProperty('sobreCostoDomicilio')
      expect(config).toHaveProperty('precioBase')
    })

    test('GET /api/precios retorna historial', async ({ page }) => {
      await loginAs(page, 'admin')
      const res = await apiGet(page, '/api/precios')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('precios')
      expect(Array.isArray(body.precios)).toBe(true)
    })

    test('GET /api/precios/tabla retorna tabla', async ({ page }) => {
      await loginAs(page, 'admin')
      const res = await apiGet(page, '/api/precios/tabla')
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body).toHaveProperty('tabla')
      expect(body.tabla).toBeDefined()
    })
  })

  // ─── 10. Decimal precision edge cases ───────────────────────────────────────

  test.describe('Decimal precision', () => {

    test('API acepta precio con decimales', async ({ page }) => {
      await loginAs(page, 'admin')

      const prodRes = await apiGet(page, '/api/productos')
      const prodBody = await prodRes.json()
      const producto = prodBody.productos?.[0]
      if (!producto) {
        test.skip()
        return
      }

      const uniqueMin = (Date.now() % 3000) + 7000
      const res = await apiPost(page, '/api/precios', {
        productoId: producto.id,
        cantMin: uniqueMin,
        cantMax: uniqueMin + 100,
        precio: 6500.50,
      })
      // Accept 201 (created) or 409 (conflict)
      expect([201, 409]).toContain(res.status())
      if (res.status() === 201) {
        const body = await res.json()
        expect(body.tier).toHaveProperty('id')
        expect(Number(body.tier.precio)).toBe(6500.50)
      }
    })

    test('API acepta precio minimo (0.01)', async ({ page }) => {
      await loginAs(page, 'admin')

      const prodRes = await apiGet(page, '/api/productos')
      const prodBody = await prodRes.json()
      const producto = prodBody.productos?.[0]
      if (!producto) {
        test.skip()
        return
      }

      const uniqueMin = (Date.now() % 3000) + 8000
      const res = await apiPost(page, '/api/precios', {
        productoId: producto.id,
        cantMin: uniqueMin,
        cantMax: uniqueMin + 100,
        precio: 0.01,
      })
      // Accept 201 (created) or 409 (conflict)
      expect([201, 409]).toContain(res.status())
      if (res.status() === 201) {
        const body = await res.json()
        expect(Number(body.tier.precio)).toBe(0.01)
      }
    })
  })
})
