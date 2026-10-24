// @tests P2-3 (#453) — embarque y repartidor de cada pedido de la lista:
// una sola consulta por lote, contra Postgres real.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { testPrisma, resetAndSeed, disconnect } from './setup'
import { cargarEmbarquesLista, camposEmbarqueLista } from '@/lib/embarque-lista'

describe('cargarEmbarquesLista', () => {
  let embarqueA: string
  let embarqueB: string
  let trabajadorNombre: string

  beforeAll(async () => {
    await resetAndSeed()
    const trabajador = await testPrisma.trabajador.create({ data: { nombre: 'Rep Lista', rol: 'REPARTIDOR', usaMoto: true } })
    trabajadorNombre = trabajador.nombre
    embarqueA = (await testPrisma.embarque.create({ data: { trabajadorId: trabajador.id, numeroDia: 3, estado: 'ABIERTO' } })).id
    embarqueB = (await testPrisma.embarque.create({ data: { trabajadorId: trabajador.id, numeroDia: 4, estado: 'ABIERTO' } })).id
  })

  afterAll(async () => {
    await disconnect()
  })

  it('devuelve número del día y repartidor, y los campos de cada pedido', async () => {
    const mapa = await cargarEmbarquesLista(testPrisma, [embarqueA, embarqueB, embarqueA, null, undefined])
    expect(mapa.size).toBe(2)
    expect(camposEmbarqueLista(embarqueA, mapa)).toEqual({ embarqueNumeroDia: 3, embarqueRepartidor: trabajadorNombre })
    expect(camposEmbarqueLista(embarqueB, mapa).embarqueNumeroDia).toBe(4)
    expect(camposEmbarqueLista(null, mapa)).toEqual({ embarqueNumeroDia: null, embarqueRepartidor: null })
    expect(camposEmbarqueLista('no-existe', mapa)).toEqual({ embarqueNumeroDia: null, embarqueRepartidor: null })
  })

  it('una sola consulta para todo el lote (sin N+1) y ninguna si no hay embarques', async () => {
    // contador de consultas: delega en Postgres real y cuenta las llamadas.
    const findMany = vi.fn((args: Parameters<typeof testPrisma.embarque.findMany>[0]) => testPrisma.embarque.findMany(args))
    const contado = { embarque: { findMany } } as unknown as Parameters<typeof cargarEmbarquesLista>[0]

    const mapa = await cargarEmbarquesLista(contado, [embarqueA, embarqueB, embarqueA, embarqueB])
    expect(mapa.size).toBe(2)
    expect(findMany).toHaveBeenCalledTimes(1)

    findMany.mockClear()
    const vacio = await cargarEmbarquesLista(contado, [null, undefined])
    expect(vacio.size).toBe(0)
    expect(findMany).not.toHaveBeenCalled()
  })
})
