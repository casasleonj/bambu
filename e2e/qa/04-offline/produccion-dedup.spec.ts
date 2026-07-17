import {
  test,
  expect,
  reportBug,
  apiCall,
  loginAs,
  resetTestDatabase,
  prisma,
} from '../../fixtures-paranoid'

test.describe('M4 - Offline dedup: POST /api/produccion', () => {
  test.beforeAll(async () => {
    resetTestDatabase()
  })

  test.afterAll(async () => {
    await prisma.$disconnect()
  })

  test('mismo offlineId retorna produccion existente sin duplicar', async ({ page }) => {
    await loginAs(page, 'admin')

    const trabajador = await prisma.trabajador.findFirst({ where: { rol: 'SELLADOR' } })
    if (!trabajador) throw new Error('No seeded SELLADOR trabajador found')

    const offlineId = `produccion-dedup-${Date.now()}`

    // Pre-crear la producción con el offlineId para simular un reintento offline.
    const existente = await prisma.produccion.create({
      data: {
        trabajadorId: trabajador.id,
        fecha: new Date(),
        turno: 'MANANA',
        comSellTotal: 0,
        comRepartTotal: 0,
        createdById: (await prisma.user.findUnique({ where: { username: 'admin' } }))?.id ?? '',
        offlineId,
        items: {
          create: [
            { producto: 'PACA_AGUA', conteoA: 10, conteoB: 10, producido: 10, stockIni: 0, ventas: 0, stockFinEsperado: 10, stockFinFisico: 10, diferencia: 0, filtradas: 0, rotas: 0, consumoInterno: 0, comSellador: 0 },
            { producto: 'PACA_HIELO', conteoA: 5, conteoB: 5, producido: 5, stockIni: 0, ventas: 0, stockFinEsperado: 5, stockFinFisico: 5, diferencia: 0, filtradas: 0, rotas: 0, consumoInterno: 0, comSellador: 0 },
          ],
        },
      },
      include: { items: true },
    })

    const body = {
      turno: 'MANANA',
      trabajadorId: trabajador.id,
      items: [
        { producto: 'PACA_AGUA', conteoA: 10, conteoB: 10, stockFinFisico: 10 },
        { producto: 'PACA_HIELO', conteoA: 5, conteoB: 5, stockFinFisico: 5 },
      ],
      offlineId,
    }

    const res = await apiCall(page.request, '/api/produccion', { method: 'POST', body })
    const data = await res.json()

    if (res.status() !== 200 || data.produccion?.id !== existente.id || data.deduped !== true) {
      reportBug({
        severity: 'HIGH',
        category: 'Funcional',
        vista: '/api/produccion',
        rol: 'ADMIN',
        pasos: 'Crear Produccion con offlineId; POST /api/produccion con mismo offlineId',
        esperado: 'POST devuelve 200 con la produccion existente y deduped=true',
        real: `POST devolvió ${res.status()} con produccion ${data.produccion?.id}; deduped=${data.deduped}`,
        evidencia: 'El server-side dedup por offlineId no funcionó para /api/produccion',
        conocidoEnAgentsMd: 'no',
      })
    }

    expect(res.status()).toBe(200)
    expect(data.produccion?.id).toBe(existente.id)
    expect(data.deduped).toBe(true)

    const count = await prisma.produccion.count({ where: { offlineId } })
    expect(count).toBe(1)
  })
})
