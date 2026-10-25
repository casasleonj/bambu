// @tests ADR-CIERRE-002 §1-2 (épica #447, Fase B) — el cierre exige cobertura
// EXACTA de los pedidos vigentes del embarque y rechaza los no entregables.
//
// Verifica contra Postgres real (hallazgos #444, #448, #449):
//   1. Un pedido CANCELADO que sigue en el embarque NO puede cerrarse como
//      entregado (antes: ENTREGADO con total $0).
//   2. Un pedido vigente omitido del cierre bloquea el cierre (antes: quedaba
//      EN_RUTA dentro de un embarque CERRADO).
//   3. Un pedido de OTRO embarque o repetido se rechaza.
//   4. `pedidos: []` con pedidos vigentes en el embarque se rechaza.
//   5. Cancelar un pedido lo suelta del embarque (decisión del PO 2026-10-24).
//   6. El rechazo NO deja efectos: el embarque sigue EN_RUTA.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, getSeededCliente, uniqueId } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { CancelarPedidoUseCase } from '@/modules/pedidos/application/use-cases/CancelarPedidoUseCase'
import { PrismaPedidoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository'
import { PrismaFacturaRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaFacturaRepository'
import { PrismaNotaCreditoRepository } from '@/modules/pedidos/infrastructure/repositories/PrismaNotaCreditoRepository'
import { PrismaTransactionManager as PedidosTxManager } from '@/modules/pedidos/infrastructure/transactions/PrismaTransactionManager'

let adminId: string
let clienteId: string

function cerrarUC() {
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
    data: { nombre: `Integ ${uniqueId('t')}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: {
      trabajadorId: trabajador.id,
      fecha: new Date(),
      estado: 'EN_RUTA',
      baseDinero: 0,
      productos: { create: [{ producto: 'PACA_AGUA', cargadas: 20 }] },
    },
  })
  return embarque
}

async function crearPedido(embarqueId: string | null, extra: Record<string, unknown> = {}) {
  return testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      estadoEntrega: embarqueId ? 'EN_RUTA' : 'PENDIENTE',
      estado: embarqueId ? 'EN_RUTA' : 'PENDIENTE',
      estadoPago: 'PENDIENTE',
      total: 23000,
      totalPagado: 0,
      saldo: 23000,
      cPacaAguaPed: 10,
      precioPacaAgua: 2300,
      embarqueId,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 0, precio: 2300, subtotal: 23000 }] },
      ...extra,
    },
  })
}

const completo = (pedidoId: string) => ({
  pedidoId,
  entregado: 'COMPLETO' as const,
  productosEntregados: {
    cPacaAguaEnt: 10, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  },
  pagos: [],
})

async function mensajeDe(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'NO_LANZO'
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

describe('Cierre — cobertura exacta de pedidos (ADR-CIERRE-002 §1-2)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await getSeededCliente()).id
  })
  afterAll(async () => {
    await disconnect()
  })

  it('caso feliz: cubre todos los pedidos vigentes y cierra (dry-run)', async () => {
    const e = await crearEmbarque()
    const p1 = await crearPedido(e.id)
    const p2 = await crearPedido(e.id)
    const r = await cerrarUC().execute({
      id: e.id, pedidos: [completo(p1.id), completo(p2.id)], dryRun: true,
    })
    expect(r.estado).toBe('CERRADO')
    expect(r.pedidosProcesados).toBe(2)
  })

  it('#449: un pedido vigente omitido bloquea el cierre (PEDIDOS_SIN_RESOLVER) y no deja efectos', async () => {
    const e = await crearEmbarque()
    const p1 = await crearPedido(e.id)
    const p2 = await crearPedido(e.id)
    const msg = await mensajeDe(cerrarUC().execute({ id: e.id, pedidos: [completo(p1.id)] }))
    expect(msg).toMatch(/^PEDIDOS_SIN_RESOLVER/)
    expect(msg).toContain(p2.id)
    const post = await testPrisma.embarque.findUniqueOrThrow({ where: { id: e.id } })
    expect(post.estado).toBe('EN_RUTA')
  })

  it('#444: pedidos vacío con pedidos vigentes en el embarque se rechaza', async () => {
    const e = await crearEmbarque()
    await crearPedido(e.id)
    const msg = await mensajeDe(cerrarUC().execute({ id: e.id, pedidos: [] }))
    expect(msg).toMatch(/^PEDIDOS_SIN_RESOLVER/)
  })

  it('un pedido de OTRO embarque se rechaza (PEDIDO_FUERA_DEL_EMBARQUE)', async () => {
    const e = await crearEmbarque()
    const otro = await crearEmbarque()
    const propio = await crearPedido(e.id)
    const ajeno = await crearPedido(otro.id)
    const msg = await mensajeDe(
      cerrarUC().execute({ id: e.id, pedidos: [completo(propio.id), completo(ajeno.id)] }),
    )
    expect(msg).toMatch(/^PEDIDO_FUERA_DEL_EMBARQUE/)
    expect(msg).toContain(ajeno.id)
    const ajenoPost = await testPrisma.pedido.findUniqueOrThrow({ where: { id: ajeno.id } })
    expect(ajenoPost.estadoEntrega).toBe('EN_RUTA')
  })

  it('un pedido repetido en el payload se rechaza (PEDIDO_DUPLICADO), sin doble entrega', async () => {
    const e = await crearEmbarque()
    const p1 = await crearPedido(e.id)
    const msg = await mensajeDe(cerrarUC().execute({ id: e.id, pedidos: [completo(p1.id), completo(p1.id)] }))
    expect(msg).toMatch(/^PEDIDO_DUPLICADO/)
  })

  it('#448: un pedido CANCELADO que sigue en el embarque no se puede cerrar como entregado', async () => {
    const e = await crearEmbarque()
    const vivo = await crearPedido(e.id)
    const cancelado = await crearPedido(e.id, { estadoEntrega: 'CANCELADO', estado: 'CANCELADO', estadoPago: 'ANULADO', total: 0, saldo: 0 })
    const msg = await mensajeDe(
      cerrarUC().execute({ id: e.id, pedidos: [completo(vivo.id), completo(cancelado.id)] }),
    )
    expect(msg).toMatch(/^PEDIDO_NO_ENTREGABLE/)
    expect(msg).toContain(cancelado.id)
    const post = await testPrisma.pedido.findUniqueOrThrow({ where: { id: cancelado.id } })
    expect(post.estadoEntrega).toBe('CANCELADO') // no se marcó ENTREGADO
  })

  it('un pedido CANCELADO/ANULADO en el embarque NO cuenta como pendiente: se puede cerrar sin él', async () => {
    const e = await crearEmbarque()
    const vivo = await crearPedido(e.id)
    await crearPedido(e.id, { estadoEntrega: 'CANCELADO', estado: 'CANCELADO', estadoPago: 'ANULADO', total: 0, saldo: 0 })
    await crearPedido(e.id, { estadoEntrega: 'ANULADO', estado: 'ANULADO', estadoPago: 'ANULADO' })
    const r = await cerrarUC().execute({ id: e.id, pedidos: [completo(vivo.id)], dryRun: true })
    expect(r.pedidosProcesados).toBe(1)
  })

  it('cancelar un pedido lo SUELTA del embarque (decisión del PO 2026-10-24)', async () => {
    const e = await crearEmbarque()
    const p = await crearPedido(e.id)
    await new CancelarPedidoUseCase(
      new PrismaPedidoRepository(),
      new PrismaFacturaRepository(),
      new PrismaNotaCreditoRepository(),
      new PedidosTxManager(),
    ).execute({ pedidoId: p.id, motivo: 'cliente desistió', offlineId: uniqueId('can') })
    const post = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id } })
    expect(post.estadoEntrega).toBe('CANCELADO')
    expect(post.embarqueId).toBeNull()
  })
})
