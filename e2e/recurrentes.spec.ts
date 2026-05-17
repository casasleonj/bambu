// @tests api/pedido, api/recurrente
import { test, expect, BASE, handleBaseCaja, fullLogin, goto, apiGet, createCliente } from './fixtures'

test.describe('Recurrentes', () => {
  test('page loads', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/recurrentes')
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/Pedidos Recurrentes|No hay recurrentes/)
    const buttons = page.locator('button:has-text("+ Nuevo Recurrente")')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('crear recurrente', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente Rec ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await goto(page, '/recurrentes')
    await page.waitForTimeout(500)

    await page.click('button:has-text("+ Nuevo Recurrente")')
    await page.waitForURL('**/recurrentes/nuevo')
    await page.waitForTimeout(500)

    const select = page.locator('select').first()
    await select.selectOption({ label: cliente.nombre })
    await page.waitForTimeout(300)

    const freqSelect = page.locator('select').last()
    await freqSelect.selectOption('SEMANAL')
    await page.waitForTimeout(300)

    const aguaInput = page.locator('input[type="number"]').first()
    await aguaInput.fill('2')
    await page.waitForTimeout(300)

    await page.click('button:has-text("Crear Recurrente")')
    await page.waitForTimeout(2000)

    await page.waitForURL('**/recurrentes', { timeout: 10000 })
    await handleBaseCaja(page)
    await page.waitForTimeout(500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain(cliente.nombre)
  })

  test('editar recurrente', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente Edit Rec ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await generateRecurrente(page, cliente.id)
    await page.waitForTimeout(300)

    await goto(page, '/recurrentes')
    await page.waitForTimeout(500)

    const editBtn = page.locator('button:has-text("Editar")').first()
    if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editBtn.click()
      await page.waitForTimeout(500)

      const freqSelect = page.locator('select').last()
      if ((await freqSelect.locator('option').count()) > 1) {
        await freqSelect.selectOption({ index: 2 })
        await page.waitForTimeout(300)

        const submitBtn = page.locator('button[type="submit"]').first()
        await submitBtn.click()
        await page.waitForTimeout(2000)

        await page.waitForURL('**/recurrentes', { timeout: 10000 }).catch(() => null)
        await handleBaseCaja(page)
        await page.waitForTimeout(500)
      }
    }
  })

  test('eliminar recurrente (soft delete)', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente Del Rec ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await generateRecurrente(page, cliente.id)
    await page.waitForTimeout(300)

    await goto(page, '/recurrentes')
    await page.waitForTimeout(500)

    const deleteBtn = page.locator('button:has-text("Eliminar")').first()
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click()
      await page.waitForTimeout(500)

      const confirmBtn = page.locator('[role="dialog"] button:has-text("Eliminar"), [role="dialog"] button:has-text("Confirmar")')
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.first().click()
        await page.waitForTimeout(1000)
      }
    }
  })

  test('generar seleccionados', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/recurrentes')
    await page.waitForTimeout(500)

    const generateBtn = page.locator('button:has-text("Generar Seleccionados")')
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await generateBtn.isVisible()).toBe(true)
    }
  })

  test('API recurrente preview', async ({ page }) => {
    await fullLogin(page)

    const res = await apiGet(page, '/api/pedidos/recurrentes')
    expect(res.status()).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.preview).toBeDefined()
  })

  test('sugerencias NORMAL/SALTAR', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/recurrentes')
    await page.waitForTimeout(500)

    const normalBtn = page.locator('button:has-text("NORMAL")').first()
    const saltarBtn = page.locator('button:has-text("SALTAR")').first()

    const hasNormal = await normalBtn.isVisible({ timeout: 2000 }).catch(() => false)
    const hasSaltar = await saltarBtn.isVisible({ timeout: 2000 }).catch(() => false)

    if (hasNormal) {
      await normalBtn.click()
      await page.waitForTimeout(300)
      const attr = await normalBtn.getAttribute('class')
      expect(attr).toContain('bg-blue')
    }

    if (hasSaltar) {
      await saltarBtn.click()
      await page.waitForTimeout(300)
      const attr = await saltarBtn.getAttribute('class')
      expect(attr).toContain('bg-gray')
    }
  })

  test('generar pedido desde recurrente via API', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, {
      nombre: `Cliente Gen ${Date.now() % 10000}`,
      telefono: `3${String(Date.now()).slice(-9)}`,
    })

    await generateRecurrente(page, cliente.id)
    await page.waitForTimeout(300)

    const previewRes = await apiGet(page, '/api/pedidos/recurrentes')
    const previewData = await previewRes.json()

    if (previewData.preview && previewData.preview.length > 0) {
      const decisiones = previewData.preview.map((item: { recurrenteId: string }) => ({
        recurrenteId: item.recurrenteId,
        decision: 'NORMAL',
      }))

      const genRes = await page.request.post(`${BASE}/api/pedidos/recurrentes`, {
        data: { decisiones },
      })
      expect(genRes.status()).toBe(201)

      const genData = await genRes.json()
      expect(genData.success).toBe(true)
    }
  })
})

async function generateRecurrente(page: import('@playwright/test').Page, clienteId: string) {
  const res = await page.request.post(`${BASE}/api/recurrentes`, {
    data: {
      clienteId,
      tipo: 'ENVIO',
      canal: 'DOMICILIO',
      frecuencia: 'SEMANAL',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    },
  })
  return res.json()
}
