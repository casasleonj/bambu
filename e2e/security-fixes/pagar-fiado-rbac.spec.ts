// @tests C-1: REPARTIDOR NO debe poder usar /api/pedidos/pagar-fiado
// Hallazgo: el endpoint solo tenía requireAuth, sin rol/ownership
import { test, expect, fullLogin, loginAs, apiPost, createCliente, resetTestDatabase, BASE } from '../fixtures'

test.describe('Security Fix: Pagar Fiado requiere rol ADMIN/ASISTENTE', () => {
  test.beforeAll(() => {
    resetTestDatabase()
  })

  test('REPARTIDOR recibe 403 al intentar pagar fiado', async ({ page }) => {
    await loginAs(page, 'repartidor')
    const cliente = await createCliente(page)

    const res = await apiPost(page, '/api/pedidos/pagar-fiado', {
      clienteId: cliente.cliente.id,
      monto: 10000,
      metodo: 'EFECTIVO',
    })

    // Antes del fix: 200 (cualquiera podía cobrar)
    // Después del fix: 403 (rechazado por rol)
    expect(res.status()).toBe(403)
  })

  test('SELLADOR recibe 403 al intentar pagar fiado', async ({ page }) => {
    // Login custom porque no hay helper
    await page.goto(`${BASE}/login`)
    await page.fill('input[placeholder="Ingrese usuario"]', 'sellador')
    await page.fill('input[placeholder="Ingrese contraseña"]', 'sell123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    const cliente = await createCliente(page)
    const res = await apiPost(page, '/api/pedidos/pagar-fiado', {
      clienteId: cliente.cliente.id,
      monto: 10000,
      metodo: 'EFECTIVO',
    })

    expect(res.status()).toBe(403)
  })

  test('ADMIN puede pagar fiado (sanity check)', async ({ page }) => {
    await fullLogin(page)
    const cliente = await createCliente(page)

    // Setup: crear pedido con saldo
    const pedidoRes = await apiPost(page, '/api/pedidos', {
      clienteId: cliente.cliente.id,
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })
    expect([200, 201]).toContain(pedidoRes.status())

    const res = await apiPost(page, '/api/pedidos/pagar-fiado', {
      clienteId: cliente.cliente.id,
      monto: 5000,
      metodo: 'EFECTIVO',
    })

    // Si no hay deuda, retorna 400 (SIN_DEUDA) — eso es OK
    // Si hay deuda, retorna 200
    expect([200, 400]).toContain(res.status())
  })
})
