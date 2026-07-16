import {
  test,
  expect,
  reportBug,
  apiCall,
  loginAs,
  resetTestDatabase,
  prisma,
} from '../../fixtures-paranoid'

test.describe('M2 - XSS: API acepta javascript: en linkUbicacion', () => {
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

  test('PUT /api/clientes/[id] debe rechazar linkUbicacion javascript:', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiCall(page.request, `/api/clientes/${clienteId}`, {
      method: 'PUT',
      body: {
        nombre: 'Cliente XSS',
        telefono: '3000000000',
        linkUbicacion: 'javascript:alert(document.domain)',
        updatedAt: new Date().toISOString(),
      },
    })
    if (res.status() === 200) {
      reportBug({
        severity: 'HIGH',
        category: 'Seguridad',
        vista: '/api/clientes/[id]',
        rol: 'ADMIN',
        pasos: 'Login como admin; PUT /api/clientes/[id] con linkUbicacion=javascript:alert(document.domain)',
        esperado: 'HTTP 400 por URL no permitida',
        real: 'HTTP 200 (cliente actualizado)',
        evidencia: 'La API acepta y persiste un linkUbicacion con scheme javascript: sin validación',
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(400)
  })
})
