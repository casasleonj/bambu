import { test, expect } from '@playwright/test'
import { loginAs, goto, apiPost, createCliente, responsiveContainer } from './fixtures'

test.describe('Dos ventas rapidas mismo cliente', () => {
  test.describe.configure({ mode: 'serial' })

  test('dos ventas rapidas fiado del mismo cliente aparecen en la lista', async ({ page }) => {
    await loginAs(page, 'admin')
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
    // FIX: "table tbody tr" matchea la tabla desktop (data-testid
    // "pedidos-desktop"), que en viewport mobile queda oculta (`hidden
    // md:block`) mientras la vista real es "pedidos-mobile" (cards, no
    // <table>) -- AGENTS.md #24. responsiveContainer() elige el contenedor
    // correcto según el viewport; dentro de él, las filas/cards tienen su
    // propio testid en cada vista.
    const container = responsiveContainer(page, 'pedidos-mobile', 'pedidos-desktop')
    await expect(container).toBeVisible({ timeout: 10000 })
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768
    const rowLocator = isMobile ? '[data-testid="pedido-mobile-card"]' : 'tbody tr'
    await page.waitForSelector(`[data-testid="${isMobile ? 'pedidos-mobile' : 'pedidos-desktop'}"] ${rowLocator}`, { timeout: 10000 })

    // Both pedidos should appear in the list
    const rows = container.locator(rowLocator).filter({ hasText: `Dos Ventas ${unique}` })
    await expect(rows).toHaveCount(2, { timeout: 10000 })
  })

  test('filtro default es Turno al entrar a pedidos', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/pedidos')
    // Wait for the filter buttons to render
    const turnoBtn = page.locator('button:has-text("Turno")').first()
    await expect(turnoBtn).toBeVisible({ timeout: 10000 })
    await expect(turnoBtn).toHaveClass(/bg-blue-600/)
  })
})
