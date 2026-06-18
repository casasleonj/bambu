// @tests C-13: Venta libre con dedup via offlineId
// El endpoint debe devolver el mismo pedido si se llama 2 veces con el mismo offlineId
import { test, expect, fullLogin, apiPost, createCliente, resetTestDatabase, createTrabajador, createEmbarque } from '../fixtures'

test.describe('Offline-First: Venta Libre Dedup por offlineId', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(() => {
    resetTestDatabase()
  })

  test('mismo offlineId en 2 ventas-libres → solo 1 pedido creado, segundo retorna deduped', async ({ page }) => {
    test.setTimeout(60000)
    await fullLogin(page)

    // Setup: cliente + trabajador + embarque ABIERTO
    const cliente = await createCliente(page)
    const repartidor = await createTrabajador(page, { usaMoto: true })
    const embarque = await createEmbarque(page, repartidor.trabajador.id)

    const offlineId = `offline-venta-libre-${Date.now()}`

    const ventaLibrePayload = {
      clienteId: cliente.cliente.id,
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5600 }],
      embarqueId: embarque.embarque.id,
      fotoEntrega: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/9k=',
      gpsLat: 4.7110,
      gpsLng: -74.0721,
      offlineId,
    }

    // 1ra llamada — debe crear el pedido
    const res1 = await apiPost(page, '/api/pedidos/venta-libre', ventaLibrePayload)
    expect([200, 201]).toContain(res1.status())
    const body1 = await res1.json()
    const pedido1Id = body1.pedido?.id || body1.id
    expect(pedido1Id).toBeTruthy()

    // 2da llamada — debe devolver el mismo pedido (deduped)
    const res2 = await apiPost(page, '/api/pedidos/venta-libre', ventaLibrePayload)
    expect([200, 201]).toContain(res2.status())
    const body2 = await res2.json()
    const pedido2Id = body2.pedido?.id || body2.id

    // Mismo pedido, no duplicado
    expect(pedido2Id).toBe(pedido1Id)
  })
})
