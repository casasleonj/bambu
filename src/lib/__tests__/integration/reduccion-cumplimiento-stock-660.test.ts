import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
import { testPrisma as db, resetAndSeed, getAdminUser, disconnect } from './setup'
import { crearPedidoUseCase, entregarPedidoUseCase } from '@/modules/pedidos'
import { SolicitarReduccionComercialUseCase, ResolverReduccionComercialUseCase } from '@/modules/pedidos/application/use-cases/ReduccionComercialUseCases'
import { getStockDisponible } from '@/lib/stock'
import { unidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'
import { construirResumenCierre } from '@/lib/cierre-resumen'
import { todayStringBogota, startOfDayBogota } from '@/lib/dates'
import { PrismaPedidoRepository } from '@/modules/dashboard/infrastructure/pedido.repository'
import { calcularVendidos, calcularVentas } from '@/modules/dashboard/domain/ventas.service'
let adminId: string
const solicitar = new SolicitarReduccionComercialUseCase()
const resolver = new ResolverReduccionComercialUseCase()
const fechaHoy = () => todayStringBogota()
const rango = (dia: string) => ({ desde: startOfDayBogota(dia), hasta: new Date(+startOfDayBogota(dia) + 86400000) })
async function crearParcial(opciones: { vehiculo?: boolean; dia?: string; fraccionPago?: number; hielo?: boolean } = {}) {
  const cliente = await db.cliente.create({ data: { nombre: 'Conservación 660', telefono: randomUUID(), direccion: 'Calle 1 #2-3', barrio: 'Centro' } })
  const { pedido } = await crearPedidoUseCase.execute({ clienteId: cliente.id, canal: 'DOMICILIO', origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: 20 }, ...(opciones.hielo ? [{ producto: 'PACA_HIELO' as const, cantidad: 2 }] : [])],
    pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: randomUUID() })
  const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: pedido.id, producto: 'PACA_AGUA' } })
  const precio = Number(item.precio)
  const dia = opciones.dia ?? fechaHoy()
  const entregaAt = new Date(+startOfDayBogota(dia) + 12 * 3600000)
  let embarqueId: string | undefined
  if (opciones.vehiculo) {
    const trabajador = await db.trabajador.findFirstOrThrow({ where: { rol: 'REPARTIDOR' } })
    const emb = await db.embarque.create({ data: { trabajadorId: trabajador.id, fecha: entregaAt, estado: 'EN_RUTA', pacasAgua: 20,
      productos: { create: { producto: 'PACA_AGUA', cargadas: 20 } },
      movimientos: { create: { tipo: 'CARGA', producto: 'PACA_AGUA', cantidad: 20, origen: 'ALMACEN', destino: 'VEHICULO' } } } })
    embarqueId = emb.id
  }
  await db.pedido.update({ where: { id: pedido.id }, data: { fecha: entregaAt, estado: 'EN_RUTA', estadoEntrega: 'EN_RUTA', embarqueId } })
  const pago = 5 * precio * (opciones.fraccionPago ?? 1)
  await entregarPedidoUseCase.execute({ pedidoId: pedido.id, actorId: adminId, offlineId: randomUUID(), entregadoAt: entregaAt.toISOString(),
    itemsEntregados: [{ producto: 'PACA_AGUA', cantidad: 5 }], pagos: pago ? [{ metodo: 'EFECTIVO', monto: pago }] : [],
    embarqueId, embarqueEntregaId: embarqueId, clienteRetiro: !opciones.vehiculo })
  return { id: pedido.id, precio, pago, embarqueId, entregaAt, dia }
}
const leer = (id: string) => db.pedido.findUniqueOrThrow({ where: { id }, include: { items: true, factura: true } })
const reducir = (id: string, cantidadReducida = 15) => solicitar.execute({ pedidoId: id, producto: 'PACA_AGUA', cantidadReducida,
  motivo: 'El cliente ya no quiere lo pendiente', aceptadoPor: 'Cliente de prueba', medio: 'PRESENCIAL', actorId: adminId, offlineId: randomUUID() })
async function dashboard(id: string, dia: string) {
  const r = rango(dia)
  const pedidos = (await new PrismaPedidoRepository(db).findByDateRange(r.desde, r.hasta)).filter(p => p.id === id)
  return { vendidos: calcularVendidos(pedidos), ventas: calcularVentas(pedidos) }
}
describe('#660 reducción y conservación física/financiera', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    await db.user.update({ where: { id: adminId }, data: { puedeAutorizarReduccionComercial: true } })
    vi.stubEnv('EMBARQUE_ENTREGA_VIVA_DESDE', '2000-01-01T00:00:00Z')
  })
  afterAll(async () => { vi.unstubAllEnvs(); await disconnect() })
  it.each([[0, 'PENDIENTE'], [0.5, 'PARCIAL'], [1, 'PAGADO']] as const)('al retirar todo el remanente con pago %s completa entrega y proyecta %s', async (fraccionPago, estadoPago) => {
    const p = await crearParcial({ fraccionPago })
    const antes = await leer(p.id)
    expect(Number(antes.factura!.montoPagado)).toBe(Number(antes.totalPagado))
    expect(Number(antes.factura!.saldo)).toBe(Number(antes.saldo))
    await reducir(p.id)
    const despues = await leer(p.id)
    expect(despues).toMatchObject({ estado: 'ENTREGADO', estadoEntrega: 'ENTREGADO', estadoPago, cPacaAguaPed: 5, cPacaAguaEnt: 5, entregadoAt: antes.entregadoAt })
    expect(Number(despues.total)).toBe(p.precio * 5)
    expect(Number(despues.totalPagado)).toBe(p.pago)
    expect(Number(despues.saldo)).toBe(p.precio * 5 - p.pago)
    expect(Number(despues.factura!.total)).toBe(p.precio * 5)
    expect(Number(despues.factura!.saldo)).toBe(Number(despues.saldo))
    expect(Number(despues.factura!.montoPagado)).toBe(Number(despues.totalPagado))
    expect(despues.factura!.estado).toBe(estadoPago === 'PAGADO' ? 'PAGADA' : estadoPago === 'PARCIAL' ? 'PARCIAL' : 'EMITIDA')
  })
  it('reducir solo una parte o dejar otra línea pendiente conserva entrega parcial', async () => {
    const parcial = await crearParcial()
    await reducir(parcial.id, 10)
    expect((await leer(parcial.id)).estadoEntrega).toBe('PENDIENTE')
    const varias = await crearParcial({ hielo: true })
    await reducir(varias.id)
    const p = await leer(varias.id)
    expect(p.estadoEntrega).toBe('PENDIENTE')
    expect(p.items.find(i => i.producto === 'PACA_HIELO')!.cantPedido).toBe(2)
  })
  it('bodega, dashboard, cierre, factura y caja: conserva 5 entregadas y un único cobro', async () => {
    const p = await crearParcial()
    const stock = await getStockDisponible()
    const unidades = await unidadesEntregadasDelDia(db, rango(p.dia))
    const cierre = await construirResumenCierre(db, p.dia)
    const d = await dashboard(p.id, p.dia)
    const pagos = await db.pago.findMany({ where: { pedidoId: p.id } })
    expect(d.vendidos.agua).toBe(5)
    expect(d.ventas).toBe(p.precio * 5)
    const ap = await reducir(p.id)
    expect(await getStockDisponible()).toEqual(stock)
    expect(await unidadesEntregadasDelDia(db, rango(p.dia))).toEqual(unidades)
    expect(await dashboard(p.id, p.dia)).toEqual(d)
    const despues = await construirResumenCierre(db, p.dia)
    expect(despues.cierre.aguaVendida).toBe(cierre.cierre.aguaVendida)
    expect(despues.cierre.cobrado).toBe(cierre.cierre.cobrado)
    expect(despues.cierre.cobroVentasHoy).toBe(cierre.cierre.cobroVentasHoy)
    expect(despues.cierre.totalVentas).toBe(cierre.cierre.totalVentas - p.precio * 15)
    expect(await db.pago.findMany({ where: { pedidoId: p.id } })).toEqual(pagos)
    const nota = await db.notaCredito.findUniqueOrThrow({ where: { id: ap.notaCreditoId } })
    expect(Number(nota.monto)).toBe(p.precio * 15)
    await resolver.execute({ reduccionId: ap.id, resolucion: 'AUTORIZAR', actorId: adminId })
    expect(await db.notaCredito.count({ where: { pedidoId: p.id } })).toBe(1)
    expect(await getStockDisponible()).toEqual(stock)
  })
  it('20 cargadas y 5 entregadas: quitar 15 no registra retorno ni las suma a bodega', async () => {
    const p = await crearParcial({ vehiculo: true })
    const movimientos = await db.embarqueMovimiento.findMany({ where: { embarqueId: p.embarqueId }, orderBy: { id: 'asc' } })
    const productos = await db.embarqueProducto.findMany({ where: { embarqueId: p.embarqueId } })
    const stock = await getStockDisponible()
    expect(movimientos.filter(m => m.tipo === 'CARGA').reduce((s, m) => s + m.cantidad, 0)).toBe(20)
    expect(movimientos.filter(m => m.tipo === 'ENTREGA').reduce((s, m) => s + m.cantidad, 0)).toBe(5)
    await reducir(p.id)
    expect(await db.embarqueMovimiento.findMany({ where: { embarqueId: p.embarqueId }, orderBy: { id: 'asc' } })).toEqual(movimientos)
    expect(await db.embarqueProducto.findMany({ where: { embarqueId: p.embarqueId } })).toEqual(productos)
    expect(await getStockDisponible()).toEqual(stock)
    expect(productos[0]).toMatchObject({ cargadas: 20, devueltas: 0 })
  })
  it('entrega de ayer: reducción de hoy no mueve unidades al día de autorización ni duplica la nota', async () => {
    const ayer = new Date(+startOfDayBogota(fechaHoy()) - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const p = await crearParcial({ dia: ayer })
    const ayerAntes = await unidadesEntregadasDelDia(db, rango(ayer))
    const hoyAntes = await unidadesEntregadasDelDia(db, rango(fechaHoy()))
    const cierre = await construirResumenCierre(db, fechaHoy())
    await reducir(p.id)
    const despues = await leer(p.id)
    expect(despues.entregadoAt).toEqual(p.entregaAt)
    expect(await unidadesEntregadasDelDia(db, rango(ayer))).toEqual(ayerAntes)
    expect(await unidadesEntregadasDelDia(db, rango(fechaHoy()))).toEqual(hoyAntes)
    const nuevo = await construirResumenCierre(db, fechaHoy())
    expect(nuevo.cierre.totalVentas).toBe(cierre.cierre.totalVentas - p.precio * 15)
    expect(nuevo.cierre.cobrado).toBe(cierre.cierre.cobrado)
  })
  it('un acumulado legacy mayor al canónico no inventa unidades ni marca entrega completa', async () => {
    const p = await crearParcial()
    const item = await db.pedidoItem.findFirstOrThrow({ where: { pedidoId: p.id, producto: 'PACA_AGUA' } })
    await db.pedidoItem.update({ where: { id: item.id }, data: { cantEntrega: 4 } })
    await reducir(p.id)
    const despues = await leer(p.id)
    expect(despues.estadoEntrega).toBe('PENDIENTE')
    expect(despues.items[0].cantEntrega).toBe(4)
    expect(despues.cPacaAguaEnt).toBe(5)
  })

})
