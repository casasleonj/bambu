// @tests C-1: REPARTIDOR NO debe poder usar /api/pedidos/pagar-fiado
// Hallazgo: el endpoint solo tenía requireAuth, sin rol/ownership
import { test, expect, fullLogin, loginAs, csrfLogin, apiPost, createCliente, resetTestDatabase } from '../fixtures'

test.describe('Security Fix: Pagar Fiado requiere rol ADMIN/ASISTENTE', () => {
  test.beforeAll(() => {
    resetTestDatabase()
  })

  test('REPARTIDOR recibe 403 al intentar pagar fiado', async ({ page }) => {
    // POST /api/clientes requiere ADMIN/ASISTENTE (ver src/app/api/clientes/route.ts) --
    // el cliente de prueba se crea con esa sesión antes de cambiar al rol bajo prueba,
    // para no confundir "createCliente() rechazado" con el fix bajo test.
    await loginAs(page, 'admin')
    const cliente = await createCliente(page)

    await loginAs(page, 'repartidor')
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
    // Mismo motivo que el test anterior: crear el cliente como ADMIN antes
    // de loguear como SELLADOR (que no puede crear clientes via API).
    await loginAs(page, 'admin')
    const cliente = await createCliente(page)

    // FIX: el login manual por UI (fill + click + waitForTimeout fijo) no
    // garantizaba que la sesión de 'admin' (recién establecida arriba, para
    // crear el cliente) ya estuviera reemplazada por la de 'sellador' antes
    // del apiPost de abajo -- si la sesión seguía siendo 'admin', requireRole
    // pasaba y el request caía en "sin deudas pendientes" (400) en vez de
    // rechazarse por rol (403). csrfLogin() acepta cualquier username/password
    // (no está limitado a los 4 roles cacheados de Role) y ya es el patrón
    // usado para credenciales no-canónicas en loginAs() mismo.
    await csrfLogin(page, 'sellador', 'sell123')

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
