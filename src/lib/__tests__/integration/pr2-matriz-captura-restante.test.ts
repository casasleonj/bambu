// @tests PR-2 — ADR-PAGO-EMBARQUE-CAPTURA-001 §383, matriz de captura (16 casos).
//
// Cierra los casos tratables como integración contra Postgres real que NO
// estaban cubiertos por `pr2b-conciliacion-captura.test.ts` (2/5/7/8/14) ni por
// `cierre-venta-ruta-entrega-posterior.test.ts` (8) ni por los tests de guard
// en `procesar-pedido.service.test.ts` (10/11):
//
//   1  — Prepago mostrador → cierre entrega parcial: cobro de misión = $0
//   3  — Prepago → pedido reasignado: el `Pago` conserva `embarqueId = null`
//   4  — Pago capturado en E70 → el pedido pasa a E78: `Pago.embarqueId` sigue E70
//   9  — Regresión: cierre fresco normal → caja idéntica al comportamiento previo
//   15 — A6: dos entregas-con-pago concurrentes sobre el mismo pedido serializan
//        bajo `PEDIDO:{id}`; nunca se persiste un `Pago` de sobrepago
//
// Fuera de este archivo (requieren orquestación de carrera o el ciclo
// cancelar/reabrir embarque — follow-up):
//   6  — offline + reintento (cubierto en esencia por `pedido-idempotencia.test.ts`)
//   12 — sync tardío a embarque CERRADO (discrepancia post-cierre por diseño, §4.3)
//   13 — carrera online cierre↔entrega (discrepancia post-cierre por diseño)
//   16 — cerrar → cancelar/reabrir → re-cerrar (depende de la reversión de caja
//        de `cancelar-embarque`, ADR-CIERRE-001)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { EntregarPedidoUseCase } from '@/modules/pedidos/application/use-cases/EntregarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaTransactionManager as PedidosTxManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

function buildCierre() {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    'ADMIN',
  )
}

async function crearEmbarque(baseDinero = 0) {
  const t = await testPrisma.trabajador.create({
    data: { nombre: `P2m ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  return testPrisma.embarque.create({
    data: { trabajadorId: t.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero },
  })
}

/** Pedido de N pacas de agua a $10.000, EN_RUTA en `embarqueId`. */
async function crearPedido(
  embarqueId: string,
  pacas: number,
  opts: { totalPagado?: number; estadoPago?: 'PENDIENTE' | 'ANTICIPADO' | 'PAGADO' | 'PARCIAL' } = {},
) {
  const total = pacas * 10_000
  const totalPagado = opts.totalPagado ?? 0
  return testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      total,
      totalPagado,
      saldo: total - totalPagado,
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: opts.estadoPago ?? (totalPagado >= total ? 'ANTICIPADO' : 'PENDIENTE'),
      embarqueId,
      cPacaAguaPed: pacas,
      cPacaAguaEnt: 0,
      precioPacaAgua: 10_000,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: pacas, cantEntrega: 0, precio: 10_000, subtotal: total }] },
    },
  })
}

describe('PR-2 — matriz de captura, casos restantes', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'P2m Cli',
        telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1',
        limitePedidosFiados: 999,
        activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('caso 1 — prepago mostrador $100k, cierre entrega 60%: cobro de misión = $0, sin PAGOS_EXCEDIDOS, pago histórico intacto', async () => {
    const emb = await crearEmbarque(0)
    const pedido = await crearPedido(emb.id, 10, { totalPagado: 100_000 }) // prepago total

    // Pago histórico "de mostrador": fuera de misión (embarqueId = null).
    const pagoPrevio = await testPrisma.pago.create({
      data: {
        pedidoId: pedido.id,
        metodo: 'EFECTIVO',
        monto: 100_000,
        embarqueId: null,
        confirmacion: 'CONFIRMADO',
        createdAt: new Date(Date.now() - 86_400_000),
      },
    })

    const result = await buildCierre().execute({
      id: emb.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL',
        productosEntregados: { cPacaAguaEnt: 6, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [], // el cierre ya no precarga el prepago
      }],
      gastos: [],
      dineroEntregado: 0,
    })

    // El prepago tiene embarqueId = null → NO entra al cobro de misión.
    expect(result.caja.efectivoEsperado).toBe(0)
    expect(result.caja.sobranteFaltante).toBe(0)

    // Pago histórico intacto.
    const pg = await testPrisma.pago.findUniqueOrThrow({ where: { id: pagoPrevio.id } })
    expect(pg.embarqueId).toBeNull()
    expect(Number(pg.monto)).toBe(100_000)

    // Obligación económica intacta; entrega parcial.
    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.total)).toBe(100_000)
    expect(Number(p.totalPagado)).toBe(100_000)
    expect(Number(p.saldo)).toBe(0)
    expect(p.estadoEntrega).toBe('PENDIENTE')
  })

  it('caso 3 — prepago → pedido reasignado a otro embarque: el Pago conserva embarqueId = null', async () => {
    const embA = await crearEmbarque(0)
    const pedido = await crearPedido(embA.id, 5, { totalPagado: 50_000 })
    const pago = await testPrisma.pago.create({
      data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 50_000, embarqueId: null, confirmacion: 'CONFIRMADO' },
    })

    const embB = await crearEmbarque(0)
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { embarqueId: embB.id } })

    const pg = await testPrisma.pago.findUniqueOrThrow({ where: { id: pago.id } })
    expect(pg.embarqueId).toBeNull()
  })

  it('caso 4 — pago capturado en E70 → el pedido pasa a E78: el Pago sigue con embarqueId = E70', async () => {
    const e70 = await crearEmbarque(0)
    const pedido = await crearPedido(e70.id, 10) // fiado $100k

    await buildCierre().execute({
      id: e70.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL',
        productosEntregados: { cPacaAguaEnt: 6, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [{ metodo: 'EFECTIVO', monto: 60_000 }],
      }],
      gastos: [],
      dineroEntregado: 60_000,
    })

    const pagoE70 = await testPrisma.pago.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    expect(pagoE70.embarqueId).toBe(e70.id)

    // El pedido se re-planifica a E78 → el Pago NO se mueve.
    const e78 = await crearEmbarque(0)
    await testPrisma.pedido.update({
      where: { id: pedido.id },
      data: { embarqueId: e78.id, estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' },
    })

    const pgDespues = await testPrisma.pago.findUniqueOrThrow({ where: { id: pagoE70.id } })
    expect(pgDespues.embarqueId).toBe(e70.id)
  })

  it('caso 9 — regresión: cierre fresco normal (fiado, cobro en la entrega, un embarque) → caja coherente', async () => {
    const emb = await crearEmbarque(0)
    const pedido = await crearPedido(emb.id, 5) // fiado $50k

    const result = await buildCierre().execute({
      id: emb.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 5, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [{ metodo: 'EFECTIVO', monto: 50_000 }],
      }],
      gastos: [],
      dineroEntregado: 50_000,
    })

    expect(result.caja.efectivoEsperado).toBe(50_000)
    expect(result.caja.efectivoReal).toBe(50_000)
    expect(result.caja.diferencia).toBe(0)
    expect(result.caja.sobranteFaltante).toBe(0)

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(Number(p.totalPagado)).toBe(50_000)
    expect(Number(p.saldo)).toBe(0)

    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: pedido.id } })
    expect(pagos).toHaveLength(1)
    expect(pagos[0].embarqueId).toBe(emb.id)
  })

  it('caso 15 — A6: dos entregas-con-pago concurrentes sobre el mismo pedido serializan; nunca se persiste sobrepago', async () => {
    const emb = await crearEmbarque(0)
    const pedido = await crearPedido(emb.id, 10) // fiado $100k

    const useCase = new EntregarPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaPagoRepository(),
      new PedidosTxManager(),
    )

    // Dos entregas concurrentes, cada una cobra $60k → juntas $120k > $100k.
    const mkInput = (offlineId: string) => ({
      pedidoId: pedido.id,
      itemsEntregados: [{ producto: 'PACA_AGUA' as const, cantidad: 6 }],
      pagos: [{ metodo: 'EFECTIVO' as const, monto: 60_000 }],
      embarqueId: emb.id,
      offlineId,
    })

    await Promise.allSettled([
      useCase.execute(mkInput('a6-1')),
      useCase.execute(mkInput('a6-2')),
    ])

    // Invariante duro: nunca se paga de más, y Σ Pago == totalPagado.
    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(p.totalPagado)).toBeLessThanOrEqual(Number(p.total))
    expect(Number(p.saldo)).toBeGreaterThanOrEqual(0)

    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: pedido.id } })
    const sumaPagos = pagos.reduce((s, pg) => s + Number(pg.monto), 0)
    expect(sumaPagos).toBe(Number(p.totalPagado))
    // Todo Pago capturado en la misión lleva el embarqueId.
    for (const pg of pagos) expect(pg.embarqueId).toBe(emb.id)
  })
})
