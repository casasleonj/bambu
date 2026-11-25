// @tests #1010 F2A: persistencia real del cálculo al registrar el pago.
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
import { POST } from '@/app/api/nomina/dia/pagar/route'
import { GET } from '@/app/api/nomina/comisiones/route'
import { POST as corregirFecha } from '@/app/api/nomina/pagos-comision/[id]/corregir-fecha/route'
import { startOfDayBogota, todayStringBogota } from '@/lib/dates'
import { crearPedidoUseCase } from '@/modules/pedidos'
let adminId: string
let clienteId: string
const hoy = todayStringBogota()
const pagar = (trabajadorId: string, concepto: string, offlineId: string, montoEsperado: number) =>
  POST(new NextRequest('http://localhost/api/nomina/dia/pagar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trabajadorId, concepto, fecha: hoy, fechaPagoReal: hoy, offlineId, montoEsperado }) }))
const leer = async (trabajadorId: string, concepto: string, fechaTrabajo = hoy) => {
  const res = await GET(new NextRequest('http://localhost/api/nomina/comisiones?modo=detalle&trabajadorId=' + trabajadorId + '&fechaTrabajo=' + fechaTrabajo + '&concepto=' + concepto))
  expect(res.status).toBe(200)
  return (await res.json()).detalle
}

describe('#1010 F2A evidencia histórica prospectiva', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    clienteId = (await testPrisma.cliente.create({ data: { nombre: 'Cliente evidencia sintético', telefono: '3001230088',
      direccion: 'Calle 1 # 2-3', barrio: 'Centro', limitePedidosFiados: 20, activo: true } })).id
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN' }, expires: '2099-01-01T00:00:00.000Z' }))

  it('pago de reparto conserva tarifa original después de cambiar configuración, incluso con reintento', async () => {
    const t = await testPrisma.trabajador.create({ data: { nombre: 'Repartidor evidencia', rol: 'REPARTIDOR', usaMoto: true,
      tipoPago: 'COMISION', comRepartAgua: 300 } })
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO', items: [{ producto: 'PACA_AGUA', cantidad: 5 }],
      pagos: [], createdById: adminId, createdByRole: 'ADMIN', offlineId: randomUUID(),
    })
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: { estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO',
      cPacaAguaEnt: 5, entregadoAt: new Date(), entregadoPorId: t.id } })
    const clave = randomUUID()
    const res = await pagar(t.id, 'REPARTO', clave, 1500)
    expect(res.status).toBe(201)
    const id = (await res.json()).pago.id
    const original = await testPrisma.pagoComisionEvidencia.findUniqueOrThrow({ where: { pagoId: id } })
    expect(original.datos).toMatchObject({ totalCentavos: 150000, desembolsoCentavos: 150000,
      detalle: { tipo: 'REPARTO', tarifasCentavos: { agua: 30000 }, unidades: { agua: 5 } } })
    await testPrisma.trabajador.update({ where: { id: t.id }, data: { comRepartAgua: 330 } })
    expect((await pagar(t.id, 'REPARTO', clave, 1500)).status).toBe(200)
    expect(await testPrisma.pagoComisionEvidencia.findUnique({ where: { pagoId: id } })).toEqual(original)
    expect(await testPrisma.pagoComisionRepartidor.count({ where: { trabajadorId: t.id } })).toBe(1)
    const d = await leer(t.id, 'REPARTO')
    expect(d.totalJornada.monto).toBe(1500)
    expect(d.trabajo.calculo.tarifas.agua).toBe(330)
    expect(d.evidenciasAlRegistrar).toEqual([{ pagoId: id, estado: 'REGISTRADA', evidencia: original.datos }])
  })

  it('producción con dos pagos conserva versiones acumuladas separadas y no duplica dinero', async () => {
    const t = await testPrisma.trabajador.create({ data: { nombre: 'Sellador evidencia', rol: 'SELLADOR', tipoPago: 'COMISION' } })
    const pr = await testPrisma.produccion.create({ data: { trabajadorId: t.id, fecha: startOfDayBogota(hoy),
      turno: 'MANANA', comSellTotal: 600, items: { create: [{ producto: 'PACA_AGUA', producido: 2, comSellador: 600 }] } } })
    const a = await pagar(t.id, 'PRODUCCION', randomUUID(), 600)
    expect(a.status).toBe(201)
    const idA = (await a.json()).pago.id
    await testPrisma.produccion.create({ data: { trabajadorId: t.id, fecha: startOfDayBogota(hoy), turno: 'TARDE',
      comSellTotal: 330, items: { create: [{ producto: 'PACA_AGUA', producido: 1, comSellador: 330 }] } } })
    const b = await pagar(t.id, 'PRODUCCION', randomUUID(), 330)
    expect(b.status).toBe(201)
    const idB = (await b.json()).pago.id
    // Una modificación posterior de la fuente no altera la evidencia de lo registrado.
    await testPrisma.produccion.update({ where: { id: pr.id }, data: { comSellTotal: 900 } })
    const d = await leer(t.id, 'PRODUCCION')
    expect(d.totalJornada.monto).toBe(930)
    expect(d.evidenciasAlRegistrar.find((e: { pagoId: string }) => e.pagoId === idA)).toMatchObject({
      estado: 'REGISTRADA', evidencia: { totalCentavos: 60000, desembolsoCentavos: 60000,
        detalle: { registros: [{ id: pr.id, items: [{ unidades: 2, tarifaImplicitaCentavos: 30000 }] }] } },
    })
    expect(d.evidenciasAlRegistrar.find((e: { pagoId: string }) => e.pagoId === idB)).toMatchObject({
      estado: 'REGISTRADA', evidencia: { alcance: 'JORNADA_ACUMULADA', totalCentavos: 93000,
        pagadoAntesCentavos: 60000, desembolsoCentavos: 33000 },
    })
    expect(d.trabajo.totalRegistrado).toBe(1230)
  })

  it('legado sin evidencia no se reconstruye ni genera registros nuevos al leer', async () => {
    const t = await testPrisma.trabajador.create({ data: { nombre: 'Legado evidencia', rol: 'SELLADOR' } })
    const p = await testPrisma.pagoComisionRepartidor.create({ data: { trabajadorId: t.id, fecha: startOfDayBogota(hoy),
      monto: 300, concepto: 'PRODUCCION' } })
    const d = await leer(t.id, 'PRODUCCION')
    expect(d.evidenciasAlRegistrar).toEqual([{ pagoId: p.id, estado: 'NO_VERIFICADA', evidencia: null }])
    expect(await testPrisma.pagoComisionEvidencia.findUnique({ where: { pagoId: p.id } })).toBeNull()
  })

  it('el trigger SQL impide editar y eliminar evidencia; FK y PK protegen la identidad del pago', async () => {
    const t = await testPrisma.trabajador.create({ data: { nombre: 'Sellador inmutabilidad', rol: 'SELLADOR', tipoPago: 'COMISION' } })
    await testPrisma.produccion.create({ data: { trabajadorId: t.id, fecha: startOfDayBogota(hoy),
      turno: 'JORNADA', comSellTotal: 300, items: { create: [{ producto: 'PACA_AGUA', producido: 1, comSellador: 300 }] } } })
    const res = await pagar(t.id, 'PRODUCCION', randomUUID(), 300)
    expect(res.status).toBe(201)
    const pagoId = (await res.json()).pago.id
    const original = await testPrisma.pagoComisionEvidencia.findUniqueOrThrow({ where: { pagoId } })
    await expect(testPrisma.pagoComisionEvidencia.update({ where: { pagoId }, data: { datos: { version: 99 } } })).rejects.toThrow()
    await expect(testPrisma.pagoComisionEvidencia.delete({ where: { pagoId } })).rejects.toThrow()
    await expect(testPrisma.pagoComisionRepartidor.delete({ where: { id: pagoId } })).rejects.toThrow()
    await expect(testPrisma.pagoComisionEvidencia.create({ data: { pagoId, datos: {} } })).rejects.toThrow()
    await expect(testPrisma.pagoComisionEvidencia.create({ data: { pagoId: randomUUID(), datos: {} } })).rejects.toThrow()
    expect(await testPrisma.pagoComisionEvidencia.findUnique({ where: { pagoId } })).toEqual(original)
  })

  it('dos solicitudes concurrentes no duplican ni el pago ni la evidencia', async () => {
    const t = await testPrisma.trabajador.create({ data: { nombre: 'Sellador concurrencia evidencia', rol: 'SELLADOR', tipoPago: 'COMISION' } })
    await testPrisma.produccion.create({ data: { trabajadorId: t.id, fecha: startOfDayBogota(hoy),
      turno: 'JORNADA', comSellTotal: 600, items: { create: [{ producto: 'PACA_AGUA', producido: 2, comSellador: 600 }] } } })
    const [a, b] = await Promise.all([pagar(t.id, 'PRODUCCION', randomUUID(), 600), pagar(t.id, 'PRODUCCION', randomUUID(), 600)])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    const pagos = await testPrisma.pagoComisionRepartidor.findMany({ where: { trabajadorId: t.id }, include: { evidencia: true } })
    expect(pagos).toHaveLength(1)
    expect(Number(pagos[0].monto)).toBe(600)
    expect(pagos[0].evidencia?.datos).toMatchObject({ desembolsoCentavos: 60000 })
  })


  it('corregir el desembolso por el endpoint real conserva la evidencia, jornada y dinero', async () => {
    const anterior = new Date(startOfDayBogota(hoy).getTime() - 2 * 86_400_000)
    const trabajo = anterior.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const corregida = new Date(anterior.getTime() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    const t = await testPrisma.trabajador.create({ data: { nombre: 'Sellador corrección evidencia', rol: 'SELLADOR', tipoPago: 'COMISION' } })
    await testPrisma.produccion.create({ data: { trabajadorId: t.id, fecha: anterior, turno: 'JORNADA',
      comSellTotal: 300, items: { create: [{ producto: 'PACA_AGUA', producido: 1, comSellador: 300 }] } } })
    const res = await POST(new NextRequest('http://localhost/api/nomina/dia/pagar', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trabajadorId: t.id, concepto: 'PRODUCCION',
        fecha: trabajo, fechaPagoReal: hoy, montoEsperado: 300, offlineId: randomUUID() }) }))
    expect(res.status).toBe(201)
    const id = (await res.json()).pago.id
    const original = await testPrisma.pagoComisionEvidencia.findUniqueOrThrow({ where: { pagoId: id } })
    const corregir = await corregirFecha(new NextRequest('http://localhost/api/nomina/pagos-comision/' + id + '/corregir-fecha', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fechaPagoReal: corregida, motivo: 'Corrección sintética de evidencia', offlineId: randomUUID() }),
    }), { params: Promise.resolve({ id }) })
    expect(corregir.status).toBe(201)
    const d = await leer(t.id, 'PRODUCCION', trabajo)
    expect(d.pagos[0]).toMatchObject({ id, fechaTrabajo: trabajo, fechaPagoReal: corregida, monto: 300 })
    expect(d.evidenciasAlRegistrar).toEqual([{ pagoId: id, estado: 'REGISTRADA', evidencia: original.datos }])
    expect(await testPrisma.pagoComisionEvidencia.findUnique({ where: { pagoId: id } })).toEqual(original)
  })

  it('si falla la escritura de evidencia en PostgreSQL, revierte el pago y no deja auditoría fantasma', async () => {
    const t = await testPrisma.trabajador.create({ data: { nombre: 'Sellador rollback evidencia', rol: 'SELLADOR', tipoPago: 'COMISION' } })
    await testPrisma.produccion.create({ data: { trabajadorId: t.id, fecha: startOfDayBogota(hoy), turno: 'JORNADA',
      comSellTotal: 300, items: { create: [{ producto: 'PACA_AGUA', producido: 1, comSellador: 300 }] } } })
    // Solo en el PostgreSQL aislado de integración; la función falla para esta identidad sintética.
    const clave = randomUUID()
    const antes = await testPrisma.historial.count({ where: { entidad: 'PagoComisionRepartidor', accion: 'CREATE' } })
    await testPrisma.$executeRawUnsafe(`CREATE FUNCTION public.test_1010_falla_evidencia() RETURNS trigger LANGUAGE plpgsql AS $falla1010$
      BEGIN IF NEW.datos->>'trabajadorId' = TG_ARGV[0] THEN RAISE EXCEPTION 'Fallo sintético de evidencia'; END IF; RETURN NEW; END; $falla1010$`)
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(t.id)) throw new Error('ID sintético inválido')
      await testPrisma.$executeRawUnsafe(`CREATE TRIGGER test_1010_falla_evidencia BEFORE INSERT ON "PagoComisionEvidencia" FOR EACH ROW EXECUTE FUNCTION public.test_1010_falla_evidencia('${t.id}')`)
      const res = await pagar(t.id, 'PRODUCCION', clave, 300)
      expect(res.status).toBe(500)
      expect(await testPrisma.pagoComisionRepartidor.findUnique({ where: { offlineId: clave } })).toBeNull()
      expect(await testPrisma.historial.count({ where: { entidad: 'PagoComisionRepartidor', accion: 'CREATE' } })).toBe(antes)
    } finally {
      await testPrisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_1010_falla_evidencia ON "PagoComisionEvidencia"')
      await testPrisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS public.test_1010_falla_evidencia()')
    }
    expect((await pagar(t.id, 'PRODUCCION', clave, 300)).status).toBe(201)
    const p = await testPrisma.pagoComisionRepartidor.findUniqueOrThrow({ where: { offlineId: clave }, include: { evidencia: true } })
    expect(p.evidencia?.datos).toMatchObject({ desembolsoCentavos: 30000 })
  })

})
