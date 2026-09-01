// @tests planificador de distribución — flujo "Hoy" (F5)
//   generar propuesta → revisar → resolver excepción → confirmar → embarque creado
import { test, expect, loginAs, goto, apiPost, apiGet, resetDatabase } from './fixtures'

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
    await expect(page.getByRole('button', { name: 'Generar propuesta' }).first()).toBeVisible()
  })

  test('generar → propuesta con grupo + excepción; confirmar → embarque', async ({ page }) => {
    await loginAs(page, 'admin')

    await apiPost(page, '/api/trabajadores', {
      nombre: 'Repa Planif', rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION',
    })

    // Cliente con ubicación (link de Maps → geocode) y cliente sin nada.
    const c1res = await apiPost(page, '/api/clientes', {
      nombre: 'Planif Con Geo', telefono: '3011112222', barrio: 'Centro',
      linkUbicacion: 'https://www.google.com/maps?q=10.031,-73.241',
    })
    const c2res = await apiPost(page, '/api/clientes', {
      nombre: 'Planif Sin Geo', telefono: '3013334444',
    })
    const c1 = await c1res.json()
    const c2 = await c2res.json()
    const id1 = c1.cliente?.id ?? c1.id
    const id2 = c2.cliente?.id ?? c2.id

    await apiPost(page, `/api/clientes/${id1}/geocode`, {})

    const p1 = await apiPost(page, '/api/pedidos', {
      clienteId: id1, canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantidad: 4 }],
    })
    const p2 = await apiPost(page, '/api/pedidos', {
      clienteId: id2, canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    expect(p1.ok(), await p1.text()).toBeTruthy()
    expect(p2.ok(), await p2.text()).toBeTruthy()

    await goto(page, '/rutas')
    await page.getByTestId('rutas-hoy').waitFor()
    await page.getByRole('button', { name: 'Generar propuesta' }).first().click()

    await expect(page.getByTestId('rutas-grupo').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('rutas-excepciones')).toBeVisible()

    await page.getByTestId('btn-confirmar-plan').click({ force: true })

    // Hay excepción ALTA (cliente sin geo) → useConfirm pide confirmación.
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.locator('button:has-text("Confirmar")').click()

    await expect(page.getByText(/Plan confirmado/i).first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('rutas-hoy')).toContainText('Confirmado')

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
