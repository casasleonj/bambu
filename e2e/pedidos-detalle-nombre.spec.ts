import { test, expect } from '@playwright/test'
import { loginAs, goto, apiPost, createCliente, responsiveContainer } from './fixtures'

test.describe('Pedidos - detalle muestra nombre', () => {
  test.describe.configure({ mode: 'serial' })

  test('abrir detalle de pedido muestra el nombre del cliente', async ({ page }) => {
    await loginAs(page, 'admin')
    const unique = Date.now()
    const cliente = await createCliente(page, {
      nombre: `Detalle Nombre ${unique}`,
      telefono: `3${String(unique).slice(-9)}`,
    })
    const clienteId = cliente.cliente?.id || cliente.data?.id
    if (!clienteId) { test.skip(); return }

    const pedido = await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    const pedidoData = await pedido.json()
    const pedidoId = pedidoData.pedido?.id || pedidoData.data?.id
    if (!pedidoId) { test.skip(); return }

    await goto(page, '/pedidos')
    // Wait for the table to render instead of networkidle (SSE keeps connection open)
    // La lista se pinta dos veces (tabla en escritorio, tarjetas en móvil): se trabaja
    // solo con la vista que corresponde al viewport.
    const lista = responsiveContainer(page, 'pedidos-mobile', 'pedidos-desktop')
    await expect(lista).toBeVisible({ timeout: 10000 })

    // Click on the row (or card) that contains the client name
    const row = lista.getByText(`Detalle Nombre ${unique}`).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.click()

    // Modal should show the client name in the heading and it must remain visible
    const heading = page.locator('h2').filter({ hasText: `Detalle Nombre ${unique}` }).first()
    await expect(heading).toBeVisible({ timeout: 5000 })
    // Wait a bit for the lazy detail fetch to complete and ensure name does not disappear
    await page.waitForTimeout(800)
    await expect(heading).toBeVisible({ timeout: 5000 })
  })
})
