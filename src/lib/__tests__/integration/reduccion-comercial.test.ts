// @tests #451 / ADR-REDUCCION-COMERCIAL-001 — reducción comercial aceptada.
//
// Contra Postgres real y los casos de uso reales. «El cliente pidió 20, recibió 15 y ya
// no quiere las 5 restantes»: baja la cantidad PEDIDA de la línea, el total, el saldo, la
// factura y emite una nota de crédito, siempre con los mismos números y sin tocar lo
// entregado. Cada pedido reducido se pasa además por el verificador de integridad (V1–V15).
//   1. Sin pago / con prepago parcial / con pago que cubre exacto el nuevo total.
//   2. Pago mayor al nuevo total → se rechaza y no cambia nada.
//   3. Nunca sobre lo entregado ni dejando el pedido vacío.
//   4. Permiso explícito por usuario: ser ADMIN no basta.
//   5. Idempotencia, una pendiente por línea, obsoleta, cancelado, botellón Fab/Dom.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testPrisma, resetAndSeed, disconnect, getAdminUser, getSeededCliente, uniqueId } from './setup'
import {
  SolicitarReduccionComercialUseCase,
  ResolverReduccionComercialUseCase,
} from '@/modules/pedidos/application/use-cases/ReduccionComercialUseCases'
import { verificarIntegridad } from '@/lib/integridad/verificar'

let adminId: string
let asistenteId: string
let autorizadorId: string
let clienteId: string

/** 20 PACA_AGUA a $2.500 = $50.000, 15 entregadas, con factura y un pago previo opcional. */
async function crearPedido(pagado = 0, extra: Record<string, unknown> = {}) {
  const total = 50000
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
      cPacaAguaPed: 20,
      cPacaAguaEnt: 15,
      precioPacaAgua: 2500,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 15, precio: 2500, subtotal: total }] },
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
    legacyPed: p.cPacaAguaPed,
    legacyEnt: p.cPacaAguaEnt,
    itemCant: p.items[0].cantPedido,
    itemEnt: p.items[0].cantEntrega,
    itemSubtotal: Number(p.items[0].subtotal),
    facSubtotal: Number(p.factura?.subtotal),
    facTotal: Number(p.factura?.total),
    facSaldo: Number(p.factura?.saldo),
    facEstado: p.factura?.estado,
  }
}

/** Reglas del verificador (V1–V15) que señalan ESTE pedido. Debe ser []. */
async function violaciones(pedidoId: string): Promise<string[]> {
  const { numero } = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedidoId }, select: { numero: true } })
  const reporte = await verificarIntegridad(testPrisma, { maxMuestras: 5000 })
  return reporte.reglas
    // V7 (pago sin ReceivableEntry) y V11 no dependen de la reducción: el fixture crea el Pago directo, sin libro.
    .filter((r) => r.id !== 'V7' && r.id !== 'V11')
    .flatMap((r) => r.hallazgos.filter((h) => h.numero === numero).map(() => r.id))
}

const solicitar = new SolicitarReduccionComercialUseCase()
const resolver = new ResolverReduccionComercialUseCase()

const base = { producto: 'PACA_AGUA', cantidadReducida: 5, motivo: 'el cliente ya no quiere el resto', aceptadoPor: 'Don Pedro (cliente)', medio: 'TELEFONO' }

async function mensajeDe(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'NO_LANZO'
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

describe('Reducción comercial (#451)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await getSeededCliente()).id
    const asistente = await testPrisma.user.findUniqueOrThrow({ where: { username: 'asistente' } })
    asistenteId = asistente.id
    // Quien tiene el permiso explícito: el ASISTENTE (el rol ADMIN por sí solo no basta).
    autorizadorId = asistenteId
    await testPrisma.user.update({ where: { id: autorizadorId }, data: { puedeAutorizarReduccionComercial: true } })
  })
  afterAll(async () => {
    await disconnect()
  })

  it('sin pago previo: línea, legacy, total, saldo, factura y nota de crédito salen de los mismos números', async () => {
    const p = await crearPedido()
    const r = await solicitar.execute({ ...base, pedidoId: p.id, actorId: autorizadorId })
    expect(r).toMatchObject({ estado: 'APLICADA', monto: 12500, totalAntes: 50000, totalDespues: 37500, deduped: false })
    const e = await estado(p.id)
    expect(e).toMatchObject({
      total: 37500, saldo: 37500, totalPagado: 0, estadoPago: 'PENDIENTE',
      itemCant: 15, itemEnt: 15, itemSubtotal: 37500, legacyPed: 15, legacyEnt: 15,
      facSubtotal: 37500, facTotal: 37500, facSaldo: 37500, facEstado: 'EMITIDA',
    })
    // V1 / V3 explícitos y verificador completo.
    expect(e.totalPagado + e.saldo).toBe(e.total)
    expect(e.facSaldo).toBe(e.saldo)
    expect(await violaciones(p.id)).toEqual([])

    const nota = await testPrisma.notaCredito.findUniqueOrThrow({ where: { id: r.notaCreditoId } })
    expect(nota).toMatchObject({ pedidoId: p.id, creadoPor: autorizadorId })
    expect(Number(nota.monto)).toBe(12500)
    expect(nota.motivo).toContain('REDUCCION_COMERCIAL')
    expect(nota.facturaId).not.toBeNull()
    const fila = await testPrisma.pedidoReduccionComercial.findUniqueOrThrow({ where: { id: r.id } })
    expect(fila).toMatchObject({
      estado: 'APLICADA', cantPedidoAntes: 20, cantPedidoDespues: 15, cantidadReducida: 5,
      aceptadoPor: 'Don Pedro (cliente)', medio: 'TELEFONO', solicitadoPorId: autorizadorId, resueltoPorId: autorizadorId,
      notaCreditoId: r.notaCreditoId,
    })
    expect(Number(fila.monto)).toBe(12500)
    expect(Number(fila.precio)).toBe(2500)
  })

  it('con prepago parcial: baja el saldo, no el pagado, y la factura queda PARCIAL', async () => {
    const p = await crearPedido(20000)
    await solicitar.execute({ ...base, pedidoId: p.id, actorId: autorizadorId })
    const e = await estado(p.id)
    expect(e).toMatchObject({
      total: 37500, totalPagado: 20000, saldo: 17500, estadoPago: 'PARCIAL',
      facTotal: 37500, facSaldo: 17500, facEstado: 'PARCIAL',
    })
    expect(await violaciones(p.id)).toEqual([])
  })

  it('con un pago que cubre exacto el nuevo total: queda PAGADO y la factura PAGADA', async () => {
    const p = await crearPedido(37500)
    await solicitar.execute({ ...base, pedidoId: p.id, actorId: autorizadorId })
    const e = await estado(p.id)
    expect(e).toMatchObject({ total: 37500, totalPagado: 37500, saldo: 0, estadoPago: 'PAGADO', facSaldo: 0, facEstado: 'PAGADA' })
    expect(await violaciones(p.id)).toEqual([])
  })

  it('con un pago mayor al nuevo total se rechaza (422) y no cambia nada ni emite nota', async () => {
    const p = await crearPedido(40000)
    const notasAntes = await testPrisma.notaCredito.count()
    const antes = await estado(p.id)
    const msg = await mensajeDe(solicitar.execute({ ...base, pedidoId: p.id, actorId: autorizadorId }))
    expect(msg).toContain('REDUCCION_GENERARIA_SOBREPAGO')
    expect(await estado(p.id)).toEqual(antes)
    expect(await testPrisma.notaCredito.count()).toBe(notasAntes)
    expect(await testPrisma.pedidoReduccionComercial.count({ where: { pedidoId: p.id } })).toBe(0)
  })

  it('no toca lo entregado: pedir quitar más de lo pendiente se rechaza', async () => {
    const p = await crearPedido()
    const antes = await estado(p.id)
    const msg = await mensajeDe(solicitar.execute({ ...base, cantidadReducida: 6, pedidoId: p.id, actorId: autorizadorId }))
    expect(msg).toContain('REDUCCION_SOBRE_ENTREGADO')
    expect(await estado(p.id)).toEqual(antes)
  })

  it('no deja el pedido sin unidades (eso es cancelar o anular)', async () => {
    const p = await crearPedido(0, {
      cPacaAguaEnt: 0,
      items: { create: [{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 0, precio: 2500, subtotal: 50000 }] },
      estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE',
    })
    const msg = await mensajeDe(solicitar.execute({ ...base, cantidadReducida: 20, pedidoId: p.id, actorId: autorizadorId }))
    expect(msg).toContain('REDUCCION_TOTAL')
  })

  it('una reducción parcial de un pedido con otras líneas conserva las demás', async () => {
    const p = await crearPedido(0, {
      total: 56000, saldo: 56000, cPacaHieloPed: 3, cPacaHieloEnt: 0, precioPacaHielo: 2000,
      items: { create: [
        { producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 15, precio: 2500, subtotal: 50000 },
        { producto: 'PACA_HIELO', cantPedido: 3, cantEntrega: 0, precio: 2000, subtotal: 6000 },
      ] },
    })
    await testPrisma.factura.updateMany({ where: { pedidoId: p.id }, data: { subtotal: 56000, total: 56000, saldo: 56000 } })
    await solicitar.execute({ ...base, cantidadReducida: 3, producto: 'PACA_HIELO', pedidoId: p.id, actorId: autorizadorId })
    const fin = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true } })
    expect(Number(fin.total)).toBe(50000)
    expect(fin.cPacaHieloPed).toBe(0)
    expect(fin.cPacaAguaPed).toBe(20)
    expect(fin.items.find((i) => i.producto === 'PACA_AGUA')?.cantPedido).toBe(20)
    expect(fin.items.find((i) => i.producto === 'PACA_HIELO')?.cantPedido).toBe(0)
  })

  describe('permiso explícito: ser ADMIN no basta', () => {
    it('un ADMIN sin el permiso solo deja la solicitud: no cambia nada hasta que alguien con permiso la aplica', async () => {
      const p = await crearPedido()
      const antes = await estado(p.id)
      const r = await solicitar.execute({ ...base, pedidoId: p.id, actorId: adminId })
      expect(r.estado).toBe('PENDIENTE')
      expect(await estado(p.id)).toEqual(antes)
      expect(await testPrisma.notaCredito.count({ where: { pedidoId: p.id } })).toBe(0)

      // El propio ADMIN (sin permiso) no puede autorizarla.
      expect(await mensajeDe(resolver.execute({ reduccionId: r.id, resolucion: 'AUTORIZAR', actorId: adminId }))).toContain('FORBIDDEN')
      expect(await estado(p.id)).toEqual(antes)

      // Quien tiene el permiso sí.
      const ap = await resolver.execute({ reduccionId: r.id, resolucion: 'AUTORIZAR', actorId: autorizadorId, nota: 'ok por teléfono' })
      expect(ap).toMatchObject({ estado: 'APLICADA', totalAntes: 50000, totalDespues: 37500, deduped: false })
      expect((await estado(p.id)).total).toBe(37500)
      const fila = await testPrisma.pedidoReduccionComercial.findUniqueOrThrow({ where: { id: r.id } })
      expect(fila).toMatchObject({ solicitadoPorId: adminId, resueltoPorId: autorizadorId, notaResolucion: 'ok por teléfono' })
      expect(await violaciones(p.id)).toEqual([])
    })

    it('resolver dos veces no aplica dos veces (deduped) y no emite otra nota', async () => {
      const p = await crearPedido()
      const r = await solicitar.execute({ ...base, pedidoId: p.id, actorId: adminId })
      await resolver.execute({ reduccionId: r.id, resolucion: 'AUTORIZAR', actorId: autorizadorId })
      const otra = await resolver.execute({ reduccionId: r.id, resolucion: 'AUTORIZAR', actorId: autorizadorId })
      expect(otra.deduped).toBe(true)
      expect((await estado(p.id)).total).toBe(37500)
      expect(await testPrisma.notaCredito.count({ where: { pedidoId: p.id } })).toBe(1)
    })

    it('rechazar no cambia el pedido ni emite nota', async () => {
      const p = await crearPedido()
      const antes = await estado(p.id)
      const r = await solicitar.execute({ ...base, pedidoId: p.id, actorId: adminId })
      const rr = await resolver.execute({ reduccionId: r.id, resolucion: 'RECHAZAR', actorId: autorizadorId, nota: 'el cliente sí quería' })
      expect(rr.estado).toBe('RECHAZADA')
      expect(await estado(p.id)).toEqual(antes)
      expect(await testPrisma.notaCredito.count({ where: { pedidoId: p.id } })).toBe(0)
    })

    it('un usuario con el permiso pero inactivo o de otro rol no puede autorizar', async () => {
      const p = await crearPedido()
      const r = await solicitar.execute({ ...base, pedidoId: p.id, actorId: adminId })
      const repartidor = await testPrisma.user.findUniqueOrThrow({ where: { username: 'repartidor' } })
      await testPrisma.user.update({ where: { id: repartidor.id }, data: { puedeAutorizarReduccionComercial: true } })
      try {
        expect(await mensajeDe(resolver.execute({ reduccionId: r.id, resolucion: 'AUTORIZAR', actorId: repartidor.id }))).toContain('FORBIDDEN')
        await testPrisma.user.update({ where: { id: autorizadorId }, data: { activo: false } })
        expect(await mensajeDe(resolver.execute({ reduccionId: r.id, resolucion: 'AUTORIZAR', actorId: autorizadorId }))).toContain('FORBIDDEN')
      } finally {
        await testPrisma.user.update({ where: { id: repartidor.id }, data: { puedeAutorizarReduccionComercial: false } })
        await testPrisma.user.update({ where: { id: autorizadorId }, data: { activo: true } })
      }
      expect((await estado(p.id)).total).toBe(50000)
    })

    it('un repartidor no puede registrar una reducción', async () => {
      const p = await crearPedido()
      const repartidor = await testPrisma.user.findUniqueOrThrow({ where: { username: 'repartidor' } })
      expect(await mensajeDe(solicitar.execute({ ...base, pedidoId: p.id, actorId: repartidor.id }))).toContain('FORBIDDEN')
    })
  })

  describe('exigencias de la solicitud', () => {
    it('exige motivo y consentimiento observado', async () => {
      const p = await crearPedido()
      expect(await mensajeDe(solicitar.execute({ ...base, motivo: ' ', pedidoId: p.id, actorId: autorizadorId }))).toContain('MOTIVO_REQUERIDO')
      expect(await mensajeDe(solicitar.execute({ ...base, aceptadoPor: '', pedidoId: p.id, actorId: autorizadorId }))).toContain('CONSENTIMIENTO_REQUERIDO')
    })

    it('rechaza cantidades no enteras o no positivas', async () => {
      const p = await crearPedido()
      for (const cantidadReducida of [0, -1, 1.5]) {
        expect(await mensajeDe(solicitar.execute({ ...base, cantidadReducida, pedidoId: p.id, actorId: autorizadorId }))).toContain('CANTIDAD_INVALIDA')
      }
    })

    it('idempotente por offlineId: el reintento no aplica ni emite una segunda nota', async () => {
      const p = await crearPedido()
      const offlineId = uniqueId('red')
      const a = await solicitar.execute({ ...base, pedidoId: p.id, actorId: autorizadorId, offlineId })
      const b = await solicitar.execute({ ...base, pedidoId: p.id, actorId: autorizadorId, offlineId })
      expect(a.deduped).toBe(false)
      expect(b).toMatchObject({ deduped: true, id: a.id, estado: 'APLICADA' })
      expect((await estado(p.id)).total).toBe(37500)
      expect(await testPrisma.notaCredito.count({ where: { pedidoId: p.id } })).toBe(1)
    })

    it('una sola solicitud pendiente por línea', async () => {
      const p = await crearPedido()
      await solicitar.execute({ ...base, cantidadReducida: 2, pedidoId: p.id, actorId: adminId })
      expect(await mensajeDe(solicitar.execute({ ...base, cantidadReducida: 1, pedidoId: p.id, actorId: adminId }))).toContain('REDUCCION_PENDIENTE')
    })

    it('si la línea cambió antes de autorizar, la solicitud queda obsoleta y no aplica', async () => {
      const p = await crearPedido()
      const r = await solicitar.execute({ ...base, pedidoId: p.id, actorId: adminId })
      // Otra reducción aplicada antes (la pendiente es por línea, así que se fuerza el cambio directo).
      await testPrisma.pedidoItem.updateMany({ where: { pedidoId: p.id }, data: { cantPedido: 18, subtotal: 45000 } })
      expect(await mensajeDe(resolver.execute({ reduccionId: r.id, resolucion: 'AUTORIZAR', actorId: autorizadorId }))).toContain('REDUCCION_OBSOLETA')
      expect(await testPrisma.notaCredito.count({ where: { pedidoId: p.id } })).toBe(0)
    })

    it('un pedido cancelado o anulado no se reduce', async () => {
      const p = await crearPedido(0, { estadoEntrega: 'CANCELADO', estado: 'CANCELADO', estadoPago: 'ANULADO' })
      expect(await mensajeDe(solicitar.execute({ ...base, pedidoId: p.id, actorId: autorizadorId }))).toContain('PEDIDO_NO_REDUCIBLE')
    })

    it('el pedido inexistente y la línea inexistente responden con su código', async () => {
      expect(await mensajeDe(solicitar.execute({ ...base, pedidoId: 'no-existe', actorId: autorizadorId }))).toContain('PEDIDO_NOT_FOUND')
      const p = await crearPedido()
      expect(await mensajeDe(solicitar.execute({ ...base, producto: 'BOLSA_HIELO', pedidoId: p.id, actorId: autorizadorId }))).toContain('LINEA_NO_ENCONTRADA')
    })
  })

  it('botellón: quita primero lo pendiente a domicilio y luego en fábrica, sin tocar lo entregado', async () => {
    const p = await testPrisma.pedido.create({
      data: {
        clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', estadoPago: 'PENDIENTE',
        total: 80000, totalPagado: 0, saldo: 80000,
        cBotellonFabPed: 4, cBotellonFabEnt: 3, cBotellonDomPed: 6, cBotellonDomEnt: 4,
        items: { create: [{ producto: 'BOTELLON', cantPedido: 10, cantEntrega: 7, precio: 8000, subtotal: 80000 }] },
      },
    })
    await testPrisma.factura.create({
      data: { numero: `FAC-${uniqueId('f').slice(0, 8)}`, clienteId, pedidoId: p.id, subtotal: 80000, total: 80000, saldo: 80000, estado: 'EMITIDA' },
    })
    await solicitar.execute({ ...base, producto: 'BOTELLON', cantidadReducida: 3, pedidoId: p.id, actorId: autorizadorId })
    const fin = await testPrisma.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true } })
    // Pendiente a domicilio = 2 → se quitan 2 allí y 1 en fábrica.
    expect(fin).toMatchObject({ cBotellonDomPed: 4, cBotellonDomEnt: 4, cBotellonFabPed: 3, cBotellonFabEnt: 3 })
    expect(fin.items[0]).toMatchObject({ cantPedido: 7, cantEntrega: 7 })
    expect(Number(fin.total)).toBe(56000)
    expect(await violaciones(p.id)).toEqual([])
  })

  it('las notas de crédito consecutivas no repiten numeración', async () => {
    const a = await crearPedido()
    const b = await crearPedido()
    const ra = await solicitar.execute({ ...base, pedidoId: a.id, actorId: autorizadorId })
    const rb = await solicitar.execute({ ...base, pedidoId: b.id, actorId: autorizadorId })
    const na = await testPrisma.notaCredito.findUniqueOrThrow({ where: { id: ra.notaCreditoId } })
    const nb = await testPrisma.notaCredito.findUniqueOrThrow({ where: { id: rb.notaCreditoId } })
    expect(na.numero).not.toBe(nb.numero)
  })
})
