import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { leerCobrosPeriodo } from '@/lib/cobros-periodo'
import { PrismaFinanzasRepository } from '@/modules/dashboard/infrastructure/finanzas.repository'
import { PrismaPedidoRepository } from '@/modules/dashboard/infrastructure/pedido.repository'

const rango = (dia: string) => {
  const start = new Date(`${dia}T00:00:00-05:00`)
  return { start, end: new Date(+start + 86400000) }
}
const hora = (dia: string, hh = '12:00:00') => new Date(`${dia}T${hh}-05:00`)
async function pedido(
  dia: string,
  saldo = 100000,
  canal: 'PUNTO' | 'DOMICILIO' = 'DOMICILIO',
) {
  const cliente = await testPrisma.cliente.create({
    data: {
      nombre: 'Sintético dashboard',
      telefono: randomUUID(),
      activo: true,
    },
  })
  const p = await testPrisma.pedido.create({
    data: {
      clienteId: cliente.id,
      canal,
      origen: 'PEDIDO',
      fecha: hora(dia),
      total: 100000,
      totalPagado: 100000 - saldo,
      saldo,
      estado: 'ENTREGADO',
      estadoEntrega: 'ENTREGADO',
      estadoPago:
        saldo === 100000 ? 'PENDIENTE' : saldo > 0 ? 'PARCIAL' : 'PAGADO',
      cPacaAguaPed: 10,
      cPacaAguaEnt: 10,
      items: {
        create: [
          {
            producto: 'PACA_AGUA',
            cantPedido: 10,
            cantEntrega: 10,
            precio: 10000,
            subtotal: 100000,
          },
        ],
      },
    },
  })
  const factura = await testPrisma.factura.create({
    data: {
      numero: `F526-${randomUUID()}`,
      pedidoId: p.id,
      clienteId: cliente.id,
      subtotal: 100000,
      total: 100000,
      saldo,
      montoPagado: 100000 - saldo,
    },
  })
  return { p, cliente, factura }
}
const leer = (dia: string) => {
  const r = rango(dia)
  return leerCobrosPeriodo(testPrisma, r.start, r.end)
}
describe('dashboard #526: PostgreSQL y snapshot financiero', () => {
  beforeAll(resetAndSeed)
  afterAll(disconnect)
  it('distingue ventas 100000 de cobros 85000: efectivo60000, Nequi25000, fiado35000 sin duplicar espejos', async () => {
    const dia = '2050-01-01',
      actual = await pedido(dia, 35000, 'PUNTO'),
      viejo = await pedido('2049-12-20', 80000)
    await testPrisma.pago.createMany({
      data: [
        {
          pedidoId: actual.p.id,
          monto: 40000,
          metodo: 'EFECTIVO',
          confirmacion: 'CONFIRMADO',
          createdAt: hora(dia),
        },
        {
          pedidoId: actual.p.id,
          monto: 15000,
          metodo: 'NEQUI',
          confirmacion: 'CONFIRMADO',
          createdAt: hora(dia),
        },
        {
          pedidoId: actual.p.id,
          monto: 10000,
          metodo: 'NEQUI',
          confirmacion: 'REPORTADO',
          createdAt: hora(dia),
        },
      ],
    })
    const pago = await testPrisma.pago.create({
      data: {
        pedidoId: viejo.p.id,
        monto: 20000,
        metodo: 'EFECTIVO',
        confirmacion: 'CONFIRMADO',
        createdAt: hora(dia),
      },
    })
    await testPrisma.abono.create({
      data: {
        numero: `A526-${randomUUID()}`,
        facturaId: viejo.factura.id,
        clienteId: viejo.cliente.id,
        pedidoId: viejo.p.id,
        monto: 20000,
        metodoPago: 'EFECTIVO',
        fecha: hora(dia),
        origenCobro: 'ESPEJO_PAGO',
        pagoOrigenId: pago.id,
      },
    })
    const r = await leer(dia)
    expect(r.subtotalRegistrado).toBe(85000)
    expect(r.medios).toEqual([
      expect.objectContaining({
        metodo: 'EFECTIVO',
        neto: 60000,
        confirmado: 60000,
      }),
      expect.objectContaining({
        metodo: 'NEQUI',
        neto: 25000,
        confirmado: 15000,
        reportado: 10000,
      }),
    ])
    expect(r.movimientos).toHaveLength(4)
    expect(r.movimientos.find((m) => m.id === pago.id)?.pedidoAnterior).toBe(
      true,
    )
    const f = await new PrismaFinanzasRepository().leer(
      rango(dia),
      rango('2049-12-31'),
    )
    expect(f.pedidosHoy.map((p) => p.id)).toEqual([actual.p.id])
    expect(Number(f.pedidosHoy[0].saldo)).toBe(35000)
    expect(f.cobros?.subtotalRegistrado).toBe(85000)
    expect(f.consultadoAt).toMatch(/^\d{4}-/)
  })
  it('BONO no es dinero nuevo; abono independiente sí, sin asumir confirmación', async () => {
    const dia = '2050-01-02',
      { p, cliente, factura } = await pedido(dia)
    await testPrisma.pago.create({
      data: {
        pedidoId: p.id,
        monto: 10000,
        metodo: 'BONO',
        createdAt: hora(dia),
      },
    })
    await testPrisma.abono.create({
      data: {
        numero: `A526-${randomUUID()}`,
        facturaId: factura.id,
        clienteId: cliente.id,
        pedidoId: p.id,
        monto: 10000,
        metodoPago: 'DAVIPLATA',
        fecha: hora(dia),
        origenCobro: 'INDEPENDIENTE',
      },
    })
    const r = await leer(dia)
    expect(r.creditoAplicado).toBe(10000)
    expect(r.subtotalRegistrado).toBe(10000)
    expect(r.medios).toEqual([
      expect.objectContaining({
        metodo: 'DAVIPLATA',
        sinEstadoVerificable: 10000,
        confirmado: 0,
      }),
    ])
  })
  it('incluye último milisegundo de Bogotá y excluye siguiente medianoche y anulado', async () => {
    const dia = '2050-01-03',
      { p } = await pedido(dia),
      otro = await pedido(dia)
    await testPrisma.pedido.update({
      where: { id: otro.p.id },
      data: {
        estado: 'ANULADO',
        estadoEntrega: 'ANULADO',
        estadoPago: 'ANULADO',
      },
    })
    await testPrisma.pago.createMany({
      data: [
        {
          pedidoId: p.id,
          metodo: 'EFECTIVO',
          monto: 100,
          createdAt: hora(dia, '23:59:59.999'),
        },
        {
          pedidoId: p.id,
          metodo: 'EFECTIVO',
          monto: 200,
          createdAt: rango(dia).end,
        },
        {
          pedidoId: otro.p.id,
          metodo: 'EFECTIVO',
          monto: 900,
          createdAt: hora(dia),
        },
      ],
    })
    expect((await leer(dia)).subtotalRegistrado).toBe(100)
    expect((await leer('2050-01-04')).subtotalRegistrado).toBe(200)
  })
  it('espejo posterior a medianoche compensa al Pago original y nunca aparece como otro ingreso', async () => {
    const dia = '2050-01-05',
      { p, cliente, factura } = await pedido(dia)
    const pago = await testPrisma.pago.create({
      data: {
        pedidoId: p.id,
        monto: 10000,
        metodo: 'EFECTIVO',
        confirmacion: 'CONFIRMADO',
        createdAt: hora(dia, '23:59:59.999'),
      },
    })
    const abono = await testPrisma.abono.create({
      data: {
        numero: `A526-${randomUUID()}`,
        facturaId: factura.id,
        clienteId: cliente.id,
        pedidoId: p.id,
        monto: 10000,
        metodoPago: 'EFECTIVO',
        origenCobro: 'ESPEJO_PAGO',
        pagoOrigenId: pago.id,
        fecha: rango(dia).end,
      },
    })
    await testPrisma.correccionAbono.create({
      data: {
        numero: `C526-${randomUUID()}`,
        abonoId: abono.id,
        tipo: 'MONTO',
        montoRevertido: 1000,
        motivo: 'Prueba sintética',
        autorizadoPorId: (await getAdminUser()).id,
      },
    })
    expect((await leer(dia)).medios[0]).toMatchObject({
      bruto: 10000,
      ajustes: 1000,
      neto: 9000,
    })
    expect((await leer('2050-01-06')).subtotalRegistrado).toBe(0)
  })
  it('legado ambiguo no se empareja por igual monto y horario', async () => {
    const dia = '2050-01-07',
      { p, cliente, factura } = await pedido(dia)
    await testPrisma.pago.create({
      data: {
        pedidoId: p.id,
        monto: 10000,
        metodo: 'EFECTIVO',
        createdAt: hora(dia),
      },
    })
    await testPrisma.abono.create({
      data: {
        numero: `A526-${randomUUID()}`,
        facturaId: factura.id,
        clienteId: cliente.id,
        pedidoId: p.id,
        monto: 10000,
        metodoPago: 'EFECTIVO',
        fecha: hora(dia),
      },
    })
    const r = await leer(dia)
    expect(r.subtotalRegistrado).toBe(10000)
    expect(r.porConciliar).toHaveLength(1)
    expect(r.medios[0].pendienteConciliacion).toBe(true)
  })
  it('RepeatableRead no mezcla saldo anterior con un pago concurrente nuevo; siguiente lectura sí lo recoge', async () => {
    const dia = '2050-01-08',
      { p } = await pedido(dia, 100000)
    const original = PrismaPedidoRepository.prototype.findByDateRange
    const spy = vi.spyOn(PrismaPedidoRepository.prototype, 'findByDateRange')
    spy.mockImplementationOnce(async function (
      this: PrismaPedidoRepository,
      start,
      end,
    ) {
      const rows = await original.call(this, start, end)
      await testPrisma.$transaction(async (tx) => {
        await tx.pago.create({
          data: {
            pedidoId: p.id,
            monto: 100000,
            metodo: 'EFECTIVO',
            createdAt: hora(dia),
          },
        })
        await tx.pedido.update({
          where: { id: p.id },
          data: { totalPagado: 100000, saldo: 0, estadoPago: 'PAGADO' },
        })
      })
      return rows
    })
    try {
      const repo = new PrismaFinanzasRepository(),
        uno = await repo.leer(rango(dia), rango('2050-01-07'))
      expect(Number(uno.pedidosHoy.find((row) => row.id === p.id)!.saldo)).toBe(
        100000,
      )
      expect(uno.cobros?.subtotalRegistrado).toBe(0)
      const dos = await repo.leer(rango(dia), rango('2050-01-07'))
      expect(Number(dos.pedidosHoy.find((row) => row.id === p.id)!.saldo)).toBe(
        0,
      )
      expect(dos.cobros?.subtotalRegistrado).toBe(100000)
    } finally {
      spy.mockRestore()
    }
  })
})
