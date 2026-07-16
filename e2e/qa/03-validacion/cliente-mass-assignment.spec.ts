import {
  test,
  expect,
  reportBug,
  apiCall,
  loginAs,
  resetTestDatabase,
  prisma,
} from '../../fixtures-paranoid'

test.describe('M3 - Validación: mass assignment en Cliente PUT', () => {
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

  test('PUT /api/clientes/[id] debe rechazar verificado=true', async ({ page }) => {
    await loginAs(page, 'asistente')
    const res = await apiCall(page.request, `/api/clientes/${clienteId}`, {
      method: 'PUT',
      body: {
        nombre: 'Nombre Válido',
        telefono: '3000000000',
        verificado: true,
        updatedAt: new Date().toISOString(),
      },
    })
    if (res.status() === 200) {
      reportBug({
        severity: 'MEDIUM',
        category: 'Seguridad',
        vista: '/api/clientes/[id]',
        rol: 'ASISTENTE',
        pasos: 'Login como asistente; PUT /api/clientes/[id] con verificado=true',
        esperado: 'HTTP 400 (campo no permitido)',
        real: 'HTTP 200 (cliente actualizado)',
        evidencia: 'ASISTENTE pudo modificar el campo verificado via PUT',
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(400)
  })

  test('PUT /api/clientes/[id] debe rechazar offlineId', async ({ page }) => {
    await loginAs(page, 'asistente')
    const res = await apiCall(page.request, `/api/clientes/${clienteId}`, {
      method: 'PUT',
      body: {
        nombre: 'Nombre Válido',
        telefono: '3000000000',
        offlineId: 'offline-id-forzado',
        updatedAt: new Date().toISOString(),
      },
    })
    if (res.status() === 200) {
      reportBug({
        severity: 'MEDIUM',
        category: 'Seguridad',
        vista: '/api/clientes/[id]',
        rol: 'ASISTENTE',
        pasos: 'Login como asistente; PUT /api/clientes/[id] con offlineId',
        esperado: 'HTTP 400 (campo no permitido)',
        real: 'HTTP 200 (cliente actualizado)',
        evidencia: 'ASISTENTE pudo modificar el campo offlineId via PUT',
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(400)
  })

  test('PUT /api/clientes/[id] permite actualizar campos permitidos', async ({ page }) => {
    await loginAs(page, 'asistente')
    const res = await apiCall(page.request, `/api/clientes/${clienteId}`, {
      method: 'PUT',
      body: {
        nombre: 'Nombre Actualizado',
        telefono: '3000000001',
        updatedAt: new Date().toISOString(),
      },
    })
    expect(res.status()).toBe(200)
  })
})
