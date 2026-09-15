// @tests F4 (Cumplimiento) — ReprogramarObligacionPendienteUseCase contra
// Postgres real. Cubre los 9 criterios exigidos por el equipo
// (docs/AGUA_BAMBU_F4_DISENO_TECNICO_REPROGRAMACION_v1.0.md §5).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { testPrisma, resetAndSeed, disconnect, createTestCliente, getAdminUser, getRepartidorUser } from './setup'
import {
  ReprogramarObligacionPendienteUseCase,
  ObligacionNotFoundError,
  ObligacionNoReprogramableError,
} from '@/modules/embarques/application/use-cases/ReprogramarObligacionPendienteUseCase'

let adminId: string
let repartidorId: string
let clienteId: string

async function crearObligacion(estado: 'ABIERTA' | 'CUMPLIDA' | 'ANULADA' = 'ABIERTA') {
  const pedido = await testPrisma.pedido.create({
    data: {
      clienteId, canal: 'PUNTO', origen: 'PEDIDO',
      estadoEntrega: 'PENDIENTE', estado: 'PENDIENTE', estadoPago: 'PENDIENTE',
      total: 10000, totalPagado: 0, saldo: 10000,
    },
  })
  const obligacion = await testPrisma.obligacionPendiente.create({
    data: {
      pedidoId: pedido.id, clienteId, producto: 'BOTELLON',
      cantidadOriginal: 5, cantidadCumplida: 0, cantidadAsignada: 0,
      estado,
    },
  })
  return { pedido, obligacion }
}

describe('F4 — ReprogramarObligacionPendienteUseCase (integración, Postgres real)', () => {
  beforeAll(async () => {
    await resetAndSeed()
    adminId = (await getAdminUser()).id
    repartidorId = (await getRepartidorUser()).id
    const c = await createTestCliente('ReprogramarObligacion')
    clienteId = c.id
  })

  afterAll(async () => { await disconnect() })

  it('(1)+(2) reprograma → mismo Pedido, misma Obligación, nueva fecha — no crea Pedido nuevo', async () => {
    const { pedido, obligacion } = await crearObligacion()
    const pedidosAntes = await testPrisma.pedido.count()

    const useCase = new ReprogramarObligacionPendienteUseCase()
    const fechaNueva = new Date(Date.now() + 7 * 86400000)
    const result = await useCase.execute({ obligacionId: obligacion.id, fechaNueva, actorId: adminId })

    expect(result.fechaAnterior).toBeNull()
    expect(result.fechaNueva.getTime()).toBe(fechaNueva.getTime())
    expect(result.deduped).toBe(false)

    const obligacionActualizada = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionActualizada.pedidoId).toBe(pedido.id)
    expect(obligacionActualizada.id).toBe(obligacion.id)
    expect(obligacionActualizada.fechaObjetivo?.getTime()).toBe(fechaNueva.getTime())

    const pedidosDespues = await testPrisma.pedido.count()
    expect(pedidosDespues).toBe(pedidosAntes)
  })

  it('(3) conserva historial de fecha anterior — dos reprogramaciones seguidas dejan dos filas, nunca se pisan', async () => {
    const { obligacion } = await crearObligacion()
    const useCase = new ReprogramarObligacionPendienteUseCase()

    const fecha1 = new Date(Date.now() + 2 * 86400000)
    const fecha2 = new Date(Date.now() + 5 * 86400000)
    await useCase.execute({ obligacionId: obligacion.id, fechaNueva: fecha1, actorId: adminId, motivo: 'Cliente pidió más tiempo' })
    await useCase.execute({ obligacionId: obligacion.id, fechaNueva: fecha2, actorId: adminId, motivo: 'Segundo aplazamiento' })

    const historial = await testPrisma.obligacionPendienteReprogramacion.findMany({
      where: { obligacionId: obligacion.id },
      orderBy: { reprogramadoAt: 'asc' },
    })
    expect(historial).toHaveLength(2)
    expect(historial[0].fechaAnterior).toBeNull()
    expect(historial[0].fechaNueva.getTime()).toBe(fecha1.getTime())
    expect(historial[1].fechaAnterior?.getTime()).toBe(fecha1.getTime())
    expect(historial[1].fechaNueva.getTime()).toBe(fecha2.getTime())
  })

  it('(4) no altera ningún otro dato del Pedido (snapshot histórico intacto)', async () => {
    const { pedido, obligacion } = await crearObligacion()
    const useCase = new ReprogramarObligacionPendienteUseCase()
    await useCase.execute({ obligacionId: obligacion.id, fechaNueva: new Date(Date.now() + 86400000), actorId: adminId })

    const pedidoTrasReprogramar = await testPrisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })
    expect(Number(pedidoTrasReprogramar.total)).toBe(10000)
    expect(Number(pedidoTrasReprogramar.totalPagado)).toBe(0)
    expect(pedidoTrasReprogramar.direccionEntrega).toBeNull()
    expect(pedidoTrasReprogramar.barrioEntrega).toBeNull()

    const obligacionTrasReprogramar = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionTrasReprogramar.cantidadOriginal).toBe(5)
    expect(obligacionTrasReprogramar.cantidadCumplida).toBe(0)
    expect(obligacionTrasReprogramar.cantidadAsignada).toBe(0)
    expect(obligacionTrasReprogramar.estado).toBe('ABIERTA')
  })

  it('(5) no importa ni referencia código real del planificador', () => {
    const sourcePath = join(process.cwd(), 'src/modules/embarques/application/use-cases/ReprogramarObligacionPendienteUseCase.ts')
    const codeOnly = readFileSync(sourcePath, 'utf-8')
      .split('\n')
      .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .join('\n')
    expect(codeOnly).not.toMatch(/from ['"].*planificador/i)
    expect(codeOnly).not.toMatch(/PlanDia/)
  })

  it('(6) reprogramaciones repetidas → señal (conteo sube), nunca bloqueo', async () => {
    const { obligacion } = await crearObligacion()
    const useCase = new ReprogramarObligacionPendienteUseCase()

    const r1 = await useCase.execute({ obligacionId: obligacion.id, fechaNueva: new Date(Date.now() + 86400000), actorId: adminId })
    const r2 = await useCase.execute({ obligacionId: obligacion.id, fechaNueva: new Date(Date.now() + 2 * 86400000), actorId: adminId })
    const r3 = await useCase.execute({ obligacionId: obligacion.id, fechaNueva: new Date(Date.now() + 3 * 86400000), actorId: adminId })

    expect(r1.vecesReprogramada).toBe(1)
    expect(r2.vecesReprogramada).toBe(2)
    expect(r3.vecesReprogramada).toBe(3)
  })

  it('(7) fecha reprogramada vencida → señal de revisión, la operación igual se aplica', async () => {
    const { obligacion } = await crearObligacion()
    const useCase = new ReprogramarObligacionPendienteUseCase()
    const fechaVencida = new Date(Date.now() - 3 * 86400000)

    const result = await useCase.execute({ obligacionId: obligacion.id, fechaNueva: fechaVencida, actorId: adminId })

    expect(result.fechaVencida).toBe(true)
    expect(result.deduped).toBe(false)
    const obligacionActualizada = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionActualizada.fechaObjetivo?.getTime()).toBe(fechaVencida.getTime())
  })

  it('(8) Pedido/Obligación ya CUMPLIDA no puede reprogramarse por esta vía', async () => {
    const { obligacion } = await crearObligacion('CUMPLIDA')
    const useCase = new ReprogramarObligacionPendienteUseCase()

    await expect(useCase.execute({
      obligacionId: obligacion.id, fechaNueva: new Date(Date.now() + 86400000), actorId: adminId,
    })).rejects.toThrow(ObligacionNoReprogramableError)
  })

  it('(8b) Obligación ANULADA tampoco puede reprogramarse', async () => {
    const { obligacion } = await crearObligacion('ANULADA')
    const useCase = new ReprogramarObligacionPendienteUseCase()

    await expect(useCase.execute({
      obligacionId: obligacion.id, fechaNueva: new Date(Date.now() + 86400000), actorId: adminId,
    })).rejects.toThrow(ObligacionNoReprogramableError)
  })

  it('obligación inexistente → ObligacionNotFoundError', async () => {
    const useCase = new ReprogramarObligacionPendienteUseCase()
    await expect(useCase.execute({
      obligacionId: 'no-existe', fechaNueva: new Date(Date.now() + 86400000), actorId: adminId,
    })).rejects.toThrow(ObligacionNotFoundError)
  })

  it('idempotencia por offlineId: replay no duplica el historial', async () => {
    const { obligacion } = await crearObligacion()
    const useCase = new ReprogramarObligacionPendienteUseCase()
    const fechaNueva = new Date(Date.now() + 86400000)
    const offlineId = `reprog-${obligacion.id}`

    const r1 = await useCase.execute({ obligacionId: obligacion.id, fechaNueva, actorId: adminId, offlineId })
    const r2 = await useCase.execute({ obligacionId: obligacion.id, fechaNueva, actorId: adminId, offlineId })

    expect(r1.deduped).toBe(false)
    expect(r2.deduped).toBe(true)
    const historial = await testPrisma.obligacionPendienteReprogramacion.findMany({ where: { obligacionId: obligacion.id } })
    expect(historial).toHaveLength(1)
  })

  it('(9) concurrencia: dos reprogramaciones simultáneas → se serializan, ambas aplican, sin corrupción', async () => {
    const { obligacion } = await crearObligacion()
    const useCaseA = new ReprogramarObligacionPendienteUseCase()
    const useCaseB = new ReprogramarObligacionPendienteUseCase()

    const fechaA = new Date(Date.now() + 86400000)
    const fechaB = new Date(Date.now() + 2 * 86400000)

    const [resA, resB] = await Promise.all([
      useCaseA.execute({ obligacionId: obligacion.id, fechaNueva: fechaA, actorId: adminId }),
      useCaseB.execute({ obligacionId: obligacion.id, fechaNueva: fechaB, actorId: repartidorId }),
    ])

    // Ambas se aplicaron (ninguna se bloqueó ni se perdió) — el lock las
    // serializa, no las rechaza. Dos filas de historial, sin duplicados ni
    // huecos: una tiene fechaAnterior=null (la que ganó el lock primero),
    // la otra tiene fechaAnterior = la fecha que dejó la primera.
    expect([resA.deduped, resB.deduped]).toEqual([false, false])

    const historial = await testPrisma.obligacionPendienteReprogramacion.findMany({
      where: { obligacionId: obligacion.id },
      orderBy: { reprogramadoAt: 'asc' },
    })
    expect(historial).toHaveLength(2)
    expect(historial[0].fechaAnterior).toBeNull()
    expect(historial[1].fechaAnterior?.getTime()).toBe(historial[0].fechaNueva.getTime())

    // El estado final de la obligación coincide con la que ganó el lock en
    // segundo lugar (última escritura) — consistente, no un híbrido corrupto.
    const obligacionFinal = await testPrisma.obligacionPendiente.findUniqueOrThrow({ where: { id: obligacion.id } })
    expect(obligacionFinal.fechaObjetivo?.getTime()).toBe(historial[1].fechaNueva.getTime())
  })
})
