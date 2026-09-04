// @tests F-A — docs/pedidos/AUDITORIA_REGRESION_POST_PR2_PEDIDO_PAGO_CIERRE.md
//
// APLICAR_CREDITO ya NO fabrica una entrega. Los pedidos prepagados que se
// consolidan se CANCELAN (nunca se entregaron) y su dinero se traspasa por
// NotaCredito + `Cliente.saldoFavor` (ciclo de crédito canónico), no copiando
// `totalPagado` a ciegas.
//
// Antes: los prepagos quedaban ENTREGADO + cantEntrega = cantPedido +
// fechaEntrega = now, y el pedido nuevo recibía totalPagado sin Pago ni NC
// → entrega inexistente, doble conteo de producto, dinero duplicado.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { generarPedidosRecurrentes } from '@/lib/recurrentes'

let clienteId: string

/** Pedido prepagado (PENDIENTE, saldo 0), origen != RECURRENTE. */
async function crearPrepago(pacas: number, precio: number) {
  const total = pacas * precio
  return testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      tipo: 'ENVIO',
      total,
      totalPagado: total,
      saldo: 0,
      estadoEntrega: 'PENDIENTE',
      estado: 'PENDIENTE',
      estadoPago: 'ANTICIPADO',
      cPacaAguaPed: pacas,
      cPacaAguaEnt: 0,
      precioPacaAgua: precio,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: pacas, cantEntrega: 0, precio, subtotal: total }] },
      pagos: { create: [{ metodo: 'EFECTIVO', monto: total, embarqueId: null, confirmacion: 'CONFIRMADO' }] },
      factura: {
        create: {
          numero: `FAC-T${Math.floor(Math.random() * 1e6)}`,
          clienteId,
          subtotal: total,
          total,
          montoPagado: total,
          saldo: 0,
          estado: 'PAGADA',
        },
      },
    },
  })
}

describe('F-A — recurrentes APLICAR_CREDITO: integridad Pedido→Pago→Cartera', () => {
  let plantillaId: string
  let prepagoA: { id: string; total: number; totalPagado: number }
  let prepagoB: { id: string; total: number; totalPagado: number }

  beforeAll(async () => {
    await resetAndSeed()
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'FA Cli',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1',
        limitePedidosFiados: 999,
        activo: true,
      },
    })
    clienteId = c.id

    const a = await crearPrepago(5, 2500) // $12.500 prepagado
    const b = await crearPrepago(5, 2500) // $12.500 prepagado
    prepagoA = { id: a.id, total: Number(a.total), totalPagado: Number(a.totalPagado) }
    prepagoB = { id: b.id, total: Number(b.total), totalPagado: Number(b.totalPagado) }

    const pl = await testPrisma.plantillaRecurrente.create({
      data: {
        clienteId,
        activo: true,
        cadaNDias: 7,
        tipo: 'ENVIO',
        canal: 'DOMICILIO',
        proxGeneracion: new Date('2026-09-01T12:00:00Z'), // martes
        ultimaGeneracion: null,
        productos: { create: [{ producto: 'PACA_AGUA', cantidad: 5 }] },
      },
    })
    plantillaId = pl.id

    await generarPedidosRecurrentes(
      [{ recurrenteId: plantillaId, decision: 'APLICAR_CREDITO' }],
      new Date('2026-09-01T12:00:00Z'),
    )
  })

  afterAll(async () => { await disconnect() })

  it('los prepagos consolidados quedan CANCELADO, nunca ENTREGADO, y sus items sin entregar', async () => {
    for (const id of [prepagoA.id, prepagoB.id]) {
      const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id }, include: { items: true } })
      expect(p.estadoEntrega).toBe('CANCELADO')
      expect(p.estado).toBe('CANCELADO')
      expect(p.estadoPago).toBe('ANULADO')
      expect(Number(p.total)).toBe(0)
      expect(Number(p.totalPagado)).toBe(0)
      expect(Number(p.saldo)).toBe(0)
      // NO se fabricó entrega.
      for (const it of p.items) expect(it.cantEntrega).toBe(0)
      expect(p.fechaEntrega).toBeNull()
    }
  })

  it('cada prepago genera una NotaCredito por su monto y su factura queda ANULADA', async () => {
    for (const pre of [prepagoA, prepagoB]) {
      const ncs = await testPrisma.notaCredito.findMany({ where: { pedidoId: pre.id } })
      expect(ncs).toHaveLength(1)
      expect(Number(ncs[0].monto)).toBe(pre.totalPagado)

      const fac = await testPrisma.factura.findFirstOrThrow({ where: { pedidoId: pre.id } })
      expect(fac.estado).toBe('ANULADA')
    }
  })

  it('el pedido nuevo consume el crédito vía saldoFavor; el excedente queda disponible', async () => {
    const nuevo = await testPrisma.pedido.findFirstOrThrow({
      where: { clienteId, origen: 'RECURRENTE' },
      include: { pagos: true },
    })
    const sumPrepago = prepagoA.totalPagado + prepagoB.totalPagado
    const nuevoTotal = Number(nuevo.total)
    const montoCredito = Math.min(sumPrepago, nuevoTotal)

    expect(nuevo.estadoEntrega).toBe('PENDIENTE')
    expect(Number(nuevo.totalPagado)).toBe(montoCredito)
    expect(Number(nuevo.saldo)).toBe(nuevoTotal - montoCredito)
    expect(nuevo.estadoPago).toBe(montoCredito >= nuevoTotal ? 'ANTICIPADO' : 'PARCIAL')
    // El crédito NO es un Pago (igual que CrearPedidoUseCase): se rastrea por
    // el movimiento de saldoFavor + las NC, no por filas Pago.
    expect(nuevo.pagos).toHaveLength(0)

    // saldoFavor del cliente = excedente (crédito parqueado − consumido).
    const cli = await testPrisma.cliente.findUniqueOrThrow({ where: { id: clienteId } })
    expect(Number(cli.saldoFavor)).toBe(Math.max(0, sumPrepago - nuevoTotal))
  })

  it('conservación del dinero: Σ NotaCredito == crédito consumido + saldoFavor', async () => {
    const ncs = await testPrisma.notaCredito.findMany({
      where: { pedido: { clienteId } },
    })
    const sumNC = ncs.reduce((s, nc) => s + Number(nc.monto), 0)

    const nuevo = await testPrisma.pedido.findFirstOrThrow({ where: { clienteId, origen: 'RECURRENTE' } })
    const cli = await testPrisma.cliente.findUniqueOrThrow({ where: { id: clienteId } })

    expect(sumNC).toBe(Number(nuevo.totalPagado) + Number(cli.saldoFavor))
  })
})
