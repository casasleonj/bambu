// #932: integración real de la consulta financiera de Pedidos con PostgreSQL.
// Fixtures sintéticos; no modifica producción ni usa datos personales.
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma as db, resetAndSeed, disconnect } from './setup'
import { consultarPedidos } from '@/lib/pedidos-consulta.repository'
import { leerFiltrosConsulta } from '@/lib/pedidos-consulta'

const diaVisible = new Date('2026-11-05T17:00:00.000Z')
const diaPosterior = new Date('2026-11-06T17:00:00.000Z')
let clienteId: string
let visibleId: string
let montoEsperado = 0

const filtros = () => leerFiltrosConsulta(new URLSearchParams(
  'desde=2026-11-05&hasta=2026-11-05&resumen=0&clienteId=' + clienteId,
))

describe('#932: consulta de cobros de otros pedidos sin corte cronológico', () => {
  beforeAll(async () => {
    await resetAndSeed()
    const cliente = await db.cliente.create({
      data: { nombre: 'Titular de prueba 932', telefono: randomUUID() },
    })
    clienteId = cliente.id
    const visible = await db.pedido.create({
      data: {
        clienteId, fecha: diaVisible, createdAt: diaVisible,
        estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO',
        total: 9000, totalPagado: 9000, saldo: 0,
        cPacaAguaPed: 3, cPacaAguaEnt: 3, precioPacaAgua: 3000,
      },
    })
    visibleId = visible.id
    // Un fiado más reciente que el pedido visible; debe generar el aviso.
    await db.pedido.create({
      data: {
        clienteId, fecha: diaPosterior, createdAt: diaPosterior,
        estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE',
        total: 5000, totalPagado: 0, saldo: 5000,
        cPacaAguaPed: 2, cPacaAguaEnt: 2, precioPacaAgua: 2500,
      },
    })
    montoEsperado += 5000
    // 30 pedidos posteriores de deuda $100 cada uno. Se consideran todos,
    // sin limitar por la fecha de creación del pedido visible ni por la página.
    await db.pedido.createMany({
      data: Array.from({ length: 30 }, () => ({
        clienteId, fecha: diaPosterior, createdAt: diaPosterior,
        estadoEntrega: 'ENTREGADO' as const, estadoPago: 'PENDIENTE' as const,
        total: 100, totalPagado: 0, saldo: 100,
        cPacaAguaPed: 1, cPacaAguaEnt: 1, precioPacaAgua: 100,
      })),
    })
    montoEsperado += 3000
    // Pedido programado que tiene saldo contractual pero NO entrega: no es
    // exigible ni debe inflar el badge.
    await db.pedido.create({
      data: {
        clienteId, fecha: diaPosterior, createdAt: diaPosterior,
        estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE',
        total: 10000, totalPagado: 0, saldo: 10000, cPacaAguaPed: 5,
      },
    })
    // Cliente distinto con deuda. Ni coincidencia de nombre ni página puede cruzarla.
    const ajeno = await db.cliente.create({
      data: { nombre: 'Titular de prueba 932', telefono: randomUUID() },
    })
    await db.pedido.create({
      data: {
        clienteId: ajeno.id, fecha: diaPosterior, createdAt: diaPosterior,
        estadoEntrega: 'ENTREGADO', estadoPago: 'PENDIENTE',
        total: 27000, totalPagado: 0, saldo: 27000, cPacaAguaPed: 9, cPacaAguaEnt: 9,
      },
    })
  })
  afterAll(disconnect)

  it('mantiene una fila pagada y presenta 31 deudas posteriores con total correcto', async () => {
    const resultado = await consultarPedidos(filtros(), 'ADMIN', db)
    expect(resultado.pedidos.map(p => p.id)).toContain(visibleId)
    const visible = resultado.pedidos.find(p => p.id === visibleId)
    expect(visible?.fiadosConsultaError).toBeUndefined()
    expect(visible?.fiadosAnteriores).toMatchObject({
      total: montoEsperado, propio: 0, totalCliente: montoEsperado, pedidos: 31,
    })
    expect(visible?.fiadosAnteriores?.productos).toEqual([
      { producto: 'PACA_AGUA', cantidad: 32 },
    ])
    expect(visible?.fiadosAnteriores?.origenes).toHaveLength(31)
  })
})
