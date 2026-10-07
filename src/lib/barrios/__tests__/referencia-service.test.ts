// @tests referencia-service — F4 Barrio: alias y referencias territoriales
// (fase separada de F1/F3, post-#279). Cubre el contrato corregido por el
// equipo (revisión 2026-10-07):
//   "Alias identifica. Referencia ayuda a ubicar. Un texto que termina
//    apuntando a más de un Barrio nunca se resuelve automáticamente."
// - resolverBarrioPorTexto consolida por barrioId SOBRE LAS 3 FUENTES
//   (nombre, alias, referencia) y nunca elige por prioridad.
// - crearAlias: bloqueo duro contra canónico/alias/referencia de OTRO barrio.
// - crearReferencia: compartible entre barrios (nunca bloquea cross-barrio),
//   solo evita redundancia DENTRO del mismo barrio.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  barrio: {
    findUnique: vi.fn(),
  },
  barrioAlias: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
  barrioReferencia: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  },
  historial: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { BarrioNoEncontradoError } from '@/lib/barrios/barrio-service'
import {
  AliasNoEncontradoError,
  ConflictoTerritorialError,
  ReferenciaNoEncontradaError,
  ReferenciaRedundanteError,
  crearAlias,
  crearReferencia,
  eliminarAlias,
  eliminarReferencia,
  resolverBarrioPorTexto,
} from '../referencia-service'

const LA_ANTILLANA = { id: 'b1', nombre: 'La Antillana', nombreNormalizado: 'la antillana', activo: true }
const EL_CAFETAL = { id: 'b2', nombre: 'El Cafetal', nombreNormalizado: 'el cafetal', activo: true }
const SAN_JOSE = { id: 'b3', nombre: 'San José', nombreNormalizado: 'san jose', activo: true }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
  mockPrisma.historial.create.mockResolvedValue({})
})

describe('resolverBarrioPorTexto', () => {
  it('NO_ENCONTRADO si ninguna de las 3 fuentes matchea', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([])

    const resultado = await resolverBarrioPorTexto('texto inexistente')
    expect(resultado).toEqual({ estado: 'NO_ENCONTRADO' })
  })

  it('ENCONTRADO vía nombre canónico exacto', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(LA_ANTILLANA)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([])

    const resultado = await resolverBarrioPorTexto('La Antillana')
    expect(resultado).toEqual({ estado: 'ENCONTRADO', barrio: LA_ANTILLANA, matchedVia: 'nombre' })
  })

  it('ENCONTRADO vía alias (ej. "Antillana" → La Antillana)', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([{ barrio: LA_ANTILLANA }])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([])

    const resultado = await resolverBarrioPorTexto('Antillana')
    expect(resultado).toEqual({ estado: 'ENCONTRADO', barrio: LA_ANTILLANA, matchedVia: 'alias' })
  })

  it('ENCONTRADO vía referencia (ej. "Antillana 2" → La Antillana)', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([{ barrio: LA_ANTILLANA }])

    const resultado = await resolverBarrioPorTexto('Antillana 2')
    expect(resultado).toEqual({ estado: 'ENCONTRADO', barrio: LA_ANTILLANA, matchedVia: 'referencia' })
  })

  it('convergencia dentro del MISMO Barrio (matchea por alias Y por referencia a la vez) → un único ENCONTRADO, no ambigüedad', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([{ barrio: LA_ANTILLANA }])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([{ barrio: LA_ANTILLANA }])

    const resultado = await resolverBarrioPorTexto('Antillana')
    expect(resultado.estado).toBe('ENCONTRADO')
    if (resultado.estado === 'ENCONTRADO') {
      expect(resultado.barrio).toEqual(LA_ANTILLANA)
      // La prioridad (nombre > alias > referencia) solo etiqueta matchedVia
      // cuando hay un único candidato — acá "alias" gana la etiqueta.
      expect(resultado.matchedVia).toBe('alias')
    }
  })

  it('AMBIGUO: una referencia compartida por dos Barrios distintos ("La Cancha" → A y B) nunca se elige en silencio', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([
      { barrio: LA_ANTILLANA },
      { barrio: EL_CAFETAL },
    ])

    const resultado = await resolverBarrioPorTexto('La Cancha')
    expect(resultado.estado).toBe('AMBIGUO')
    if (resultado.estado === 'AMBIGUO') {
      const ids = resultado.candidatos.map((c) => c.barrio.id).sort()
      expect(ids).toEqual(['b1', 'b2'])
    }
  })

  it('AMBIGUO: nunca elige por prioridad — canónico de un Barrio vs alias de OTRO Barrio con datos heredados inconsistentes', async () => {
    // Caso de corrupción/dato heredado: "San Jose" es el nombre canónico de
    // San José (b3) pero también quedó registrado como alias de otro Barrio.
    // resolverBarrioPorTexto NUNCA debe devolver el canónico ocultando la
    // inconsistencia — debe consolidar y reportar AMBIGUO.
    mockPrisma.barrio.findUnique.mockResolvedValue(SAN_JOSE)
    mockPrisma.barrioAlias.findMany.mockResolvedValue([{ barrio: LA_ANTILLANA }])
    mockPrisma.barrioReferencia.findMany.mockResolvedValue([])

    const resultado = await resolverBarrioPorTexto('San Jose')
    expect(resultado.estado).toBe('AMBIGUO')
    if (resultado.estado === 'AMBIGUO') {
      const ids = resultado.candidatos.map((c) => c.barrio.id).sort()
      expect(ids).toEqual(['b1', 'b3'])
    }
  })

  it('NO_ENCONTRADO sin tocar la DB si el texto normalizado queda vacío', async () => {
    const resultado = await resolverBarrioPorTexto('   ')
    expect(resultado).toEqual({ estado: 'NO_ENCONTRADO' })
    expect(mockPrisma.barrio.findUnique).not.toHaveBeenCalled()
  })
})

describe('crearAlias', () => {
  it('crea dentro de una transacción y audita (CREATE)', async () => {
    mockPrisma.barrio.findUnique.mockImplementation(({ where }: { where: { id?: string; nombreNormalizado?: string } }) =>
      where.id === 'b1' ? LA_ANTILLANA : null,
    )
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    mockPrisma.barrioReferencia.findFirst.mockResolvedValue(null)
    mockPrisma.barrioAlias.create.mockResolvedValue({ id: 'a1', barrioId: 'b1', texto: 'Antillana', textoNormalizado: 'antillana' })

    const alias = await crearAlias('b1', 'Antillana', 'user1')

    expect(mockPrisma.barrioAlias.create).toHaveBeenCalledWith({
      data: { barrioId: 'b1', texto: 'Antillana', textoNormalizado: 'antillana' },
    })
    expect(mockPrisma.historial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entidad: 'BarrioAlias', accion: 'CREATE', usuarioId: 'user1' }),
      }),
    )
    expect(alias.id).toBe('a1')
  })

  it('lanza BarrioNoEncontradoError si el barrio no existe', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    await expect(crearAlias('nope', 'Antillana', 'user1')).rejects.toBeInstanceOf(BarrioNoEncontradoError)
  })

  it('bloqueo duro: el texto ya es el nombre canónico de OTRO Barrio', async () => {
    mockPrisma.barrio.findUnique.mockImplementation(({ where }: { where: { id?: string; nombreNormalizado?: string } }) => {
      if (where.id === 'b2') return EL_CAFETAL
      if (where.nombreNormalizado === 'la antillana') return LA_ANTILLANA
      return null
    })
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    mockPrisma.barrioReferencia.findFirst.mockResolvedValue(null)

    await expect(crearAlias('b2', 'La Antillana', 'user1')).rejects.toBeInstanceOf(ConflictoTerritorialError)
    expect(mockPrisma.barrioAlias.create).not.toHaveBeenCalled()
  })

  it('redundante: el texto ya es el propio nombre canónico del Barrio', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(LA_ANTILLANA)
    await expect(crearAlias('b1', 'La Antillana', 'user1')).rejects.toBeInstanceOf(ReferenciaRedundanteError)
    expect(mockPrisma.barrioAlias.create).not.toHaveBeenCalled()
  })

  it('bloqueo duro: el texto ya es una Referencia de OTRO Barrio', async () => {
    mockPrisma.barrio.findUnique.mockImplementation(({ where }: { where: { id?: string; nombreNormalizado?: string } }) =>
      where.id === 'b2' ? EL_CAFETAL : null,
    )
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    mockPrisma.barrioReferencia.findFirst.mockResolvedValue({
      id: 'r1',
      barrioId: 'b1',
      texto: 'Antillana 2',
      textoNormalizado: 'antillana 2',
      barrio: LA_ANTILLANA,
    })

    await expect(crearAlias('b2', 'Antillana 2', 'user1')).rejects.toBeInstanceOf(ConflictoTerritorialError)
    expect(mockPrisma.barrioAlias.create).not.toHaveBeenCalled()
  })

  it('redundante: el texto ya es un alias propio del mismo Barrio', async () => {
    mockPrisma.barrio.findUnique.mockImplementation(({ where }: { where: { id?: string; nombreNormalizado?: string } }) =>
      where.id === 'b1' ? LA_ANTILLANA : null,
    )
    mockPrisma.barrioAlias.findFirst.mockResolvedValue({ id: 'a1', barrioId: 'b1', texto: 'Antillana', textoNormalizado: 'antillana' })
    mockPrisma.barrioReferencia.findFirst.mockResolvedValue(null)

    await expect(crearAlias('b1', 'Antillana', 'user1')).rejects.toBeInstanceOf(ReferenciaRedundanteError)
    expect(mockPrisma.barrioAlias.create).not.toHaveBeenCalled()
  })

  it('si falla la auditoría, la creación hace rollback (el error se propaga, no se silencia)', async () => {
    mockPrisma.barrio.findUnique.mockImplementation(({ where }: { where: { id?: string; nombreNormalizado?: string } }) =>
      where.id === 'b1' ? LA_ANTILLANA : null,
    )
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    mockPrisma.barrioReferencia.findFirst.mockResolvedValue(null)
    mockPrisma.barrioAlias.create.mockResolvedValue({ id: 'a1', barrioId: 'b1', texto: 'Antillana', textoNormalizado: 'antillana' })
    mockPrisma.historial.create.mockRejectedValue(new Error('DB caída'))

    await expect(crearAlias('b1', 'Antillana', 'user1')).rejects.toThrow('DB caída')
  })
})

describe('crearReferencia', () => {
  it('crea dentro de una transacción y audita (CREATE)', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(LA_ANTILLANA)
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    mockPrisma.barrioReferencia.create.mockResolvedValue({ id: 'r1', barrioId: 'b1', texto: 'Antillana 2', textoNormalizado: 'antillana 2' })

    const referencia = await crearReferencia('b1', 'Antillana 2', 'user1')

    expect(mockPrisma.barrioReferencia.create).toHaveBeenCalledWith({
      data: { barrioId: 'b1', texto: 'Antillana 2', textoNormalizado: 'antillana 2' },
    })
    expect(mockPrisma.historial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entidad: 'BarrioReferencia', accion: 'CREATE', usuarioId: 'user1' }),
      }),
    )
    expect(referencia.id).toBe('r1')
  })

  it('NO bloquea contra otro Barrio: una referencia puede compartirse ("La Cancha" en Barrio A y luego en Barrio B)', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(EL_CAFETAL)
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    mockPrisma.barrioReferencia.create.mockResolvedValue({ id: 'r2', barrioId: 'b2', texto: 'La Cancha', textoNormalizado: 'la cancha' })

    // El servicio nunca consulta BarrioReferencia de OTROS barrios al crear
    // — a diferencia de crearAlias, que sí lo hace para el bloqueo duro.
    await expect(crearReferencia('b2', 'La Cancha', 'user1')).resolves.toMatchObject({ id: 'r2' })
    expect(mockPrisma.barrioReferencia.findFirst).not.toHaveBeenCalled()
  })

  it('redundante: el texto ya es el nombre canónico del propio Barrio', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(LA_ANTILLANA)
    await expect(crearReferencia('b1', 'La Antillana', 'user1')).rejects.toBeInstanceOf(ReferenciaRedundanteError)
    expect(mockPrisma.barrioReferencia.create).not.toHaveBeenCalled()
  })

  it('redundante: el texto ya es un alias propio del mismo Barrio', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(LA_ANTILLANA)
    mockPrisma.barrioAlias.findFirst.mockResolvedValue({ id: 'a1', barrioId: 'b1', texto: 'Antillana', textoNormalizado: 'antillana' })

    await expect(crearReferencia('b1', 'Antillana', 'user1')).rejects.toBeInstanceOf(ReferenciaRedundanteError)
    expect(mockPrisma.barrioReferencia.create).not.toHaveBeenCalled()
  })

  it('lanza BarrioNoEncontradoError si el barrio no existe', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    await expect(crearReferencia('nope', 'Antillana 2', 'user1')).rejects.toBeInstanceOf(BarrioNoEncontradoError)
  })

  it('duplicado exacto dentro del mismo Barrio lo rechaza la unique constraint de DB (P2002), no este servicio', async () => {
    // @@unique([barrioId, textoNormalizado]) es la única fuente de verdad
    // para este caso — mismo patrón que crearBarrio (F1): no hay pre-check,
    // el caller (route) traduce P2002 a 409.
    mockPrisma.barrio.findUnique.mockResolvedValue(LA_ANTILLANA)
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    mockPrisma.barrioReferencia.create.mockRejectedValue(p2002)

    await expect(crearReferencia('b1', 'Antillana 2', 'user1')).rejects.toMatchObject({ code: 'P2002' })
  })

  it('si falla la auditoría, la creación hace rollback (el error se propaga, no se silencia)', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(LA_ANTILLANA)
    mockPrisma.barrioAlias.findFirst.mockResolvedValue(null)
    mockPrisma.barrioReferencia.create.mockResolvedValue({ id: 'r1', barrioId: 'b1', texto: 'Antillana 2', textoNormalizado: 'antillana 2' })
    mockPrisma.historial.create.mockRejectedValue(new Error('DB caída'))

    await expect(crearReferencia('b1', 'Antillana 2', 'user1')).rejects.toThrow('DB caída')
  })
})

describe('eliminarAlias / eliminarReferencia', () => {
  it('eliminarAlias borra y audita como DELETE', async () => {
    mockPrisma.barrioAlias.findUnique.mockResolvedValue({ id: 'a1', barrioId: 'b1', texto: 'Antillana', barrio: LA_ANTILLANA })

    await eliminarAlias('b1', 'a1', 'user1')

    expect(mockPrisma.barrioAlias.delete).toHaveBeenCalledWith({ where: { id: 'a1' } })
    expect(mockPrisma.historial.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entidad: 'BarrioAlias', accion: 'DELETE' }) }),
    )
  })

  it('eliminarAlias lanza AliasNoEncontradoError si no existe', async () => {
    mockPrisma.barrioAlias.findUnique.mockResolvedValue(null)
    await expect(eliminarAlias('b1', 'nope', 'user1')).rejects.toBeInstanceOf(AliasNoEncontradoError)
  })

  it('eliminarAlias lanza AliasNoEncontradoError (no leak) si el alias existe pero pertenece a OTRO Barrio', async () => {
    mockPrisma.barrioAlias.findUnique.mockResolvedValue({ id: 'a1', barrioId: 'b2', texto: 'Antillana', barrio: EL_CAFETAL })
    await expect(eliminarAlias('b1', 'a1', 'user1')).rejects.toBeInstanceOf(AliasNoEncontradoError)
    expect(mockPrisma.barrioAlias.delete).not.toHaveBeenCalled()
  })

  it('eliminarReferencia borra y audita como DELETE', async () => {
    mockPrisma.barrioReferencia.findUnique.mockResolvedValue({ id: 'r1', barrioId: 'b1', texto: 'Antillana 2', barrio: LA_ANTILLANA })

    await eliminarReferencia('b1', 'r1', 'user1')

    expect(mockPrisma.barrioReferencia.delete).toHaveBeenCalledWith({ where: { id: 'r1' } })
    expect(mockPrisma.historial.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entidad: 'BarrioReferencia', accion: 'DELETE' }) }),
    )
  })

  it('eliminarReferencia lanza ReferenciaNoEncontradaError (no leak) si la referencia existe pero pertenece a OTRO Barrio', async () => {
    mockPrisma.barrioReferencia.findUnique.mockResolvedValue({ id: 'r1', barrioId: 'b2', texto: 'La Cancha', barrio: EL_CAFETAL })
    await expect(eliminarReferencia('b1', 'r1', 'user1')).rejects.toBeInstanceOf(ReferenciaNoEncontradaError)
    expect(mockPrisma.barrioReferencia.delete).not.toHaveBeenCalled()
  })

  it('eliminarReferencia lanza ReferenciaNoEncontradaError si no existe', async () => {
    mockPrisma.barrioReferencia.findUnique.mockResolvedValue(null)
    await expect(eliminarReferencia('b1', 'nope', 'user1')).rejects.toBeInstanceOf(ReferenciaNoEncontradaError)
  })
})
