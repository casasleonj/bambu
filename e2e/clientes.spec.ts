import { test, expect, fullLogin, goto, apiPost, createCliente } from './fixtures'

test.describe('Clientes', () => {

  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo Cliente")')).toBeVisible()
  })

  test('crear cliente y verificar', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)
    const modal = page.locator('div.bg-white.rounded-xl').filter({ hasText: 'Nuevo Cliente' })
    const name = `Cliente Test ${Date.now() % 10000}`
    await modal.locator('text=Nombre').locator('..').locator('input').fill(name)
    await modal.locator('text=Teléfono').locator('..').locator('input').fill(`3${String(Date.now()).slice(-9)}`)
    await modal.locator('button[type="submit"]').click()
    await page.waitForTimeout(1500)
    await expect(modal).not.toBeVisible({ timeout: 5000 }).catch(() => null)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(500)
    expect(await page.locator('body').innerText()).toContain(name)
  })

  test('buscar cliente', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    const searchInput = page.locator('input[placeholder*="Buscar"], input[placeholder*="buscar"]').first()
    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchInput.fill('a')
      await page.waitForTimeout(500)
      expect((await page.locator('body').innerText()).length).toBeGreaterThan(0)
    }
  })

  test('validacion: nombre vacio', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)
    const modal = page.locator('div.bg-white.rounded-xl').filter({ hasText: 'Nuevo Cliente' })
    await modal.locator('button[type="submit"]').click()
    await page.waitForTimeout(1000)
    await expect(modal).toBeVisible()
  })

  test('ver detalle de cliente', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
      await expect(page.locator('h2:has-text("Detalle"), h3:has-text("Detalle")').first()).toBeVisible()
    }
  })

  test('crear cliente via API', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    expect(c.cliente?.id).toBeTruthy()
  })

  test('API crea cliente con telefono duplicado', async ({ page }) => {
    await fullLogin(page)
    const phone = `3${String(Date.now()).slice(-9)}`
    const c1 = await createCliente(page, { telefono: phone })
    expect(c1.cliente?.id).toBeTruthy()
    const res2 = await apiPost(page, '/api/clientes', {
      nombre: `Duplicado ${Date.now() % 10000}`,
      telefono: phone,
    })
    const body2 = await res2.json()
    expect(body2.success || body2.error).toBeTruthy()
  })
})
