import {
  test,
  expect,
  reportBug,
  apiCall,
  loginAs,
  resetTestDatabase,
  prisma,
} from '../../fixtures-paranoid'

test.describe('M3 - Validación: Negocio linkUbicacion con javascript:', () => {
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

  test('POST /api/negocios debe rechazar linkUbicacion javascript:', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiCall(page.request, '/api/negocios', {
      method: 'POST',
      body: {
        clienteId,
        nombre: 'Negocio XSS',
        linkUbicacion: 'javascript:alert(document.domain)',
      },
    })
    if (res.status() === 200 || res.status() === 201) {
      reportBug({
        severity: 'HIGH',
        category: 'Seguridad',
        vista: '/api/negocios',
        rol: 'ADMIN',
        pasos: 'Login como admin; POST /api/negocios con linkUbicacion=javascript:alert(document.domain)',
        esperado: 'HTTP 400 por URL no permitida',
        real: `HTTP ${res.status()} (negocio creado)`,
        evidencia: 'La API acepta y persiste un linkUbicacion con scheme javascript:',
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(400)
  })
})
