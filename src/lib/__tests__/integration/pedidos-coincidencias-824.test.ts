// @tests #824 — la resolución de coincidencias de Pedidos no omite fichas reales por un corte arbitrario.
// PostgreSQL real con datos sintéticos; ninguna base de producción.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { disconnect, resetAndSeed, testPrisma } from './setup'
import { resolverCoincidenciasPedidos } from '@/lib/pedidos-consulta.repository'

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

  it('el resultado es determinista: dos consultas iguales devuelven el mismo orden', async () => {
    const a = await resolverCoincidenciasPedidos(testPrisma, 'maria')
    const b = await resolverCoincidenciasPedidos(testPrisma, 'maria')
    expect(b.clientes).toEqual(a.clientes)
  })

  it('una búsqueda con dígitos o símbolos no se aproxima (contrato #789)', async () => {
    const r = await resolverCoincidenciasPedidos(testPrisma, '50%_516')
    expect(r).toEqual({ clientes: [], negocios: [] })
  })
})
