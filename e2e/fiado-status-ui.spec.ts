import { test, expect, type Page } from '@playwright/test'
import { fullLogin, createCliente, apiPost, apiPut, resetDatabase, BASE } from './fixtures'

async function createPedidoEntregado(page: Page, clienteId: string) {
  return apiPost(page, '/api/pedidos', {
    clienteId,
    canal: 'DOMICILIO',
    ventaRapida: true,
    items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    pagos: [],
  })
}

async function openNuevoPedidoModal(page: Page) {
  // Prevent the PWA install banner from covering the FAB on mobile viewports.
  await page.addInitScript(() => {
    localStorage.setItem('pwa-install-banner-dismissed', 'true')
  })

  await page.goto(`${BASE}/pedidos`)
  await page.waitForLoadState('domcontentloaded')

  await page.getByTestId('fab-main').click()
  await page.getByTestId('fab-pedido-envio').click()
}

test.describe.configure({ mode: 'serial' })

test.describe('UI fiado status banner', () => {
  test.beforeAll(() => {
    resetDatabase()
  })

  test('nuevo cliente sin pedidos no muestra banner de límite', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, { nombre: 'Karina Limpia' })
    await apiPut(page, `/api/clientes/${cliente.cliente.id}`, { limitePedidosFiados: 2 })

    await openNuevoPedidoModal(page)

    const searchInput = page.getByPlaceholder('Buscar cliente por nombre o teléfono...')
    await searchInput.fill('Karina Limpia')
    await page.waitForTimeout(300)
    const resultBtn = page.getByTestId('cliente-search-result').filter({ hasText: /Karina Limpia/ }).first()
    await resultBtn.evaluate((el: HTMLElement) => el.click())

    const banner = page.getByTestId('fiado-status-banner')
    await expect(banner).not.toBeVisible()
  })

  test('cliente al límite muestra banner 2/2 límite alcanzado', async ({ page }) => {
    await fullLogin(page)

    const cliente = await createCliente(page, { nombre: 'Karina Limite' })
    const clienteId = cliente.cliente.id
    await apiPut(page, `/api/clientes/${clienteId}`, { limitePedidosFiados: 2 })

    const p1 = await createPedidoEntregado(page, clienteId)
    expect(p1.status()).toBe(201)
    const p2 = await createPedidoEntregado(page, clienteId)
    expect(p2.status()).toBe(201)

    await openNuevoPedidoModal(page)

    const searchInput = page.getByPlaceholder('Buscar cliente por nombre o teléfono...')
    await searchInput.fill('Karina Limite')
    await page.waitForTimeout(300)
    const resultBtn = page.getByTestId('cliente-search-result').filter({ hasText: /Karina Limite/ }).first()
    await resultBtn.evaluate((el: HTMLElement) => el.click())

    const banner = page.getByTestId('fiado-status-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('2/2 pedidos fiados (límite alcanzado)')
  })
})
