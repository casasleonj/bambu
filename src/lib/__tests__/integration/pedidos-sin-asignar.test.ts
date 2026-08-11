// @tests Red de contención — pedidos atrasados sin asignar (whereAtrasadosSinAsignar)
// Verifica contra Postgres real, con el corte exacto de medianoche Bogotá:
//   1. Un pendiente sin embarque de AYER cuenta como atrasado.
//   2. Un pendiente sin embarque de HOY NO cuenta (esa es la brecha real:
//      todavía es visible en las vistas normales de "hoy").
//   3. Un pendiente de ayer YA asignado a un embarque no cuenta.
//   4. El filtro embarqueId:null vía ListarPedidosUseCase/PrismaPedidoRepository
//      (el mismo camino que usa GET /api/pedidos?atrasados=true) devuelve
//      exactamente esos pedidos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, uniqueId } from './setup'
import { startOfDayBogota } from '@/lib/dates'
import { countPedidosAtrasadosSinAsignar } from '@/lib/pedidos-sin-asignar'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'

describe('Pedidos atrasados sin asignar — corte exacto a medianoche Bogotá', () => {
  let clienteId: string

  beforeAll(async () => {
    await resetAndSeed()
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'Test Cliente Atrasados',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle Test',
        activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => {
    await disconnect()
  })

  function ayerBogota(): Date {
    return new Date(startOfDayBogota().getTime() - 60_000)
  }

  async function crearPedido(overrides: { fecha: Date; embarqueId?: string | null }) {
    return testPrisma.pedido.create({
      data: {
        clienteId,
        canal: 'DOMICILIO',
        offlineId: uniqueId('atrasado'),
        fecha: overrides.fecha,
        embarqueId: overrides.embarqueId ?? null,
      },
    })
  }

  it('un pendiente sin embarque de AYER cuenta como atrasado', async () => {
    const before = await countPedidosAtrasadosSinAsignar()
    const p = await crearPedido({ fecha: ayerBogota() })

    const after = await countPedidosAtrasadosSinAsignar()
    expect(after).toBe(before + 1)

    await testPrisma.pedido.delete({ where: { id: p.id } })
  })

  it('un pendiente sin embarque de HOY NO cuenta (todavía visible en las vistas de "hoy")', async () => {
    const before = await countPedidosAtrasadosSinAsignar()
    const p = await crearPedido({ fecha: new Date() })

    const after = await countPedidosAtrasadosSinAsignar()
    expect(after).toBe(before)

    await testPrisma.pedido.delete({ where: { id: p.id } })
  })

  it('un pendiente de ayer YA asignado a un embarque NO cuenta', async () => {
    const trabajador = await testPrisma.trabajador.create({
      data: { nombre: 'Test Repartidor Atrasados', rol: 'REPARTIDOR', usaMoto: true },
    })
    const embarque = await testPrisma.embarque.create({
      data: { trabajadorId: trabajador.id },
    })

    const before = await countPedidosAtrasadosSinAsignar()
    const p = await crearPedido({ fecha: ayerBogota(), embarqueId: embarque.id })

    const after = await countPedidosAtrasadosSinAsignar()
    expect(after).toBe(before)

    await testPrisma.pedido.delete({ where: { id: p.id } })
    await testPrisma.embarque.delete({ where: { id: embarque.id } })
  })

  it('PrismaPedidoRepository.findMany con embarqueId:null devuelve el pedido atrasado (mismo camino que la API)', async () => {
    const p = await crearPedido({ fecha: ayerBogota() })
    const repo = new PrismaPedidoRepository()

    const pedidos = await repo.findMany(
      { estadoEntrega: ['PENDIENTE'], embarqueId: null, hasta: startOfDayBogota() },
      { take: 1000 },
    )

    expect(pedidos.some((f) => f.id.get() === p.id)).toBe(true)

    await testPrisma.pedido.delete({ where: { id: p.id } })
  })
})
