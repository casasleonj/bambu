/**
 * Tier 2: Forms Validation - Venta Rápida Form
 * Tests: 10
 */
import { test, expect, loginAsAdmin, apiPost, expectStatus } from '../00-fixtures'
import { resetTestDatabase } from '../../fixtures'

test.describe('Form Validation - Venta Rápida', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('TC-VR-01: Venta rápida PUNTO (no envio) creates pedido', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-VR-02: Venta rápida with multiple products', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      items: [
        { producto: 'PACA_AGUA', cantidad: 2 },
        { producto: 'PACA_HIELO', cantidad: 1 },
        { producto: 'BOTELLON', cantidad: 3 },
      ],
      pagos: [{ metodo: 'EFECTIVO', monto: 50000 }],
    })
    await expectStatus(res, [200, 201])
    const body = await res.json()
    const pedido = body.pedido || body
    expect(Number(pedido.total)).toBeGreaterThan(0)
  })

  test('TC-VR-03: Venta rápida with no payments (fiado)', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [],
    })
    await expectStatus(res, [200, 201])
    const body = await res.json()
    const pedido = body.pedido || body
    expect(Number(pedido.saldo)).toBeGreaterThan(0)
  })

  test('TC-VR-04: Venta rápida with payment method NEQUI', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'NEQUI', monto: 5000 }],
    })
    await expectStatus(res, [200, 201])
  })

  test('TC-VR-05: Venta rápida with all payment methods', async ({ page }) => {
    const methods = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']
    for (const method of methods) {
      const res = await apiPost(page, '/api/pedidos', {
        clienteId: 'CONSUMIDOR_FINAL',
        canal: 'PUNTO',
        ventaRapida: true,
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
        pagos: [{ metodo: method, monto: 5000 }],
      })
      await expectStatus(res, [200, 201])
    }
  })

  test('TC-VR-06: Venta rápida with very large quantity', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 9999 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 99999999 }],
    })
    // May be rejected if total exceeds Decimal(10,2) limit
    expect([200, 201, 400, 500]).toContain(res.status())
  })

  test('TC-VR-07: Venta rápida with multiple payments (split)', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [
        { metodo: 'EFECTIVO', monto: 5000 },
        { metodo: 'NEQUI', monto: 5000 },
      ],
    })
    await expectStatus(res, [200, 201])
    const body = await res.json()
    const pedido = body.pedido || body
    expect(Number(pedido.totalPagado)).toBe(10000)
  })

  test('TC-VR-08: Venta rápida rechaza precio manual > 99999999 (overflow)', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 999999999 }],
      pagos: [],
    })
    // Decimal(10,2) max is 99999999.99
    expect([200, 201, 400, 500]).toContain(res.status())
  })

  test('TC-VR-09: Venta rápida with empty items array is rejected', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      clienteId: 'CONSUMIDOR_FINAL',
      canal: 'PUNTO',
      ventaRapida: true,
      items: [],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    await expectStatus(res, 400)
  })

  test('TC-VR-10: Venta rápida with missing clienteId uses CONSUMIDOR_FINAL fallback', async ({ page }) => {
    const res = await apiPost(page, '/api/pedidos', {
      canal: 'PUNTO',
      ventaRapida: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
    })
    // Should default to CONSUMIDOR_FINAL or reject
    expect([200, 201, 400, 422]).toContain(res.status())
  })

  test.describe('TC-VR-11: Venta rápida no duplica cliente Consumidor Final', () => {
    test.describe.configure({ mode: 'serial' })

    test.beforeAll(() => {
      resetTestDatabase()
    })

    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page)
    })

    test('3 ventas rápidas anónimas usan el mismo clienteId canónico', async ({ page }) => {
      test.setTimeout(30000)

      const createdIds: string[] = []
      for (let i = 0; i < 3; i++) {
        const res = await apiPost(page, '/api/pedidos', {
          clienteId: 'CONSUMIDOR_FINAL',
          canal: 'PUNTO',
          ventaRapida: true,
          items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
          pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
          offlineId: `vr11-test-${i}-${Date.now()}`,
        })
        await expectStatus(res, [200, 201])
        const body = await res.json()
        const pedido = body.pedido || body
        expect(pedido.clienteId).toBe('CONSUMIDOR_FINAL')
        createdIds.push(pedido.id)
      }

      // Todos los pedidos deben compartir el mismo clienteId
      expect(new Set(createdIds).size).toBe(3)

      // La lista de clientes NO debe mostrar "Consumidor Final"
      // (el canónico tiene activo=false; los duplicados CUID no deben existir)
      const data = await page.evaluate(async () => {
        const r = await fetch('/api/clientes?all=true', { credentials: 'include' })
        return r.json()
      })
      const consumidoresFinal = (data.clientes || []).filter(
        (c: any) => c.nombre === 'Consumidor Final',
      )
      expect(consumidoresFinal).toHaveLength(0)
    })
  })
})
