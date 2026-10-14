// @tests Opción A — la venta del mostrador (modal "Venta Rápida" → Punto de Venta)
// con un cliente seleccionado nace ENTREGADA y NO pide dirección ni barrio.
// En Domicilio sigue pendiente y sí pide dirección. Formulario clásico
// (Hub apagado, como producción).
import { test, expect, loginAs, goto, createCliente, apiGet } from './fixtures'

const HUB_ON = process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'

async function pedidoDe(page: import('@playwright/test').Page, nombre: string) {
  const res = await apiGet(page, `/api/pedidos?all=true&search=${encodeURIComponent(nombre)}`)
  const body = await res.json()
  return (body.pedidos ?? []).find((p: { nombreCli?: string }) => (p.nombreCli ?? '').includes(nombre)) as
    | { estadoEntrega: string; canal: string; origen: string }
    | undefined
}

async function elegirCliente(page: import('@playwright/test').Page, nombre: string) {
  const search = page.locator('input[placeholder="Buscar cliente por nombre o teléfono..."], input[placeholder^="Buscar cliente"]').first()
  await search.fill(nombre)
  await page.getByTestId('cliente-search-result').first().click()
}

test.describe('Venta en punto con cliente (opción A)', () => {
  test.skip(HUB_ON, 'formulario clásico (producción tiene el Hub apagado)')
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test('Venta Rápida + Punto + cliente: nace ENTREGADA y no pide dirección ni barrio', async ({ page }) => {
    test.setTimeout(120000)
    await loginAs(page, 'admin')
    const nombre = `Mostrador ${Date.now() % 1000000}`
    await createCliente(page, { nombre, direccion: 'Cra 7 # 10-20', barrio: 'Chapinero' })
    await goto(page, '/pedidos')
    await page.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await elegirCliente(page, nombre)

    // en Punto no hay inputs de dirección ni barrio
    await expect(page.getByPlaceholder(/Dirección/)).toHaveCount(0)
    await expect(page.getByPlaceholder(/Barrio/)).toHaveCount(0)

    await page.getByTestId('item-cant-PACA_AGUA').fill('1')
    await page.getByTestId('submit-pedido').click()
    await expect(async () => {
      const p = await pedidoDe(page, nombre)
      expect(p?.estadoEntrega).toBe('ENTREGADO')
      expect(p?.canal).toBe('PUNTO')
    }).toPass({ timeout: 20000 })
  })

  test('Venta Rápida cambiada a Domicilio con cliente: sigue PENDIENTE y sí muestra dirección', async ({ page }) => {
    test.setTimeout(120000)
    await loginAs(page, 'admin')
    const nombre = `Domicilio ${Date.now() % 1000000}`
    await createCliente(page, { nombre, direccion: 'Cra 8 # 11-21', barrio: 'Centro' })
    await goto(page, '/pedidos')
    await page.getByTestId('fab-main').click()
    await page.getByTestId('fab-venta-rapida').click()
    await elegirCliente(page, nombre)
    await page.getByRole('button', { name: /Domicilio/ }).first().click()
    // en Domicilio sí se piden dirección y barrio
    await expect(page.getByPlaceholder(/Dirección/)).toBeVisible()
    await expect(page.getByPlaceholder(/Barrio/)).toBeVisible()
    await page.getByTestId('item-cant-PACA_AGUA').fill('1')
    await page.getByTestId('submit-pedido').click()
    await expect(async () => {
      const p = await pedidoDe(page, nombre)
      expect(p?.estadoEntrega).toBe('PENDIENTE')
      expect(p?.canal).toBe('DOMICILIO')
    }).toPass({ timeout: 20000 })
  })
})
