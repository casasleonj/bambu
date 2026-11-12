// @tests #789 — pruebas E2E reales de búsqueda fuzzy en desktop y móvil.
// Datos sintéticos en la BD de E2E; no se ejecutan sobre producción.
import { test, expect, loginAs, goto, apiPost, createClienteFull, createTrabajador } from './fixtures'

test.describe('Búsqueda fuzzy transversal #789', () => {
  test('Clientes escritorio: sin acentos, palabras desordenadas y sin resultados', async ({ page }) => {
    await loginAs(page, 'admin')
    const suffix = Date.now()
    const nombre = 'Máximo'
    const apellido = 'Pérez Busca789' + suffix
    const res = await createClienteFull(page, {
      nombre, apellido, telefono: '3' + String(suffix).slice(-9),
      direccion: 'Calle QA',
    })
    expect(res.success).toBe(true)
    await goto(page, '/clientes')

    const input = page.locator('input[placeholder*="Buscar"]').first()
    await expect(input).toBeVisible()
    await input.fill('zzzinexistente789')
    await expect(page.locator('main')).not.toContainText(apellido)

    await input.fill('perez maximo')
    await expect(page.locator('main')).toContainText(apellido, { timeout: 15000 })
  })

  test('Clientes móvil: sugerencias acentuadas siguen visibles', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, 'admin')
    const suffix = Date.now()
    const nombre = 'Ángela'
    const apellido = 'Quíñones QA789' + suffix
    const res = await createClienteFull(page, {
      nombre, apellido, telefono: '3' + String(suffix).slice(-9),
      direccion: 'Cra 1 QA',
    })
    expect(res.success).toBe(true)
    await goto(page, '/clientes')
    const input = page.locator('input[placeholder*="Buscar"]').first()
    await input.fill('angela quinones')
    await expect(page.locator('main')).toContainText(apellido, { timeout: 15000 })
  })

  test('Proveedores: encuentra nombre sin tilde', async ({ page }) => {
    await loginAs(page, 'admin')
    const nombre = 'Suministros Rápidos QA789' + Date.now()
    const res = await apiPost(page, '/api/proveedores', {
      nombre, telefono: '3001234567', tipoProducto: 'Bolsas',
    })
    expect(res.status()).toBe(201)
    await goto(page, '/proveedores')
    const input = page.locator('input[placeholder*="Buscar"]').first()
    await input.fill('suministros rapidos')
    await expect(page.locator('main')).toContainText(nombre, { timeout: 15000 })
  })

  test('Trabajadores: encuentra nombre sin acentos y preserva selección', async ({ page }) => {
    await loginAs(page, 'admin')
    const nombre = 'Ángel QA789' + Date.now()
    const res = await createTrabajador(page, { nombre, rol: 'REPARTIDOR' })
    expect(res.success).toBe(true)
    await goto(page, '/trabajadores')
    const input = page.locator('input[placeholder*="Buscar"]').first()
    await input.fill('angel')
    await expect(page.locator('main')).toContainText(nombre, { timeout: 15000 })
  })
})
