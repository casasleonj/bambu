import { test, expect, fullLogin, apiPost, apiGet, createCliente, resetDatabase } from './fixtures'

test.describe('Pedidos: saldo no se muestra para pedidos no entregados', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: {} })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('pedido PENDIENTE sin pago muestra saldo cero/OK en la UI', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const create = await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    expect(create.status()).toBeLessThan(500)
    const body = await create.json()
    const pedidoId = body.pedido?.id || body.data?.id

    await page.goto('/pedidos?all=true')
    // Wait for table to load
    await page.waitForSelector('text=Lista de Pedidos', { timeout: 10000 })
    // Find the row for this pedido and verify no red saldo badge
    const row = page.locator(`tr:has-text("#${body.pedido?.numero}")`).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    const saldoCell = row.locator('td').nth(4)
    await expect(saldoCell).toContainText('✓')
  })
})
