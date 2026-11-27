import { describe, expect, it } from 'vitest'
import { dashboardDateRange, dashboardPreviousPeriod, dashboardToday } from './dashboard-date-range'

describe('dashboard date range (#922)', () => {
  it('uses Bogotá midnight and an exclusive end', () => {
    const range = dashboardDateRange('2026-11-19')
    expect(range.start.toISOString()).toBe('2026-11-19T05:00:00.000Z')
    expect(range.end.toISOString()).toBe('2026-11-20T05:00:00.000Z')
  })
  it('handles a leap day and year boundary', () => {
    expect(dashboardDateRange('2024-02-29').end.toISOString()).toBe('2024-03-01T05:00:00.000Z')
    expect(dashboardDateRange('2025-12-31', '2026-01-01').end.toISOString()).toBe('2026-01-02T05:00:00.000Z')
  })
  it('compares periods of equal duration', () => {
    const selected = dashboardDateRange('2026-11-14', '2026-11-20')
    const previous = dashboardPreviousPeriod(selected)
    expect(+selected.end - +selected.start).toBe(+previous.end - +previous.start)
    expect(previous.to).toBe('2026-11-13')
  })
  it('defaults to the Colombia business date', () => {
    expect(dashboardToday(new Date('2026-11-20T03:30:00Z')).from).toBe('2026-11-19')
  })
  it.each([['2026-02-29', '2026-02-29'], ['2026-13-01', '2026-13-01'], ['2026-11-20', '2026-11-19'], ['2026/11/20', '2026/11/20']])('rejects invalid ranges %s - %s', (from, to) => {
    expect(() => dashboardDateRange(from, to)).toThrow()
  })
})
