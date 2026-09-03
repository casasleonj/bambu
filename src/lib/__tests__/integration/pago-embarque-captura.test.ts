// @tests PR-2a — ADR-PAGO-EMBARQUE-CAPTURA-001: los pagos capturados en una
// misión llevan `Pago.embarqueId`; los de fuera de misión quedan `null`.
// (PR-2a NO cambia la conciliación del cierre — solo puebla el campo.)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { CrearPedidoUseCase } from '@/modules/pedidos/application/use-cases/CrearPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaPagoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPagoRepository'
import { PrismaClienteRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaClienteRepository'
import { PrismaPricingAdapter } from '@/modules/pedidos/infrastructure/repositories/PrismaPricingAdapter'
import { PrismaTransactionManager as PedidoTxMgr } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

async function crearEmbarque() {
  const t = await testPrisma.trabajador.create({ data: { nombre: `P2a ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true } })
  return testPrisma.embarque.create({ data: { trabajadorId: t.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0 } })
}

describe('PR-2a — Pago.embarqueId (contexto de captura)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await testPrisma.cliente.create({
      data: { nombre: 'P2a Cli', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', limitePedidosFiados: 20, activo: true },
    })
    clienteId = c.id
  })
  afterAll(async () => { await disconnect() })

  it('prepago al crear el pedido (fuera de misión) → Pago.embarqueId = null', async () => {
    const useCase = new CrearPedidoUseCase(
      new PrismaPedidoRepository(), new PrismaFacturaRepository(), new PrismaPagoRepository(),
      new PrismaClienteRepository(), new PrismaPricingAdapter(), new PedidoTxMgr(),
    )
    const res = await useCase.execute({
      clienteId, canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 9_999_999 }],
      offlineId: `p2a-${Math.random()}`, createdById: adminId, createdByRole: 'ADMIN',
    })
    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: res.pedido.id } })
    expect(pagos.length).toBeGreaterThan(0)
    expect(pagos.every((p) => p.embarqueId === null)).toBe(true)
  })

  it('venta libre en ruta → Pago.embarqueId = el embarque de la venta', async () => {
    const emb = await crearEmbarque()
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', origen: 'VENTA_LIBRE', total: 10_000, totalPagado: 10_000, saldo: 0,
        estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PAGADO', embarqueId: emb.id, embarqueOrigenId: emb.id,
        cPacaAguaPed: 10, cPacaAguaEnt: 10, precioPacaAgua: 1_000,
      },
    })
    // Simula el create de pago del route de venta-libre.
    await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 10_000, embarqueId: emb.id } })
    const p = await testPrisma.pago.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    expect(p.embarqueId).toBe(emb.id)
  })

  it('cobro registrado en el cierre (COMPLETO) → Pago.embarqueId = el embarque que se cierra', async () => {
    const emb = await crearEmbarque()
    const pedido = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', total: 5_000, totalPagado: 0, saldo: 5_000,
        estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA', estadoPago: 'PENDIENTE', embarqueId: emb.id,
        cPacaAguaPed: 5, cPacaAguaEnt: 0, precioPacaAgua: 1_000,
        items: { create: [{ producto: 'PACA_AGUA', cantPedido: 5, cantEntrega: 0, precio: 1_000, subtotal: 5_000 }] },
      },
    })

    await new CerrarEmbarqueUseCase(
      new PrismaEmbarqueRepository(), new PrismaGastoEmbarqueRepository(), new PrismaEmbarqueProductoRepository(),
      new PrismaTransactionManager(), adminId, 'ADMIN',
    ).execute({
      id: emb.id,
      pedidos: [{
        pedidoId: pedido.id, entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 5, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [{ metodo: 'EFECTIVO', monto: 5_000 }],
      }],
      gastos: [], dineroEntregado: 5_000,
    })

    const p = await testPrisma.pago.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    expect(p.embarqueId).toBe(emb.id)
    expect(Number(p.monto)).toBe(5_000)
  })
})
