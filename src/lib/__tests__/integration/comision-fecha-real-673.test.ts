// @tests #673 #752 — trabajo, desembolso y captura son fechas diferentes. Solo datos sintéticos.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'

vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/notifications/notify-event', () => ({ notifyEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/realtime', () => ({ publishRealtimeEvent: vi.fn(async () => {}) }))

import { testPrisma as db, resetAndSeed, disconnect, getAdminUser, registrarBaseDia } from './setup'
import { POST } from '@/app/api/nomina/dia/pagar/route'
import { GET as consultarCierre, POST as cerrar } from '@/app/api/cierre/route'
import { comisionPagadaEnCaja, comisionPagadaOtrosMedios, pagadoComisionDia, leerPagosComisionCaja } from '@/lib/comision-pagada'
import { PARAMETROS_POR_DEFECTO, REGLAS } from '@/lib/integridad/reglas'
import { listarDiasPendientes } from '@/lib/cierre-huecos'
import { startOfDayBogota, todayStringBogota } from '@/lib/dates'

const hoy = todayStringBogota()
const dia = (offset: number) => new Date(startOfDayBogota(hoy).getTime() + offset * 86400000)
const fecha = (offset: number) => dia(offset).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
let adminId: string

async function trabajador() {
  const t = await db.trabajador.create({ data: { nombre: `Sellador sintético ${randomUUID()}`, rol: 'SELLADOR', tipoPago: 'COMISION' } })
  await db.produccion.create({ data: {
    trabajadorId: t.id, fecha: dia(-2), turno: 'MANANA', comSellTotal: 3300,
    items: { create: { producto: 'PACA_AGUA', conteoA: 10, conteoB: 10, producido: 10, comSellador: 3300 } },
  } })
  return t.id
}

const pagar = (trabajadorId: string, extra: Record<string, unknown> = {}) => POST(new NextRequest('http://localhost/api/nomina/dia/pagar', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ trabajadorId, fecha: fecha(-2), fechaPagoReal: fecha(-1), concepto: 'PRODUCCION', metodo: 'EFECTIVO', montoEsperado: 3300, offlineId: randomUUID(), ...extra }),
}))

describe('#673 — fecha real de desembolso de comisiones', () => {
  beforeAll(async () => { await resetAndSeed(); adminId = (await getAdminUser()).id })
  beforeEach(async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00Z' })
    await db.pagoComisionRepartidor.deleteMany({})
    await db.cierreDia.deleteMany({})
    await db.historial.deleteMany({ where: { entidad: 'PagoComisionRepartidor' } })
  })
  afterAll(disconnect)

  it('registra hoy un desembolso de ayer sin mover el trabajo ni descontar la caja de hoy', async () => {
    const id = await trabajador()
    const res = await pagar(id)
    expect(res.status).toBe(201)
    const cuerpo = await res.json()
    expect(cuerpo.pago.fechaPagoReal).toBe(fecha(-1))
    const p = await db.pagoComisionRepartidor.findFirstOrThrow({ where: { trabajadorId: id } })
    expect(p.fecha).toEqual(dia(-2))
    expect(p.createdAt.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })).toBe(hoy)
    expect(await comisionPagadaEnCaja(db, dia(-1), dia(0))).toBe(3300)
    expect(await comisionPagadaEnCaja(db, dia(0), dia(1))).toBe(0)
    expect(await pagadoComisionDia(db, id, fecha(-2))).toBe(3300)
    const auditoria = await db.historial.findFirstOrThrow({ where: { entidad: 'PagoComisionRepartidor', registroId: p.id, accion: 'CREATE' } })
    expect(JSON.parse(auditoria.datos)).toMatchObject({ fecha: fecha(-2), fechaPagoReal: fecha(-1), monto: 3300, metodo: 'EFECTIVO' })
  })

  it('el pago digital pertenece a su día real, no resta efectivo y sí descuenta lo ya pagado por ese trabajo', async () => {
    const id = await trabajador()
    expect((await pagar(id, { metodo: 'NEQUI' })).status).toBe(201)
    expect(await comisionPagadaEnCaja(db, dia(-1), dia(0))).toBe(0)
    expect(await comisionPagadaOtrosMedios(db, dia(-1), dia(0))).toBe(3300)
    expect(await comisionPagadaOtrosMedios(db, dia(0), dia(1))).toBe(0)
    expect(await pagadoComisionDia(db, id, fecha(-2))).toBe(3300)
  })

  it('no afirma una fecha física para un pago nuevo que no la proporciona', async () => {
    const res = await pagar(await trabajador(), { fechaPagoReal: undefined })
    expect(res.status).toBe(422)
    expect(await db.pagoComisionRepartidor.count()).toBe(0)
  })

  it.each([
    ['2026-02-31', 400],
    [fecha(1), 422],
  ])('rechaza fecha imposible o futura %s sin guardar dinero', async (fechaPagoReal, esperado) => {
    expect((await pagar(await trabajador(), { fechaPagoReal })).status).toBe(esperado)
    expect(await db.pagoComisionRepartidor.count()).toBe(0)
  })

  it('rechaza un desembolso nuevo en un día cerrado y conserva íntegro su snapshot', async () => {
    const id = await trabajador()
    const c = await db.cierreDia.create({ data: { fecha: dia(-1), comisiones: 87, reporte: { _version: '2.2', evidencia: 'conservar' } } })
    expect((await pagar(id)).status).toBe(409)
    expect(await db.pagoComisionRepartidor.count()).toBe(0)
    expect(await db.cierreDia.findUniqueOrThrow({ where: { id: c.id } })).toEqual(c)
  })

  it('repite el pago aceptado aun después del cierre, pero rechaza reutilizar su clave para otra fecha o medio', async () => {
    const id = await trabajador(), offlineId = randomUUID()
    expect((await pagar(id, { offlineId })).status).toBe(201)
    await db.cierreDia.create({ data: { fecha: dia(-1) } })
    expect((await pagar(id, { offlineId })).status).toBe(200)
    expect((await pagar(id, { offlineId, fechaPagoReal: hoy })).status).toBe(409)
    expect((await pagar(id, { offlineId, metodo: 'NEQUI' })).status).toBe(409)
    expect(await db.pagoComisionRepartidor.count()).toBe(1)
  })

  it('un reintento antiguo sin el campo nuevo conserva el pago aceptado', async () => {
    const id = await trabajador(), offlineId = randomUUID()
    await db.pagoComisionRepartidor.create({ data: { trabajadorId: id, fecha: dia(-2), monto: 3300, concepto: 'PRODUCCION', offlineId } })
    const res = await pagar(id, { offlineId, fechaPagoReal: undefined })
    expect(res.status).toBe(200)
    expect(await db.pagoComisionRepartidor.count()).toBe(1)
  })

  it('conserva el criterio de captura del legado y lo marca sin fecha física verificada', async () => {
    const id = await trabajador()
    await db.pagoComisionRepartidor.create({ data: { trabajadorId: id, fecha: dia(-2), monto: 3300, concepto: 'PRODUCCION', offlineId: randomUUID() } })
    const caja = await leerPagosComisionCaja(db, dia(0), dia(1))
    expect(caja).toMatchObject({ efectivo: 3300, otrosMedios: 0, sinFechaVerificada: 1 })
    expect(caja.pagos[0]).toMatchObject({ fechaTrabajo: fecha(-2), fechaPagoReal: null })
    expect(await comisionPagadaEnCaja(db, dia(-2), dia(-1))).toBe(0)
  })

  it('también protege una caja cerrada hoy', async () => {
    await db.cierreDia.create({ data: { fecha: dia(0) } })
    const res = await pagar(await trabajador(), { fechaPagoReal: hoy })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: { code: 'DIA_CERRADO' } })
    expect(await db.pagoComisionRepartidor.count()).toBe(0)
  })

  it('una fecha omitida sigue admitiendo su desembolso aunque exista un cierre posterior (#306)', async () => {
    await db.cierreDia.create({ data: { fecha: dia(0) } })
    expect((await pagar(await trabajador())).status).toBe(201)
    expect(await comisionPagadaEnCaja(db, dia(-1), dia(0))).toBe(3300)
  })

  it('no reutiliza la clave aceptada para otro importe, trabajador o concepto', async () => {
    const id = await trabajador(), otro = await trabajador(), offlineId = randomUUID()
    expect((await pagar(id, { offlineId })).status).toBe(201)
    expect((await pagar(id, { offlineId, montoEsperado: 3200 })).status).toBe(409)
    expect((await pagar(id, { offlineId, concepto: 'REPARTO' })).status).toBe(409)
    expect((await pagar(otro, { offlineId })).status).toBe(409)
    expect(await db.pagoComisionRepartidor.count()).toBe(1)
  })

  it('dos solicitudes concurrentes de pago no duplican lo pendiente', async () => {
    const id = await trabajador()
    const respuestas = await Promise.all([pagar(id), pagar(id)])
    expect(respuestas.map(r => r.status).sort()).toEqual([201, 409])
    expect(await db.pagoComisionRepartidor.count()).toBe(1)
    expect(await comisionPagadaEnCaja(db, dia(-1), dia(0))).toBe(3300)
  })

  it('el cierre y el pago concurrentes no dejan un desembolso fuera del snapshot', async () => {
    const id = await trabajador()
    await registrarBaseDia(fecha(-1), 10000)
    const [pago, cierre] = await Promise.all([pagar(id), cerrar(new NextRequest('http://localhost/api/cierre', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        fecha: fecha(-1), baseDia: 10000, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
        stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
      }),
    }))])
    expect(cierre.status, JSON.stringify(await cierre.json())).toBe(201)
    expect([201, 409]).toContain(pago.status)
    const c = await db.cierreDia.findUniqueOrThrow({ where: { fecha: dia(-1) } })
    expect(Number(c.comisiones)).toBe(pago.status === 201 ? 3300 : 0)
    expect(await comisionPagadaEnCaja(db, dia(-1), dia(0))).toBe(Number(c.comisiones))
    expect(c.reporte).toMatchObject({ _version: '2.3' })
  })

  it('reintenta el cierre si Prisma comunica P2034 solo en code, sin ese texto en el mensaje', async () => {
    await registrarBaseDia(fecha(-1), 10000)
    // Inyección real de SQLSTATE 40001. nextval no se revierte, así que solo falla el primer intento.
    // No se espía el cliente Prisma (su proxy altera el binding de $transaction al restaurarlo).
    await db.$executeRawUnsafe('CREATE SEQUENCE test_retry_cierre_673')
    await db.$executeRawUnsafe(`CREATE FUNCTION test_retry_cierre_673() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF nextval('test_retry_cierre_673') = 1 THEN RAISE EXCEPTION 'Conflicto sintético de serialización' USING ERRCODE = '40001'; END IF;
        RETURN NEW;
      END $$`)
    await db.$executeRawUnsafe('CREATE TRIGGER test_retry_cierre_673 BEFORE INSERT ON "CierreDia" FOR EACH ROW EXECUTE FUNCTION test_retry_cierre_673()')
    try {
      const res = await cerrar(new NextRequest('http://localhost/api/cierre', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          fecha: fecha(-1), baseDia: 10000, stockIniAgua: 0, prodAgua: 0, stockFinAgua: 0,
          stockIniHielo: 0, prodHielo: 0, stockFinHielo: 0,
        }),
      }))
      expect(res.status).toBe(201)
      expect(await db.$queryRawUnsafe<Array<{ last_value: bigint }>>('SELECT last_value FROM test_retry_cierre_673')).toEqual([{ last_value: 2n }])
      expect(await db.cierreDia.count({ where: { fecha: dia(-1) } })).toBe(1)
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER test_retry_cierre_673 ON "CierreDia"')
      await db.$executeRawUnsafe('DROP FUNCTION test_retry_cierre_673()')
      await db.$executeRawUnsafe('DROP SEQUENCE test_retry_cierre_673')
    }
  })

  it('consulta la conciliación actual sin sobrescribir un cierre histórico', async () => {
    const id = await trabajador()
    expect((await pagar(id)).status).toBe(201)
    // Snapshot real de esta versión: V16 compara su subtotal de efectivo, no un JSON sin comisionesAuto.
    const c = await db.cierreDia.create({ data: { fecha: dia(-1), comisiones: 0, reporte: { _version: '2.2', evidencia: 'original', comisionesAuto: { pagadoRepartidores: 0 } } } })
    const res = await consultarCierre(new NextRequest(`http://localhost/api/cierre?fecha=${fecha(-1)}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'CERRADO', cierre: {
      comisiones: 0, evidencia: 'original', _version: '2.2',
      conciliacionComisiones: { original: 0, actual: 3300, diferencia: 3300, sinFechaVerificada: 0 },
    } })
    expect(await db.cierreDia.findUniqueOrThrow({ where: { id: c.id } })).toEqual(c)
    const v16 = REGLAS.find(r => r.id === 'V16')!
    const discrepancias = await db.$queryRaw<Array<{ ref: string }>>(v16.consulta(PARAMETROS_POR_DEFECTO))
    expect(discrepancias.map(d => d.ref)).toContain(c.id)
  })

  it('la verificación no omite los snapshots 2.3', async () => {
    const c = await db.cierreDia.create({ data: { fecha: dia(-1), totalVentas: 1, reporte: {
      _version: '2.3', totalVentas: 999, cobrado: 0, fiado: 0, efectivo: 0, transferencia: 0,
      nequi: 0, daviplata: 0, bono: 0, totalGastos: 0, netoCaja: 0,
    } } })
    const v18 = REGLAS.find(r => r.id === 'V18')!
    const hallazgos = await db.$queryRaw<Array<{ ref: string; detalle: { campo: string } }>>(v18.consulta(PARAMETROS_POR_DEFECTO))
    expect(hallazgos).toEqual([expect.objectContaining({ ref: c.id, detalle: expect.objectContaining({ campo: 'totalVentas' }) })])
  })

  it('la base rechaza una hora que pretenda pasar como día físico normalizado', async () => {
    const id = await trabajador()
    await expect(db.pagoComisionRepartidor.create({ data: {
      trabajadorId: id, fecha: dia(-2), fechaPagoReal: new Date(dia(-1).getTime() + 60000), monto: 3300, offlineId: randomUUID(),
    } })).rejects.toThrow('PagoComisionRepartidor_fechaPagoReal_dia_check')
    expect(await db.pagoComisionRepartidor.count()).toBe(0)
  })

  it('un día con solo desembolso de comisión queda como obligatorio aunque la captura ocurra hoy', async () => {
    await db.cierreDia.create({ data: { fecha: dia(-4) } })
    expect((await pagar(await trabajador())).status).toBe(201)
    const pendientes = await listarDiasPendientes(db, hoy)
    expect(pendientes.find(p => p.fecha === fecha(-1))).toMatchObject({ obligatorio: true, operaciones: 1 })
  })

  it('si no puede guardar la auditoría, tampoco guarda el desembolso', async () => {
    const id = await trabajador()
    await db.$executeRaw`ALTER TABLE "Historial" ADD CONSTRAINT test_audit_comision_673 CHECK (entidad <> 'PagoComisionRepartidor') NOT VALID`
    try {
      expect((await pagar(id)).status).toBe(500)
      expect(await db.pagoComisionRepartidor.count()).toBe(0)
    } finally {
      await db.$executeRaw`ALTER TABLE "Historial" DROP CONSTRAINT test_audit_comision_673`
    }
  })

  it('no permite que ASISTENTE registre desembolsos', async () => {
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ASISTENTE' }, expires: '2099-01-01T00:00:00Z' })
    expect((await pagar(await trabajador())).status).toBe(403)
    expect(await db.pagoComisionRepartidor.count()).toBe(0)
  })
})
