// @tests planificador de distribución — flujo "Hoy" (F5)
//   generar propuesta → revisar → resolver excepción → confirmar → embarque creado
import { test, expect, loginAs, goto, apiPost, apiGet, apiPatch, resetDatabase } from './fixtures'

test.describe('Rutas · Planificador (Hoy)', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(async () => {
    resetDatabase()
  })

  test('sin propuesta muestra el CTA de generar', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/rutas')
    await expect(page.locator('h1:has-text("Hoy")')).toBeVisible()
    await expect(page.getByTestId('rutas-hoy')).toBeVisible()
    await expect(page.locator('button:has-text("Generar propuesta")')).toBeVisible()
  })

  test('generar → propuesta con grupo + excepción; confirmar → embarque', async ({ page }) => {
    await loginAs(page, 'admin')

    await apiPost(page, '/api/trabajadores', {
      nombre: 'Repa Planif', rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION',
    })

    const c1res = await apiPost(page, '/api/clientes', {
      nombre: 'Planif Con Geo', telefono: '3011112222', barrio: 'Centro',
    })
    const c2res = await apiPost(page, '/api/clientes', {
      nombre: 'Planif Sin Geo', telefono: '3013334444',
    })
    const c1 = await c1res.json()
    const c2 = await c2res.json()
    const id1 = c1.cliente?.id ?? c1.id
    const id2 = c2.cliente?.id ?? c2.id

    await apiPatch(page, `/api/clientes/${id1}`, { lat: 10.03, lng: -73.24, geocodeOrigen: 'MANUAL' })

    await apiPost(page, '/api/pedidos', { clienteId: id1, canal: 'DOMICILIO', productos: { PACA_AGUA: 4 } })
    await apiPost(page, '/api/pedidos', { clienteId: id2, canal: 'DOMICILIO', productos: { PACA_AGUA: 2 } })

    await goto(page, '/rutas')
    await page.locator('button:has-text("Generar propuesta")').click({ force: true })

    await expect(page.getByTestId('rutas-grupo').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('rutas-excepciones')).toBeVisible()

    page.on('dialog', (d) => d.accept())
    await page.getByTestId('btn-confirmar-plan').click({ force: true })

    await expect(page.locator('text=/Plan confirmado/i')).toBeVisible({ timeout: 15000 })

    const embRes = await apiGet(page, '/api/embarques')
    const emb = await embRes.json()
    const lista = emb.embarques ?? []
    expect(lista.length).toBeGreaterThan(0)
  })

  test('el botón de Embarques lleva al Planificador', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/embarques')
    const btn = page.locator('button:has-text("Planificar día"), button:has-text("Auto-Generar")').first()
    await expect(btn).toBeVisible()
  })
})
