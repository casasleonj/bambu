// @tests ADR-MONETARIO-002 §1 (épica #447, Fase D) — corrección de precio con recálculo.
//
// Contra Postgres real y los casos de uso reales:
//   1. Aplicada por ADMIN: ítem, columna legacy, total, saldo, estadoPago y factura se
//      recalculan juntos y respetan las reglas de integridad (V1: pagado + saldo = total;
//      V3: factura con el mismo saldo).
//   2. El ASISTENTE solo solicita; el ADMIN autoriza o rechaza.
//   3. Pagó de más → se rechaza y no cambia nada.
//   4. Precio raro se marca; idempotencia; una pendiente por línea; obsoleta; cancelado.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, getSeededCliente, uniqueId } from './setup'
import {
  SolicitarCorreccionPrecioUseCase,
  ResolverCorreccionPrecioUseCase,
} from '@/modules/pedidos/application/use-cases/CorreccionPrecioUseCases'

let adminId: string
let clienteId: string

/** Pedido de 10 PACA_AGUA a $2.500 = $25.000, con factura, opcionalmente con un pago previo. */
async function crearPedido(pagado = 0, extra: Record<string, unknown> = {}) {
  const total = 25000
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId,
      canal: 'DOMICILIO',
      origen: 'PEDIDO',
      estadoEntrega: 'ENTREGADO',
      estado: 'ENTREGADO',
      estadoPago: pagado === 0 ? 'PENDIENTE' : pagado >= total ? 'PAGADO' : 'PARCIAL',
      total,
      totalPagado: pagado,
      saldo: total - pagado,
      cPacaAguaPed: 10,
      cPacaAguaEnt: 10,
      precioPacaAgua: 2500,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 10, cantEntrega: 10, precio: 2500, subtotal: total }] },
      ...extra,
    },
  })
  await testPrisma.factura.create({
    data: {
      numero: `FAC-${uniqueId('f').slice(0, 8)}`,
      clienteId,
      pedidoId: pedido.id,
      subtotal: total,
      total,
      saldo: total - pagado,
      montoPagado: pagado,
      estado: pagado === 0 ? 'EMITIDA' : pagado >= total ? 'PAGADA' : 'PARCIAL',
    },
  })
  if (pagado > 0) {
    await testPrisma.pago.create({ data: { pedidoId: pedido.id, metodo: 'EFECTIVO', monto: pagado } })
  }
  return pedido
}

async function estado(pedidoId: string) {
  const p = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, include: { items: true, factura: true } })
  return {
    total: Number(p.total),
    saldo: Number(p.saldo),
    totalPagado: Number(p.totalPagado),
    estadoPago: p.estadoPago,
    precioLegacy: Number(p.precioPacaAgua),
    itemPrecio: Number(p.items[0].precio),
    itemSubtotal: Number(p.items[0].subtotal),
    facTotal: Number(p.factura?.total),
    facSaldo: Number(p.factura?.saldo),
    facEstado: p.factura?.estado,
  }
}

const solicitar = new SolicitarCorreccionPrecioUseCase()
const resolver = new ResolverCorreccionPrecioUseCase()

async function mensajeDe(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'NO_LANZO'
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

describe('Corrección de precio (ADR-MONETARIO-002 §1)', () => {
  let asistenteId: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await getSeededCliente()).id
    const asistente = await testPrisma.user.findUnique({ where: { username: 'asistente' } })
    asistenteId = asistente?.id ?? adminId
  })
  afterAll(async () => {
    await disconnect()
  })

  it('ADMIN aplica en el acto: ítem, legacy, total, saldo, estadoPago y factura se recalculan juntos', async () => {
    const p = await crearPedido()
    const r = await solicitar.execute({
      pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'se prometió $2.300', actorId: adminId, actorRol: 'ADMIN',
    })
    expect(r.estado).toBe('APLICADA')
    expect(r.totalAntes).toBe(25000)
    expect(r.totalDespues).toBe(23000)
    const e = await estado(p.id)
    expect(e).toMatchObject({
      total: 23000, saldo: 23000, totalPagado: 0, estadoPago: 'PENDIENTE',
      precioLegacy: 2300, itemPrecio: 2300, itemSubtotal: 23000,
      facTotal: 23000, facSaldo: 23000, facEstado: 'EMITIDA',
    })
    // Integridad V1 / V3
    expect(e.totalPagado + e.saldo).toBe(e.total)
    expect(e.facSaldo).toBe(e.saldo)
    const fila = await testPrisma.pedidoCorreccionPrecio.findUniqueOrThrow({ where: { id: r.id } })
    expect(fila).toMatchObject({ estado: 'APLICADA', resueltoPorId: adminId, motivo: 'se prometió $2.300' })
    expect(Number(fila.delta)).toBe(-2000)
    const item = await testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id } })
    expect(item).toMatchObject({ precioOrigen: 'manual', autorizadoPorAdmin: true, autorizadoPorId: adminId })
  })

  it('subir el precio también recalcula (total, saldo y factura suben)', async () => {
    const p = await crearPedido()
    await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2600, motivo: 'precio vigente', actorId: adminId, actorRol: 'ADMIN' })
    const e = await estado(p.id)
    expect(e).toMatchObject({ total: 26000, saldo: 26000, facTotal: 26000, facSaldo: 26000 })
  })

  it('con abono parcial: el saldo descuenta lo pagado y la factura queda PARCIAL con el mismo saldo', async () => {
    const p = await crearPedido(10000)
    await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'ajuste', actorId: adminId, actorRol: 'ADMIN' })
    const e = await estado(p.id)
    expect(e).toMatchObject({ total: 23000, totalPagado: 10000, saldo: 13000, estadoPago: 'PARCIAL', facSaldo: 13000, facEstado: 'PARCIAL' })
  })

  it('pagado exacto al nuevo total: queda PAGADO y la factura PAGADA', async () => {
    const p = await crearPedido(23000)
    await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'ajuste', actorId: adminId, actorRol: 'ADMIN' })
    const e = await estado(p.id)
    expect(e).toMatchObject({ total: 23000, saldo: 0, estadoPago: 'PAGADO', facEstado: 'PAGADA', facSaldo: 0 })
  })

  it('pagó de más: se rechaza (PRECIO_GENERARIA_SOBREPAGO), no cambia nada y no deja solicitud', async () => {
    const p = await crearPedido(25000)
    const msg = await mensajeDe(
      solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'ajuste', actorId: adminId, actorRol: 'ADMIN' }),
    )
    expect(msg).toMatch(/^PRECIO_GENERARIA_SOBREPAGO/)
    const e = await estado(p.id)
    expect(e).toMatchObject({ total: 25000, saldo: 0, totalPagado: 25000, itemPrecio: 2500, facTotal: 25000 })
    expect(await testPrisma.pedidoCorreccionPrecio.count({ where: { pedidoId: p.id } })).toBe(0)
  })

  it('ASISTENTE solo solicita: queda PENDIENTE y el pedido no cambia', async () => {
    const p = await crearPedido()
    const r = await solicitar.execute({
      pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'cliente reclama', actorId: asistenteId, actorRol: 'ASISTENTE',
    })
    expect(r.estado).toBe('PENDIENTE')
    expect(await estado(p.id)).toMatchObject({ total: 25000, itemPrecio: 2500, facTotal: 25000 })
  })

  it('el ASISTENTE no puede resolver; el ADMIN autoriza y se aplica', async () => {
    const p = await crearPedido()
    const s = await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'cliente reclama', actorId: asistenteId, actorRol: 'ASISTENTE' })
    const prohibido = await mensajeDe(resolver.execute({ correccionId: s.id, resolucion: 'AUTORIZAR', actorId: asistenteId, actorRol: 'ASISTENTE' }))
    expect(prohibido).toMatch(/^FORBIDDEN/)
    expect(await estado(p.id)).toMatchObject({ total: 25000 })

    const r = await resolver.execute({ correccionId: s.id, resolucion: 'AUTORIZAR', actorId: adminId, actorRol: 'ADMIN', nota: 'ok' })
    expect(r).toMatchObject({ estado: 'APLICADA', totalAntes: 25000, totalDespues: 23000, deduped: false })
    expect(await estado(p.id)).toMatchObject({ total: 23000, saldo: 23000, facTotal: 23000 })
    const fila = await testPrisma.pedidoCorreccionPrecio.findUniqueOrThrow({ where: { id: s.id } })
    expect(fila).toMatchObject({ solicitadoPorId: asistenteId, resueltoPorId: adminId, notaResolucion: 'ok' })

    // Resolver otra vez: deduped, sin segundo recálculo.
    const otra = await resolver.execute({ correccionId: s.id, resolucion: 'AUTORIZAR', actorId: adminId, actorRol: 'ADMIN' })
    expect(otra.deduped).toBe(true)
    expect(await estado(p.id)).toMatchObject({ total: 23000 })
  })

  it('el ADMIN rechaza: nada cambia y la solicitud queda RECHAZADA', async () => {
    const p = await crearPedido()
    const s = await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'cliente reclama', actorId: asistenteId, actorRol: 'ASISTENTE' })
    const r = await resolver.execute({ correccionId: s.id, resolucion: 'RECHAZAR', actorId: adminId, actorRol: 'ADMIN', nota: 'no procede' })
    expect(r.estado).toBe('RECHAZADA')
    expect(await estado(p.id)).toMatchObject({ total: 25000, itemPrecio: 2500 })
  })

  it('precio raro (< $2.000 en paca) se marca; ADMIN lo aplica', async () => {
    const p = await crearPedido()
    const r = await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 1500, motivo: 'regalo autorizado', actorId: adminId, actorRol: 'ADMIN' })
    expect(r.precioRaro).toBe(true)
    expect(r.estado).toBe('APLICADA')
    expect(await estado(p.id)).toMatchObject({ total: 15000 })
  })

  it('el ASISTENTE puede solicitar un precio raro, pero queda pendiente (solo un ADMIN lo aplica)', async () => {
    const p = await crearPedido()
    const r = await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 1500, motivo: 'promo', actorId: asistenteId, actorRol: 'ASISTENTE' })
    expect(r).toMatchObject({ estado: 'PENDIENTE', precioRaro: true })
  })

  it('idempotente por offlineId; una sola pendiente por línea', async () => {
    const p = await crearPedido()
    const offlineId = uniqueId('cp')
    const a = await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'x y z', actorId: asistenteId, actorRol: 'ASISTENTE', offlineId })
    const b = await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'x y z', actorId: asistenteId, actorRol: 'ASISTENTE', offlineId })
    expect(b).toMatchObject({ id: a.id, deduped: true })
    const otra = await mensajeDe(
      solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2200, motivo: 'otra', actorId: asistenteId, actorRol: 'ASISTENTE' }),
    )
    expect(otra).toMatch(/^CORRECCION_PENDIENTE/)
  })

  it('solicitud obsoleta: si el precio de la línea cambió antes de autorizar, no se aplica', async () => {
    const p = await crearPedido()
    const s = await solicitar.execute({ pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'reclamo', actorId: asistenteId, actorRol: 'ASISTENTE' })
    await testPrisma.pedidoItem.updateMany({ where: { pedidoId: p.id }, data: { precio: 2400, subtotal: 24000 } })
    const msg = await mensajeDe(resolver.execute({ correccionId: s.id, resolucion: 'AUTORIZAR', actorId: adminId, actorRol: 'ADMIN' }))
    expect(msg).toMatch(/^CORRECCION_OBSOLETA/)
    const fila = await testPrisma.pedidoCorreccionPrecio.findUniqueOrThrow({ where: { id: s.id } })
    expect(fila.estado).toBe('PENDIENTE')
  })

  it('validaciones: motivo, rol, precio, línea y pedido cancelado', async () => {
    const p = await crearPedido()
    const base = { pedidoId: p.id, producto: 'PACA_AGUA', precioNuevo: 2300, motivo: 'bien', actorId: adminId, actorRol: 'ADMIN' }
    expect(await mensajeDe(solicitar.execute({ ...base, motivo: ' ' }))).toMatch(/^MOTIVO_REQUERIDO/)
    expect(await mensajeDe(solicitar.execute({ ...base, actorRol: 'REPARTIDOR' }))).toMatch(/^FORBIDDEN/)
    expect(await mensajeDe(solicitar.execute({ ...base, precioNuevo: 0 }))).toMatch(/^PRECIO_INVALIDO/)
    expect(await mensajeDe(solicitar.execute({ ...base, precioNuevo: 2500 }))).toMatch(/^PRECIO_SIN_CAMBIO/)
    expect(await mensajeDe(solicitar.execute({ ...base, producto: 'BOTELLON' }))).toMatch(/^LINEA_NO_ENCONTRADA/)
    expect(await mensajeDe(solicitar.execute({ ...base, pedidoId: 'no-existe' }))).toMatch(/^PEDIDO_NOT_FOUND/)
    const c = await crearPedido(0, { estadoEntrega: 'CANCELADO', estado: 'CANCELADO', estadoPago: 'ANULADO', total: 0, saldo: 0 })
    expect(await mensajeDe(solicitar.execute({ ...base, pedidoId: c.id }))).toMatch(/^PEDIDO_NO_CORREGIBLE/)
    expect(await estado(p.id)).toMatchObject({ total: 25000 })
  })
})
