import { test, expect } from '@playwright/test'
import { fullLogin, goto, apiPost, createCliente } from './fixtures'

test.describe('Dos ventas rapidas mismo cliente', () => {
  test.describe.configure({ mode: 'serial' })

  test('dos ventas rapidas fiado del mismo cliente aparecen en la lista', async ({ page }) => {
    await fullLogin(page)
    const unique = Date.now()
    const cliente = await createCliente(page, {
      nombre: `Dos Ventas ${unique}`,
      telefono: `3${String(unique).slice(-9)}`,
    })
    const clienteId = cliente.cliente?.id || cliente.data?.id
    if (!clienteId) { test.skip(); return }

    // First quick sale (fiado)
    await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })

    // Second quick sale (fiado) — should also appear in the list
    await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })

    await goto(page, '/pedidos')
    // Wait for the table to render instead of networkidle (SSE keeps connection open)
    await page.waitForSelector('table tbody tr', { timeout: 10000 })

    // Both pedidos should appear in the list
    const rows = page.locator('table tbody tr').filter({ hasText: `Dos Ventas ${unique}` })
    await expect(rows).toHaveCount(2, { timeout: 10000 })
  })

  test('filtro default es Turno al entrar a pedidos', async ({ page }) => {
    await fullLogin(page)
    await goto(page, '/pedidos')
    // Wait for the filter buttons to render
    const turnoBtn = page.locator('button:has-text("Turno")').first()
    await expect(turnoBtn).toBeVisible({ timeout: 10000 })
    await expect(turnoBtn).toHaveClass(/bg-blue-600/)
  })
})
