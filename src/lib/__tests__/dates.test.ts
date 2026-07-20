import { describe, it, expect } from 'vitest'
import { getTodayRange, getDateRange, getYesterdayRange, getTodayString, getPresetDate, buildDateRangeFilter } from '@/lib/dates'

describe('getTodayRange', () => {
  it('returns an object with startOfDay and endOfDay keys', () => {
    const range = getTodayRange()
    expect(range).toHaveProperty('startOfDay')
    expect(range).toHaveProperty('endOfDay')
  })

  it('returns Date instances', () => {
    const range = getTodayRange()
    expect(range.startOfDay).toBeInstanceOf(Date)
    expect(range.endOfDay).toBeInstanceOf(Date)
  })

  it('has startOfDay before endOfDay', () => {
    const range = getTodayRange()
    expect(range.startOfDay.getTime()).toBeLessThan(range.endOfDay.getTime())
  })

  it('startOfDay has UTC hours = 5 (CO offset -05:00)', () => {
    const range = getTodayRange()
    expect(range.startOfDay.getUTCHours()).toBe(5)
    expect(range.startOfDay.getUTCMinutes()).toBe(0)
    expect(range.startOfDay.getUTCSeconds()).toBe(0)
    expect(range.startOfDay.getUTCMilliseconds()).toBe(0)
  })

  it('endOfDay has UTC hours = 4, minutes 59, seconds 59, ms 999 (next UTC day)', () => {
    const range = getTodayRange()
    expect(range.endOfDay.getUTCHours()).toBe(4)
    expect(range.endOfDay.getUTCMinutes()).toBe(59)
    expect(range.endOfDay.getUTCSeconds()).toBe(59)
    expect(range.endOfDay.getUTCMilliseconds()).toBe(999)
  })

  it('endOfDay UTC date is startOfDay UTC date + 1', () => {
    const range = getTodayRange()
    expect(range.endOfDay.getUTCDate()).toBe(range.startOfDay.getUTCDate() + 1)
  })

  it('covers full 24h minus 1ms range', () => {
    const range = getTodayRange()
    const diff = range.endOfDay.getTime() - range.startOfDay.getTime()
    expect(diff).toBe(24 * 60 * 60 * 1000 - 1) // 86399999 ms
  })

  it('does not mutate across calls', () => {
    const range1 = getTodayRange()
    const range2 = getTodayRange()
    expect(range1.startOfDay.getTime()).toBe(range2.startOfDay.getTime())
    expect(range1.endOfDay.getTime()).toBe(range2.endOfDay.getTime())
  })
})

describe('getDateRange', () => {
  it('returns an object with startDate and endDate keys', () => {
    const range = getDateRange('2024-01-15', '2024-01-16')
    expect(range).toHaveProperty('startDate')
    expect(range).toHaveProperty('endDate')
  })

  it('returns Date instances for valid date strings', () => {
    const range = getDateRange('2024-01-15', '2024-01-16')
    expect(range.startDate).toBeInstanceOf(Date)
    expect(range.endDate).toBeInstanceOf(Date)
  })

  it('sets startDate to 00:00:00.000-05:00 of start date', () => {
    const range = getDateRange('2024-01-15', '2024-01-16')
    expect(range.startDate.getUTCHours()).toBe(5)
    expect(range.startDate.getUTCMinutes()).toBe(0)
    expect(range.startDate.getUTCSeconds()).toBe(0)
    expect(range.startDate.getUTCMilliseconds()).toBe(0)
  })

  it('sets endDate to 23:59:59.999-05:00 of end date', () => {
    const range = getDateRange('2024-01-15', '2024-01-16')
    expect(range.endDate.getUTCHours()).toBe(4)
    expect(range.endDate.getUTCMinutes()).toBe(59)
    expect(range.endDate.getUTCSeconds()).toBe(59)
    expect(range.endDate.getUTCMilliseconds()).toBe(999)
  })

  it('works with same start and end date', () => {
    const range = getDateRange('2024-06-15', '2024-06-15')
    expect(range.startDate.getTime()).toBeLessThan(range.endDate.getTime())
  })

  it('handles date strings in any valid format', () => {
    const range = getDateRange('2024-12-31', '2025-01-01')
    expect(range.startDate).toBeInstanceOf(Date)
    expect(range.endDate).toBeInstanceOf(Date)
    expect(range.startDate.getTime()).toBeLessThan(range.endDate.getTime())
  })

  it('start is before end when start date < end date', () => {
    const range = getDateRange('2024-01-01', '2024-12-31')
    expect(range.startDate.getTime()).toBeLessThan(range.endDate.getTime())
  })

  it('produces Invalid Date for malformed input', () => {
    const range = getDateRange('not-a-date', 'also-not-a-date')
    expect(range.startDate.getTime()).toBeNaN()
    expect(range.endDate.getTime()).toBeNaN()
  })
})

describe('getYesterdayRange', () => {
  it('returns an object with startOfDay and endOfDay keys', () => {
    const range = getYesterdayRange()
    expect(range).toHaveProperty('startOfDay')
    expect(range).toHaveProperty('endOfDay')
  })

  it('returns Date instances', () => {
    const range = getYesterdayRange()
    expect(range.startOfDay).toBeInstanceOf(Date)
    expect(range.endOfDay).toBeInstanceOf(Date)
  })

  it('has startOfDay before endOfDay', () => {
    const range = getYesterdayRange()
    expect(range.startOfDay.getTime()).toBeLessThan(range.endOfDay.getTime())
  })

  it('startOfDay UTC hours = 5 (CO offset)', () => {
    const range = getYesterdayRange()
    expect(range.startOfDay.getUTCHours()).toBe(5)
    expect(range.startOfDay.getUTCMinutes()).toBe(0)
    expect(range.startOfDay.getUTCSeconds()).toBe(0)
    expect(range.startOfDay.getUTCMilliseconds()).toBe(0)
  })

  it('endOfDay UTC hours = 4, next UTC day', () => {
    const range = getYesterdayRange()
    expect(range.endOfDay.getUTCHours()).toBe(4)
    expect(range.endOfDay.getUTCMinutes()).toBe(59)
    expect(range.endOfDay.getUTCSeconds()).toBe(59)
    expect(range.endOfDay.getUTCMilliseconds()).toBe(999)
  })

  it('covers full 24h minus 1ms range', () => {
    const range = getYesterdayRange()
    const diff = range.endOfDay.getTime() - range.startOfDay.getTime()
    expect(diff).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('endOfDay is 1ms before the next UTC calendar day', () => {
    const range = getYesterdayRange()
    const nextDay = new Date(range.startOfDay.getTime())
    nextDay.setUTCDate(nextDay.getUTCDate() + 1)
    expect(range.endOfDay.getTime()).toBe(nextDay.getTime() - 1)
  })
})

describe('getTodayString', () => {
  it('returns a string', () => {
    expect(typeof getTodayString()).toBe('string')
  })

  it('returns YYYY-MM-DD format', () => {
    const result = getTodayString()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('has month between 01 and 12', () => {
    const result = getTodayString()
    const month = parseInt(result.split('-')[1], 10)
    expect(month).toBeGreaterThanOrEqual(1)
    expect(month).toBeLessThanOrEqual(12)
  })

  it('has day between 01 and 31', () => {
    const result = getTodayString()
    const day = parseInt(result.split('-')[2], 10)
    expect(day).toBeGreaterThanOrEqual(1)
    expect(day).toBeLessThanOrEqual(31)
  })

  it('is consistent across calls in same execution', () => {
    const result1 = getTodayString()
    const result2 = getTodayString()
    expect(result1).toBe(result2)
  })

  it('matches the date part of getTodayRange startOfDay (in -05:00)', () => {
    const today = getTodayString()
    const range = getTodayRange()
    // startOfDay in UTC is +5h, so convert back to CO date string
    const utcIso = range.startOfDay.toISOString().split('T')[0]
    // Since startOfDay in CO is 5h behind UTC, a CO date X starts at UTC X 05:00
    // So if today in CO is 2026-05-04, getTodayRange().startOfDay ISO = 2026-05-04T05:00:00.000Z
    // which matches the date part
    expect(today).toBe(utcIso)
  })
})

describe('getPresetDate', () => {
  it('turno returns yesterday to today', () => {
    const result = getPresetDate('turno')
    expect(result).not.toBeNull()
    const hoy = getTodayString()
    const ayer = new Date()
    ayer.setDate(ayer.getDate() - 1)
    const ayerStr = ayer.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    expect(result?.desde).toBe(ayerStr)
    expect(result?.hasta).toBe(hoy)
  })
})

describe('buildDateRangeFilter', () => {
  it('returns undefined when both dates are empty', () => {
    expect(buildDateRangeFilter('', '')).toBeUndefined()
    expect(buildDateRangeFilter(null, undefined)).toBeUndefined()
  })

  it('returns only gte for partial desde', () => {
    const filter = buildDateRangeFilter('2024-06-15', '')
    expect(filter).toHaveProperty('gte')
    expect(filter).not.toHaveProperty('lte')
    expect(filter?.gte?.toISOString()).toBe('2024-06-15T05:00:00.000Z')
  })

  it('returns only lte for partial hasta', () => {
    const filter = buildDateRangeFilter('', '2024-06-15')
    expect(filter).not.toHaveProperty('gte')
    expect(filter).toHaveProperty('lte')
    expect(filter?.lte?.toISOString()).toBe('2024-06-16T04:59:59.999Z')
  })

  it('returns both bounds for complete range', () => {
    const filter = buildDateRangeFilter('2024-06-01', '2024-06-15')
    expect(filter?.gte?.toISOString()).toBe('2024-06-01T05:00:00.000Z')
    expect(filter?.lte?.toISOString()).toBe('2024-06-16T04:59:59.999Z')
  })

  it('trims whitespace around dates', () => {
    const filter = buildDateRangeFilter(' 2024-06-01 ', ' 2024-06-15 ')
    expect(filter?.gte?.toISOString()).toBe('2024-06-01T05:00:00.000Z')
    expect(filter?.lte?.toISOString()).toBe('2024-06-16T04:59:59.999Z')
  })
})
