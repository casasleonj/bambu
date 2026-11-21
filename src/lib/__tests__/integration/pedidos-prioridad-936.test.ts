// #936: prueba REAL de consulta y paginación con PostgreSQL de CI.
// Todos los datos son sintéticos; no usar esta suite contra producción.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { consultarPedidos } from '@/lib/pedidos-consulta.repository'
import { leerFiltrosConsulta } from '@/lib/pedidos-consulta'

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const en = (dia: string, hhmm = '08:00:00') => new Date(`${dia}T${hhmm}-05:00`)
const MARCA = randomUUID()
const ids: Record<string, string> = {}
let clienteId = ''

async function crear(
  nombre: string,
  horaCreacion: string,
  opciones: { canal?: 'DOMICILIO' | 'PUNTO'; pago?: 'CONFIRMADO' | 'REPORTADO'; entregado?: boolean } = {},
) {
  const admin = await getAdminUser()
  const pagado = !!opciones.pago
  const entrega = opciones.entregado ? 1 : 0
  const p = await testPrisma.pedido.create({
    data: {
      clienteId,
      createdById: admin.id,
      fecha: en(HOY, '08:00:00'),
      createdAt: new Date(horaCreacion),
      fechaEntrega: null,
      canal: opciones.canal ?? 'DOMICILIO',
      estado: opciones.entregado ? 'ENTREGADO' : 'PENDIENTE',
      estadoEntrega: opciones.entregado ? 'ENTREGADO' : 'PENDIENTE',
      estadoPago: pagado ? 'PAGADO' : 'PENDIENTE',
      total: 1000, totalPagado: pagado ? 1000 : 0, saldo: pagado ? 0 : 1000,
      items: { create: { producto: 'PACA_AGUA', cantPedido: 1, cantEntrega: entrega, precio: 1000, subtotal: 1000 } },
    },
  })
  if (opciones.pago) {
    await testPrisma.pago.create({
      data: {
        pedidoId: p.id, monto: 1000, metodo: 'NEQUI',
        confirmacion: opciones.pago,
      },
    })
  }
  ids[nombre] = p.id
}

const consulta = (extra = '') => consultarPedidos(leerFiltrosConsulta(
  new URLSearchParams(`desde=${HOY}&hasta=${HOY}&clienteId=${clienteId}&agrupar=&pageSize=100${extra}`),
  HOY,
), 'ADMIN')

describe('#936 · prioridad/FIFO en PostgreSQL real', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const c = await testPrisma.cliente.create({ data: { nombre: `QA 936 ${MARCA}`, telefono: randomUUID() } })
    clienteId = c.id
    // createdAt y Pedido.fecha son deliberadamente distintos: FIFO por creación, filtro por fecha del pedido.
    await crear('pagoAntiguo', '2026-11-18T11:00:00.000Z', { pago: 'CONFIRMADO' })
    await crear('pagoNuevo', '2026-11-20T11:00:00.000Z', { pago: 'CONFIRMADO' })
    await crear('pagoReportado', '2026-11-17T11:00:00.000Z', { pago: 'REPORTADO', canal: 'PUNTO' })
    await crear('sinPago', '2026-11-19T11:00:00.000Z')
    await crear('entregadoConDeuda', '2026-11-16T11:00:00.000Z', { entregado: true })
  }, 120000)
  afterAll(disconnect)

  it('prioriza pago confirmado, usa FIFO por createdAt y deja entregado con deuda al final', async () => {
    const resultado = await consulta()
    expect(resultado.total).toBe(5)
    expect(resultado.pedidos.map(p => p.id)).toEqual([
      ids.pagoAntiguo, ids.pagoNuevo, ids.pagoReportado, ids.sinPago, ids.entregadoConDeuda,
    ])
    expect(new Set(resultado.pedidos.map(p => p.id)).size).toBe(5)
  })

  it('pagina antes de devolver la lista sin invertir el orden global ni duplicar', async () => {
    const paginas = await Promise.all([
      consulta('&pageSize=2&page=1'),
      consulta('&pageSize=2&page=2'),
      consulta('&pageSize=2&page=3'),
    ])
    const concatenados = paginas.flatMap(p => p.pedidos.map(x => x.id))
    expect(paginas.map(p => p.total)).toEqual([5, 5, 5])
    expect(paginas.map(p => p.pedidos.length)).toEqual([2, 2, 1])
    expect(concatenados).toEqual([
      ids.pagoAntiguo, ids.pagoNuevo, ids.pagoReportado, ids.sinPago, ids.entregadoConDeuda,
    ])
    expect(new Set(concatenados).size).toBe(5)
    // No garantiza snapshot entre páginas si pagos/estados cambian concurrentemente.
  })

  it('filtros combinados y pago reportado conservan la prioridad relativa entre los visibles', async () => {
    const domicilio = await consulta('&canal=DOMICILIO')
    expect(domicilio.pedidos.map(p => p.id)).toEqual([
      ids.pagoAntiguo, ids.pagoNuevo, ids.sinPago, ids.entregadoConDeuda,
    ])
    const registrados = await consulta('&pago=registrado')
    expect(registrados.pedidos.map(p => p.id)).toEqual([
      ids.pagoAntiguo, ids.pagoNuevo, ids.pagoReportado,
    ])
    // El filtro "registrado" se basa en estadoPago; REPORTADO no adquiere prioridad CONFIRMADO.
  })
})
