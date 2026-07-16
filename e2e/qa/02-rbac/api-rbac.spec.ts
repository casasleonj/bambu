import {
  test,
  expect,
  reportBug,
  apiCall,
  loginAs,
  resetTestDatabase,
  prisma,
} from '../../fixtures-paranoid'

function startOfDayInBogota(date: Date): Date {
  const bogota = new Date(date.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  bogota.setHours(0, 0, 0, 0)
  return bogota
}

test.describe('M2 - RBAC: endpoints sin role check en lectura', () => {
  let facturaId: string
  let clienteId: string
  let trabajadorId: string

  test.beforeAll(async () => {
    resetTestDatabase()

    const { Prisma } = await import('@prisma/client')

    const cliente = await prisma.cliente.findFirst({ where: { activo: true } })
    if (!cliente) throw new Error('No seeded cliente found')
    clienteId = cliente.id

    const trabajador = await prisma.trabajador.findFirst({ where: { rol: 'SELLADOR' } })
    if (!trabajador) throw new Error('No seeded SELLADOR trabajador found')
    trabajadorId = trabajador.id

    const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } })
    const adminId = adminUser?.id ?? ''

    const pedido = await prisma.pedido.create({
      data: {
        numero: 10001,
        clienteId: cliente.id,
        tipo: 'CONTADO',
        origen: 'PEDIDO',
        estadoEntrega: 'ENTREGADO',
        estadoPago: 'PAGADO',
        total: new Prisma.Decimal(10000),
        totalPagado: new Prisma.Decimal(10000),
        saldo: new Prisma.Decimal(0),
        fecha: new Date(),
        items: {
          create: [
            { producto: 'PACA_AGUA', cantPedido: 1, cantEntrega: 1, precio: new Prisma.Decimal(10000), subtotal: new Prisma.Decimal(10000) },
          ],
        },
      },
    })

    const factura = await prisma.factura.create({
      data: {
        pedidoId: pedido.id,
        clienteId: cliente.id,
        numero: 'FAC-RBAC-0001',
        fecha: new Date(),
        subtotal: new Prisma.Decimal(10000),
        total: new Prisma.Decimal(10000),
        saldo: new Prisma.Decimal(0),
        montoPagado: new Prisma.Decimal(10000),
        estado: 'PAGADA',
        empresaNombre: 'Agua Bambú SAS',
        empresaNit: '900.123.456-7',
      },
    })
    facturaId = factura.id

    await prisma.produccion.create({
      data: {
        trabajadorId: trabajador.id,
        fecha: startOfDayInBogota(new Date()),
        turno: 'MANANA',
        comSellTotal: 0,
        comRepartTotal: 0,
        createdById: adminId,
        items: {
          create: [
            { producto: 'PACA_AGUA', conteoA: 10, conteoB: 10, producido: 10, stockIni: 0, ventas: 0, stockFinEsperado: 10, stockFinFisico: 10, diferencia: 0, filtradas: 0, rotas: 0, consumoInterno: 0, comSellador: 0 },
            { producto: 'PACA_HIELO', conteoA: 5, conteoB: 5, producido: 5, stockIni: 0, ventas: 0, stockFinEsperado: 5, stockFinFisico: 5, diferencia: 0, filtradas: 0, rotas: 0, consumoInterno: 0, comSellador: 0 },
          ],
        },
      },
    })
  })

  test.afterAll(async () => {
    await prisma.$disconnect()
  })

  test('GET /api/facturas/[id] debe rechazar a REPARTIDOR con 403', async ({ page }) => {
    await loginAs(page, 'repartidor')
    const res = await apiCall(page.request, `/api/facturas/${facturaId}`)
    if (res.status() !== 403) {
      reportBug({
        severity: 'HIGH',
        category: 'Seguridad',
        vista: '/api/facturas/[id]',
        rol: 'REPARTIDOR',
        pasos: `Login como repartidor; GET /api/facturas/${facturaId}`,
        esperado: 'HTTP 403 Forbidden',
        real: `HTTP ${res.status()}`,
        evidencia: `REPARTIDOR obtuvo status ${res.status()} al leer factura ${facturaId}; se esperaba 403`,
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(403)
  })

  test('GET /api/facturas/[id] permite a ADMIN con 200', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiCall(page.request, `/api/facturas/${facturaId}`)
    expect(res.status()).toBe(200)
  })

  test('GET /api/clientes/[id] debe rechazar a REPARTIDOR con 403', async ({ page }) => {
    await loginAs(page, 'repartidor')
    const res = await apiCall(page.request, `/api/clientes/${clienteId}`)
    if (res.status() !== 403) {
      reportBug({
        severity: 'HIGH',
        category: 'Seguridad',
        vista: '/api/clientes/[id]',
        rol: 'REPARTIDOR',
        pasos: `Login como repartidor; GET /api/clientes/${clienteId}`,
        esperado: 'HTTP 403 Forbidden',
        real: `HTTP ${res.status()}`,
        evidencia: `REPARTIDOR obtuvo status ${res.status()} al leer cliente ${clienteId}; se esperaba 403`,
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(403)
  })

  test('GET /api/clientes/[id] permite a ASISTENTE con 200', async ({ page }) => {
    await loginAs(page, 'asistente')
    const res = await apiCall(page.request, `/api/clientes/${clienteId}`)
    expect(res.status()).toBe(200)
  })

  test('GET /api/produccion debe rechazar a REPARTIDOR con 403', async ({ page }) => {
    await loginAs(page, 'repartidor')
    const res = await apiCall(page.request, '/api/produccion')
    if (res.status() !== 403) {
      reportBug({
        severity: 'HIGH',
        category: 'Seguridad',
        vista: '/api/produccion',
        rol: 'REPARTIDOR',
        pasos: 'Login como repartidor; GET /api/produccion',
        esperado: 'HTTP 403 Forbidden',
        real: `HTTP ${res.status()}`,
        evidencia: `REPARTIDOR obtuvo status ${res.status()} al listar producción; se esperaba 403`,
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(403)
  })

  test('GET /api/produccion permite a ADMIN con 200', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiCall(page.request, '/api/produccion')
    expect(res.status()).toBe(200)
  })

  test('GET /api/trabajadores debe rechazar a REPARTIDOR con 403', async ({ page }) => {
    await loginAs(page, 'repartidor')
    const res = await apiCall(page.request, '/api/trabajadores')
    if (res.status() !== 403) {
      reportBug({
        severity: 'MEDIUM',
        category: 'Seguridad',
        vista: '/api/trabajadores',
        rol: 'REPARTIDOR',
        pasos: 'Login como repartidor; GET /api/trabajadores',
        esperado: 'HTTP 403 Forbidden',
        real: `HTTP ${res.status()}`,
        evidencia: `REPARTIDOR obtuvo status ${res.status()} al listar trabajadores; se esperaba 403`,
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(403)
  })

  test('GET /api/trabajadores/[id] debe rechazar a REPARTIDOR con 403', async ({ page }) => {
    await loginAs(page, 'repartidor')
    const res = await apiCall(page.request, `/api/trabajadores/${trabajadorId}`)
    if (res.status() !== 403) {
      reportBug({
        severity: 'MEDIUM',
        category: 'Seguridad',
        vista: '/api/trabajadores/[id]',
        rol: 'REPARTIDOR',
        pasos: `Login como repartidor; GET /api/trabajadores/${trabajadorId}`,
        esperado: 'HTTP 403 Forbidden',
        real: `HTTP ${res.status()}`,
        evidencia: `REPARTIDOR obtuvo status ${res.status()} al leer trabajador ${trabajadorId}; se esperaba 403`,
        conocidoEnAgentsMd: 'no',
      })
    }
    expect(res.status()).toBe(403)
  })

  test('GET /api/trabajadores permite a ADMIN con 200', async ({ page }) => {
    await loginAs(page, 'admin')
    const res = await apiCall(page.request, '/api/trabajadores')
    expect(res.status()).toBe(200)
  })
})
