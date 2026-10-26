// @tests #487 — un precio vacío o 0 NO es una corrección de precio en el cierre.
//
// La pantalla y la ruta convierten un campo vacío en `0`; el servidor lo guardaba como precio del
// pedido (`?? original` no se activa con 0) y dejaba el ítem, la columna legacy y la comisión en $0.
// Postgres real, caso de uso real (`CerrarEmbarqueUseCase`), COMPLETO y PARCIAL.
// Datos 100% sintéticos.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => ({})) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { CerrarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CerrarEmbarqueUseCase'
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaGastoEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaGastoEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { calcularEstadoPago } from '@/modules/pedidos/domain/services/pagos-calculator.service'

const CANT = 10
const PRECIO = 1_000
const TOTAL = CANT * PRECIO // 10.000

let adminId: string
let clienteId: string

function casoDeUso(role: 'ADMIN' | 'ASISTENTE' = 'ADMIN') {
  return new CerrarEmbarqueUseCase(
    new PrismaEmbarqueRepository(),
    new PrismaGastoEmbarqueRepository(),
    new PrismaEmbarqueProductoRepository(),
    new PrismaTransactionManager(),
    adminId,
    role,
  )
}

const CEROS = { cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0 }
const PRECIOS_VACIOS = { pacaAgua: 0, pacaHielo: 0, botellonFab: 0, botellonDom: 0, bolsaAgua: 0, bolsaHielo: 0 }

async function crearEmbarque() {
  const trabajador = await testPrisma.trabajador.create({
    data: { nombre: `Precio ${Math.random().toString(36).slice(2, 8)}`, rol: 'REPARTIDOR', usaMoto: true },
  })
  const embarque = await testPrisma.embarque.create({
    data: { trabajadorId: trabajador.id, fecha: new Date(), estado: 'EN_RUTA', baseDinero: 0 },
  })
  await testPrisma.embarqueProducto.create({ data: { embarqueId: embarque.id, producto: 'PACA_AGUA', cargadas: CANT } })
  return embarque
}

/** Pedido de 10 pacas a $1.000 EN_RUTA con `pagado` ya cobrado (con su Pago y su Factura). */
async function crearPedido(embarqueId: string, pagado = 0) {
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      total: TOTAL,
      totalPagado: pagado,
      saldo: TOTAL - pagado,
      estadoEntrega: 'EN_RUTA',
      estado: 'EN_RUTA',
      estadoPago: calcularEstadoPago(TOTAL, pagado, 'EN_RUTA'),
      embarqueId,
      cPacaAguaPed: CANT,
      precioPacaAgua: PRECIO,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: CANT, cantEntrega: 0, precio: PRECIO, subtotal: TOTAL }] },
    },
  })
  if (pagado > 0) {
    await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: pagado, confirmacion: 'CONFIRMADO' } })
  }
  await testPrisma.factura.create({
    data: {
      numero: `FAC-${Math.random().toString(36).slice(2, 9)}`,
      clienteId, pedidoId: pedido.id, subtotal: TOTAL, total: TOTAL, saldo: TOTAL - pagado, montoPagado: pagado,
      estado: pagado >= TOTAL ? 'PAGADA' : pagado > 0 ? 'PARCIAL' : 'EMITIDA',
    },
  })
  return pedido
}

type Opciones = {
  entregado?: 'COMPLETO' | 'PARCIAL'
  entrega?: number
  precio?: number | null
  preciosReales?: Record<string, number>
  pagos?: Array<{ metodo: string; monto: number }>
  dryRun?: boolean
  role?: 'ADMIN' | 'ASISTENTE'
}

function cerrar(embarqueId: string, pedidoId: string, o: Opciones = {}) {
  const entrega = o.entrega ?? CANT
  const pagoTotal = (o.pagos ?? []).reduce((s, p) => s + p.monto, 0)
  return casoDeUso(o.role).execute({
    id: embarqueId,
    pedidos: [{
      pedidoId,
      entregado: o.entregado ?? 'COMPLETO',
      productosEntregados: { ...CEROS, cPacaAguaEnt: entrega },
      pagos: o.pagos ?? [],
      preciosReales: o.preciosReales ?? (o.precio ? { ...PRECIOS_VACIOS, pacaAgua: o.precio } : undefined),
    }],
    gastos: [],
    dineroEntregado: pagoTotal,
    dryRun: o.dryRun,
  })
}

async function estado(pedidoId: string) {
  const [p, item, factura, hist] = await Promise.all([
    testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId } }),
    testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId, producto: 'PACA_AGUA' } }),
    testPrisma.factura.findUniqueOrThrow({ where: { pedidoId } }),
    testPrisma.historial.findMany({ where: { registroId: pedidoId, accion: 'PRECIO_CIERRE' } }),
  ])
  return { p, item, factura, hist }
}

describe('#487 — precio vacío/0 no sobrescribe el precio del pedido en el cierre', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Precio Cli', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'Calle 1', activo: true },
    })
    clienteId = c.id
  })
  afterAll(async () => { await disconnect() })

  it('COMPLETO con todos los precios en 0: conserva el precio del pedido y la comisión se calcula con él', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    const r = await cerrar(emb.id, ped.id, { preciosReales: { ...PRECIOS_VACIOS } })

    const { p, item, hist } = await estado(ped.id)
    expect(Number(p.precioPacaAgua)).toBe(PRECIO)
    expect(Number(item.precio)).toBe(PRECIO)
    expect(Number(p.total)).toBe(TOTAL)
    expect(hist).toHaveLength(0)
    expect(r.totalVentas).toBe(TOTAL)
  })

  it('PARCIAL con todos los precios en 0: conserva el precio del pedido y la comisión usa el precio real', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    const r = await cerrar(emb.id, ped.id, { entregado: 'PARCIAL', entrega: 6, preciosReales: { ...PRECIOS_VACIOS } })

    const { p, item, hist } = await estado(ped.id)
    expect(Number(p.precioPacaAgua)).toBe(PRECIO)
    expect(Number(item.precio)).toBe(PRECIO)
    expect(Number(p.total)).toBe(TOTAL)
    expect(hist).toHaveLength(0)
    expect(r.totalVentas).toBe(6 * PRECIO)
  })

  it('un precio negativo o inválido tampoco corrige', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    await cerrar(emb.id, ped.id, { preciosReales: { ...PRECIOS_VACIOS, pacaAgua: -500 } })

    const { p, item } = await estado(ped.id)
    expect(Number(p.precioPacaAgua)).toBe(PRECIO)
    expect(Number(item.precio)).toBe(PRECIO)
  })

  it('un precio real distinto sigue guardándose como hasta ahora (su efecto en el total es #326 / ADR-MONETARIO-002)', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    await cerrar(emb.id, ped.id, { precio: 1_100 })

    const { p, item, hist } = await estado(ped.id)
    expect(Number(p.precioPacaAgua)).toBe(1_100)
    expect(Number(item.precio)).toBe(1_100)
    expect(hist).toHaveLength(1)
  })
})
