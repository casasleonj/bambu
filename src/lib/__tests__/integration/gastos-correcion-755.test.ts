// #755: Prisma/PostgreSQL real. Nunca modificar datos reales del negocio.
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { resetAndSeed, disconnect, testPrisma, getAdminUser } from './setup'
import { startOfDayInBogota } from '@/lib/date-helpers'

const actor = { id: 'pendiente', role: 'ADMIN' }
vi.mock('@/lib/auth-check', () => ({
  requireRole: vi.fn(async () => ({ user: actor })),
}))
vi.mock('@/lib/realtime', () => ({
  publishRealtimeEvent: vi.fn(async () => {}),
}))
import { PATCH } from '@/app/api/gastos/[id]/route'

const FECHA = '2030-04-15'
const FECHA_CERRADA = '2030-04-16'

function solicitud(id: string, payload: object) {
  return PATCH(new NextRequest(`http://localhost/api/gastos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }), { params: Promise.resolve({ id }) })
}

async function crearGasto(data: { fecha?: string; categoria?: string; descripcion?: string; monto?: number; esPagoPersonal?: boolean } = {}) {
  return testPrisma.gasto.create({
    data: {
      fecha: startOfDayInBogota(data.fecha ?? FECHA),
      categoria: data.categoria ?? 'OTRO',
      descripcion: data.descripcion ?? 'Gasto operativo de prueba',
      monto: data.monto ?? 100,
      ...(data.esPagoPersonal ? { esPagoPersonal: true } : {}),
    },
  })
}

const editar = (version: number, monto: number) => ({
  accion: 'EDITAR', version, motivo: 'Corregir error de digitación',
  categoria: 'OTRO', descripcion: 'Corrección verificada',
  monto, responsable: 'Administración', notas: 'Comprobante revisado',
})

describe('#755 corrección y anulación de gastos operativos (PG real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    actor.id = (await getAdminUser()).id
  })
  afterAll(async () => { await disconnect() })

  it('corrige monto y datos de día abierto, conserva fecha y audita antes/después', async () => {
    const previo = await crearGasto()
    const respuesta = await solicitud(previo.id, editar(0, 120.50))
    expect(respuesta.status).toBe(200)
    const actualizado = await testPrisma.gasto.findUniqueOrThrow({ where: { id: previo.id } })
    expect(Number(actualizado.monto)).toBe(120.50)
    expect(actualizado.version).toBe(1)
    expect(actualizado.fecha.toISOString()).toBe(previo.fecha.toISOString())
    const historia = await testPrisma.historial.findFirst({
      where: { entidad: 'Gasto', registroId: previo.id, accion: 'UPDATE' },
    })
    expect(historia?.usuarioId).toBe(actor.id)
    const cambios = JSON.parse(historia?.datos ?? '{}')
    expect(cambios.antes.monto).toBe(100)
    expect(cambios.despues.monto).toBe(120.50)
  })

  it('dos editores con la misma versión no se pisan ni repiten corrección', async () => {
    const previo = await crearGasto()
    const primera = await solicitud(previo.id, editar(0, 105))
    const repetida = await solicitud(previo.id, editar(0, 115))
    expect(primera.status).toBe(200)
    expect(repetida.status).toBe(409)
    expect((await repetida.json()).error.code).toBe('GASTO_CONFLICTO')
    const guardado = await testPrisma.gasto.findUniqueOrThrow({ where: { id: previo.id } })
    expect(Number(guardado.monto)).toBe(105)
    expect(guardado.version).toBe(1)
  })

  it('anula solo registro no real/duplicado, sin borrar la fila ni perder el monto anterior', async () => {
    const previo = await crearGasto({ monto: 70 })
    const payload = {
      accion: 'ANULAR', version: 0, motivo: 'Se digitó por duplicado el comprobante',
      motivoOrigen: 'REGISTRO_DUPLICADO', confirmarOperacionNoReal: true,
    }
    const respuesta = await solicitud(previo.id, payload)
    expect(respuesta.status).toBe(200)
    const anulado = await testPrisma.gasto.findUniqueOrThrow({ where: { id: previo.id } })
    expect(Number(anulado.monto)).toBe(0)
    expect(Number(anulado.montoAntesAnular)).toBe(70)
    expect(anulado.anuladoAt).not.toBeNull()
    expect(anulado.version).toBe(1)
    expect(await testPrisma.historial.count({ where: { entidad: 'Gasto', registroId: previo.id, accion: 'DELETE' } })).toBe(1)
    const repetida = await solicitud(previo.id, payload)
    expect(repetida.status).toBe(409)
    expect(await testPrisma.historial.count({ where: { entidad: 'Gasto', registroId: previo.id, accion: 'DELETE' } })).toBe(1)
  })

  it('rechaza anular si no confirman que el movimiento no fue una salida de dinero adicional', async () => {
    const gasto = await crearGasto()
    const r = await solicitud(gasto.id, {
      accion: 'ANULAR', version: 0,
      motivo: 'No tiene evidencia de reintegro efectivo',
      motivoOrigen: 'DINERO_NO_SALIO',
    })
    expect(r.status).toBe(400)
    expect(Number((await testPrisma.gasto.findUniqueOrThrow({ where: { id: gasto.id } })).monto)).toBe(100)
  })

  it('rechaza importes con fracciones inferiores a un centavo', async () => {
    const gasto = await crearGasto()
    const r = await solicitud(gasto.id, editar(0, 100.123))
    expect(r.status).toBe(400)
  })

  it('no permite editar Nómina, reversión histórica de Nómina ni gasto identificado de personal', async () => {
    const nomina = await crearGasto({ categoria: 'NOMINA' })
    const reverso = await crearGasto({ descripcion: 'Reversión nómina anulada - caso sintético' })
    const importado = await crearGasto({ esPagoPersonal: true })
    for (const gasto of [nomina, reverso, importado]) {
      const r = await solicitud(gasto.id, editar(0, 15))
      expect(r.status).toBe(422)
      expect((await r.json()).error.code).toBe('GASTO_OTRO_MODULO')
    }
  })

  it('un cierre guardado impide corregir y anular; no modifica dinero ni snapshot', async () => {
    const gasto = await crearGasto({ fecha: FECHA_CERRADA })
    await testPrisma.cierreDia.create({
      data: { fecha: startOfDayInBogota(FECHA_CERRADA), cerradoPor: actor.id },
    })
    const r = await solicitud(gasto.id, editar(0, 15))
    expect(r.status).toBe(409)
    expect((await r.json()).error.code).toBe('GASTO_DIA_CERRADO')
    const anulado = await solicitud(gasto.id, {
      accion: 'ANULAR', version: 0,
      motivo: 'Registro duplicado de un cierre histórico',
      motivoOrigen: 'REGISTRO_DUPLICADO', confirmarOperacionNoReal: true,
    })
    expect(anulado.status).toBe(409)
    const guardado = await testPrisma.gasto.findUniqueOrThrow({ where: { id: gasto.id } })
    expect(Number(guardado.monto)).toBe(100)
    expect(guardado.anuladoAt).toBeNull()
  })
})
