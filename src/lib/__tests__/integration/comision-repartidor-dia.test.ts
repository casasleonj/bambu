// @tests #499 — comisión del repartidor por día: función compartida + GET /api/nomina/dia
// (Postgres real). Lo central: la cifra del día es EXACTAMENTE la que pagaría una nómina
// de ese mismo día, y respeta el día de Bogotá, ambos orígenes y quién cobra comisión.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { GET as comisionDelDia } from '@/app/api/nomina/dia/route'
import { POST as crearNomina } from '@/app/api/nomina/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { nominaQueCubre } from '@/lib/nomina-cobertura'
import { comisionRepartidoresDelDia } from '@/lib/comision-repartidor'

const TARIFA_AGUA = 400
const TARIFA_HIELO = 250
/** Día fijo y lejano: ningún otro test de la suite escribe en él. */
const DIA = '2026-03-10'

let adminId: string
let clienteId: string

const unico = () => `cd-${randomUUID()}`
const bogota = (hora: string, dia = DIA) => new Date(`${dia}T${hora}-05:00`)

async function repartidor(
  nombre: string,
  o: { tipoPago?: 'COMISION' | 'MIXTO' | 'FIJO'; usaMoto?: boolean; activo?: boolean; propias?: boolean } = {},
) {
  return (await testPrisma.trabajador.create({
    data: {
      nombre,
      rol: 'REPARTIDOR',
      usaMoto: o.usaMoto ?? true,
      tipoPago: o.tipoPago ?? 'COMISION',
      activo: o.activo ?? true,
      ...(o.propias === false ? {} : { comRepartAgua: TARIFA_AGUA, comRepartHielo: TARIFA_HIELO }),
    },
  })).id
}

async function pedidoEntregado(o: {
  repartidorId: string
  agua?: number
  hielo?: number
  embarqueId?: string
  entregadoAt: Date
}) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId,
    canal: 'DOMICILIO',
    origen: 'PEDIDO',
    items: [{ producto: 'PACA_AGUA', cantidad: Math.max(o.agua ?? 1, 1) }],
    pagos: [],
    createdById: adminId,
    createdByRole: 'ADMIN',
    offlineId: unico(),
  })
  await testPrisma.pedido.update({
    where: { id: pedido.id },
    data: {
      estadoEntrega: 'ENTREGADO',
      estado: 'ENTREGADO',
      cPacaAguaEnt: o.agua ?? 0,
      cPacaHieloEnt: o.hielo ?? 0,
      entregadoAt: o.entregadoAt,
      entregadoPorId: o.repartidorId,
      ...(o.embarqueId ? { embarqueId: o.embarqueId } : {}),
    },
  })
  return pedido.id
}

const embarqueCerrado = (trabajadorId: string, fecha: Date, numeroDia = 1) =>
  testPrisma.embarque.create({ data: { trabajadorId, fecha, estado: 'CERRADO', numeroDia } })

async function pedirDia(fecha?: string) {
  const url = `http://localhost/api/nomina/dia${fecha ? `?fecha=${fecha}` : ''}`
  return comisionDelDia(new NextRequest(url))
}

describe('#499 — comisión del repartidor por día (Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Comisión Día', telefono: '3001230099', direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })

  it('suma embarque y oficina del día, separa el origen y coincide con una nómina de ese día', async () => {
    const id = await repartidor('Carlos Día')
    const emb = await embarqueCerrado(id, bogota('09:00:00'))
    await pedidoEntregado({ repartidorId: id, agua: 6, hielo: 2, embarqueId: emb.id, entregadoAt: bogota('10:00:00') })
    await pedidoEntregado({ repartidorId: id, agua: 3, entregadoAt: bogota('15:00:00') })

    const res = await pedirDia(DIA)
    expect(res.status).toBe(200)
    const data = await res.json()
    const fila = data.repartidores.find((r: { trabajadorId: string }) => r.trabajadorId === id)

    expect(fila.entregasAgua).toBe(9)
    expect(fila.entregasHielo).toBe(2)
    expect(fila.porOrigen.embarque).toBe(6 * TARIFA_AGUA + 2 * TARIFA_HIELO)
    expect(fila.porOrigen.sinEmbarque).toBe(3 * TARIFA_AGUA)
    expect(fila.total).toBe(9 * TARIFA_AGUA + 2 * TARIFA_HIELO)

    // Invariante: la misma cifra que pagaría la nómina de ese día.
    const nominaRes = await crearNomina(new NextRequest('http://localhost/api/nomina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trabajadorId: id, fechaInicio: DIA, fechaFin: DIA, tipoCalculo: 'AUTO' }),
    }))
    expect(nominaRes.status).toBe(200)
    const nomina = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: id, estado: { not: 'ANULADA' } } })
    expect(Number(nomina.totalComisiones)).toBe(fila.total)
  })

  it('respeta el día de Bogotá: 11:30 p. m. cuenta, 12:30 a. m. del día siguiente no', async () => {
    const id = await repartidor('Noche Día')
    await pedidoEntregado({ repartidorId: id, agua: 4, entregadoAt: bogota('23:30:00') })
    await pedidoEntregado({ repartidorId: id, agua: 5, entregadoAt: bogota('00:30:00', '2026-03-11') })

    const hoy = (await comisionRepartidoresDelDia(testPrisma, DIA)).find((r) => r.trabajadorId === id)
    const siguiente = (await comisionRepartidoresDelDia(testPrisma, '2026-03-11')).find((r) => r.trabajadorId === id)
    expect(hoy?.entregasAgua).toBe(4)
    expect(siguiente?.entregasAgua).toBe(5)
  })

  it('#523: período Bogotá incluye antes/después de 19:00 y medianoche; deduce solo los pagos de ese período', async () => {
    const id = await repartidor('Nómina nocturna')
    await pedidoEntregado({ repartidorId: id, agua: 4, entregadoAt: bogota('23:30:00') })
    await pedidoEntregado({ repartidorId: id, agua: 2, entregadoAt: bogota('18:59:00') })
    await pedidoEntregado({ repartidorId: id, agua: 3, entregadoAt: bogota('19:01:00') })
    await pedidoEntregado({ repartidorId: id, agua: 1, entregadoAt: bogota('00:00:00') })
    await pedidoEntregado({ repartidorId: id, agua: 7, entregadoAt: bogota('23:59:59', '2026-03-09') })
    await pedidoEntregado({ repartidorId: id, agua: 5, entregadoAt: bogota('00:30:00', '2026-03-11') })
    const e = await embarqueCerrado(id, bogota('23:59:59'))
    await pedidoEntregado({ repartidorId: id, agua: 2, embarqueId: e.id, entregadoAt: bogota('23:59:59') })
    await testPrisma.pagoComisionRepartidor.createMany({ data: [
      { trabajadorId: id, fecha: bogota('00:00:00'), monto: 400, offlineId: unico() },
      { trabajadorId: id, fecha: bogota('00:00:00', '2026-03-09'), monto: 700, offlineId: unico() },
      { trabajadorId: id, fecha: bogota('00:00:00', '2026-03-11'), monto: 1000, offlineId: unico() },
    ] })
    const res = await crearNomina(new NextRequest('http://localhost/api/nomina', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trabajadorId: id, fechaInicio: DIA, fechaFin: DIA, tipoCalculo: 'AUTO' }) }))
    expect(res.status).toBe(200)
    const n = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: id } })
    expect(n.entregasAgua).toBe(12)
    expect(Number(n.totalComisiones)).toBe(4800)
    expect(Number(n.comisionPagadaCaja)).toBe(400)
    expect(Number(n.total)).toBe(4400)
    expect(n.fechaInicio).toEqual(bogota('00:00:00'))
    expect(n.fechaFin).toEqual(bogota('23:59:59.999'))
    expect(await nominaQueCubre(testPrisma, id, bogota('23:30:00'))).not.toBeNull()
    expect(await nominaQueCubre(testPrisma, id, bogota('00:00:00', '2026-03-11'))).toBeNull()
  })

  it('lista solo a quien cobra comisión: activo, con moto y COMISION/MIXTO; aparece con $0 si no entregó', async () => {
    const sinEntregas = await repartidor('Cero Día')
    const mixto = await repartidor('Mixto Día', { tipoPago: 'MIXTO' })
    const fijo = await repartidor('Fijo Día', { tipoPago: 'FIJO' })
    const sinMoto = await repartidor('SinMoto Día', { usaMoto: false })
    const inactivo = await repartidor('Inactivo Día', { activo: false })

    const filas = await comisionRepartidoresDelDia(testPrisma, DIA)
    const ids = filas.map((f) => f.trabajadorId)
    expect(ids).toContain(sinEntregas)
    expect(ids).toContain(mixto)
    expect(ids).not.toContain(fijo)
    expect(ids).not.toContain(sinMoto)
    expect(ids).not.toContain(inactivo)
    expect(filas.find((f) => f.trabajadorId === sinEntregas)?.total).toBe(0)
  })

  it('una tarifa 0 es «sin definir»: usa la general COM_REPARTIDOR (#500)', async () => {
    await testPrisma.config.upsert({ where: { clave: 'COM_REPARTIDOR' }, create: { clave: 'COM_REPARTIDOR', valor: '300' }, update: { valor: '300' } })
    const id = await repartidor('Config Día', { propias: false })
    await pedidoEntregado({ repartidorId: id, agua: 2, hielo: 1, entregadoAt: bogota('11:00:00') })

    const fila = (await comisionRepartidoresDelDia(testPrisma, DIA)).find((f) => f.trabajadorId === id)
    expect(fila?.entregasAgua).toBe(2)
    expect(fila?.total).toBe(2 * 300 + 1 * 300)
    await testPrisma.config.delete({ where: { clave: 'COM_REPARTIDOR' } })
  })

  it('no cuenta anulados ni entregas de otro día, y un embarque abierto no suma', async () => {
    const id = await repartidor('Ruido Día')
    const abierto = await testPrisma.embarque.create({ data: { trabajadorId: id, fecha: bogota('08:00:00'), estado: 'ABIERTO', numeroDia: 7 } })
    await pedidoEntregado({ repartidorId: id, agua: 9, embarqueId: abierto.id, entregadoAt: bogota('09:00:00') })
    await pedidoEntregado({ repartidorId: id, agua: 8, entregadoAt: bogota('09:00:00', '2026-03-09') })

    const fila = (await comisionRepartidoresDelDia(testPrisma, DIA)).find((f) => f.trabajadorId === id)
    expect(fila?.entregasAgua).toBe(0)
  })

  it('no convierte Punto legado en reparto ni acredita un evento de pedido anulado', async () => {
    const id = await repartidor('Canales y anulación')
    const e = await embarqueCerrado(id, bogota('09:00:00'))
    const p = await pedidoEntregado({ repartidorId: id, agua: 6, embarqueId: e.id, entregadoAt: bogota('10:00:00') })
    await testPrisma.pedido.update({ where: { id: p }, data: { canal: 'PUNTO' } })
    expect((await comisionRepartidoresDelDia(testPrisma, DIA)).find(r => r.trabajadorId === id)?.total).toBe(0)
    await testPrisma.embarqueMovimiento.create({ data: { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 6, metadata: { captura: 'ENTREGA_PEDIDO', pedidoId: p } } })
    expect((await comisionRepartidoresDelDia(testPrisma, DIA)).find(r => r.trabajadorId === id)?.total).toBe(2400)
    await testPrisma.pedido.update({ where: { id: p }, data: { estadoEntrega: 'ANULADO', estado: 'ANULADO', estadoPago: 'ANULADO' } })
    expect((await comisionRepartidoresDelDia(testPrisma, DIA)).find(r => r.trabajadorId === id)?.total).toBe(0)
  })

  it('cuenta delta y venta de ruta una vez; excluye promoción, sustitución y entrega tardía', async () => {
    const id = await repartidor('Fuentes físicas distintas')
    const e = await embarqueCerrado(id, bogota('09:00:00'))
    await testPrisma.embarqueMovimiento.createMany({ data: [
      { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 2, metadata: { captura: 'CIERRE' } },
      { embarqueId: e.id, tipo: 'VENTA_RUTA', producto: 'PACA_AGUA', cantidad: 3 },
      { embarqueId: e.id, tipo: 'PROMOCION', producto: 'PACA_AGUA', cantidad: 8 },
    ] })
    const entrada = await testPrisma.embarqueMovimiento.create({ data: { embarqueId: e.id, tipo: 'RETORNO', producto: 'PACA_AGUA', cantidad: 4 } })
    const salida = await testPrisma.embarqueMovimiento.create({ data: { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 4 } })
    await testPrisma.sustitucion.create({ data: { embarqueId: e.id, movimientoEntregaId: salida.id, movimientoRecepcionId: entrada.id } })
    const fila = (await comisionRepartidoresDelDia(testPrisma, DIA)).find(r => r.trabajadorId === id)
    expect(fila?.entregasAgua).toBe(5)
    expect(fila?.total).toBe(2000)
    expect(fila?.revisiones).toHaveLength(0)
    await testPrisma.embarqueMovimiento.create({ data: { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 9, metadata: { captura: 'ENTREGA_PEDIDO', posCierre: true } } })
    const tarde = (await comisionRepartidoresDelDia(testPrisma, DIA)).find(r => r.trabajadorId === id)
    expect(tarde?.total).toBe(2000)
    expect(tarde?.revisiones).toHaveLength(1)
  })

  it('permisos: ADMIN y CONTADOR leen; ASISTENTE y REPARTIDOR reciben 403; sin sesión 401', async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'CONTADOR' }, expires: '2099-01-01T00:00:00.000Z' })
    expect((await pedirDia(DIA)).status).toBe(200)
    for (const role of ['ASISTENTE', 'REPARTIDOR']) {
      mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
      expect((await pedirDia(DIA)).status).toBe(403)
    }
    mockAuth.mockResolvedValue(null)
    expect((await pedirDia(DIA)).status).toBe(401)
  })

  it('una fecha inválida no rompe: responde 200 con el día de hoy', async () => {
    const res = await pedirDia('basura')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
