import { test, expect, fullLogin, apiPost, createCliente, resetDatabase } from './fixtures'

test.describe('Pedidos: estado de pago visual refleja el estado real', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeAll(() => {
    resetDatabase()
  })

  test('pedido PENDIENTE sin pago no muestra checkmark verde', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const create = await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    expect(create.status()).toBeLessThan(500)
    const body = await create.json()

    await page.goto('/pedidos?all=true')
    // Wait for table to load
    await page.waitForSelector('text=Lista de Pedidos', { timeout: 10000 })
    // Find the row for this pedido and verify it does NOT show a green checkmark
    const row = page.locator(`tr:has-text("#${body.pedido?.numero}")`).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    const saldoCell = row.locator('td').nth(4)
    await expect(saldoCell).not.toContainText('✓')
    await expect(saldoCell).toContainText('—')
  })

  test('pedido ENTREGADO con saldo muestra monto fiado en rojo', async ({ page }) => {
    await fullLogin(page)
    const c = await createCliente(page)
    const create = await apiPost(page, '/api/pedidos', {
      clienteId: c.cliente.id,
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    expect(create.status()).toBeLessThan(500)
    const body = await create.json()
    const pedidoId = body.pedido?.id

    // Entregar el pedido sin pago
    const entrega = await apiPost(page, '/api/pedidos/entrega', {
      pedidoId,
      itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    expect(entrega.status()).toBeLessThan(500)

    await page.goto('/pedidos?all=true')
    await page.waitForSelector('text=Lista de Pedidos', { timeout: 10000 })
    const row = page.locator(`tr:has-text("#${body.pedido?.numero}")`).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    const saldoCell = row.locator('td').nth(4)
    // Should show the outstanding amount as red money, not checkmark or dash
    await expect(saldoCell).not.toContainText('✓')
    await expect(saldoCell).not.toContainText('—')
    await expect(saldoCell.locator('[data-testid="money-display"], .text-red-600')).toBeVisible()
  })
})
