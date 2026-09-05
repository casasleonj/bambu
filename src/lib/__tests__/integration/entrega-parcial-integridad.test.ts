// @tests PR-1 — integridad de entrega parcial (docs/pedidos/CUMPLIMIENTO_PARCIAL_*)
//
// Golden: 10 comprado / 10 pagado → entregar 6 (cierre PARCIAL) → 4 pendientes
//         → re-planificar → entregar 4 (cierre) → ENTREGADO.
// El prepago NUNCA se destruye, NO se crea pedido hijo, `total`/`totalPagado`
// se conservan, `saldo = total - totalPagado`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

function buildUseCase() {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    'ADMIN',
  )
}

async function crearEmbarque() {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `PR1 ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0 },
  })
  return embarque
}

/** Pedido de 10 pacas de agua a $1.000, prepago total, EN_RUTA en `embarqueId`. */
async function crearPedido10Prepago(embarqueId: string) {
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      total: 10_000,
      totalPagado: 10_000,
      saldo: 0,
      // chk_pedido_estadopago_proyectado: pagado completo + EN_RUTA (aún no
      // entregado) → ANTICIPADO, no PAGADO.
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: 'ANTICIPADO',
      embarqueId,
      cPacaAguaPed: 10,
      cPacaAguaEnt: 0,
      precioPacaAgua: 1_000,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0, precio: 1_000, subtotal: 10_000 }] },
    },
  })
  await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: 10_000, confirmacion: 'CONFIRMADO' } })
  await testPrisma.factura.create({
    data: {
      numero: `FAC-${Math.random().toString(36).slice(2, 9)}`,
      clienteId, pedidoId: pedido.id, subtotal: 10_000, total: 10_000, saldo: 0, montoPagado: 10_000, estado: 'PAGADA',
    },
  })
  return pedido
}

describe('PR-1 — golden: entrega parcial no destruye el prepago ni crea hijo', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await testPrisma.cliente.create({
      data: {
        nombre: 'PR1 Cli', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
        direccion: 'Calle 1', activo: true,
      },
    })
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('10 pagado → cierre PARCIAL 6/10 → PENDIENTE, sin hijo, prepago intacto → cierre 4/4 → ENTREGADO', async () => {
    const emb1 = await crearEmbarque()
    const pedido = await crearPedido10Prepago(emb1.id)
    const pedidosAntes = await testPrisma.pedido.count()

    // ── Cierre 1: entrega parcial (6 de 10) ──────────────────────────
    await buildUseCase().execute({
      id: emb1.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL',
        productosEntregados: {
          cPacaAguaEnt: 6, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
          cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
        },
        // PR-2b: el wizard ya NO precarga el prepago. `pagos` = solo dinero
        // nuevo; este pedido ya está pagado → lista vacía.
        pagos: [],
      }],
      gastos: [],
      dineroEntregado: 0,
    })

    const p1 = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
    expect(p1.estadoEntrega).toBe('PENDIENTE')
    expect(p1.cPacaAguaEnt).toBe(6)
    expect(p1.cPacaAguaPed).toBe(10)
    expect(p1.items[0].cantEntrega).toBe(6)
    expect(Number(p1.total)).toBe(10_000)       // obligación intacta
    expect(Number(p1.totalPagado)).toBe(10_000) // prepago intacto
    expect(Number(p1.saldo)).toBe(0)            // sin deuda artificial
    expect(p1.embarqueId).toBeNull()            // re-planificable

    // NO se creó un pedido hijo.
    expect(await testPrisma.pedido.count()).toBe(pedidosAntes)

    // La factura no se degradó.
    const f1 = await testPrisma.factura.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    expect(Number(f1.total)).toBe(10_000)
    expect(f1.estado).toBe('PAGADA')

    // El Pago original sigue intacto.
    const pagos = await testPrisma.pago.findMany({ where: { pedidoId: pedido.id } })
    expect(pagos).toHaveLength(1)
    expect(Number(pagos[0].monto)).toBe(10_000)

    // ── Re-planificar: asignar el faltante a un nuevo embarque ───────
    const emb2 = await crearEmbarque()
    await testPrisma.pedido.update({
      where: { id: pedido.id },
      data: { embarqueId: emb2.id, estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' },
    })

    // ── Cierre 2: entrega de las 4 restantes ─────────────────────────
    await buildUseCase().execute({
      id: emb2.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL', // el repartidor marca PARCIAL; la acumulación completa
        productosEntregados: {
          cPacaAguaEnt: 4, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
          cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
        },
        pagos: [],
      }],
      gastos: [],
      dineroEntregado: 0,
    })

    const p2 = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, include: { items: true } })
    expect(p2.estadoEntrega).toBe('ENTREGADO')
    expect(p2.cPacaAguaEnt).toBe(10) // 6 + 4
    expect(p2.items[0].cantEntrega).toBe(10)
    expect(Number(p2.total)).toBe(10_000)
    expect(Number(p2.totalPagado)).toBe(10_000)
    expect(Number(p2.saldo)).toBe(0)
    expect(await testPrisma.pedido.count()).toBe(pedidosAntes) // nunca hubo hijo
  })

  it('re-cierre vía COMPLETO sin línea de pago (pedido ya prepago) → prepago NO se destruye', async () => {
    const emb1 = await crearEmbarque()
    const pedido = await crearPedido10Prepago(emb1.id)

    // Cierre 1: parcial 6/10
    await buildUseCase().execute({
      id: emb1.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'PARCIAL',
        productosEntregados: { cPacaAguaEnt: 6, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [],
      }],
      gastos: [], dineroEntregado: 0,
    })

    // Re-planificar
    const emb2 = await crearEmbarque()
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { embarqueId: emb2.id, estadoEntrega: 'EN_RUTA', estado: 'EN_RUTA' } })

    // Cierre 2: COMPLETO con `pagos: []` (nada nuevo por cobrar — ya está prepago)
    await buildUseCase().execute({
      id: emb2.id,
      pedidos: [{
        pedidoId: pedido.id,
        entregado: 'COMPLETO',
        productosEntregados: { cPacaAguaEnt: 4, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 },
        pagos: [],
      }],
      gastos: [], dineroEntregado: 0,
    })

    const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(p.estadoEntrega).toBe('ENTREGADO')
    expect(p.cPacaAguaEnt).toBe(10)
    expect(Number(p.total)).toBe(10_000)
    expect(Number(p.totalPagado)).toBe(10_000) // prepago intacto (no se pisó con 0)
    expect(Number(p.saldo)).toBe(0)
    // No se duplicó el Pago.
    expect(await testPrisma.pago.count({ where: { pedidoId: pedido.id } })).toBe(1)
    const f = await testPrisma.factura.findFirstOrThrow({ where: { pedidoId: pedido.id } })
    expect(f.estado).toBe('PAGADA')
  })
})
