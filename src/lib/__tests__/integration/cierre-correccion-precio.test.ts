// @tests #326 — corrección de precio en el cierre del embarque, con recálculo de la
// obligación (decisión del PO 2026-10-23; ADR-MONETARIO-001, addendum «Corrección de precio
// en el cierre»). Postgres real, caso de uso real (`CerrarEmbarqueUseCase`).
//
// Regla bajo prueba (COMPLETO y PARCIAL):
//  - Solo ADMIN corrige; el motivo es obligatorio; un precio vacío/0 NO es una corrección.
//  - `total nuevo = total + Σ (precio nuevo − precio anterior) × cantidad PEDIDA` (todo el pedido).
//  - Se recalculan en la misma transacción: `PedidoItem.precio/subtotal`, `Pedido.total/saldo/
//    estadoPago` y `Factura.total/saldo/estado`; el valor entregado (comisión) usa el precio corregido.
//  - Si el cliente ya pagó más que el nuevo total, se rechaza con un error claro y NO cambia nada
//    (mismo patrón que `CORRECCION_GENERARIA_SOBREPAGO` de G11), nunca un 500.
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
const MOTIVO = 'Acuerdo con el cliente en la puerta'

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
  motivoPrecio?: string
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
      motivoPrecio: o.motivoPrecio,
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

describe('#326 — corrección de precio en el cierre, con recálculo', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    const c = await testPrisma.cliente.create({
      data: { nombre: 'Precio Cli', telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'Calle 1', activo: true },
    })
    clienteId = c.id
  })
  afterAll(async () => { await disconnect() })

  it('COMPLETO, precio sube: recalcula ítem, total, saldo, estado de pago, factura y comisión', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    const r = await cerrar(emb.id, ped.id, { precio: 1_100, motivoPrecio: MOTIVO })

    const { p, item, factura, hist } = await estado(ped.id)
    expect(Number(item.precio)).toBe(1_100)
    expect(Number(item.subtotal)).toBe(11_000)
    expect(Number(p.precioPacaAgua)).toBe(1_100)
    expect(Number(p.total)).toBe(11_000)
    expect(Number(p.saldo)).toBe(11_000)
    expect(p.estadoPago).toBe('PENDIENTE')
    expect(Number(factura.total)).toBe(11_000)
    expect(Number(factura.saldo)).toBe(11_000)
    expect(factura.estado).toBe('EMITIDA')
    expect(r.totalVentas).toBe(11_000)
    expect(hist).toHaveLength(1)
    const datos = JSON.parse(String(hist[0].datos))
    expect(datos).toMatchObject({ motivo: MOTIVO, totalAntes: 10_000, totalDespues: 11_000 })
    expect(datos.cambios).toEqual([{ producto: 'PACA_AGUA', antes: 1_000, despues: 1_100 }])
  })

  it('COMPLETO, precio baja con pago parcial previo: queda PARCIAL con el saldo nuevo', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id, 4_000)
    await cerrar(emb.id, ped.id, { precio: 900, motivoPrecio: MOTIVO })

    const { p, factura } = await estado(ped.id)
    expect(Number(p.total)).toBe(9_000)
    expect(Number(p.totalPagado)).toBe(4_000)
    expect(Number(p.saldo)).toBe(5_000)
    expect(p.estadoPago).toBe('PARCIAL')
    expect(Number(factura.total)).toBe(9_000)
    expect(Number(factura.saldo)).toBe(5_000)
    expect(factura.estado).toBe('PARCIAL')
  })

  it('COMPLETO, precio baja justo hasta lo ya pagado: queda PAGADO sin saldo', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id, 9_000)
    await cerrar(emb.id, ped.id, { precio: 900, motivoPrecio: MOTIVO })

    const { p, factura } = await estado(ped.id)
    expect(Number(p.total)).toBe(9_000)
    expect(Number(p.saldo)).toBe(0)
    expect(p.estadoPago).toBe('PAGADO')
    expect(factura.estado).toBe('PAGADA')
  })

  it('COMPLETO, el cliente ya pagó más que el nuevo total: error claro y NO cambia nada', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id, TOTAL)
    await expect(cerrar(emb.id, ped.id, { precio: 900, motivoPrecio: MOTIVO })).rejects.toThrow(/PRECIO_GENERARIA_SOBREPAGO/)

    const { p, item, factura, hist } = await estado(ped.id)
    expect(Number(p.total)).toBe(TOTAL)
    expect(Number(p.precioPacaAgua)).toBe(PRECIO)
    expect(Number(item.precio)).toBe(PRECIO)
    expect(Number(factura.total)).toBe(TOTAL)
    expect(p.estadoEntrega).toBe('EN_RUTA')
    expect(hist).toHaveLength(0)
  })

  it('PARCIAL: el precio aplica a TODO el pedido; el valor entregado usa el precio corregido', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    const r = await cerrar(emb.id, ped.id, { entregado: 'PARCIAL', entrega: 6, precio: 1_100, motivoPrecio: MOTIVO })

    const { p, item, factura } = await estado(ped.id)
    expect(p.estadoEntrega).toBe('PENDIENTE')
    expect(Number(item.cantEntrega)).toBe(6)
    expect(Number(item.precio)).toBe(1_100)
    expect(Number(item.subtotal)).toBe(11_000)
    expect(Number(p.total)).toBe(11_000)
    expect(Number(p.saldo)).toBe(11_000)
    expect(Number(factura.total)).toBe(11_000)
    expect(Number(factura.saldo)).toBe(11_000)
    expect(r.totalVentas).toBe(6 * 1_100) // comisión sobre lo entregado ahora, con el precio corregido
  })

  it('un precio vacío o 0 NO es una corrección (hoy la pantalla manda 0 por campo vacío)', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    const r = await cerrar(emb.id, ped.id, { preciosReales: { ...PRECIOS_VACIOS } })

    const { p, item, hist } = await estado(ped.id)
    expect(Number(p.precioPacaAgua)).toBe(PRECIO)
    expect(Number(item.precio)).toBe(PRECIO)
    expect(Number(p.total)).toBe(TOTAL)
    expect(hist).toHaveLength(0)
    expect(r.totalVentas).toBe(TOTAL) // la comisión se calcula con el precio real, no con $0
  })

  it('sin motivo no hay corrección: error claro y NO cambia nada', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    await expect(cerrar(emb.id, ped.id, { precio: 1_100 })).rejects.toThrow(/PRECIO_SIN_MOTIVO/)

    const { p } = await estado(ped.id)
    expect(Number(p.total)).toBe(TOTAL)
    expect(p.estadoEntrega).toBe('EN_RUTA')
  })

  it('quien no es ADMIN no corrige precios (se ignora, como hasta ahora)', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    await cerrar(emb.id, ped.id, { precio: 1_100, motivoPrecio: MOTIVO, role: 'ASISTENTE' })

    const { p, hist } = await estado(ped.id)
    expect(Number(p.total)).toBe(TOTAL)
    expect(Number(p.precioPacaAgua)).toBe(PRECIO)
    expect(hist).toHaveLength(0)
  })

  it('cobro de la misión contra el total NUEVO: lo cobrado no puede exceder el saldo recalculado', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    await expect(
      cerrar(emb.id, ped.id, { precio: 900, motivoPrecio: MOTIVO, pagos: [{ metodo: 'EFECTIVO', monto: 9_500 }] }),
    ).rejects.toThrow(/PAGOS_EXCEDIDOS/)

    const emb2 = await crearEmbarque()
    const ped2 = await crearPedido(emb2.id)
    await cerrar(emb2.id, ped2.id, { precio: 900, motivoPrecio: MOTIVO, pagos: [{ metodo: 'EFECTIVO', monto: 9_000 }] })
    const { p } = await estado(ped2.id)
    expect(Number(p.total)).toBe(9_000)
    expect(p.estadoPago).toBe('PAGADO')
    expect(Number(p.saldo)).toBe(0)
  })

  it('preview (dryRun): informa total y saldo nuevos y no persiste nada', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id)
    const r = await cerrar(emb.id, ped.id, { precio: 1_100, motivoPrecio: MOTIVO, dryRun: true })

    expect(r.pedidosActualizados[0].correccionPrecio).toMatchObject({
      totalAntes: 10_000, totalDespues: 11_000, saldoAntes: 10_000, saldoDespues: 11_000,
    })
    const { p, item } = await estado(ped.id)
    expect(Number(p.total)).toBe(TOTAL)
    expect(Number(item.precio)).toBe(PRECIO)
    expect(p.estadoEntrega).toBe('EN_RUTA')
  })

  it('invariantes de integridad tras corregir: total = pagado + saldo y factura = pedido', async () => {
    const emb = await crearEmbarque()
    const ped = await crearPedido(emb.id, 3_000)
    await cerrar(emb.id, ped.id, { precio: 1_250, motivoPrecio: MOTIVO })

    const { p, factura } = await estado(ped.id)
    expect(Number(p.totalPagado) + Number(p.saldo)).toBeCloseTo(Number(p.total), 2) // V1
    expect(Number(factura.saldo)).toBeCloseTo(Number(p.saldo), 2) // V3
    const pagos = await testPrisma.pago.aggregate({ where: { pedidoId: ped.id }, _sum: { monto: true } })
    expect(Number(pagos._sum.monto ?? 0)).toBeCloseTo(Number(p.totalPagado), 2) // V2
  })
})
