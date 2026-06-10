import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the module under test
vi.mock('@/lib/prisma', () => ({
  prisma: {
    config: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

// Mock next/cache so we don't depend on Next.js runtime
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { revalidateTag } from 'next/cache'
import {
  getConfig,
  getConfigs,
  getConfigBool,
  getConfigNumber,
  getConfigInt,
  revalidateConfigCache,
} from '@/lib/config'

const mockPrisma = prisma as unknown as {
  config: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getConfig', () => {
  it('returns the value when found', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'BASE_DIA', valor: '100000' })
    expect(await getConfig('BASE_DIA')).toBe('100000')
    expect(mockPrisma.config.findUnique).toHaveBeenCalledWith({ where: { clave: 'BASE_DIA' } })
  })

  it('returns null when not found', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce(null)
    expect(await getConfig('NONEXISTENT')).toBeNull()
  })
})

describe('getConfigs', () => {
  it('returns a map of values for the requested keys', async () => {
    mockPrisma.config.findMany.mockResolvedValueOnce([
      { clave: 'empresa_nombre', valor: 'Agua Bambú' },
      { clave: 'empresa_nit', valor: '900.123.456-7' },
    ])
    const result = await getConfigs(['empresa_nombre', 'empresa_nit'])
    expect(result).toEqual({
      empresa_nombre: 'Agua Bambú',
      empresa_nit: '900.123.456-7',
    })
  })

  it('returns empty map when nothing matches', async () => {
    mockPrisma.config.findMany.mockResolvedValueOnce([])
    expect(await getConfigs(['nope1', 'nope2'])).toEqual({})
  })
})

describe('getConfigBool', () => {
  it('returns true for "true" (case insensitive)', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'X', valor: 'TRUE' })
    expect(await getConfigBool('X')).toBe(true)
  })
  it('returns false for "false"', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'X', valor: 'false' })
    expect(await getConfigBool('X')).toBe(false)
  })
  it('returns false for any non-"true" value', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'X', valor: '1' })
    expect(await getConfigBool('X')).toBe(false)
  })
  it('returns default when missing', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce(null)
    expect(await getConfigBool('X', true)).toBe(true)
    expect(await getConfigBool('X')).toBe(false)
  })
})

describe('getConfigNumber', () => {
  it('parses valid number', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'BASE_DIA', valor: '100000' })
    expect(await getConfigNumber('BASE_DIA')).toBe(100000)
  })
  it('parses decimal', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'X', valor: '99.5' })
    expect(await getConfigNumber('X')).toBe(99.5)
  })
  it('returns default for NaN', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'X', valor: 'abc' })
    expect(await getConfigNumber('X', 50)).toBe(50)
  })
  it('returns default for null', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce(null)
    expect(await getConfigNumber('X', 0)).toBe(0)
  })
})

describe('getConfigInt', () => {
  it('returns integer when value is integer string', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'X', valor: '42' })
    expect(await getConfigInt('X')).toBe(42)
  })
  it('returns default for non-integer numeric value', async () => {
    mockPrisma.config.findUnique.mockResolvedValueOnce({ clave: 'X', valor: '42.5' })
    expect(await getConfigInt('X', 10)).toBe(10)
  })
})

describe('revalidateConfigCache', () => {
  it('calls revalidateTag with the config tag', () => {
    revalidateConfigCache()
    // Next.js 16 revalidateTag takes (tag, profile) — we use 'max' for full revalidation
    expect(revalidateTag).toHaveBeenCalledWith('config', 'max')
  })
})
