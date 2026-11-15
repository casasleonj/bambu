import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { test, expect, sharedLoginAs, createCliente, BASE, appMain, resetTestDatabase } from './fixtures'

async function prepararPedido(page: Page) {
  const nombre = `Avisos 783 ${randomUUID()}`
  await createCliente(page, { nombre, direccion: 'Calle de prueba', barrio: 'Centro' })
  await page.goto(`${BASE}/pedidos`)
  await appMain(page).getByTestId('fab-main').click()
  await page.getByTestId('fab-pedido-envio').click()
  await page.getByTestId('cliente-search-input').fill(nombre)
  await page.getByTestId('cliente-search-result').filter({ hasText: nombre }).first().click()
  await page.locator('[data-testid$="-cant-PACA_AGUA"]').fill('1')
  const workspace = await page.getByTestId('pedidos-workspace').count() > 0
  const guardar = page.getByTestId(workspace ? 'workspace-commit' : 'submit-pedido')
  await expect(guardar).toBeEnabled()
  return { guardar, cantidad: page.locator('[data-testid$="-cant-PACA_AGUA"]') }
}

test.describe('#783 · avisos y siguiente operación', () => {
  test.beforeAll(() => resetTestDatabase())

  test('crear → aviso visible → abrir otro pedido sin esperar su cierre', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { guardar } = await prepararPedido(page)
    await guardar.click()
    const aviso = page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: 'Pedido creado exitosamente' })
    await expect(aviso).toBeVisible()
    // Pausar para poder comprobar el aviso real antes del siguiente clic.
    await aviso.hover()
    const fab = appMain(page).getByTestId('fab-main')
    const libre = await fab.evaluate(el => {
      const box = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    })
    expect(libre, 'El aviso no puede interceptar el centro del botón +').toBe(true)
    await fab.click()
    await expect(aviso).toBeVisible()
    await page.getByTestId('fab-pedido-envio').click()
    await expect(page.getByTestId('cliente-search-input')).toBeVisible()
    await expect(page.locator('[data-testid$="-cant-PACA_AGUA"]')).toHaveValue('')
  })

  test('error → conservar cantidades → reintentar con el aviso presente; cerrar por teclado', async ({ browser }) => {
    const page = await sharedLoginAs(browser, 'admin')
    const { guardar, cantidad } = await prepararPedido(page)
    let rechazar = true
    await page.route('**/api/pedidos', route => {
      if (route.request().method() === 'POST' && rechazar) {
        rechazar = false
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error sintético 783' } }) })
      }
      return route.continue()
    })
    await guardar.click()
    const error = page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: 'Error sintético 783' })
    await expect(error).toBeVisible()
    await error.hover()
    await expect(cantidad).toHaveValue('1')
    await expect(guardar).toBeEnabled()
    const respuesta = page.waitForResponse(r => r.url().endsWith('/api/pedidos') && r.request().method() === 'POST')
    await guardar.click()
    expect((await respuesta).status()).toBe(201)
    const exito = page.locator('[data-sonner-toast][data-type="success"]').filter({ hasText: 'Pedido creado exitosamente' })
    await expect(exito).toBeVisible()
    await exito.hover()
    const cerrar = exito.getByRole('button', { name: 'Cerrar aviso', exact: true })
    await cerrar.focus()
    await page.keyboard.press('Enter')
    await expect(exito).toHaveCount(0)
    await page.reload()
    await expect(appMain(page).getByTestId('fab-main')).toBeVisible()
  })
})
