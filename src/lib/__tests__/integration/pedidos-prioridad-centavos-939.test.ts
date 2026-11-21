// #939: regresión de precisión en la clasificación visual del Hub.
// La base PostgreSQL de CI crea pagos DECIMAL(10,2); no tocar contabilidad real.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { consultarPedidos } from '@/lib/pedidos-consulta.repository'
import { leerFiltrosConsulta } from '@/lib/pedidos-consulta'

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const fecha = new Date(`${HOY}T08:00:00-05:00`)
const marca = randomUUID()
const IDs: Record<string, string> = {}
let clienteId = ''

async function crear(
  nombre: string,
  antiguedadHoras: number,
  pagos: { monto: number; confirmacion: 'CONFIRMADO' | 'REPORTADO' }[],
) {
  const admin = await getAdminUser()
  const totalPagado = pagos.reduce((n, p) => n + Math.round(p.monto * 100), 0) / 100
  const estadoPago = totalPagado >= 1500.90 ? 'ANTICIPADO' : totalPagado > 0 ? 'PARCIAL' : 'PENDIENTE'
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId, createdById: admin.id, fecha,
      createdAt: new Date(Date.now() - antiguedadHoras * 3600000),
      estadoEntrega: 'PENDIENTE', estadoPago,
      canal: 'DOMICILIO', total: 1500.90,
      totalPagado, saldo: 1500.90 - totalPagado,
      items: { create: {
        producto: 'PACA_AGUA', cantPedido: 1, cantEntrega: 0,
        precio: 1500.90, subtotal: 1500.90,
      } },
    },
  })
  await testPrisma.pago.createMany({
    data: pagos.map(p => ({
      pedidoId: pedido.id, monto: p.monto, metodo: 'NEQUI',
      confirmacion: p.confirmacion,
    })),
  })
  IDs[nombre] = pedido.id
}

describe('#939 · sumatoria exacta de pagos confirmados para ordenar Pedidos', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const c = await testPrisma.cliente.create({ data: {
      nombre: `QA #939 centavos ${marca}`, telefono: randomUUID(),
    } })
    clienteId = c.id
    // El pagado completo es NUEVO respecto al no pagado; tiene que ganar por prioridad,
    // no por antigüedad (que fallaría ante el error binario 1500.30+0.60).
    await crear('sinPagoAntiguo', 72, [])
    await crear('pagadoCentavos', 4, [
      { monto: 1500.30, confirmacion: 'CONFIRMADO' },
      { monto: 0.60, confirmacion: 'CONFIRMADO' },
    ])
    // Hay dinero aplicado pero no enteramente confirmado; no debe superar al anterior.
    await crear('parcialConfirmado', 48, [
      { monto: 1500.30, confirmacion: 'CONFIRMADO' },
      { monto: 0.60, confirmacion: 'REPORTADO' },
    ])
    // Reportado sin confirmación: nivel normal; desempata FIFO frente al no pagado.
    await crear('soloReportado', 96, [
      { monto: 1500.90, confirmacion: 'REPORTADO' },
    ])
  }, 120000)
  afterAll(disconnect)

  it('suma centavos DECIMAL por pedido sin degradar prioridad de pago completo', async () => {
    const filtros = leerFiltrosConsulta(new URLSearchParams(
      `desde=${HOY}&hasta=${HOY}&clienteId=${clienteId}&agrupar=&pageSize=25`,
    ), HOY)
    const resultado = await consultarPedidos(filtros, 'ADMIN')
    expect(resultado.total).toBe(4)
    expect(resultado.pedidos.map(p => p.id)).toEqual([
      IDs.pagadoCentavos, IDs.parcialConfirmado, IDs.soloReportado, IDs.sinPagoAntiguo,
    ])
  })

  it('la comparación decimal correcta no altera los estados de pago en la base', async () => {
    const filas = await testPrisma.pedido.findMany({
      where: { id: { in: Object.values(IDs) } },
      select: { id: true, total: true, totalPagado: true, saldo: true, estadoPago: true },
    })
    expect(filas).toHaveLength(4)
    for (const f of filas) expect(Number(f.total)).toBe(1500.9)
    expect(filas.find(f => f.id === IDs.pagadoCentavos)?.estadoPago).toBe('ANTICIPADO')
    expect(Number(filas.find(f => f.id === IDs.pagadoCentavos)?.saldo)).toBe(0)
  })
})
