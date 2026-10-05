// @tests zona-service — F3 Zona territorial (ALS/Plan Técnico Barrio/Zona/
// Distribución). Cubre: búsqueda, CRUD con auditoría atómica (rollback si
// falla logAudit), y el contrato de solapamiento de agregarBarrioAZona
// (detectar -> informar -> confirmación explícita -> persistir, SIEMPRE
// recalculado contra la DB, nunca contra lo que el caller afirme haber
// visto antes).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  zona: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  barrio: {
    findUnique: vi.fn(),
  },
  zonaBarrio: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  historial: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))

import { BarrioNoEncontradoError } from '@/lib/barrios/barrio-service'
import {
  ZonaNoEncontradaError,
  ZonaBarrioNoEncontradoError,
  agregarBarrioAZona,
  archivarZona,
  buscarZonas,
  crearZona,
  obtenerZonasDeBarrio,
  quitarBarrioDeZona,
  reactivarZona,
  renombrarZona,
} from '../zona-service'

const FAKE_ZONA = { id: 'z1', nombre: 'Norte', nombreNormalizado: 'norte', activo: true }
const FAKE_ZONA_SUR = { id: 'z2', nombre: 'Sur', nombreNormalizado: 'sur', activo: true }
const FAKE_BARRIO = { id: 'b1', nombre: 'El Carmen', nombreNormalizado: 'el carmen', activo: true }

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.historial.create.mockResolvedValue({})
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma))
})

describe('buscarZonas', () => {
  it('filtra por activo=true por defecto', async () => {
    mockPrisma.zona.findMany.mockResolvedValue([FAKE_ZONA])
    await buscarZonas('nort')
    expect(mockPrisma.zona.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ activo: true }) }),
    )
  })

  it('incluye inactivas cuando se pide explícitamente', async () => {
    mockPrisma.zona.findMany.mockResolvedValue([])
    await buscarZonas('nort', { incluirInactivas: true })
    const where = mockPrisma.zona.findMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty('activo')
  })

  it('usa substring determinista sobre nombreNormalizado, no fuzzy', async () => {
    mockPrisma.zona.findMany.mockResolvedValue([])
    await buscarZonas('Norte')
    const where = mockPrisma.zona.findMany.mock.calls[0][0].where
    expect(where.nombreNormalizado).toEqual({ contains: 'norte' })
  })

  it('incluye el conteo de barrios', async () => {
    mockPrisma.zona.findMany.mockResolvedValue([])
    await buscarZonas('')
    expect(mockPrisma.zona.findMany.mock.calls[0][0].include).toEqual({ _count: { select: { barrios: true } } })
  })
})

describe('crearZona', () => {
  it('crea con nombre trimmed + nombreNormalizado, dentro de una transacción, y audita', async () => {
    mockPrisma.zona.create.mockResolvedValue(FAKE_ZONA)

    const zona = await crearZona('  Norte  ', 'user1')

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.zona.create).toHaveBeenCalledWith({
      data: { nombre: 'Norte', nombreNormalizado: 'norte' },
    })
    expect(mockPrisma.historial.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entidad: 'Zona', accion: 'CREATE', usuarioId: 'user1' }),
      }),
    )
    expect(zona).toEqual(FAKE_ZONA)
  })

  it('si falla la auditoría, la creación hace rollback (el error se propaga, no se silencia)', async () => {
    mockPrisma.zona.create.mockResolvedValue(FAKE_ZONA)
    mockPrisma.historial.create.mockRejectedValue(new Error('DB caída'))

    await expect(crearZona('Norte', 'user1')).rejects.toThrow('DB caída')
  })
})

describe('renombrarZona / archivarZona / reactivarZona', () => {
  it('renombrarZona lanza ZonaNoEncontradaError si no existe', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(null)
    await expect(renombrarZona('nope', 'Nuevo', 'user1')).rejects.toBeInstanceOf(ZonaNoEncontradaError)
  })

  it('renombrarZona actualiza nombre/nombreNormalizado y audita con antes/después', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA)
    mockPrisma.zona.update.mockResolvedValue({ ...FAKE_ZONA, nombre: 'Norte Alto', nombreNormalizado: 'norte alto' })

    await renombrarZona('z1', 'Norte Alto', 'user1')

    expect(mockPrisma.zona.update).toHaveBeenCalledWith({
      where: { id: 'z1' },
      data: { nombre: 'Norte Alto', nombreNormalizado: 'norte alto' },
    })
    const datos = mockPrisma.historial.create.mock.calls[0][0].data
    expect(JSON.parse(datos.datos)).toMatchObject({ cambios: { nombre: 'Norte Alto' }, antes: { nombre: 'Norte' } })
  })

  it('archivarZona setea activo=false y audita como DELETE', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA)
    mockPrisma.zona.update.mockResolvedValue({ ...FAKE_ZONA, activo: false })

    await archivarZona('z1', 'user1')

    expect(mockPrisma.zona.update).toHaveBeenCalledWith({ where: { id: 'z1' }, data: { activo: false } })
    expect(mockPrisma.historial.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'DELETE' }) }),
    )
  })

  it('reactivarZona setea activo=true y audita como RESTORE', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue({ ...FAKE_ZONA, activo: false })
    mockPrisma.zona.update.mockResolvedValue(FAKE_ZONA)

    await reactivarZona('z1', 'user1')

    expect(mockPrisma.zona.update).toHaveBeenCalledWith({ where: { id: 'z1' }, data: { activo: true } })
    expect(mockPrisma.historial.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ accion: 'RESTORE' }) }),
    )
  })

  it('archivarZona/reactivarZona lanzan ZonaNoEncontradaError si no existe', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(null)
    await expect(archivarZona('nope', 'user1')).rejects.toBeInstanceOf(ZonaNoEncontradaError)
    await expect(reactivarZona('nope', 'user1')).rejects.toBeInstanceOf(ZonaNoEncontradaError)
  })
})

describe('obtenerZonasDeBarrio', () => {
  it('excluye la zona indicada en excluirZonaId', async () => {
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([])
    await obtenerZonasDeBarrio('b1', { excluirZonaId: 'z1' })
    expect(mockPrisma.zonaBarrio.findMany.mock.calls[0][0].where).toMatchObject({
      barrioId: 'b1',
      zonaId: { not: 'z1' },
    })
  })

  it('filtra solo zonas activas cuando soloActivas=true', async () => {
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([])
    await obtenerZonasDeBarrio('b1', { soloActivas: true })
    expect(mockPrisma.zonaBarrio.findMany.mock.calls[0][0].where).toMatchObject({
      zona: { activo: true },
    })
  })
})

describe('agregarBarrioAZona — contrato de solapamiento (ALS §7-8)', () => {
  it('sin solapamiento: crea directamente, sin pedir confirmación', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA)
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([]) // sin otras zonas
    mockPrisma.zonaBarrio.create.mockResolvedValue({ zonaId: 'z1', barrioId: 'b1', source: 'USER' })

    const resultado = await agregarBarrioAZona('z1', 'b1', 'user1')

    expect(resultado.status).toBe('created')
    expect(mockPrisma.zonaBarrio.create).toHaveBeenCalledWith({
      data: { zonaId: 'z1', barrioId: 'b1', source: 'USER', createdBy: 'user1' },
    })
  })

  it('con solapamiento y SIN confirmOverlap: NO crea ZonaBarrio, devuelve requires_confirmation', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA_SUR)
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([{ zona: { id: 'z1', nombre: 'Norte' } }])

    const resultado = await agregarBarrioAZona('z2', 'b1', 'user1')

    expect(resultado).toEqual({
      status: 'requires_confirmation',
      overlapDetected: true,
      existingZones: [{ id: 'z1', nombre: 'Norte' }],
    })
    expect(mockPrisma.zonaBarrio.create).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('con solapamiento y confirmOverlap=true: SÍ crea, dentro de transacción, y audita el solapamiento', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA_SUR)
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([{ zona: { id: 'z1', nombre: 'Norte' } }])
    mockPrisma.zonaBarrio.create.mockResolvedValue({ zonaId: 'z2', barrioId: 'b1', source: 'USER' })

    const resultado = await agregarBarrioAZona('z2', 'b1', 'user1', { confirmOverlap: true })

    expect(resultado.status).toBe('created')
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    const datos = JSON.parse(mockPrisma.historial.create.mock.calls[0][0].data.datos)
    expect(datos).toMatchObject({
      overlapDetected: true,
      confirmadoPorAdmin: true,
      existingZonesAlConfirmar: [{ id: 'z1', nombre: 'Norte' }],
    })
  })

  it('recalcula el solapamiento SIEMPRE contra la DB — confirmOverlap no evita la re-consulta', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA_SUR)
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([])
    mockPrisma.zonaBarrio.create.mockResolvedValue({ zonaId: 'z2', barrioId: 'b1', source: 'USER' })

    await agregarBarrioAZona('z2', 'b1', 'user1', { confirmOverlap: true })

    // Si el solapamiento ya no existe al momento de confirmar, se crea
    // igual (no es un error) pero la llamada a la DB para recalcularlo
    // SIEMPRE ocurrió — nunca se confía en un existingZones del request.
    expect(mockPrisma.zonaBarrio.findMany).toHaveBeenCalled()
  })

  it('lanza ZonaNoEncontradaError si la zona no existe', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(null)
    await expect(agregarBarrioAZona('nope', 'b1', 'user1')).rejects.toBeInstanceOf(ZonaNoEncontradaError)
  })

  it('lanza BarrioNoEncontradoError si el barrio no existe', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA)
    mockPrisma.barrio.findUnique.mockResolvedValue(null)
    await expect(agregarBarrioAZona('z1', 'nope', 'user1')).rejects.toBeInstanceOf(BarrioNoEncontradoError)
  })

  it('source por defecto es USER; createdBy sale del parámetro usuarioId, nunca de un valor libre', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA)
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([])
    mockPrisma.zonaBarrio.create.mockResolvedValue({})

    await agregarBarrioAZona('z1', 'b1', 'user-real')

    expect(mockPrisma.zonaBarrio.create).toHaveBeenCalledWith({
      data: { zonaId: 'z1', barrioId: 'b1', source: 'USER', createdBy: 'user-real' },
    })
  })

  it('si falla la auditoría del alta, la creación hace rollback', async () => {
    mockPrisma.zona.findUnique.mockResolvedValue(FAKE_ZONA)
    mockPrisma.barrio.findUnique.mockResolvedValue(FAKE_BARRIO)
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([])
    mockPrisma.zonaBarrio.create.mockResolvedValue({})
    mockPrisma.historial.create.mockRejectedValue(new Error('Auditoría caída'))

    await expect(agregarBarrioAZona('z1', 'b1', 'user1')).rejects.toThrow('Auditoría caída')
  })
})

describe('quitarBarrioDeZona', () => {
  it('lanza ZonaBarrioNoEncontradoError si el vínculo no existe', async () => {
    mockPrisma.zonaBarrio.findUnique.mockResolvedValue(null)
    await expect(quitarBarrioDeZona('z1', 'b1', 'user1')).rejects.toBeInstanceOf(ZonaBarrioNoEncontradoError)
    expect(mockPrisma.zonaBarrio.delete).not.toHaveBeenCalled()
  })

  it('borra el vínculo (no la Zona ni el Barrio), audita, y devuelve zonasRestantes', async () => {
    mockPrisma.zonaBarrio.findUnique.mockResolvedValue({ zonaId: 'z1', barrioId: 'b1' })
    mockPrisma.zonaBarrio.delete.mockResolvedValue({})
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([{ zona: { id: 'z2', nombre: 'Sur' } }])

    const resultado = await quitarBarrioDeZona('z1', 'b1', 'user1')

    expect(mockPrisma.zonaBarrio.delete).toHaveBeenCalledWith({ where: { zonaId_barrioId: { zonaId: 'z1', barrioId: 'b1' } } })
    expect(resultado.zonasRestantes).toEqual([{ id: 'z2', nombre: 'Sur' }])
    expect(mockPrisma.historial.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entidad: 'ZonaBarrio', accion: 'DELETE' }) }),
    )
  })

  it('quitar un barrio compartido de una zona no afecta su vínculo en otra (zonasRestantes lo refleja)', async () => {
    mockPrisma.zonaBarrio.findUnique.mockResolvedValue({ zonaId: 'z1', barrioId: 'b1' })
    mockPrisma.zonaBarrio.delete.mockResolvedValue({})
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([{ zona: { id: 'z2', nombre: 'Sur' } }])

    const { zonasRestantes } = await quitarBarrioDeZona('z1', 'b1', 'user1')

    expect(zonasRestantes).toHaveLength(1)
    expect(zonasRestantes[0].nombre).toBe('Sur')
  })

  it('si falla la auditoría del delete, hace rollback (no queda borrado a medias)', async () => {
    mockPrisma.zonaBarrio.findUnique.mockResolvedValue({ zonaId: 'z1', barrioId: 'b1' })
    mockPrisma.zonaBarrio.delete.mockResolvedValue({})
    mockPrisma.zonaBarrio.findMany.mockResolvedValue([])
    mockPrisma.historial.create.mockRejectedValue(new Error('Auditoría caída'))

    await expect(quitarBarrioDeZona('z1', 'b1', 'user1')).rejects.toThrow('Auditoría caída')
  })
})
