// @tests #834 — corrección administrativa del día real de caja de un pago de comisión (Postgres real, handlers REALES, datos sintéticos).
// Solo ADMIN, motivo obligatorio, rastro que solo añade filas, sin reescribir `createdAt`, `fecha` ni el cierre guardado.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))

import { testPrisma as db, resetAndSeed, disconnect, getAdminUser, limpiarPagosComisionDePrueba } from './setup'
import { POST as corregir } from '@/app/api/nomina/pagos-comision/[id]/corregir-fecha/route'
import { GET as consultarCierre } from '@/app/api/cierre/route'
import { comisionPagadaEnCaja, pagadoComisionDia, leerPagosComisionCaja } from '@/lib/comision-pagada'
import { verificarIntegridad } from '@/lib/integridad/verificar'
import { REGLAS } from '@/lib/integridad/reglas'
import { startOfDayBogota, todayStringBogota } from '@/lib/dates'

const hoy = todayStringBogota()
const dia = (offset: number) => new Date(startOfDayBogota(hoy).getTime() + offset * 86_400_000)
const fecha = (offset: number) => dia(offset).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const diaDe = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
const TRABAJO = -6
let adminId: string

const como = (role: string) => mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00Z' })
const unico = () => `cf-${randomUUID()}`

async function trabajador() {
  return (await db.trabajador.create({ data: { nombre: `Repartidor sintético ${unico()}`, rol: 'REPARTIDOR', tipoPago: 'COMISION' } })).id
}
/** Un pago de comisión en efectivo con su día real (o sin verificar) y su captura en `capturaOffset`. */
async function pago(opts: { real?: number | null; captura?: number; monto?: number; metodo?: 'EFECTIVO' | 'NEQUI'; trabajadorId?: string } = {}) {
  const trabajadorId = opts.trabajadorId ?? await trabajador()
  const captura = new Date(dia(opts.captura ?? 0).getTime() + 10 * 3_600_000)
  return db.pagoComisionRepartidor.create({ data: {
    trabajadorId, fecha: dia(TRABAJO), fechaPagoReal: opts.real === null || opts.real === undefined ? null : dia(opts.real),
    monto: opts.monto ?? 1200, metodo: opts.metodo ?? 'EFECTIVO', concepto: 'REPARTO', offlineId: unico(), createdAt: captura,
  } })
}
const llamar = (id: string, body: Record<string, unknown>) => corregir(
  new NextRequest(`http://localhost/api/nomina/pagos-comision/${id}/corregir-fecha`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ id }) },
)
const cuerpo = async (r: Response) => (await r.json()) as { data?: Record<string, unknown>; error?: { code?: string; message?: string } }
const v16 = () => verificarIntegridad(db, { reglas: REGLAS.filter((r) => r.id === 'V16') })
const filas = (pagoId: string) => db.pagoComisionFechaCorreccion.findMany({ where: { pagoId }, orderBy: { corregidoAt: 'asc' } })

describe('#834 — corregir el día real de caja de un pago de comisión', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(async () => {
    como('ADMIN')
    await limpiarPagosComisionDePrueba()
    await db.cierreDia.deleteMany({})
    await db.historial.deleteMany({ where: { entidad: 'PagoComisionRepartidor' } })
  })
  afterAll(disconnect)

  describe('qué cambia y qué se conserva', () => {
    it('mueve el día real: la caja cambia de día; createdAt, el día trabajado y el pago por trabajo no cambian; queda el rastro', async () => {
      const p = await pago({ real: -3, captura: -1 })
      const res = await llamar(p.id, { fechaPagoReal: fecha(-2), motivo: 'El propietario confirmó que se entregó ese día', offlineId: unico() })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const despues = await db.pagoComisionRepartidor.findUniqueOrThrow({ where: { id: p.id } })
      expect(despues.fechaPagoReal).toEqual(dia(-2))
      expect(despues.createdAt).toEqual(p.createdAt)
      expect(despues.fecha).toEqual(p.fecha)
      expect(despues.monto.toString()).toBe(p.monto.toString())
      expect(await comisionPagadaEnCaja(db, dia(-3), dia(-2))).toBe(0)
      expect(await comisionPagadaEnCaja(db, dia(-2), dia(-1))).toBe(1200)
      expect(await pagadoComisionDia(db, p.trabajadorId, fecha(TRABAJO))).toBe(1200)
      const [fila] = await filas(p.id)
      expect(fila.fechaRealAnterior).toEqual(dia(-3))
      expect(fila.fechaRealNueva).toEqual(dia(-2))
      expect(fila.motivo).toContain('propietario')
      expect(fila.corregidoPorId).toBe(adminId)
      const audit = await db.historial.findFirst({ where: { entidad: 'PagoComisionRepartidor', registroId: p.id, accion: 'UPDATE' } })
      expect(audit).not.toBeNull()
    })

    it('un pago «sin verificar» recibe su día real; la caja deja de atribuirlo a la captura', async () => {
      const p = await pago({ real: null, captura: -1 })
      expect(await comisionPagadaEnCaja(db, dia(-1), dia(0))).toBe(1200) // criterio anterior: la captura
      const res = await llamar(p.id, { fechaPagoReal: fecha(-4), motivo: 'Comprobado con el propietario' })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      const [fila] = await filas(p.id)
      expect(fila.fechaRealAnterior).toBeNull()
      expect(fila.fechaRealNueva).toEqual(dia(-4))
      expect(await comisionPagadaEnCaja(db, dia(-1), dia(0))).toBe(0)
      expect(await comisionPagadaEnCaja(db, dia(-4), dia(-3))).toBe(1200)
    })

    it('la consulta de pagos de la caja trae el último rastro de cada pago', async () => {
      const p = await pago({ real: -3 })
      await llamar(p.id, { fechaPagoReal: fecha(-2), motivo: 'Primera corrección' })
      await llamar(p.id, { fechaPagoReal: fecha(-1), motivo: 'Segunda corrección' })
      const lectura = await leerPagosComisionCaja(db, dia(-1), dia(0))
      const leido = lectura.pagos.find((x) => x.id === p.id)
      expect(leido?.correccion).toMatchObject({ motivo: 'Segunda corrección', anterior: fecha(-2), nueva: fecha(-1) })
      expect(leido?.correccion?.por).toBeTruthy()
    })
  })

  describe('reglas', () => {
    it('solo un ADMIN: CONTADOR y ASISTENTE reciben 403 y no se guarda nada', async () => {
      const p = await pago({ real: -3 })
      for (const rol of ['CONTADOR', 'ASISTENTE']) {
        como(rol)
        expect((await llamar(p.id, { fechaPagoReal: fecha(-2), motivo: 'Intento sin permiso' })).status).toBe(403)
      }
      expect(await filas(p.id)).toHaveLength(0)
      expect((await db.pagoComisionRepartidor.findUniqueOrThrow({ where: { id: p.id } })).fechaPagoReal).toEqual(dia(-3))
    })

    it('motivo corto, fecha futura, anterior al trabajo, sin cambio e inválida se rechazan sin guardar nada', async () => {
      const p = await pago({ real: -3 })
      const casos: [Record<string, unknown>, number, string][] = [
        [{ fechaPagoReal: fecha(-2), motivo: 'ab' }, 422, 'MOTIVO_REQUERIDO'],
        [{ fechaPagoReal: fecha(1), motivo: 'Motivo válido' }, 422, 'FECHA_PAGO_FUTURA'],
        [{ fechaPagoReal: fecha(TRABAJO - 1), motivo: 'Motivo válido' }, 422, 'FECHA_PAGO_ANTERIOR_AL_TRABAJO'],
        [{ fechaPagoReal: fecha(-3), motivo: 'Motivo válido' }, 422, 'SIN_CAMBIO'],
        [{ fechaPagoReal: '2026-02-30', motivo: 'Motivo válido' }, 422, 'FECHA_PAGO_INVALIDA'],
      ]
      for (const [body, status, code] of casos) {
        const res = await llamar(p.id, body)
        expect(res.status, code).toBe(status)
        expect((await cuerpo(res)).error?.code, code).toBe(code)
      }
      expect(await filas(p.id)).toHaveLength(0)
    })

    it('un pago que no existe da 404', async () => {
      const res = await llamar('no-existe', { fechaPagoReal: fecha(-2), motivo: 'Motivo válido' })
      expect(res.status).toBe(404)
    })

    it('un reintento con la misma clave no duplica; con otra fecha usa la clave de otra corrección y se rechaza', async () => {
      const p = await pago({ real: -3 })
      const offlineId = unico()
      expect((await llamar(p.id, { fechaPagoReal: fecha(-2), motivo: 'Motivo válido', offlineId })).status).toBe(201)
      const repetido = await llamar(p.id, { fechaPagoReal: fecha(-2), motivo: 'Motivo válido', offlineId })
      expect(repetido.status).toBe(200)
      expect(await filas(p.id)).toHaveLength(1)
      const otro = await llamar(p.id, { fechaPagoReal: fecha(-1), motivo: 'Motivo válido', offlineId })
      expect(otro.status).toBe(409)
      expect((await cuerpo(otro)).error?.code).toBe('OFFLINE_ID_EN_USO')
      expect(await filas(p.id)).toHaveLength(1)
    })

    it('dos correcciones a la vez con claves distintas no se pisan: queda un orden y dos filas coherentes', async () => {
      const p = await pago({ real: -3 })
      const [a, b] = await Promise.all([
        llamar(p.id, { fechaPagoReal: fecha(-2), motivo: 'Corrección A', offlineId: unico() }),
        llamar(p.id, { fechaPagoReal: fecha(-1), motivo: 'Corrección B', offlineId: unico() }),
      ])
      expect([a.status, b.status].every((s) => s === 201 || s === 422)).toBe(true)
      const lista = await filas(p.id)
      const actual = (await db.pagoComisionRepartidor.findUniqueOrThrow({ where: { id: p.id } })).fechaPagoReal
      expect(lista.length).toBeGreaterThanOrEqual(1)
      expect(actual).toEqual(lista[lista.length - 1].fechaRealNueva)
    })
  })

  describe('días ya cerrados: el cierre guardado no se reescribe', () => {
    it('corregir hacia un día cerrado se acepta, avisa qué cierre queda intacto y no cambia ese cierre', async () => {
      const p = await pago({ real: -2 })
      const cierre = await db.cierreDia.create({ data: { fecha: dia(-4), cerradoPor: adminId, reporte: { comisionesAuto: { pagadoRepartidores: 0 } }, createdAt: new Date(dia(-3).getTime() + 8 * 3_600_000) } })
      const antes = JSON.stringify(await db.cierreDia.findUniqueOrThrow({ where: { id: cierre.id } }))
      const res = await llamar(p.id, { fechaPagoReal: fecha(-4), motivo: 'Se entregó ese día según el propietario' })
      expect(res.status, JSON.stringify(await res.clone().json())).toBe(201)
      expect(((await res.json()).diasCerrados as string[])).toEqual([fecha(-4)])
      expect(JSON.stringify(await db.cierreDia.findUniqueOrThrow({ where: { id: cierre.id } }))).toBe(antes)
    })

    it('V16 no marca el cierre cuando una corrección POSTERIOR mueve un pago hacia él o fuera de él', async () => {
      // Cierre del día -4 hecho cuando un pago (real -4) ya estaba: guardó 1.200. Otro pago real -2 no estaba en él.
      const entra = await pago({ real: -2, captura: -2, monto: 700 }) // importe distinto: no puede compensarse con el que sale
      const sale = await pago({ real: -4, captura: -4, trabajadorId: undefined })
      const cierre = await db.cierreDia.create({ data: { fecha: dia(-4), cerradoPor: adminId, reporte: { comisionesAuto: { pagadoRepartidores: 1200 } }, createdAt: new Date(dia(-3).getTime() + 8 * 3_600_000) } })
      expect(JSON.stringify(await v16())).not.toContain(cierre.id)
      // Corrección posterior al cierre: uno entra al día cerrado, el otro sale. El cierre guardado sigue siendo correcto.
      expect((await llamar(entra.id, { fechaPagoReal: fecha(-4), motivo: 'Corrección posterior que entra' })).status).toBe(201)
      expect((await llamar(sale.id, { fechaPagoReal: fecha(-2), motivo: 'Corrección posterior que sale' })).status).toBe(201)
      expect(JSON.stringify(await v16())).not.toContain(cierre.id)
    })

    it('V16 sigue marcando un descuadre real (un pago normal posterior al cierre, sin corrección)', async () => {
      const cierre = await db.cierreDia.create({ data: { fecha: dia(-4), cerradoPor: adminId, reporte: { comisionesAuto: { pagadoRepartidores: 0 } }, createdAt: new Date(dia(-4).getTime() + 20 * 3_600_000) } })
      await db.pagoComisionRepartidor.create({ data: {
        trabajadorId: await trabajador(), fecha: dia(TRABAJO), monto: 700, metodo: 'EFECTIVO', concepto: 'REPARTO', offlineId: unico(),
        createdAt: new Date(dia(-4).getTime() + 22 * 3_600_000),
      } })
      expect(JSON.stringify(await v16())).toContain(cierre.id)
    })

    it('la consulta de un día cerrado lista las correcciones posteriores que explican su diferencia', async () => {
      const p = await pago({ real: -4, captura: -4 })
      const cierre = await db.cierreDia.create({ data: {
        fecha: dia(-4), cerradoPor: adminId, comisiones: 1200, reporte: { comisionesAuto: { pagadoRepartidores: 1200 } },
        createdAt: new Date(dia(-3).getTime() + 8 * 3_600_000),
      } })
      expect((await llamar(p.id, { fechaPagoReal: fecha(-2), motivo: 'Se entregó el domingo, según el propietario' })).status).toBe(201)
      const res = await consultarCierre(new NextRequest(`http://localhost/api/cierre?fecha=${fecha(-4)}`))
      expect(res.status).toBe(200)
      const json = await res.json()
      const concil = (json.data?.cierre ?? json.cierre).conciliacionComisiones
      expect(concil.original).toBe(1200)
      expect(concil.actual).toBe(0)
      expect(concil.diferencia).toBe(-1200)
      expect(concil.correccionesPosteriores).toHaveLength(1)
      expect(concil.correccionesPosteriores[0]).toMatchObject({
        pagoId: p.id, monto: 1200, anterior: fecha(-4), nueva: fecha(-2), motivo: 'Se entregó el domingo, según el propietario', efecto: 'sale',
      })
      expect(JSON.stringify(await db.cierreDia.findUniqueOrThrow({ where: { id: cierre.id } }))).toContain('1200')
    })

    it('una corrección ANTERIOR al cierre no se lista como posterior', async () => {
      const p = await pago({ real: -5, captura: -5 })
      expect((await llamar(p.id, { fechaPagoReal: fecha(-4), motivo: 'Corregido antes de cerrar' })).status).toBe(201)
      await db.cierreDia.create({ data: { fecha: dia(-4), cerradoPor: adminId, comisiones: 1200, reporte: { comisionesAuto: { pagadoRepartidores: 1200 } } } })
      const res = await consultarCierre(new NextRequest(`http://localhost/api/cierre?fecha=${fecha(-4)}`))
      const json = await res.json()
      expect((json.data?.cierre ?? json.cierre).conciliacionComisiones.correccionesPosteriores).toHaveLength(0)
    })
  })

  it('no toca el pago de comisiones de otros medios ni cambia su día de trabajo', async () => {
    const p = await pago({ real: -3, metodo: 'NEQUI' })
    expect((await llamar(p.id, { fechaPagoReal: fecha(-2), motivo: 'Pagado por Nequi otro día' })).status).toBe(201)
    expect(await comisionPagadaEnCaja(db, dia(-2), dia(-1))).toBe(0) // el dinero digital nunca resta de la caja
    expect(diaDe((await db.pagoComisionRepartidor.findUniqueOrThrow({ where: { id: p.id } })).fecha)).toBe(fecha(TRABAJO))
  })
})
