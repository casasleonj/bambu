// @tests #305 — el medio de pago de comisiones y salarios decide si salen de la caja del cierre.
// Postgres real, handlers REALES; cada prueba mira la base de datos.
//   - Comisión del repartidor: se paga con un medio; solo EFECTIVO resta de la caja del cierre.
//   - Salarios: `salariosEfectivo` (opcional) es lo que sale de la caja; sin él, se asume todo.
//   - La nómina descuenta TODA la comisión pagada, sea cual sea el medio.

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
import { POST as pagarComision } from '@/app/api/nomina/dia/pagar/route'
import { POST as crearNomina } from '@/app/api/nomina/route'
import { POST as cerrarDia } from '@/app/api/cierre/route'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { todayStringBogota } from '@/lib/dates'
import { startOfDayInBogota } from '@/lib/date-helpers'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { REGLAS } from '@/lib/integridad/reglas'

const TARIFA = 400
const HOY = todayStringBogota()

let adminId: string
let clienteId: string

const unico = () => `mp-${randomUUID()}`
const json = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

async function repartidor(nombre: string) {
  return (await testPrisma.trabajador.create({
    data: { nombre, rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION', comRepartAgua: TARIFA, comRepartHielo: TARIFA, salarioFijo: 0 },
  })).id
}

async function entrega(repartidorId: string, agua: number) {
  const { pedido } = await crearPedidoUseCase.execute({
    clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: agua }],
    pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: unico(),
  })
  await testPrisma.pedido.update({
    where: { id: pedido.id },
    data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: agua, entregadoAt: new Date(), entregadoPorId: repartidorId },
  })
}

const pagar = (trabajadorId: string, extra: Record<string, unknown> = {}) =>
  pagarComision(json('/api/nomina/dia/pagar', { trabajadorId, fecha: HOY, offlineId: unico() + '-x', ...extra }))

const cierreBody = (extra: Record<string, unknown>) => ({
  baseDia: 1000, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0, stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0, salarios: 0, ...extra,
})

describe('#305 — medio de pago de comisiones y salarios (Postgres real)', () => {
  let rEfectivo: string
  let rNequi: string

  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Medio Pago', telefono: '3001230305', direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })).id
    rEfectivo = await repartidor('Paga Efectivo')
    rNequi = await repartidor('Paga Nequi')
    await entrega(rEfectivo, 3) // comisión 1.200
    await entrega(rNequi, 5) // comisión 2.000
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' })
  })

  it('sin indicar medio se asume EFECTIVO; con medio, queda guardado', async () => {
    const a = await pagar(rEfectivo)
    expect(a.status).toBe(201)
    expect((await a.json()).pago.metodo).toBe('EFECTIVO')
    const b = await pagar(rNequi, { metodo: 'NEQUI' })
    expect(b.status).toBe(201)
    expect((await b.json()).pago.metodo).toBe('NEQUI')

    const filaA = await testPrisma.pagoComisionRepartidor.findFirstOrThrow({ where: { trabajadorId: rEfectivo } })
    const filaB = await testPrisma.pagoComisionRepartidor.findFirstOrThrow({ where: { trabajadorId: rNequi } })
    expect(filaA.metodo).toBe('EFECTIVO')
    expect(filaB.metodo).toBe('NEQUI')
    expect(Number(filaB.monto)).toBe(5 * TARIFA)
  })

  it('un medio que no existe (o BONO) se rechaza sin pagar', async () => {
    const r = await repartidor('Medio Inválido')
    await entrega(r, 1)
    expect((await pagar(r, { metodo: 'BONO' })).status).toBe(400)
    expect((await pagar(r, { metodo: 'CHEQUE' })).status).toBe(400)
    expect(await testPrisma.pagoComisionRepartidor.count({ where: { trabajadorId: r } })).toBe(0)
  })

  it('el cierre resta de la caja solo la comisión pagada en efectivo y deja constancia de la otra', async () => {
    const res = await cerrarDia(json('/api/cierre', cierreBody({ fecha: HOY })))
    expect(res.status).toBe(201)
    const cierre = await testPrisma.cierreDia.findFirstOrThrow({ where: { fecha: startOfDayInBogota(HOY) } })
    expect(Number(cierre.comisiones)).toBe(3 * TARIFA)
    expect(Number(cierre.netoCaja)).toBe(1000 - 3 * TARIFA)
    const reporte = cierre.reporte as { comisionesAuto: { pagadoRepartidores: number; pagadoRepartidoresOtrosMedios: number } }
    expect(reporte.comisionesAuto.pagadoRepartidores).toBe(3 * TARIFA)
    expect(reporte.comisionesAuto.pagadoRepartidoresOtrosMedios).toBe(5 * TARIFA)
  })

  it('V16 sigue cuadrando: el cierre se compara solo con los pagos en efectivo', async () => {
    const v16 = await verificarIntegridad(testPrisma, { reglas: REGLAS.filter((r) => r.id === 'V16') })
    expect(v16.reglas[0].cantidad).toBe(0)
  })

  it('la nómina descuenta TODA la comisión pagada, también la que no salió de la caja', async () => {
    const res = await crearNomina(json('/api/nomina', { trabajadorId: rNequi, fechaInicio: HOY, fechaFin: HOY, tipoCalculo: 'AUTO' }))
    expect(res.status).toBe(200)
    const n = await testPrisma.nomina.findFirstOrThrow({ where: { trabajadorId: rNequi } })
    expect(Number(n.totalComisiones)).toBe(5 * TARIFA)
    expect(Number(n.comisionPagadaCaja)).toBe(5 * TARIFA)
    expect(Number(n.total)).toBe(0)
    const v16 = await verificarIntegridad(testPrisma, { reglas: REGLAS.filter((r) => r.id === 'V16') })
    expect(v16.reglas[0].cantidad).toBe(0)
  })

  describe('salarios', () => {
    const dia = '2040-05-01'
    beforeAll(async () => {
      await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota('2040-04-30'), cerradoPor: adminId } })
    })

    it('salariosEfectivo mayor que los salarios se rechaza', async () => {
      const res = await cerrarDia(json('/api/cierre', cierreBody({ fecha: dia, baseDia: 0, salarios: 50_000, salariosEfectivo: 60_000 })))
      expect(res.status).toBe(400)
      expect(await testPrisma.cierreDia.count({ where: { fecha: startOfDayInBogota(dia) } })).toBe(0)
    })

    it('solo lo pagado en efectivo resta de la caja; el total de salarios queda guardado', async () => {
      const res = await cerrarDia(json('/api/cierre', cierreBody({ fecha: dia, baseDia: 0, salarios: 100_000, salariosEfectivo: 40_000 })))
      expect(res.status).toBe(201)
      const cierre = await testPrisma.cierreDia.findFirstOrThrow({ where: { fecha: startOfDayInBogota(dia) } })
      expect(Number(cierre.salarios)).toBe(100_000)
      expect(Number(cierre.netoCaja)).toBe(-40_000)
      const reporte = cierre.reporte as { salariosEfectivo: number; salariosOtrosMedios: number }
      expect(reporte.salariosEfectivo).toBe(40_000)
      expect(reporte.salariosOtrosMedios).toBe(60_000)
    })

    it('sin indicar salariosEfectivo se asume todo en efectivo (comportamiento anterior)', async () => {
      await testPrisma.cierreDia.create({ data: { fecha: startOfDayInBogota('2040-05-02'), cerradoPor: adminId } })
      const res = await cerrarDia(json('/api/cierre', cierreBody({ fecha: '2040-05-03', baseDia: 0, salarios: 30_000 })))
      expect(res.status).toBe(201)
      const cierre = await testPrisma.cierreDia.findFirstOrThrow({ where: { fecha: startOfDayInBogota('2040-05-03') } })
      expect(Number(cierre.netoCaja)).toBe(-30_000)
    })
  })
})
