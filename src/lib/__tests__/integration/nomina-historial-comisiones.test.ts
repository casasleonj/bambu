// @tests #1010 F1 — consulta real PostgreSQL, sin pagos nuevos por leer.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))
const mockAuth = vi.fn()
vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))

import { testPrisma, resetAndSeed, disconnect, getAdminUser } from './setup'
import { GET } from '@/app/api/nomina/comisiones/route'
import { startOfDayBogota } from '@/lib/dates'
import { crearPedidoUseCase } from '@/modules/pedidos'
import { randomUUID } from 'crypto'

let adminId: string
let trabajadorId: string
const trabajo = '2026-10-20'
const pago1 = '2026-10-21'
const pago2 = '2026-10-22'
const dia = startOfDayBogota
const como = (role: string) => mockAuth.mockResolvedValue({ user: { id: adminId, role }, expires: '2099-01-01T00:00:00.000Z' })
const consultar = (query: string) => GET(new NextRequest('http://localhost/api/nomina/comisiones?' + query))
const detalle = (concepto: string) => consultar('modo=detalle&trabajadorId=' + trabajadorId + '&fechaTrabajo=' + trabajo + '&concepto=' + concepto)
const rango = (desde: string, hasta: string, porFecha = 'TRABAJO') =>
  'trabajadorId=' + trabajadorId + '&desde=' + desde + '&hasta=' + hasta + '&porFecha=' + porFecha

describe('#1010 historial de comisiones', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    trabajadorId = (await testPrisma.trabajador.create({ data: {
      nombre: 'Trabajador histórico sintético', rol: 'SELLADOR', activo: false, usaMoto: true,
      comPacaAgua: 999, comRepartAgua: 999,
    } })).id
    await testPrisma.pagoComisionRepartidor.createMany({ data: [
      { trabajadorId, fecha: dia(trabajo), fechaPagoReal: dia(pago1), monto: 20000, metodo: 'EFECTIVO', concepto: 'REPARTO', pagadoPorId: adminId },
      { trabajadorId, fecha: dia(trabajo), fechaPagoReal: dia(pago2), monto: 35500, metodo: 'NEQUI', concepto: 'REPARTO', pagadoPorId: adminId },
      { trabajadorId, fecha: dia(trabajo), fechaPagoReal: null, createdAt: new Date('2026-10-22T04:59:59Z'), monto: 133000, metodo: 'EFECTIVO', concepto: 'PRODUCCION' },
    ] })
    await testPrisma.produccion.create({ data: { trabajadorId, fecha: dia(trabajo), turno: 'JORNADA', comSellTotal: 133000,
      items: { create: [
        { producto: 'PACA_AGUA', producido: 400, comSellador: 120000 },
        { producto: 'PACA_HIELO', producido: 20, comSellador: 8000 },
        { producto: 'BOTELLON', producido: 10, comSellador: 5000 },
      ] },
    } })
  })
  afterAll(async () => { await disconnect() })
  beforeEach(() => como('ADMIN'))

  it('agrupa por jornada y concepto, mantiene totales sin depender de página', async () => {
    const res = await consultar(rango(trabajo, trabajo) + '&tamano=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    const body = await res.json()
    expect(body.resumen.monto).toBe(188500)
    expect(body.totalJornadas).toBe(2)
    expect(body.jornadas).toHaveLength(1)
    const siguiente = await (await consultar(rango(trabajo, trabajo) + '&tamano=1&pagina=2')).json()
    expect(siguiente.resumen).toEqual(body.resumen)
    expect(siguiente.jornadas[0].concepto).not.toBe(body.jornadas[0].concepto)
  })

  it('filtro por desembolso incluye captura legado sin afirmar fecha real; no recorta total de jornada', async () => {
    const body = await (await consultar(rango(pago1, pago1, 'PAGO'))).json()
    const reparto = body.jornadas.find((g: { concepto: string }) => g.concepto === 'REPARTO')
    const produccion = body.jornadas.find((g: { concepto: string }) => g.concepto === 'PRODUCCION')
    expect(reparto.subtotalFiltro.monto).toBe(20000)
    expect(reparto.totalJornada.monto).toBe(55500)
    expect(reparto.pagos).toHaveLength(1)
    expect(produccion.pagos[0].fechaPagoReal).toBeNull()
    expect(body.resumen.sinFechaVerificada).toBe(1)
    expect(body.resumen.monto).toBe(153000)
  })

  it('detalle de producción muestra cantidades, importes y tarifa implícita, no tarifa actual ni evidencia de pago', async () => {
    const res = await detalle('PRODUCCION')
    expect(res.status).toBe(200)
    const d = (await res.json()).detalle
    expect(d.evidenciaAlPagar).toBe('NO_VERIFICADA')
    expect(d.trabajo.evidencia).toBe('REGISTRO_OPERATIVO_ACTUAL')
    expect(d.trabajo.totalRegistrado).toBe(133000)
    expect(d.trabajo.registros[0].items.find((i: { producto: string }) => i.producto === 'PACA_AGUA'))
      .toMatchObject({ unidades: 400, tarifaImplicita: 300, importe: 120000 })
  })

  it('pago histórico sin fuentes de reparto no se pierde ni certifica cálculo histórico', async () => {
    const res = await detalle('REPARTO')
    expect(res.status).toBe(200)
    const d = (await res.json()).detalle
    expect(d.totalJornada.monto).toBe(55500)
    expect(d.pagos).toHaveLength(2)
    expect(d.trabajo.hayFuentes).toBe(false)
    expect(d.evidenciaAlPagar).toBe('NO_VERIFICADA')
  })

  it('recupera el pedido de reparto histórico sin confundir la tarifa vigente con la tarifa al pagar', async () => {
    const t = await testPrisma.trabajador.create({ data: {
      nombre: 'Repartidor detalle sintético', rol: 'REPARTIDOR', usaMoto: true,
      tipoPago: 'COMISION', comRepartAgua: 300,
    } })
    const c = await testPrisma.cliente.create({ data: {
      nombre: 'Cliente historial sintético', telefono: '3001230099', direccion: 'Calle 1 # 2-3',
      barrio: 'Centro', limitePedidosFiados: 20, activo: true,
    } })
    const { pedido } = await crearPedidoUseCase.execute({
      clienteId: c.id, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }], pagos: [],
      createdById: adminId, createdByRole: 'ADMIN', offlineId: randomUUID(),
    })
    await testPrisma.pedido.update({ where: { id: pedido.id }, data: {
      estadoEntrega: 'ENTREGADO', estado: 'ENTREGADO', cPacaAguaEnt: 5,
      entregadoAt: dia(trabajo), entregadoPorId: t.id,
    } })
    await testPrisma.pagoComisionRepartidor.create({ data: {
      trabajadorId: t.id, fecha: dia(trabajo), fechaPagoReal: dia(pago1), monto: 1250,
      metodo: 'EFECTIVO', concepto: 'REPARTO',
    } })
    const res = await consultar('modo=detalle&trabajadorId=' + t.id + '&fechaTrabajo=' + trabajo + '&concepto=REPARTO')
    expect(res.status).toBe(200)
    const d = (await res.json()).detalle
    expect(d.totalJornada.monto).toBe(1250)
    expect(d.evidenciaAlPagar).toBe('NO_VERIFICADA')
    expect(d.trabajo.evidencia).toBe('CALCULO_ACTUAL_NO_HISTORICO')
    expect(d.trabajo.calculo).toMatchObject({ entregasAgua: 5, comAgua: 1500, total: 1500, tarifas: { agua: 300 } })
    expect(d.trabajo.calculo.fuentes[0].pedidos[0]).toMatchObject({ id: pedido.id, unidades: { agua: 5 } })
  })

  it('la lectura no crea pagos, gastos ni nóminas', async () => {
    const conteos = () => Promise.all([testPrisma.pagoComisionRepartidor.count(), testPrisma.gasto.count(), testPrisma.nomina.count()])
    const antes = await conteos()
    await consultar(rango(trabajo, trabajo))
    await detalle('PRODUCCION')
    expect(await conteos()).toEqual(antes)
  })

  it('rechaza filtros inválidos y roles no autorizados', async () => {
    expect((await consultar('desde=2026-02-30')).status).toBe(400)
    expect((await consultar('tamano=0')).status).toBe(400)
    expect((await consultar('modo=detalle')).status).toBe(400)
    como('ASISTENTE')
    expect((await consultar(rango(trabajo, trabajo))).status).toBe(403)
    expect((await detalle('PRODUCCION')).status).toBe(403)
    como('CONTADOR')
    expect((await consultar(rango(trabajo, trabajo))).status).toBe(200)
    mockAuth.mockResolvedValue({ user: { id: adminId, role: 'ADMIN', mustChangePassword: true }, expires: '2099-01-01T00:00:00.000Z' })
    expect((await consultar(rango(trabajo, trabajo))).status).toBe(403)
    expect((await detalle('PRODUCCION')).status).toBe(403)
    mockAuth.mockResolvedValue(null)
    expect((await consultar(rango(trabajo, trabajo))).status).toBe(401)
  })
})
