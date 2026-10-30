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
      entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })

    // Second quick sale (fiado) — should also appear in the list
    await apiPost(page, '/api/pedidos', {
      clienteId,
      canal: 'PUNTO',
      entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })

    await goto(page, '/pedidos')

    // La lista existe dos veces en el DOM: tabla (desktop, `hidden md:block`) y tarjetas
    // (mobile, `md:hidden`). En mobile la tabla está oculta y `table tbody tr` nunca era
    // visible (#396): se usa el contenedor de la vista activa. Se espera por el contenido,
    // no por networkidle (SSE mantiene la conexión abierta).
    const lista = responsiveContainer(page, 'pedidos-mobile', 'pedidos-desktop')

    // Both pedidos should appear in the list (el nombre aparece una vez por pedido)
    await expect(lista.getByText(`Dos Ventas ${unique}`)).toHaveCount(2, { timeout: 15000 })
  })

  test('filtro default es Hoy al entrar a pedidos', async ({ page }) => {
    await loginAs(page, 'admin')
    await goto(page, '/pedidos')
    const hoyBtn = page.getByRole('button', { name: 'Hoy', exact: true })
    await expect(hoyBtn).toBeVisible({ timeout: 10000 })
    if (process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true') {
      await expect(hoyBtn).toHaveAttribute('aria-pressed', 'true')
    } else {
      await expect(hoyBtn).toHaveClass(/bg-blue-600/)
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      await expect(page).toHaveURL(url => url.searchParams.get('desde') === hoy && url.searchParams.get('hasta') === hoy)
    }
  })
})
