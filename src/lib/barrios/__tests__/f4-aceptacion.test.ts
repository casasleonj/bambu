// @tests F4 — Gate de aceptación final (equipo, revisión 2026-10-07)
//
// "No basta con que Prisma compile." Este archivo demuestra, uno por uno,
// cada punto del gate final que el equipo pidió explícitamente — no
// cobertura dispersa, sino la lista exacta que se acordó como criterio de
// cierre de la fase. Caso de aceptación: La Antillana (nombre canónico),
// alias "Antillana", referencias "Antillana 1"/"Antillana 2".
//
// Nota de alcance: esto corre contra Prisma mockeado (igual que el resto
// de la suite de esta fase) — la demostración contra Postgres real
// (equivalente al "gate" que se corrió a mano para F3/#279) queda
// pendiente de que alguien con acceso a DB local la ejecute antes del
// merge, siguiendo el mismo patrón ya usado en esa fase.
//
// Puntos del gate que son de UI/UX y ya están cubiertos en sus propios
// archivos (no duplicados acá):
//  - "Cliente/Negocio comprende el resultado sin conocer la taxonomía" y
//    "Referencia ayuda a completar ubicación sólo por acción explícita"
//    → src/components/__tests__/barrio-referencias-chips.test.tsx,
//      cliente-form.test.tsx, negocio-form.test.tsx.
//  - "Zona encuentra el Barrio correcto pero solo persiste barrioId"
//    → src/app/(app)/configuracion/zonas/__tests__/zonas-client.test.tsx.
//  - "Administración distingue 'otro nombre' de 'referencia común'"
//    → src/app/(app)/configuracion/barrios/__tests__/barrios-client.test.tsx.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  barrio: { findUnique: vi.fn(), findMany: vi.fn() },
  barrioAlias: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  barrioReferencia: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  historial: { create: vi.fn() },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { resolverBarrioPorTexto, crearAlias } from '@/lib/barrios/referencia-service'
import { buscarBarrios } from '@/lib/barrios/barrio-service'

const LA_ANTILLANA = { id: 'b1', nombre: 'La Antillana', nombreNormalizado: 'la antillana', activo: true }
const EL_CAFETAL = { id: 'b2', nombre: 'El Cafetal', nombreNormalizado: 'el cafetal', activo: true }

const ALIAS_ANTILLANA = { id: 'a1', barrioId: 'b1', texto: 'Antillana', textoNormalizado: 'antillana', barrio: LA_ANTILLANA }
const REF_ANTILLANA_1 = { id: 'r1', barrioId: 'b1', texto: 'Antillana 1', textoNormalizado: 'antillana 1', barrio: LA_ANTILLANA }
const REF_ANTILLANA_2 = { id: 'r2', barrioId: 'b1', texto: 'Antillana 2', textoNormalizado: 'antillana 2', barrio: LA_ANTILLANA }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
  mockPrisma.historial.create.mockResolvedValue({})
})

describe('F4 — gate de aceptación: resolución exacta', () => {
  it('"La Antillana" (nombre canónico) → encuentra La Antillana', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(LA_ANTILLANA)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([])

    const resultado = await resolverBarrioPorTexto('La Antillana')
    expect(resultado).toEqual({ estado: 'ENCONTRADO', barrio: LA_ANTILLANA, matchedVia: 'nombre' })
  })

  it('"Antillana" (otro nombre) → encuentra La Antillana', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([ALIAS_ANTILLANA])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([])

    const resultado = await resolverBarrioPorTexto('Antillana')
    expect(resultado).toEqual({ estado: 'ENCONTRADO', barrio: LA_ANTILLANA, matchedVia: 'alias' })
  })

  it('"Antillana 1" → encuentra La Antillana', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([REF_ANTILLANA_1])

    const resultado = await resolverBarrioPorTexto('Antillana 1')
    expect(resultado).toEqual({ estado: 'ENCONTRADO', barrio: LA_ANTILLANA, matchedVia: 'referencia' })
  })

  it('"Antillana 2" → encuentra La Antillana', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([REF_ANTILLANA_2])

    const resultado = await resolverBarrioPorTexto('Antillana 2')
    expect(resultado).toEqual({ estado: 'ENCONTRADO', barrio: LA_ANTILLANA, matchedVia: 'referencia' })
  })
})

describe('F4 — gate de aceptación: búsqueda consolidada', () => {
  it('"antill" (parcial) → encuentra una SOLA La Antillana, no una fila por cada fuente que matcheó', async () => {
    mockPrisma.barrio.findMany.mockResolvedValue([
      {
        ...LA_ANTILLANA,
        aliases: [{ texto: 'Antillana' }],
        referencias: [{ texto: 'Antillana 1' }, { texto: 'Antillana 2' }],
      },
    ])

    const resultado = await buscarBarrios('antill')
    expect(resultado).toHaveLength(1)
    expect(resultado[0].id).toBe('b1')
  })
})

describe('F4 — gate de aceptación: ningún conflicto "texto → dos Barrios" se resuelve en silencio', () => {
  it('una referencia compartida por dos Barrios → resolución exacta es AMBIGUO, nunca elige uno', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([
      { ...REF_ANTILLANA_1, barrio: LA_ANTILLANA },
      { id: 'r9', barrioId: 'b2', texto: 'La Cancha', textoNormalizado: 'la cancha', barrio: EL_CAFETAL },
    ])

    const resultado = await resolverBarrioPorTexto('cualquier texto con 2 matches')
    expect(resultado.estado).toBe('AMBIGUO')
  })

  it('crear un Alias que colisiona con el nombre canónico de OTRO Barrio → bloqueado, nunca se persiste', async () => {
    mockPrisma.barrio.findUnique.mockImplementation(({ where }: { where: { id?: string; nombreNormalizado?: string } }) => {
      if (where.id === 'b2') return EL_CAFETAL
      if (where.nombreNormalizado === 'la antillana') return LA_ANTILLANA
      return null
    })
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    mockPrisma.barrioReferencia.findFirst.mockResolvedValue(null)

    await expect(crearAlias('b2', 'La Antillana', 'admin1')).rejects.toThrow()
    expect(mockPrisma.barrioAlias.create).not.toHaveBeenCalled()
  })
})

describe('F4 — gate de aceptación: Crear Barrio sigue siendo último recurso', () => {
  it('buscarBarrios sin ningún match no crea nada por sí mismo — es responsabilidad del caller (UI) ofrecer crear', async () => {
    mockPrisma.barrio.findMany.mockResolvedValue([])
    const resultado = await buscarBarrios('un barrio que no existe')
    expect(resultado).toEqual([])
    expect(mockPrisma.barrio.findMany).toHaveBeenCalled()
    // No hay ninguna llamada a crear — buscar nunca crea.
  })
})
