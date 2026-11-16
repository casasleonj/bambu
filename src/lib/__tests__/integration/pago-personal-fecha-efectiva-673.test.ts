// @tests #673 punto 2 — fecha EFECTIVA de caja de los pagos al personal (Postgres real, handlers REALES, datos sintéticos).
// Comisiones: `PagoComisionRepartidor.pagadoAt` (NULL = createdAt) lo lee el cierre; correcciones solo ADMIN, append-only.
// Sueldos: `Nomina.fechaPago` y `Gasto.fecha` opcionales; `Gasto.createdAt` conserva la captura.
// Un día ya cerrado NO se reescribe: el pago se acepta, queda trazado y V16 lo ve como explicado.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/push', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { POST as pagarComision } from '@/app/api/nomina/dia/pagar/route'
import { POST as corregirFechaComision } from '@/app/api/nomina/pagos-comision/[id]/corregir-fecha/route'
import { PUT as accionNomina } from '@/app/api/nomina/[id]/route'
import { comisionPagadaEnCaja, comisionPagadaOtrosMedios } from '@/lib/comision-pagada'
import { dayInBogota, startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { REGLAS } from '@/lib/integridad/reglas'
import { crearPedidoUseCase } from '@/modules/pedidos'

const DIA = 86_400_000
const dia = (atras: number) => dayInBogota(new Date(Date.now() - atras * DIA))
const rango = (d: string) => ({ desde: startOfDayInBogota(d), hasta: new Date(startOfDayInBogota(d).getTime() + DIA) })
const HOY = todayInBogota()
let adminId: string
let clienteId: string

const unico = () => `pf-${randomUUID()}`
const como = (role: string) => mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const put = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

async function repartidor(nombre: string) {
  return (await testPrisma.trabajador.create({
    data: { nombre, rol: 'REPARTIDOR', usaMoto: true, tipoPago: 'COMISION', comRepartAgua: 400, comRepartHielo: 400 },
  })).id
}
/** Una entrega de oficina hoy: deja comisión pendiente de pagar para el repartidor. */
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
  pagarComision(post('/api/nomina/dia/pagar', { trabajadorId, fecha: HOY, offlineId: unico(), ...extra }))
const cuerpo = async (r: Response) => (await r.json()) as { error?: { code?: string; message?: string }; data?: Record<string, unknown> }
const nuevoPago = (trabajadorId: string, monto: number, extra: Record<string, unknown> = {}) => testPrisma.pagoComisionRepartidor.create({
  data: { trabajadorId, fecha: startOfDayInBogota(HOY), monto, metodo: 'EFECTIVO', offlineId: unico(), ...extra },
})

describe('#673 punto 2 — fecha efectiva de caja de los pagos al personal', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({
      data: { nombre: 'Cliente Fecha Efectiva', telefono: '3001230673', direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true },
    })).id
  })
  afterAll(disconnect)
  beforeEach(() => como('ADMIN'))

  describe('lectura de la caja: la fecha efectiva manda, NULL cae en createdAt', () => {
    it('un pago anotado hoy y entregado hace 2 días resta del día de entrega, no del de captura', async () => {
      const t = await repartidor('Lectura Uno')
      const entregado = dia(2)
      await nuevoPago(t, 1000, { pagadoAt: new Date(`${entregado}T12:00:00-05:00`) })
      const dEntrega = rango(entregado)
      const dHoy = rango(HOY)
      expect(await comisionPagadaEnCaja(testPrisma, dEntrega.desde, dEntrega.hasta)).toBe(1000)
      expect(await comisionPagadaEnCaja(testPrisma, dHoy.desde, dHoy.hasta)).toBe(0)
    })

    it('un pago antiguo sin fecha efectiva (NULL) sigue contando por createdAt', async () => {
      const t = await repartidor('Lectura Dos')
      await nuevoPago(t, 700)
      const dHoy = rango(HOY)
      expect(await comisionPagadaEnCaja(testPrisma, dHoy.desde, dHoy.hasta)).toBe(1000 * 0 + 700)
    })

    it('los pagos por otros medios siguen sin tocar la caja y usan la misma fecha efectiva', async () => {
      const t = await repartidor('Lectura Tres')
      const entregado = dia(3)
      await nuevoPago(t, 500, { metodo: 'NEQUI', pagadoAt: new Date(`${entregado}T12:00:00-05:00`) })
      const d = rango(entregado)
      expect(await comisionPagadaEnCaja(testPrisma, d.desde, d.hasta)).toBe(0)
      expect(await comisionPagadaOtrosMedios(testPrisma, d.desde, d.hasta)).toBe(500)
    })
  })

  describe('pagar una comisión indicando cuándo se entregó', () => {
    it('sin fecha: igual que siempre (pagadoAt NULL)', async () => {
      const t = await repartidor('Pagar Uno')
      await entrega(t, 2)
      const res = await pagar(t)
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const fila = await testPrisma.pagoComisionRepartidor.findFirstOrThrow({ where: { trabajadorId: t } })
      expect(fila.pagadoAt).toBeNull()
    })

    it('con fecha pasada y motivo: guarda la fecha efectiva y conserva la captura', async () => {
      const t = await repartidor('Pagar Dos')
      await entrega(t, 2)
      const antes = Date.now()
      const res = await pagar(t, { pagadoEl: dia(2), motivoFecha: 'Se le entregó ese día y se anotó hoy' })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const fila = await testPrisma.pagoComisionRepartidor.findFirstOrThrow({ where: { trabajadorId: t } })
      expect(dayInBogota(fila.pagadoAt!)).toBe(dia(2))
      expect(fila.createdAt.getTime()).toBeGreaterThanOrEqual(antes - 1000)
      expect(dayInBogota(fila.createdAt)).toBe(HOY)
      const d = rango(dia(2))
      expect(await comisionPagadaEnCaja(testPrisma, d.desde, d.hasta)).toBeGreaterThanOrEqual(800)
    })

    it('una fecha anterior a hoy exige motivo; una futura se rechaza; hoy no necesita motivo', async () => {
      const t = await repartidor('Pagar Tres')
      await entrega(t, 2)
      const sinMotivo = await pagar(t, { pagadoEl: dia(1) })
      expect(sinMotivo.status).toBe(422)
      expect((await cuerpo(sinMotivo)).error?.code).toBe('MOTIVO_FECHA_REQUERIDO')
      const futura = await pagar(t, { pagadoEl: dia(-1), motivoFecha: 'prueba' })
      expect(futura.status).toBe(422)
      expect((await cuerpo(futura)).error?.code).toBe('FECHA_PAGO_FUTURA')
      const hoy = await pagar(t, { pagadoEl: HOY })
      expect(hoy.status, JSON.stringify(await hoy.clone().json())).toBe(201)
      const fila = await testPrisma.pagoComisionRepartidor.findFirstOrThrow({ where: { trabajadorId: t } })
      expect(fila.pagadoAt).toBeNull()
    })

    it('el mismo reintento (offlineId) no duplica el pago ni cambia la fecha', async () => {
      const t = await repartidor('Pagar Cuatro')
      await entrega(t, 2)
      const offlineId = unico()
      const extra = { offlineId, pagadoEl: dia(2), motivoFecha: 'Entrega de hace dos días' }
      expect((await pagar(t, extra)).status).toBe(201)
      expect((await pagar(t, extra)).status).toBe(200)
      expect(await testPrisma.pagoComisionRepartidor.count({ where: { trabajadorId: t } })).toBe(1)
    })
  })

  describe('día ya cerrado: no se reescribe, se acepta con rastro y V16 lo ve explicado', () => {
    it('un pago entregado en un día cerrado se acepta; el cierre guardado no cambia y V16 no lo marca', async () => {
      const t = await repartidor('Cerrado Uno')
      await entrega(t, 2)
      const cerrado = dia(4)
      // un cierre antiguo con su cifra guardada: 0 pagado por comisiones
      const cierre = await testPrisma.cierreDia.create({
        data: { fecha: startOfDayInBogota(cerrado), cerradoPor: adminId, reporte: { comisionesAuto: { pagadoRepartidores: 0 } } },
      })
      const snapshotAntes = JSON.stringify(await testPrisma.cierreDia.findUniqueOrThrow({ where: { id: cierre.id } }))
      const res = await pagar(t, { pagadoEl: cerrado, motivoFecha: 'Se entregó ese día y no se había anotado' })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      expect(JSON.stringify(await testPrisma.cierreDia.findUniqueOrThrow({ where: { id: cierre.id } }))).toBe(snapshotAntes)
      const v16 = await verificarIntegridad(testPrisma, { reglas: REGLAS.filter((r) => r.id === 'V16') })
      expect(JSON.stringify(v16)).not.toContain(cierre.id)
    })
  })

  describe('V16 compara el cierre con lo que el cierre vio, por fecha efectiva', () => {
    const v16 = () => verificarIntegridad(testPrisma, { reglas: REGLAS.filter((r) => r.id === 'V16') })

    it('un pago anotado hoy con la fecha de un día aún abierto cuenta en el cierre de ese día y V16 no lo marca', async () => {
      const t = await repartidor('V16 Uno')
      const ayer = dia(9)
      await nuevoPago(t, 800, { pagadoAt: new Date(`${ayer}T12:00:00-05:00`) })
      // el cierre de ese día se hace después y resta 800 (lectura por fecha efectiva)
      const cierre = await testPrisma.cierreDia.create({
        data: { fecha: startOfDayInBogota(ayer), cerradoPor: adminId, reporte: { comisionesAuto: { pagadoRepartidores: 800 } } },
      })
      expect(JSON.stringify(await v16())).not.toContain(cierre.id)
    })

    it('un pago capturado en un día cerrado y corregido DESPUÉS a otro día no descuadra el cierre que ya lo había restado', async () => {
      const t = await repartidor('V16 Dos')
      const cerrado = dia(11)
      const original = new Date(`${cerrado}T12:00:00-05:00`)
      const pago = await nuevoPago(t, 600, { createdAt: original })
      const cierre = await testPrisma.cierreDia.create({
        data: {
          fecha: startOfDayInBogota(cerrado), cerradoPor: adminId, createdAt: new Date(`${cerrado}T23:00:00-05:00`),
          reporte: { comisionesAuto: { pagadoRepartidores: 600 } },
        },
      })
      // la corrección llega después del cierre y mueve el pago a otro día
      const nueva = new Date(`${dia(14)}T12:00:00-05:00`)
      await testPrisma.pagoComisionRepartidor.update({ where: { id: pago.id }, data: { pagadoAt: nueva } })
      await testPrisma.pagoComisionFechaCorreccion.create({
        data: { pagoId: pago.id, fechaAnterior: original, fechaNueva: nueva, motivo: 'Entregado antes según el propietario', corregidoPorId: adminId },
      })
      expect(JSON.stringify(await v16())).not.toContain(cierre.id)
    })

    it('sigue marcando un pago normal hecho después del cierre del mismo día (no es una fecha retroactiva)', async () => {
      const t = await repartidor('V16 Tres')
      const d = dia(13)
      const cierre = await testPrisma.cierreDia.create({
        data: {
          fecha: startOfDayInBogota(d), cerradoPor: adminId, createdAt: new Date(`${d}T20:00:00-05:00`),
          reporte: { comisionesAuto: { pagadoRepartidores: 0 } },
        },
      })
      await nuevoPago(t, 450, { createdAt: new Date(`${d}T22:00:00-05:00`) })
      expect(JSON.stringify(await v16())).toContain(cierre.id)
    })
  })

  describe('corrección administrativa de la fecha efectiva (solo ADMIN, append-only)', () => {
    const corregir = (id: string, body: Record<string, unknown>) =>
      corregirFechaComision(post(`/api/nomina/pagos-comision/${id}/corregir-fecha`, body), { params: Promise.resolve({ id }) })

    it('mueve la fecha efectiva con rastro: guarda anterior, nueva, motivo y autor; createdAt no cambia', async () => {
      const t = await repartidor('Corregir Uno')
      const p = await nuevoPago(t, 1200)
      const res = await corregir(p.id, { fecha: dia(3), motivo: 'El propietario confirmó que se entregó ese día', offlineId: unico() })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const despues = await testPrisma.pagoComisionRepartidor.findUniqueOrThrow({ where: { id: p.id } })
      expect(despues.createdAt.getTime()).toBe(p.createdAt.getTime())
      expect(dayInBogota(despues.pagadoAt!)).toBe(dia(3))
      const [fila] = await testPrisma.pagoComisionFechaCorreccion.findMany({ where: { pagoId: p.id } })
      expect(dayInBogota(fila.fechaAnterior)).toBe(HOY)
      expect(dayInBogota(fila.fechaNueva)).toBe(dia(3))
      expect(fila.motivo).toContain('propietario')
      expect(fila.corregidoPorId).toBe(adminId)
    })

    it('solo ADMIN; motivo obligatorio; misma fecha o futura se rechazan', async () => {
      const t = await repartidor('Corregir Dos')
      const p = await nuevoPago(t, 900)
      como('CONTADOR')
      expect((await corregir(p.id, { fecha: dia(2), motivo: 'Motivo válido' })).status).toBe(403)
      como('ADMIN')
      expect((await corregir(p.id, { fecha: dia(2), motivo: '' })).status).toBe(422)
      expect((await corregir(p.id, { fecha: HOY, motivo: 'Misma fecha' })).status).toBe(422)
      expect((await corregir(p.id, { fecha: dia(-2), motivo: 'Futuro' })).status).toBe(422)
      expect(await testPrisma.pagoComisionFechaCorreccion.count({ where: { pagoId: p.id } })).toBe(0)
    })

    it('un reintento con el mismo offlineId no duplica la corrección', async () => {
      const t = await repartidor('Corregir Tres')
      const p = await nuevoPago(t, 1100)
      const offlineId = unico()
      expect((await corregir(p.id, { fecha: dia(2), motivo: 'Motivo válido', offlineId })).status).toBe(201)
      expect((await corregir(p.id, { fecha: dia(2), motivo: 'Motivo válido', offlineId })).status).toBe(200)
      expect(await testPrisma.pagoComisionFechaCorreccion.count({ where: { pagoId: p.id } })).toBe(1)
    })

    it('corregir a un día ya cerrado no cambia el cierre guardado y V16 no lo marca', async () => {
      const t = await repartidor('Corregir Cuatro')
      const p = await nuevoPago(t, 600)
      const cerrado = dia(6)
      const cierre = await testPrisma.cierreDia.create({
        data: { fecha: startOfDayInBogota(cerrado), cerradoPor: adminId, reporte: { comisionesAuto: { pagadoRepartidores: 0 } } },
      })
      const res = await corregir(p.id, { fecha: cerrado, motivo: 'Entregado ese día según el propietario' })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const v16 = await verificarIntegridad(testPrisma, { reglas: REGLAS.filter((r) => r.id === 'V16') })
      expect(JSON.stringify(v16)).not.toContain(cierre.id)
    })
  })

  describe('sueldos: fecha de pago opcional', () => {
    async function nominaPendiente(total = 50_000) {
      const t = await testPrisma.trabajador.create({ data: { nombre: `Sueldo ${unico()}`, rol: 'AYUDANTE', tipoPago: 'FIJO', salarioFijo: total } })
      return testPrisma.nomina.create({
        data: {
          trabajadorId: t.id, fechaInicio: startOfDayInBogota(dia(8)), fechaFin: startOfDayInBogota(dia(8)), salario: total, total,
        },
      })
    }
    const pagarNomina = (id: string, body: Record<string, unknown>) =>
      accionNomina(put(`/api/nomina/${id}`, { action: 'PAGAR', metodo: 'EFECTIVO', ...body }), { params: Promise.resolve({ id }) })

    it('sin fecha: el pago y el egreso quedan en el momento de la captura, como siempre', async () => {
      const n = await nominaPendiente()
      expect((await pagarNomina(n.id, {})).status).toBe(200)
      const gasto = await testPrisma.gasto.findFirstOrThrow({ where: { trabajadorId: n.trabajadorId } })
      expect(dayInBogota(gasto.fecha)).toBe(HOY)
    })

    it('con fecha pasada y motivo: el egreso y fechaPago caen ese día; createdAt guarda la captura; el periodo cubierto no cambia', async () => {
      const n = await nominaPendiente()
      const res = await pagarNomina(n.id, { fechaPago: dia(3), motivoFecha: 'Se pagó antes de lo previsto' })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(200)
      const nomina = await testPrisma.nomina.findUniqueOrThrow({ where: { id: n.id } })
      expect(dayInBogota(nomina.fechaPago!)).toBe(dia(3))
      expect(dayInBogota(nomina.fechaInicio)).toBe(dia(8))
      expect(dayInBogota(nomina.fechaFin)).toBe(dia(8))
      const gasto = await testPrisma.gasto.findFirstOrThrow({ where: { trabajadorId: n.trabajadorId } })
      expect(dayInBogota(gasto.fecha)).toBe(dia(3))
      expect(dayInBogota(gasto.createdAt)).toBe(HOY)
      expect(gasto.notas ?? '').toContain('Se pagó antes de lo previsto')
    })

    it('una fecha pasada exige motivo y una futura se rechaza; la nómina queda pendiente', async () => {
      const n = await nominaPendiente()
      const sinMotivo = await pagarNomina(n.id, { fechaPago: dia(2) })
      expect(sinMotivo.status).toBe(422)
      expect((await cuerpo(sinMotivo)).error?.code).toBe('MOTIVO_FECHA_REQUERIDO')
      const futura = await pagarNomina(n.id, { fechaPago: dia(-1), motivoFecha: 'prueba' })
      expect(futura.status).toBe(422)
      expect((await testPrisma.nomina.findUniqueOrThrow({ where: { id: n.id } })).estado).toBe('PENDIENTE')
      expect(await testPrisma.gasto.count({ where: { trabajadorId: n.trabajadorId } })).toBe(0)
    })
  })
})
