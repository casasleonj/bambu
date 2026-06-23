import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  normalizePhone,
  normalizeString,
  parseDate,
  parseMoney,
  parseInteger,
  normalizeTime,
  slugifyColumnName,
} from '../normalizer'

describe('normalizer', () => {
  describe('normalizeString', () => {
    it('removes accents and trims', () => {
      expect(normalizeString('  José Pérez  ')).toBe('Jose Perez')
    })

    it('handles null/undefined', () => {
      expect(normalizeString(null)).toBe('')
      expect(normalizeString(undefined)).toBe('')
    })
  })

  describe('normalizeName', () => {
    it('lowercases, removes accents and collapses whitespace', () => {
      expect(normalizeName('  María   PÉREZ  ')).toBe('maria perez')
    })
  })

  describe('normalizePhone', () => {
    it('normalizes 10-digit mobile to E.164', () => {
      expect(normalizePhone('3001234567').normalized).toBe('573001234567')
      expect(normalizePhone('3001234567').isValid).toBe(true)
    })

    it('normalizes +57 format', () => {
      expect(normalizePhone('+57 300 123 4567').normalized).toBe('573001234567')
      expect(normalizePhone('+57 300 123 4567').isValid).toBe(true)
    })

    it('keeps already-E.164 12-digit number', () => {
      expect(normalizePhone('573001234567').normalized).toBe('573001234567')
      expect(normalizePhone('573001234567').isValid).toBe(true)
    })

    it('marks invalid phones', () => {
      expect(normalizePhone('123').isValid).toBe(false)
      expect(normalizePhone('').isValid).toBe(false)
    })

    it('normalizes fixed 7-digit number', () => {
      expect(normalizePhone('1234567').normalized).toBe('571234567')
      expect(normalizePhone('1234567').isValid).toBe(true)
    })
  })

  describe('parseMoney', () => {
    it('parses plain number', () => {
      expect(parseMoney('1500')?.toNumber()).toBe(1500)
    })

    it('parses Colombian format with dots and comma decimals', () => {
      expect(parseMoney('$ 1.500,00')?.toNumber()).toBe(1500)
      expect(parseMoney('1.234.567,89')?.toNumber()).toBe(1234567.89)
    })

    it('parses US format with comma thousands', () => {
      expect(parseMoney('1,500.00')?.toNumber()).toBe(1500)
    })

    it('parses integer with dot as thousands', () => {
      expect(parseMoney('1.500')?.toNumber()).toBe(1500)
    })

    it('returns null for invalid', () => {
      expect(parseMoney('')).toBeNull()
      expect(parseMoney('foo')).toBeNull()
    })
  })

  describe('parseInteger', () => {
    it('parses integers', () => {
      expect(parseInteger('42')).toBe(42)
      expect(parseInteger(42)).toBe(42)
    })

    it('ignores non-digit characters', () => {
      expect(parseInteger('42 pacas')).toBe(42)
    })

    it('returns null for invalid', () => {
      expect(parseInteger('')).toBeNull()
      expect(parseInteger('foo')).toBeNull()
    })
  })

  describe('parseDate', () => {
    it('parses DD/MM/AAAA by default', () => {
      const date = parseDate('15/03/2024')
      expect(date?.toISOString()).toBe('2024-03-15T00:00:00.000Z')
    })

    it('uses DD/MM heuristic when both parts <= 12', () => {
      const date = parseDate('05/04/2024')
      expect(date?.toISOString()).toBe('2024-04-05T00:00:00.000Z')
    })

    it('parses ISO date', () => {
      const date = parseDate('2024-03-15')
      expect(date?.toISOString()).toBe('2024-03-15T00:00:00.000Z')
    })

    it('parses Spanish text date', () => {
      const date = parseDate('15 de marzo de 2024')
      expect(date?.toISOString()).toBe('2024-03-15T00:00:00.000Z')
    })

    it('parses date with time', () => {
      const date = parseDate('15/03/2024 14:30')
      expect(date?.toISOString()).toBe('2024-03-15T14:30:00.000Z')
    })

    it('returns null for invalid', () => {
      expect(parseDate('')).toBeNull()
      expect(parseDate('no es fecha')).toBeNull()
    })

    it('respects explicit MM/DD/AAAA format', () => {
      const date = parseDate('03/15/2024', 'MM/DD/AAAA')
      expect(date?.toISOString()).toBe('2024-03-15T00:00:00.000Z')
    })
  })

  describe('normalizeTime', () => {
    it('normalizes HH:MM', () => {
      expect(normalizeTime('14:30')).toBe('14:30')
    })

    it('converts 12-hour format', () => {
      expect(normalizeTime('2:30 PM')).toBe('14:30')
      expect(normalizeTime('12:00 AM')).toBe('00:00')
    })

    it('returns null for invalid', () => {
      expect(normalizeTime('')).toBeNull()
    })
  })

  describe('slugifyColumnName', () => {
    it('slugifies Spanish headers', () => {
      expect(slugifyColumnName('Teléfono del cliente')).toBe('telefono_del_cliente')
      expect(slugifyColumnName('PACA_AGUA precio')).toBe('paca_agua_precio')
    })
  })
})
