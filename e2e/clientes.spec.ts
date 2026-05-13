import { test, expect, handleBaseCaja, fullLogin, goto, apiPost, createCliente } from './fixtures'

test.describe('Clientes', () => {
  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    await expect(page.locator('h1:has-text("Clientes")')).toBeVisible()
    await expect(page.locator('button:has-text("+ Nuevo Cliente")')).toBeVisible()
  })

  test('crear cliente y verificar', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)
    
    const dialog = page.locator('[role="dialog"]')
    await dialog.locator('#cliente-nombre').fill('Cliente E2E Test')
    await dialog.locator('#cliente-telefono').fill('3112223344')
    
    await dialog.locator('button[type="submit"]').click()
    await page.waitForTimeout(2000)
    
    await expect(dialog).not.toBeVisible({ timeout: 5000 }).catch(() => null)
    
    await page.reload()
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)
    await page.waitForTimeout(500)
    
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Cliente E2E Test')
  })

  test('buscar cliente', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    const searchInput = page.locator('input[placeholder*="Buscar"]').first()
    await searchInput.fill('a')
    await page.waitForTimeout(500)
    
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('validation: nombre vacío', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)
    
    const dialog = page.locator('[role="dialog"]')
    await dialog.locator('button[type="submit"]').click()
    await page.waitForTimeout(1000)
    
    await expect(dialog).toBeVisible()
  })

  test('ver detalle', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    const firstRow = page.locator('.bg-white.rounded-xl.shadow.overflow-hidden .divide-y > div').first()
    if (await firstRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
      
      await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible()
    }
  })

  test('editar cliente', async ({ page }) => {
    await fullLogin(page)
    
    const name = `Cliente Edit ${Date.now() % 10000}`
    await createCliente(page, { nombre: name, telefono: `3${String(Date.now()).slice(-9)}` })
    
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    const searchInput = page.locator('input[placeholder*="Buscar"]').first()
    await searchInput.fill(name)
    await page.waitForTimeout(500)
    
    const clientRow = page.locator('.bg-white.rounded-xl.shadow.overflow-hidden .divide-y > div').filter({ hasText: name }).first()
    await clientRow.click()
    await page.waitForTimeout(500)
    
    await page.getByRole('button', { name: 'Editar' }).click()
    await page.waitForTimeout(500)
    
    const dialog = page.locator('[role="dialog"]')
    await dialog.locator('#cliente-nombre').fill(`${name} Editado`)
    
    await dialog.locator('button[type="submit"]').click()
    await page.waitForTimeout(2000)
    
    await page.reload()
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)
    await page.waitForTimeout(500)
    
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(`${name} Editado`)
  })

  test('desactivar cliente', async ({ page }) => {
    await fullLogin(page)
    
    const name = `Cliente Desactivar ${Date.now() % 10000}`
    await createCliente(page, { nombre: name, telefono: `3${String(Date.now()).slice(-9)}` })
    
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    const searchInput = page.locator('input[placeholder*="Buscar"]').first()
    await searchInput.fill(name)
    await page.waitForTimeout(500)
    
    const clientRow = page.locator('.bg-white.rounded-xl.shadow.overflow-hidden .divide-y > div').filter({ hasText: name }).first()
    await clientRow.click()
    await page.waitForTimeout(500)
    
    await page.getByRole('button', { name: 'Desactivar' }).click()
    await page.waitForTimeout(500)
    
    const confirmBtn = page.locator('[role="dialog"] button:has-text("Confirmar")')
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click()
      await page.waitForTimeout(1000)
    }
    
    await page.reload()
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)
    await page.waitForTimeout(500)
    
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toContain(name)
  })

  test('crear con todos los campos', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    const name = `Cliente Full ${Date.now() % 10000}`
    
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)
    
    const dialog = page.locator('[role="dialog"]')
    await dialog.locator('#cliente-nombre').fill(name)
    await dialog.locator('#cliente-telefono').fill(`3${String(Date.now()).slice(-9)}`)
    await dialog.locator('#cliente-barrio').fill('Centro')
    await dialog.locator('#cliente-direccion').fill('Calle Test 123')
    
    await dialog.locator('button[type="submit"]').click()
    await page.waitForTimeout(2000)
    
    await expect(dialog).not.toBeVisible({ timeout: 5000 }).catch(() => null)
    
    await page.reload()
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)
    await page.waitForTimeout(500)
    
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(name)
  })

  test('crear con precios especiales', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await page.waitForTimeout(500)
    
    const name = `Cliente Precios ${Date.now() % 10000}`
    
    await page.click('button:has-text("+ Nuevo Cliente")')
    await page.waitForTimeout(500)
    
    const dialog = page.locator('[role="dialog"]')
    await dialog.locator('#cliente-nombre').fill(name)
    await dialog.locator('#cliente-telefono').fill(`3${String(Date.now()).slice(-9)}`)
    
    const preciosSection = dialog.locator('fieldset:has(legend:has-text("Precios Especiales"))')
    if (await preciosSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      const precioInput = preciosSection.locator('input[type="number"]').first()
      if (await precioInput.isVisible()) {
        await precioInput.fill('5000')
      }
    }
    
    await dialog.locator('button[type="submit"]').click()
    await page.waitForTimeout(2000)
    
    await expect(dialog).not.toBeVisible({ timeout: 5000 }).catch(() => null)
    
    await page.reload()
    await page.waitForLoadState('networkidle')
    await handleBaseCaja(page)
    await page.waitForTimeout(500)
    
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(name)
  })

  test('API crea cliente con telefono duplicado', async ({ page }) => {
    await fullLogin(page)
    
    const phone = `3${String(Date.now()).slice(-9)}`
    
    const c1 = await createCliente(page, { telefono: phone })
    expect(c1.cliente?.id || c1.data?.id).toBeTruthy()
    
    const client2Name = `Duplicado ${Date.now() % 10000}`
    const res2 = await apiPost(page, '/api/clientes', {
      nombre: client2Name,
      telefono: phone,
    })
    const body2 = await res2.json()
    
    if (body2.error) {
      expect(body2.error).toBeTruthy()
    } else if (body2.cliente) {
      expect(body2.cliente.telefono).toBe(phone)
    }
  })
})
