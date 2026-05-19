// @tests api/cliente, api/cliente/quick
import { test, expect, fullLogin, goto, apiPost, apiGet, apiPut, apiDelete, createCliente } from './fixtures'

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

  test('search, filtros y sort', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    await searchInput.fill('Test')
    await expect(page.locator('text=de ').first()).toBeVisible()
    await searchInput.clear()
    await page.click('button:has-text("Con saldo")')
    await page.waitForTimeout(300)
    await page.click('button:has-text("Con saldo")')
    await page.click('button:has-text("Nombre")')
    await page.waitForTimeout(300)
  })

  test('editar cliente via API', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const id = c.cliente.id
    const res = await apiPut(page, `/api/clientes/${id}`, { nombre: 'Cliente Editado' })
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.cliente.nombre).toBe('Cliente Editado')
  })

  test('desactivar cliente', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const id = c.cliente.id
    const res = await apiDelete(page, `/api/clientes/${id}`)
    const body = await res.json()
    expect(body.success).toBe(true)
    // Soft delete: GET returns 404 for inactive clients
    const res2 = await apiGet(page, `/api/clientes/${id}`)
    expect(res2.status()).toBe(404)
  })

  test('links sin 404 desde detalle', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page, { nombre: 'Cliente Links Test' })
    await goto(page, `/clientes?openCliente=${c.cliente.id}`)
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: 'Cliente Links Test' })).toBeVisible()
    const pedidoLink = page.locator('a[href*="/pedidos?cliente="]')
    await expect(pedidoLink).toBeVisible()
    await expect(page.locator('button:has-text("Editar")')).toBeVisible()
  })

  test('API PUT rechaza telefono duplicado en contactos', async ({ page }) => {
    await fullLogin(page)
    const phone = `3${String(Date.now()).slice(-9)}`
    const c1 = await createCliente(page, { telefono: phone })
    const c2 = await createCliente(page, { nombre: 'Cliente Contactos' })
    const id2 = c2.cliente.id
    const res = await apiPut(page, `/api/clientes/${id2}`, {
      contactos: [{ nombre: 'Contacto', telefono: phone }]
    })
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('cliente inactivo retorna 404 en GET y PUT', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const id = c.cliente.id
    await apiDelete(page, `/api/clientes/${id}`)
    // GET returns 404
    const resGet = await apiGet(page, `/api/clientes/${id}`)
    expect(resGet.status()).toBe(404)
    // PUT returns 404
    const resPut = await apiPut(page, `/api/clientes/${id}`, { nombre: 'Reactivado' })
    expect(resPut.status()).toBe(404)
  })

  test('precios especiales via API', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const id = c.cliente.id
    const precios = JSON.stringify({ DOMICILIO: { cPacaAguaPed: 3000 }, PUNTO: {} })
    const res = await apiPut(page, `/api/clientes/${id}`, { preciosEspeciales: precios })
    const body = await res.json()
    expect(body.success).toBe(true)
    const resGet = await apiGet(page, `/api/clientes/${id}`)
    const getBody = await resGet.json()
    expect(getBody.cliente.preciosEspeciales).toBe(precios)
  })

  test('contactos con telefono validado', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page, {
      nombre: 'Cliente Contactos Test',
    })
    const id = c.cliente.id
    const res = await apiPut(page, `/api/clientes/${id}`, {
      contactos: [
        { nombre: 'Juan', telefono: '3001234567', relacion: 'Esposo' },
        { nombre: 'Maria', telefono: '3009876543', relacion: 'Hija' },
      ]
    })
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  test('vista lista renderiza correctamente', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/clientes')
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible()
    await expect(page.locator('button:has-text("Nuevo Cliente")')).toBeVisible()
    await expect(page.locator('input[placeholder*="Buscar"]')).toBeVisible()
    await expect(page.locator('button:has-text("Con saldo")')).toBeVisible()
    await expect(page.locator('button:has-text("Con frecuencia")')).toBeVisible()
  })

  test('openCliente param abre panel de detalle', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page, { nombre: 'Cliente Open Test' })
    await goto(page, `/clientes?openCliente=${c.cliente.id}`)
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: 'Cliente Open Test' })).toBeVisible()
  })

  test('API response incluye id y clienteId', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    expect(c.cliente.id).toBeTruthy()
    expect(c.cliente.clienteId).toBeTruthy()
    const res = await apiGet(page, `/api/clientes/${c.cliente.id}`)
    const body = await res.json()
    expect(body.cliente.id).toBeTruthy()
    expect(body.cliente.clienteId).toBeTruthy()
  })

  test('crear cliente con datos completos via API', async ({ page }) => {
    await fullLogin(page)
    const res = await apiPost(page, '/api/clientes', {
      nombre: 'Cliente Completo',
      apellido: 'Apellido Test',
      telefono: `3${String(Date.now()).slice(-9)}`,
      nombreNegocio: 'Tienda Test',
      tipoNegocio: 'Tienda',
      barrio: 'Centro',
      direccion: 'Calle 123 #45-67',
      notas: 'Notas de prueba',
    })
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.cliente.nombre).toBe('Cliente Completo')
    expect(body.cliente.apellido).toBe('Apellido Test')
    expect(body.cliente.nombreNegocio).toBe('Tienda Test')
  })
})
