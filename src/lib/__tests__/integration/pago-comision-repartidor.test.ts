// @tests #499 — pago de la comisión del repartidor desde la caja (Postgres real, handlers REALES):
// pagar, doble toque, concurrencia, pantalla desactualizada, cierre de caja (las dos rutas), nómina
// del período y la regla V16 del verificador. Cada prueba mira la base, no solo el HTTP.

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
import { POST as pagarComision } from '@/app/api/nomina/dia/pagar/route'
import { POST as crearNomina } from '@/app/api/nomina/route'
import { POST as cerrarDia } from '@/app/api/cierre/route'
import { POST as cerrarDiaAlterno } from '@/app/api/cierre-dia/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { todayStringBogota } from '@/lib/dates'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { REGLAS } from '@/lib/integridad/reglas'

const TARIFA = 400
const HOY = todayStringBogota()

let adminId: string
let clienteId: string

const unico = () => `pc-${randomUUID()}`
const como = (role: string) => mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
const json = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

async function repartidor(nombre: string, salarioFijo = 0) {
  return (await testPrisma.trabajador.create({
    data: { nombre, rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION', comRepartAgua: TARIFA, comRepartHielo: TARIFA, salarioFijo },
  })).id
}

/** Entrega a domicilio de la oficina (sin embarque) con `agua` pacas, hoy. */
async function entrega(repartidorId: string, agua: number) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: agua }],
    pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
  })
  await testPrisma.pedido.update({
    where: { id: pedido.id },
    data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: agua, entregadoAt: new Date(), entregadoPorId: repartidorId },
  })
  return pedido.id
}

const pagar = (trabajadorId: string, extra: Record<string, unknown> = {}) =>
  pagarComision(json('/api/nomina/dia/pagar', { trabajadorId, fecha: HOY, offlineId: unico() + '-x', ...extra }))
const filas = (trabajadorId: string) => testPrisma.pagoComisionRepartidor.findMany({ where: { trabajadorId }, orderBy: { createdAt: 'asc' } })
const sumar = (l: { monto: unknown }[]) => l.reduce((s, p) => s + Number(p.monto), 0)

describe('#499 — pago de la comisión del repartidor (Postgres real)', () => {
  let r1: string
  let r2: string
  let r3: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Pago Comisión', telefono: '3001230077', direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })).id
    r1 = await repartidor('Uno Pago', 10_000)
    r2 = await repartidor('Dos Pago')
    r3 = await repartidor('Tres Pago')
    await entrega(r1, 5)
    await entrega(r2, 3)
    await entrega(r3, 1)
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => como('ADMIN'))

  it('paga lo pendiente (el monto lo pone el servidor) y deja quién, cuándo y por qué día', async () => {
    const res = await pagar(r1, { offlineId: 'p1-' + unico(), montoEsperado: 5 * TARIFA })
    expect(res.status).toBe(201)
    const [fila] = await filas(r1)
    expect(Number(fila.monto)).toBe(5 * TARIFA)
    expect(fila.pagadoPorId).toBe(adminId)
    expect(fila.fecha.toISOString()).toBe(new Date(`${HOY}T00:00:00-05:00`).toISOString())

    const dia = await (await comisionDelDia(new NextRequest(`http://localhost/api/nomina/dia?fecha=${HOY}`))).json()
    const f = dia.repartidores.find((x: { trabajadorId: string }) => x.trabajadorId === r1)
    expect(f.pagado).toBe(5 * TARIFA)
    expect(f.pendiente).toBe(0)
  })

  it('el mismo offlineId no paga dos veces y otro intento sin nada pendiente responde 409', async () => {
    const offlineId = 'dedup-' + unico()
    const a = await pagar(r2, { offlineId })
    expect(a.status).toBe(201)
    const b = await pagar(r2, { offlineId })
    expect(b.status).toBe(200)
    expect((await b.json()).deduped).toBe(true)
    const c = await pagar(r2)
    expect(c.status).toBe(409)
    expect((await c.json()).error.code).toBe('NADA_PENDIENTE')
    expect(await filas(r2)).toHaveLength(1)
    expect(sumar(await filas(r2))).toBe(3 * TARIFA)
  })

  it('dos personas pagando a la vez: se paga una sola vez', async () => {
    const r = await repartidor('Carrera Pago')
    await entrega(r, 2)
    const [a, b] = await Promise.all([pagar(r), pagar(r)])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    expect(await filas(r)).toHaveLength(1)
    expect(sumar(await filas(r))).toBe(2 * TARIFA)
  })

  it('una pantalla desactualizada no paga: 409 con la cifra vigente', async () => {
    const res = await pagar(r3, { montoEsperado: 999 })
    expect(res.status).toBe(409)
    const cuerpo = await res.json()
    expect(cuerpo.error.code).toBe('MONTO_CAMBIO')
    expect(cuerpo.error.impacto.pendiente).toBe(TARIFA)
    expect(await filas(r3)).toHaveLength(0)
  })

  it('si luego hay otra entrega el mismo día, se paga solo la diferencia', async () => {
    await entrega(r1, 2)
    const res = await pagar(r1, { montoEsperado: 2 * TARIFA })
    expect(res.status).toBe(201)
    const l = await filas(r1)
    expect(l.map((p) => Number(p.monto))).toEqual([5 * TARIFA, 2 * TARIFA])
  })

  it('permisos: el CONTADOR paga; la ASISTENTE y el REPARTIDOR reciben 403; fecha futura 422', async () => {
    como('ASISTENTE')
    expect((await pagar(r3)).status).toBe(403)
    como('REPARTIDOR')
    expect((await pagar(r3)).status).toBe(403)
    como('CONTADOR')
    const futura = await pagarComision(json('/api/nomina/dia/pagar', { trabajadorId: r3, fecha: '2999-01-01', offlineId: unico() + '-x' }))
    expect(futura.status).toBe(422)
    expect((await pagar(r3)).status).toBe(201)
  })

  it('el cierre de caja resta lo pagado, ignora la cifra que mande el cliente y deja el detalle', async () => {
    const pagadoHoy = sumar(await testPrisma.pagoComisionRepartidor.findMany())
    expect(pagadoHoy).toBe((5 + 2 + 3 + 1 + 2) * TARIFA) // r1 (5+2), r2 (3), r3 (1) y el de la carrera (2)

    const res = await cerrarDia(json('/api/cierre', {
      fecha: HOY, baseDia: 1000, comisiones: 999_999, salarios: 0,
      stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0, stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
    }))
    expect(res.status).toBe(201)
    const cierre = await testPrisma.cierreDia.findFirstOrThrow()
    expect(Number(cierre.comisiones)).toBe(pagadoHoy)
    expect(Number(cierre.netoCaja)).toBe(1000 - pagadoHoy)
    const reporte = cierre.reporte as { comisionesAuto: { pagadoRepartidores: number; sellador: number } }
    expect(reporte.comisionesAuto.pagadoRepartidores).toBe(pagadoHoy)
    expect(reporte.comisionesAuto.sellador).toBe(0)
  })

  it('V16 no marca nada mientras todo cuadra, y marca un pago hecho después del cierre', async () => {
    const reglaV16 = REGLAS.filter((r) => r.id === 'V16')
    const limpio = await verificarIntegridad(testPrisma, { reglas: reglaV16 })
    expect(limpio.reglas[0].cantidad).toBe(0)

    await entrega(r2, 2)
    expect((await pagar(r2)).status).toBe(201)
    const sucio = await verificarIntegridad(testPrisma, { reglas: reglaV16 })
    expect(sucio.reglas[0].cantidad).toBe(1)
    expect((sucio.reglas[0].hallazgos[0].detalle as { caso: string }).caso).toBe('cierre')
  })

  it('la nómina del período descuenta lo ya pagado de la caja y no toca el salario', async () => {
    const res = await crearNomina(json('/api/nomina', { trabajadorId: r1, fechaInicio: HOY, fechaFin: HOY, tipoCalculo: 'AUTO' }))
    expect(res.status).toBe(200)
    const n = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: r1 } })
    expect(Number(n.totalComisiones)).toBe(7 * TARIFA)
    expect(Number(n.comisionPagadaCaja)).toBe(7 * TARIFA)
    expect(Number(n.total)).toBe(10_000) // solo el salario: la comisión ya salió de la caja

    // Con una nómina que cubre el día, ya no se paga comisión de ese día por la caja.
    await entrega(r1, 1)
    const tarde = await pagar(r1)
    expect(tarde.status).toBe(409)
    expect((await tarde.json()).error.code).toBe('NOMINA_EXISTENTE')
  })

  it('si se pagó de más (se anuló una entrega después), la comisión por pagar queda en 0 y el salario intacto', async () => {
    const r = await repartidor('Exceso Pago', 3000)
    const pedidoId = await entrega(r, 1)
    expect((await pagar(r)).status).toBe(201)
    await testPrisma.pedido.update({
      where: { id: pedidoId },
      data: { estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE', cPacaAguaEnt: 0, entregadoAt: null },
    })
    const res = await crearNomina(json('/api/nomina', { trabajadorId: r, fechaInicio: HOY, fechaFin: HOY, tipoCalculo: 'AUTO' }))
    expect(res.status).toBe(200)
    const n = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: r } })
    expect(Number(n.totalComisiones)).toBe(0)
    expect(Number(n.comisionPagadaCaja)).toBe(TARIFA)
    expect(Number(n.total)).toBe(3000)
  })

  it('la otra ruta de cierre (cierre-dia) también calcula las comisiones en el servidor', async () => {
    const ayer = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    await testPrisma.pagoComisionRepartidor.create({
      data: { trabajadorId: r3, fecha: new Date(`${ayer}T00:00:00-05:00`), monto: 700, createdAt: new Date(`${ayer}T15:00:00-05:00`) },
    })
    const res = await cerrarDiaAlterno(json('/api/cierre-dia', { fecha: `${ayer}T17:00:00.000Z`, comisiones: 123 }))
    expect(res.status).toBe(201)
    const c = await testPrisma.cierreDia.findFirstOrThrow({ orderBy: { fecha: 'asc' } })
    expect(Number(c.comisiones)).toBe(700)
  })
  it('por conciliar bloquea solo al repartidor afectado y conserva el replay de un pago anterior', async () => {
    const id = await repartidor('Conciliar propia')
    await entrega(id, 2)
    const offlineId = unico()
    expect((await pagar(id, { offlineId })).status).toBe(201)
    const e = await testPrisma.embarque.create({ data: { trabajadorId: id, fecha: new Date(), estado: 'CERRADO' } })
    await testPrisma.embarqueMovimiento.createMany({ data: [
      { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 1, metadata: { captura: 'CIERRE' } },
      { embarqueId: e.id, tipo: 'ENTREGA', producto: 'PACA_AGUA', cantidad: 1, metadata: { tipoEnvase: 'ENTREGADO' } },
    ] })
    const bloquear = await pagar(id)
    expect(bloquear.status).toBe(409)
    expect((await bloquear.json()).error.code).toBe('COMISION_POR_CONCILIAR')
    expect((await pagar(id, { offlineId })).status).toBe(200)
    expect(await filas(id)).toHaveLength(1)
    const otro = await repartidor('No afectado por conciliación ajena')
    await entrega(otro, 1)
    expect((await pagar(otro)).status).toBe(201)
    const nomina = await crearNomina(json('/api/nomina', { trabajadorId: id, fechaInicio: HOY, fechaFin: HOY, tipoCalculo: 'AUTO' }))
    expect(nomina.status).toBe(409)
    expect(await testPrisma.nomina.count({ where: { trabajadorId: id } })).toBe(0)
  })


  it('comisión fraccionaria totalmente pagada no crea un pago fantasma por redondeo', async () => {
    const id = await repartidor('Centavos exactos')
    await testPrisma.trabajador.update({ where: { id }, data: { comRepartAgua: 0.1 } })
    await entrega(id, 8)
    await testPrisma.pagoComisionRepartidor.createMany({ data: [
      { trabajadorId: id, fecha: new Date(`${HOY}T00:00:00-05:00`), monto: 0.7, offlineId: unico() },
      { trabajadorId: id, fecha: new Date(`${HOY}T00:00:00-05:00`), monto: 0.1, offlineId: unico() },
    ] })
    const r = await pagar(id)
    expect(r.status).toBe(409)
    expect((await r.json()).error.code).toBe('NADA_PENDIENTE')
    expect(await filas(id)).toHaveLength(2)
  })

})
