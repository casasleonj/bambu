// @tests #824 — la resolución de coincidencias de Pedidos no omite fichas reales por un corte arbitrario.
// PostgreSQL real con datos sintéticos; ninguna base de producción.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { disconnect, resetAndSeed, testPrisma } from './setup'
import { resolverCoincidenciasPedidos } from '@/lib/pedidos-consulta.repository'
import { logger } from '@/lib/logger'

// Más que el antiguo tope de 500: obliga a que el corte, si existe, decida quién queda fuera.
const FILLERS_CLIENTES = 800
const FILLERS_NEGOCIOS = 650

let objetivoClienteId = ''
let objetivoNegocioId = ''

describe('#824 resolverCoincidenciasPedidos con muchos candidatos', () => {
  beforeAll(async () => {
    await resetAndSeed()
    await testPrisma.cliente.createMany({
      data: Array.from({ length: FILLERS_CLIENTES }, (_, i) => ({
        nombre: `Maria Filler ${i}`, telefono: `30${String(i).padStart(8, '0')}`, direccion: 'Calle sintética', activo: true,
      })),
    })
    // Insertada la ÚLTIMA: con un LIMIT sin ORDER BY es la candidata a quedar fuera.
    objetivoClienteId = (await testPrisma.cliente.create({
      data: { nombre: 'María Zuluaga', telefono: '3999999999', direccion: 'Calle sintética', activo: true },
    })).id
    const dueno = await testPrisma.cliente.create({
      data: { nombre: 'Dueño Sintético', telefono: '3888888888', direccion: 'Calle sintética', activo: true },
    })
    await testPrisma.negocio.createMany({
      data: Array.from({ length: FILLERS_NEGOCIOS }, (_, i) => ({ clienteId: dueno.id, nombre: `Punti Filler ${i}` })),
    })
    objetivoNegocioId = (await testPrisma.negocio.create({
      data: { clienteId: dueno.id, nombre: 'Puntí Dorado' },
    })).id
  }, 120_000)
  afterAll(disconnect)

  it('«maria» incluye a María Zuluaga aunque coincidan más de 500 clientes', async () => {
    const r = await resolverCoincidenciasPedidos(testPrisma, 'maria')
    expect(r.clientes).toContain(objetivoClienteId)
    expect(r.clientes.length).toBeGreaterThan(FILLERS_CLIENTES)
  })

  it('«punti» incluye al negocio Puntí Dorado aunque coincidan más de 500 negocios', async () => {
    const r = await resolverCoincidenciasPedidos(testPrisma, 'punti')
    expect(r.negocios).toContain(objetivoNegocioId)
    expect(r.negocios.length).toBeGreaterThan(FILLERS_NEGOCIOS)
  })

  it('control: un término específico devuelve solo la ficha buscada', async () => {
    const r = await resolverCoincidenciasPedidos(testPrisma, 'zuluaga')
    expect(r.clientes).toEqual([objetivoClienteId])
  })

  it('una búsqueda con dígitos o símbolos no se aproxima (contrato #789)', async () => {
    const r = await resolverCoincidenciasPedidos(testPrisma, '50%_516')
    expect(r).toEqual({ clientes: [], negocios: [] })
  })
})

describe('#824 cuando el tope sí actúa', () => {
  const TOPE = 5000
  beforeAll(async () => {
    await testPrisma.cliente.createMany({
      data: Array.from({ length: TOPE + 100 }, (_, i) => ({
        nombre: `Zorrillo Tope ${i}`, telefono: `31${String(i).padStart(8, '0')}`, direccion: 'Calle sintética', activo: true,
      })),
    })
  }, 120_000)

  it('devuelve exactamente el tope y deja un aviso en el log', async () => {
    const aviso = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    const r = await resolverCoincidenciasPedidos(testPrisma, 'zorrillo')
    expect(r.clientes).toHaveLength(TOPE)
    expect(aviso).toHaveBeenCalledTimes(1)
    aviso.mockRestore()
  })

  it('por debajo del tope no avisa', async () => {
    const aviso = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    await resolverCoincidenciasPedidos(testPrisma, 'maria')
    expect(aviso).not.toHaveBeenCalled()
    aviso.mockRestore()
  })
})
