// @tests barrio-service — F1 Barrio canónico (ajuste aprobado sobre el ALS)
// Cubre: búsqueda exacta/determinista, creación (sin pre-check de unicidad,
// la garantiza la DB), rename con sincronización atómica de Cliente/Negocio
// legacy, archivado/reactivación (soft, nunca destructivo), y resolución
// para el dual-write de Cliente/Negocio.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  barrio: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  cliente: { updateMany: vi.fn() },
  negocio: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import {
  BarrioNoEncontradoError,
  archivarBarrio,
  buscarBarrioExacto,
  buscarBarrios,
  crearBarrio,
  reactivarBarrio,
  renombrarBarrio,
  resolverBarrioParaVinculo,
} from '../barrio-service'

const FAKE_BARRIO = { id: 'b1', nombre: 'La Esperanza', nombreNormalizado: 'la esperanza', activo: true }
const FAKE_BARRIO_CON_RELACIONES = { ...FAKE_BARRIO, aliases: [], referencias: [] }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
})

describe('buscarBarrioExacto', () => {
  it('normaliza el nombre antes de buscar', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    const result = await buscarBarrioExacto('  LA  ESPERANZA ')
    expect(mockPrisma.barrio.findUnique).toHaveBeenCalledWith({ where: { nombreNormalizado: 'la esperanza' } })
    expect(result).toBe(FAKE_BARRIO)
  })

  it('devuelve null sin tocar la DB si el nombre normalizado queda vacío', async () => {
    const result = await buscarBarrioExacto('   ')
    expect(result).toBeNull()
    expect(mockPrisma.barrio.findUnique).not.toHaveBeenCalled()
  })
})

describe('buscarBarrios', () => {
  it('filtra por activo=true por defecto', async () => {
    mockPrisma.barrio.findMany.mockResolvedValue([FAKE_BARRIO_CON_RELACIONES])
    await buscarBarrios('esper')
    expect(mockPrisma.barrio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ activo: true }),
      }),
    )
  })

  it('incluye inactivos cuando se pide explícitamente', async () => {
    mockPrisma.barrio.findMany.mockResolvedValue([])
    await buscarBarrios('esper', { incluirInactivos: true })
    const where = mockPrisma.barrio.findMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('activo')
  })

  it('usa substring determinista sobre nombreNormalizado, no fuzzy/similarity', async () => {
    mockPrisma.barrio.findMany.mockResolvedValue([])
    await buscarBarrios('Esperanza')
    const where = mockPrisma.barrio.findMany.mock.calls[0][0].where
    expect(where.OR).toContainEqual({ nombreNormalizado: { contains: 'esperanza' } })
  })

  it('F4: también busca por substring sobre BarrioAlias y BarrioReferencia, consolidado por barrio', async () => {
    mockPrisma.barrio.findMany.mockResolvedValue([])
    await buscarBarrios('antill')
    const call = mockPrisma.barrio.findMany.mock.calls[0][0]
    expect(call.where.OR).toContainEqual({
      aliases: { some: { textoNormalizado: { contains: 'antill' } } },
    })
    expect(call.where.OR).toContainEqual({
      referencias: { some: { textoNormalizado: { contains: 'antill' } } },
    })
    expect(call.include.aliases).toEqual({
      where: { textoNormalizado: { contains: 'antill' } },
      select: { texto: true },
    })
  })

  it('F4: consolida por barrio — un Barrio que matchea por nombre+alias+referencia aparece una sola vez, con el contexto de qué coincidió', async () => {
    mockPrisma.barrio.findMany.mockResolvedValue([
      {
        ...FAKE_BARRIO,
        aliases: [{ texto: 'Antillana' }],
        referencias: [{ texto: 'Antillana 1' }, { texto: 'Antillana 2' }],
      },
    ])
    const resultado = await buscarBarrios('antill')
    expect(resultado).toHaveLength(1)
    expect(resultado[0].aliasCoincidente).toBe('Antillana')
    expect(resultado[0].referenciasCoincidentes).toEqual(['Antillana 1', 'Antillana 2'])
    expect(resultado[0]).not.toHaveProperty('aliases')
    expect(resultado[0]).not.toHaveProperty('referencias')
  })

  it('con query vacía no agrega filtro de nombre (lista todos)', async () => {
    mockPrisma.barrio.findMany.mockResolvedValue([])
    await buscarBarrios('')
    const where = mockPrisma.barrio.findMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('nombreNormalizado')
  })
})

describe('crearBarrio', () => {
  it('crea con nombre trimmed y nombreNormalizado calculado', async () => {
    mockPrisma.barrio.create.mockResolvedValue(FAKE_BARRIO)
    await crearBarrio('  La Esperanza  ')
    expect(mockPrisma.barrio.create).toHaveBeenCalledWith({
      data: { nombre: 'La Esperanza', nombreNormalizado: 'la esperanza' },
    })
  })

  it('no hace ninguna comprobación previa de unicidad (la DB es la única fuente)', async () => {
    mockPrisma.barrio.create.mockResolvedValue(FAKE_BARRIO)
    await crearBarrio('La Esperanza')
    expect(mockPrisma.barrio.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.barrio.findMany).not.toHaveBeenCalled()
  })
})

describe('renombrarBarrio', () => {
  it('lanza BarrioNoEncontradoError si el barrio no existe', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    await expect(renombrarBarrio('nope', 'Nuevo Nombre')).rejects.toBeInstanceOf(BarrioNoEncontradoError)
  })

  it('actualiza nombre+nombreNormalizado y sincroniza Cliente/Negocio vinculados, todo en la misma transacción', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.barrio.update.mockResolvedValue({ ...FAKE_BARRIO, nombre: 'La Nueva Esperanza', nombreNormalizado: 'la nueva esperanza' })
    mockPrisma.cliente.updateMany.mockResolvedValue({ count: 3 })
    mockPrisma.negocio.updateMany.mockResolvedValue({ count: 1 })

    const result = await renombrarBarrio('b1', 'La Nueva Esperanza')

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.barrio.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { nombre: 'La Nueva Esperanza', nombreNormalizado: 'la nueva esperanza' },
    })
    expect(mockPrisma.cliente.updateMany).toHaveBeenCalledWith({
      where: { barrioId: 'b1' },
      data: { barrio: 'La Nueva Esperanza' },
    })
    expect(mockPrisma.negocio.updateMany).toHaveBeenCalledWith({
      where: { barrioId: 'b1' },
      data: { barrio: 'La Nueva Esperanza' },
    })
    expect(result.clientesSincronizados).toBe(3)
    expect(result.negociosSincronizados).toBe(1)
  })

  it('el id permanece igual — solo cambia nombre/nombreNormalizado en el update', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.barrio.update.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.cliente.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.negocio.updateMany.mockResolvedValue({ count: 0 })

    await renombrarBarrio('b1', 'Otro Nombre')

    const updateCall = mockPrisma.barrio.update.mock.calls[0][0]
    expect(updateCall.where).toEqual({ id: 'b1' })
    expect(updateCall.data).not.toHaveProperty('id')
  })
})

describe('archivarBarrio / reactivarBarrio', () => {
  it('archivarBarrio: setea activo=false', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.barrio.update.mockResolvedValue({ ...FAKE_BARRIO, activo: false })
    await archivarBarrio('b1')
    expect(mockPrisma.barrio.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { activo: false } })
  })

  it('archivarBarrio: lanza BarrioNoEncontradoError si no existe', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    await expect(archivarBarrio('nope')).rejects.toBeInstanceOf(BarrioNoEncontradoError)
  })

  it('reactivarBarrio: setea activo=true', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue({ ...FAKE_BARRIO, activo: false })
    mockPrisma.barrio.update.mockResolvedValue(FAKE_BARRIO)
    await reactivarBarrio('b1')
    expect(mockPrisma.barrio.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { activo: true } })
  })

  it('reactivarBarrio: lanza BarrioNoEncontradoError si no existe', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    await expect(reactivarBarrio('nope')).rejects.toBeInstanceOf(BarrioNoEncontradoError)
  })
})

describe('resolverBarrioParaVinculo', () => {
  it('devuelve el Barrio si existe', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    const result = await resolverBarrioParaVinculo('b1')
    expect(result).toBe(FAKE_BARRIO)
  })

  it('lanza BarrioNoEncontradoError si el barrioId es inválido — nunca se acepta en silencio', async () => {
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    await expect(resolverBarrioParaVinculo('fantasma')).rejects.toBeInstanceOf(BarrioNoEncontradoError)
  })
})
