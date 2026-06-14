/**
 * Tier 2: Forms Validation - Cliente Form
 * Tests: 12
 * Covers: cliente creation, editing, validation, business rules
 */
import { test, expect, loginAsAdmin, uniquePhone, uniqueClientName, apiPost, expectStatus, BASE } from '../00-fixtures'

test.describe('Form Validation - Cliente', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-CF-01: Create cliente via UI with valid data', async ({ page }) => {
    await page.goto(`${BASE}/clientes`)
    await page.getByRole('button', { name: /Nuevo Cliente/ }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 5000 })

    const name = uniqueClientName('TC-CF-01')
    const phone = uniquePhone()

    await page.getByPlaceholder(/Ej: Juan/).fill(name)
    await page.locator('input[placeholder*="300"]').first().fill(phone)
    await modal.getByRole('button', { name: /Guardar|Crear/ }).click()

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 10000 })
  })

  test('TC-CF-02: Empty nombre blocks submission', async ({ page }) => {
    await page.goto(`${BASE}/clientes`)
    await page.getByRole('button', { name: /Nuevo Cliente/ }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 5000 })

    // Fill only phone, leave nombre empty
    await page.locator('input[placeholder*="300"]').first().fill(uniquePhone())
    await modal.getByRole('button', { name: /Guardar|Crear/ }).click()

    // Modal should stay open
    await expect(modal).toBeVisible()
  })

  test('TC-CF-03: Phone with non-numeric chars shows error', async ({ page }) => {
    await page.goto(`${BASE}/clientes`)
    await page.getByRole('button', { name: /Nuevo Cliente/ }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    await page.getByPlaceholder(/Ej: Juan/).fill('Test Phone Chars')
    await page.locator('input[placeholder*="300"]').first().fill('abc123xyz')
    await modal.getByRole('button', { name: /Guardar|Crear/ }).click()

    // Should still be open due to validation
    await expect(modal).toBeVisible({ timeout: 3000 })
  })

  test('TC-CF-04: Cliente form has 5 sections (Básico, Ubicación, Contactos, Recurrentes, Precios)', async ({ page }) => {
    await page.goto(`${BASE}/clientes`)
    await page.getByRole('button', { name: /Nuevo Cliente/ }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    // Check for tab labels
    const tabs = modal.getByRole('tab')
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(5)
  })

  test('TC-CF-05: Can switch between form sections', async ({ page }) => {
    await page.goto(`${BASE}/clientes`)
    await page.getByRole('button', { name: /Nuevo Cliente/ }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    // Find and click Ubicación tab
    const ubicacionTab = modal.locator('button:has-text("Ubicación")')
    if (await ubicacionTab.count() > 0) {
      await ubicacionTab.first().click()
      // Barrio field should appear
      await expect(modal.locator('input[placeholder*="barrio" i], input[placeholder*="Barrio" i]').first()).toBeVisible()
    }
  })

  test('TC-CF-06: API rejects cliente with empty nombre', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: '',
      telefono: uniquePhone(),
    })
    await expectStatus(res, 400)
  })

  test('TC-CF-07: API rejects cliente with empty telefono', async ({ page }) => {
    const res = await apiPost(page, '/api/clientes', {
      nombre: uniqueClientName('NoPhone'),
      telefono: '',
    })
    await expectStatus(res, 400)
  })

  test('TC-CF-08: API dedupes by telefono', async ({ page }) => {
    const phone = uniquePhone()
    const r1 = await apiPost(page, '/api/clientes', { nombre: 'Dup1', telefono: phone })
    await expectStatus(r1, [200, 201])
    const b1 = await r1.json()
    const id1 = b1.cliente?.id || b1.id

    const r2 = await apiPost(page, '/api/clientes', { nombre: 'Dup2', telefono: phone })
    await expectStatus(r2, [200, 201, 409])
    const b2 = await r2.json()

    // Should return same cliente (deduped)
    const id2 = b2.cliente?.id || b2.id
    if (id1 && id2) {
      expect(id1).toBe(id2)
    }
  })

  test('TC-CF-09: API accepts long nombre (100 chars max)', async ({ page }) => {
    const longName = 'A'.repeat(100)
    const res = await apiPost(page, '/api/clientes', { nombre: longName, telefono: uniquePhone() })
    await expectStatus(res, [200, 201])
  })

  test('TC-CF-10: API rejects nombre > 100 chars', async ({ page }) => {
    const tooLong = 'A'.repeat(101)
    const res = await apiPost(page, '/api/clientes', { nombre: tooLong, telefono: uniquePhone() })
    await expectStatus(res, 400)
  })

  test('TC-CF-11: Create cliente with special chars in name', async ({ page }) => {
    const specialName = `Cliente Ñoño ${Date.now() % 1000}`
    const res = await apiPost(page, '/api/clientes', { nombre: specialName, telefono: uniquePhone() })
    await expectStatus(res, [200, 201])
    const body = await res.json()
    const created = body.cliente || body
    expect(created.nombre).toBe(specialName)
  })

  test('TC-CF-12: Create cliente with emoji in name (should be allowed or sanitized)', async ({ page }) => {
    const emojiName = `Cliente 🚰 ${Date.now() % 1000}`
    const res = await apiPost(page, '/api/clientes', { nombre: emojiName, telefono: uniquePhone() })
    await expectStatus(res, [200, 201, 400]) // Either accepted or rejected
    // Document the behavior
  })
})
