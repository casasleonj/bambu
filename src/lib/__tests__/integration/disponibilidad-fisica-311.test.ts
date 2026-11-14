// @tests #311 — disponibilidad física en vivo del embarque: las salidas de un CAMBIO (Sustitución) descuentan lo
// disponible, y nada se cuenta dos veces (entrega viva, venta libre, botellón). Postgres real.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { calcularDisponibilidadFisicaPrisma, EmbarqueNoEncontradoError } from '@/modules/embarques/domain/services/disponibilidad-fisica.service'
import { CAPTURA_ENTREGA_PEDIDO } from '@/lib/entrega-fisica-viva'

let trabajadorId: string
let adminId: string
const clave = () => `d311-${Math.random().toString(36).slice(2, 10)}`

async function embarqueConCarga(cargas: Record<string, number>, estado: 'ABIERTO' | 'EN_RUTA' | 'CERRADO' = 'EN_RUTA') {
  const e = await testPrisma.embarque.create({ data: { trabajadorId, fecha: new Date(), estado } })
  const carga = await testPrisma.embarqueCarga.create({ data: { embarqueId: e.id } })
  for (const [producto, cantidad] of Object.entries(cargas)) {
    await testPrisma.embarqueCargaProducto.create({ data: { cargaId: carga.id, producto, cantidad } })
  }
  return e.id
}

async function pedidoEn(embarqueId: string, items: Array<{ producto: string; pedido: number; entregado?: number }>, opts: { origen?: 'PEDIDO' | 'VENTA_LIBRE'; estadoEntrega?: 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO' | 'CANCELADO' } = {}) {
  const cliente = await testPrisma.cliente.create({ data: { nombre: `Cliente ${clave()}`, telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`, direccion: 'x', activo: true } })
  return testPrisma.pedido.create({
    data: {
      clienteId: cliente.id, embarqueId, canal: 'DOMICILIO', origen: opts.origen ?? 'PEDIDO', estadoEntrega: opts.estadoEntrega ?? 'EN_RUTA',
      total: 1000, totalPagado: 0, saldo: 1000, estadoPago: opts.estadoEntrega === 'CANCELADO' ? 'ANULADO' : 'PENDIENTE', createdById: adminId,
      items: { create: items.map((i) => ({ producto: i.producto, cantPedido: i.pedido, cantEntrega: i.entregado ?? 0 })) },
    },
  })
}

const movimiento = (embarqueId: string, data: { tipo: 'ENTREGA' | 'VENTA_RUTA' | 'PROMOCION' | 'DESCARTE' | 'CUSTODY_TRANSFER' | 'RETORNO' | 'AJUSTE_AUTORIZADO'; producto: string; cantidad: number; origen?: string | null; destino?: string | null; metadata?: Record<string, unknown>; authorization?: string; userId?: string }) =>
  testPrisma.embarqueMovimiento.create({ data: { embarqueId, origen: 'VEHICULO', destino: 'CLIENTE', ...data, metadata: data.metadata as object | undefined } })

describe('#311 calcularDisponibilidadFisica (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    trabajadorId = (await testPrisma.trabajador.findFirstOrThrow()).id
    adminId = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => vi.stubEnv('EMBARQUE_ENTREGA_VIVA_DESDE', ''))
  afterEach(() => vi.unstubAllEnvs())

  it('ejemplo del diseño: 60 cargadas y 25 comprometidas dejan 35 libres', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60 })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 25 }])
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.modo).toBe('ANTERIOR')
    expect(d.custodia.PACA_AGUA).toBe(60)
    expect(d.comprometido.PACA_AGUA).toBe(25)
    expect(d.disponible.PACA_AGUA).toBe(35)
    expect(d.sobrecomprometidos).toEqual([])
  })

  it('#311: las salidas de un CAMBIO (Sustitución) descuentan lo disponible, en modo anterior', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60 })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 25 }])
    await movimiento(e, { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 3 }) // la entrega del cambio: sin `captura`
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.salidas.ledger.PACA_AGUA).toBe(3)
    expect(d.custodia.PACA_AGUA).toBe(57)
    expect(d.disponible.PACA_AGUA).toBe(32)
  })

  it('modo anterior: la entrega de un pedido (cantEntrega) sale de la custodia y deja de estar comprometida', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60 })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 25, entregado: 10 }])
    await movimiento(e, { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 3 })
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.salidas.pedidos.PACA_AGUA).toBe(10)
    expect(d.custodia.PACA_AGUA).toBe(47) // 60 − 10 (pedido) − 3 (cambio)
    expect(d.comprometido.PACA_AGUA).toBe(15)
    expect(d.disponible.PACA_AGUA).toBe(32)
  })

  it('modo entrega viva: la entrega atribuida cuenta UNA vez (del ledger), no también del pedido; el cambio sí descuenta', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60 })
    const p = await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 25, entregado: 10 }])
    await movimiento(e, { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 10, metadata: { captura: CAPTURA_ENTREGA_PEDIDO, pedidoId: p.id, eventoEntregaId: clave() } })
    await movimiento(e, { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 3 }) // cambio
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.modo).toBe('VIVO')
    expect(d.salidas.pedidos.PACA_AGUA).toBe(0)
    expect(d.salidas.ledger.PACA_AGUA).toBe(13)
    expect(d.custodia.PACA_AGUA).toBe(47)
    expect(d.comprometido.PACA_AGUA).toBe(15)
    expect(d.disponible.PACA_AGUA).toBe(32)
  })

  it('entrega viva por la fecha del interruptor del servidor: un embarque nuevo no lee los pedidos', async () => {
    vi.stubEnv('EMBARQUE_ENTREGA_VIVA_DESDE', '2020-01-01T00:00:00Z')
    const e = await embarqueConCarga({ PACA_AGUA: 60 })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 25, entregado: 10 }])
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.modo).toBe('VIVO')
    expect(d.salidas.pedidos.PACA_AGUA).toBe(0)
  })

  it('modo entrega viva: una venta libre SIN evento sí sale de la custodia (no escribe en vivo, #354); con evento no se repite', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60 })
    const normal = await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 5, entregado: 5 }])
    await movimiento(e, { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 5, metadata: { captura: CAPTURA_ENTREGA_PEDIDO, pedidoId: normal.id, eventoEntregaId: clave() } })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 4, entregado: 4 }], { origen: 'VENTA_LIBRE', estadoEntrega: 'ENTREGADO' })
    const conEvento = await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 2, entregado: 2 }], { origen: 'VENTA_LIBRE', estadoEntrega: 'ENTREGADO' })
    await movimiento(e, { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 2, metadata: { captura: CAPTURA_ENTREGA_PEDIDO, pedidoId: conEvento.id, eventoEntregaId: clave() } })
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.salidas.ledger.PACA_AGUA).toBe(7) // 5 + 2
    expect(d.salidas.pedidos.PACA_AGUA).toBe(4) // solo la venta libre sin evento
    expect(d.custodia.PACA_AGUA).toBe(49)
  })

  it('botellón: manda el ledger; la entrega del pedido no se lee (evita la doble cuenta de #353)', async () => {
    const e = await embarqueConCarga({ BOTELLON: 20 })
    await pedidoEn(e, [{ producto: 'BOTELLON', pedido: 6, entregado: 6 }])
    await movimiento(e, { tipo: 'ENTREGA', producto: 'BOTELLON', cantidad: 6, metadata: { tipoEnvase: 'ENTREGADO' } })
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.salidas.pedidos.BOTELLON).toBe(0)
    expect(d.custodia.BOTELLON).toBe(14)
  })

  it('otras salidas del ledger descuentan; el retorno NO suma; un evento posterior al cierre se ignora', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60, PACA_HIELO: 30 })
    await movimiento(e, { tipo: 'PROMOCION', producto: 'PACA_AGUA', cantidad: 2 })
    await movimiento(e, { tipo: 'DESCARTE', producto: 'PACA_AGUA', cantidad: 1, destino: 'DESCARTE' })
    await movimiento(e, { tipo: 'VENTA_RUTA', producto: 'PACA_HIELO', cantidad: 4 })
    await movimiento(e, { tipo: 'RETORNO', producto: 'PACA_AGUA', cantidad: 5, destino: 'ALMACEN' })
    await movimiento(e, { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 9, metadata: { captura: CAPTURA_ENTREGA_PEDIDO, posCierre: true, pedidoId: 'x' } })
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.custodia.PACA_AGUA).toBe(57) // 60 − 2 − 1 (el retorno no suma; el evento tardío no cuenta)
    expect(d.custodia.PACA_HIELO).toBe(26)
  })

  it('transferencia de custodia: solo resta si el vehículo es el origen; el ajuste autorizado suma o resta según su efecto', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 50 })
    await movimiento(e, { tipo: 'CUSTODY_TRANSFER', producto: 'PACA_AGUA', cantidad: 4, origen: 'VEHICULO', destino: 'EXTERNO' })
    await movimiento(e, { tipo: 'CUSTODY_TRANSFER', producto: 'PACA_AGUA', cantidad: 7, origen: 'ALMACEN', destino: 'VEHICULO' })
    await movimiento(e, { tipo: 'AJUSTE_AUTORIZADO', producto: 'PACA_AGUA', cantidad: 3, metadata: { effect: 'DECREASE' }, authorization: 'ok', userId: adminId })
    await movimiento(e, { tipo: 'AJUSTE_AUTORIZADO', producto: 'PACA_AGUA', cantidad: 1, metadata: { effect: 'INCREASE' }, authorization: 'ok', userId: adminId })
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.custodia.PACA_AGUA).toBe(44) // 50 − 4 − 3 + 1
  })

  it('un pedido cancelado no compromete ni cuenta entregas; el pedido ya entregado no compromete', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60 })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 10 }], { estadoEntrega: 'CANCELADO' })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 8, entregado: 8 }], { estadoEntrega: 'ENTREGADO' })
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.comprometido.PACA_AGUA).toBe(0)
    expect(d.salidas.pedidos.PACA_AGUA).toBe(8)
    expect(d.custodia.PACA_AGUA).toBe(52)
  })

  it('más prometido que mercancía a bordo: disponible negativo y el producto queda marcado', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60 })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 60 }])
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 5 }]) // el cliente que pide 5 más
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.disponible.PACA_AGUA).toBe(-5)
    expect(d.sobrecomprometidos).toEqual(['PACA_AGUA'])
  })

  it('embarque cerrado: ya todo está en el ledger, así que no se vuelve a leer el pedido', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 60 }, 'CERRADO')
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 10, entregado: 10 }], { estadoEntrega: 'ENTREGADO' })
    await movimiento(e, { tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 10, metadata: { captura: 'CIERRE' } })
    const d = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(d.modo).toBe('CERRADO')
    expect(d.salidas.pedidos.PACA_AGUA).toBe(0)
    expect(d.custodia.PACA_AGUA).toBe(50)
  })

  it('solo lee: no escribe ningún movimiento ni cambia nada', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 10 })
    const antes = await testPrisma.embarqueMovimiento.count({ where: { embarqueId: e } })
    await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    expect(await testPrisma.embarqueMovimiento.count({ where: { embarqueId: e } })).toBe(antes)
  })

  it('un embarque que no existe lanza un error claro', async () => {
    await expect(calcularDisponibilidadFisicaPrisma(testPrisma, 'no-existe')).rejects.toBeInstanceOf(EmbarqueNoEncontradoError)
  })

  it('es consistente dentro de una transacción de lectura (misma cifra que fuera)', async () => {
    const e = await embarqueConCarga({ PACA_AGUA: 40 })
    await pedidoEn(e, [{ producto: 'PACA_AGUA', pedido: 12 }])
    const fuera = await calcularDisponibilidadFisicaPrisma(testPrisma, e)
    const dentro = await testPrisma.$transaction((tx) => calcularDisponibilidadFisicaPrisma(tx, e))
    expect(dentro).toEqual(fuera)
  })
})
