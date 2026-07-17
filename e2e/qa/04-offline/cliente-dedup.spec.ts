import {
  test,
  expect,
  reportBug,
  apiCall,
  loginAs,
  resetTestDatabase,
  prisma,
} from '../../fixtures-paranoid'

test.describe('M4 - Offline dedup: POST /api/clientes', () => {
  test.beforeAll(() => {
    resetTestDatabase()
  })

  test.afterAll(async () => {
    await prisma.$disconnect()
  })

  test('mismo offlineId retorna cliente existente sin duplicar', async ({ page }) => {
    await loginAs(page, 'asistente')
    const offlineId = `cliente-dedup-${Date.now()}`
    const body = {
      nombre: 'Cliente Offline',
      telefono: '3100000000',
      direccion: 'Calle 1',
      barrio: 'Centro',
      offlineId,
    }

    const res1 = await apiCall(page.request, '/api/clientes', { method: 'POST', body })
    expect(res1.status()).toBe(201)
    const data1 = await res1.json()
    const clienteId = data1.cliente?.id
    expect(clienteId).toBeDefined()

    const res2 = await apiCall(page.request, '/api/clientes', { method: 'POST', body })
    const data2 = await res2.json()

    if (res2.status() !== 200 || data2.cliente?.id !== clienteId || data2.deduped !== true) {
      reportBug({
        severity: 'HIGH',
        category: 'Funcional',
        vista: '/api/clientes',
        rol: 'ASISTENTE',
        pasos: 'POST /api/clientes con offlineId; repetir POST con mismo offlineId',
        esperado: 'Segundo POST devuelve 200 con el cliente existente y deduped=true',
        real: `Segundo POST devolvió ${res2.status()} con cliente ${data2.cliente?.id}; deduped=${data2.deduped}`,
        evidencia: 'El server-side dedup por offlineId no funcionó para /api/clientes',
        conocidoEnAgentsMd: 'no',
      })
    }

    expect(res2.status()).toBe(200)
    expect(data2.cliente?.id).toBe(clienteId)
    expect(data2.deduped).toBe(true)

    const count = await prisma.cliente.count({ where: { offlineId } })
    expect(count).toBe(1)
  })
})
