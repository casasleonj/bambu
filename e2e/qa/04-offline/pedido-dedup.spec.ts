import {
  test,
  expect,
  reportBug,
  apiCall,
  loginAs,
  resetTestDatabase,
  prisma,
} from '../../fixtures-paranoid'

test.describe('M4 - Offline dedup: POST /api/pedidos', () => {
  let clienteId: string

  test.beforeAll(async () => {
    resetTestDatabase()
    const cliente = await prisma.cliente.findFirst({ where: { activo: true } })
    if (!cliente) throw new Error('No seeded cliente found')
    clienteId = cliente.id
  })

  test.afterAll(async () => {
    await prisma.$disconnect()
  })

  test('mismo offlineId retorna pedido existente sin duplicar', async ({ page }) => {
    await loginAs(page, 'asistente')
    const offlineId = `pedido-dedup-${Date.now()}`
    const body = {
      clienteId,
      origen: 'PEDIDO',
      canal: 'DOMICILIO',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 12000 }],
      offlineId,
    }

    const res1 = await apiCall(page.request, '/api/pedidos', { method: 'POST', body })
    expect(res1.status()).toBe(201)
    const data1 = await res1.json()
    const pedidoId = data1.pedido?.id
    expect(pedidoId).toBeDefined()

    const res2 = await apiCall(page.request, '/api/pedidos', { method: 'POST', body })
    const data2 = await res2.json()

    if (res2.status() !== 200 || data2.pedido?.id !== pedidoId || data2.deduped !== true) {
      reportBug({
        severity: 'HIGH',
        category: 'Funcional',
        vista: '/api/pedidos',
        rol: 'ASISTENTE',
        pasos: 'POST /api/pedidos con offlineId; repetir POST con mismo offlineId',
        esperado: 'Segundo POST devuelve 200 con el pedido existente y deduped=true',
        real: `Segundo POST devolvió ${res2.status()} con pedido ${data2.pedido?.id}; deduped=${data2.deduped}`,
        evidencia: 'El server-side dedup por offlineId no funcionó para /api/pedidos',
        conocidoEnAgentsMd: 'no',
      })
    }

    expect(res2.status()).toBe(200)
    expect(data2.pedido?.id).toBe(pedidoId)
    expect(data2.deduped).toBe(true)

    const count = await prisma.pedido.count({ where: { offlineId } })
    expect(count).toBe(1)
  })
})
