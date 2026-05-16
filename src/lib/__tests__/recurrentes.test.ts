import { describe, it, expect } from 'vitest'
import { sanitizarSaltos } from '@/lib/recurrentes'

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

describe('sanitizarSaltos', () => {
  it('returns empty for empty input', () => {
    expect(sanitizarSaltos([])).toEqual([])
  })

  it('keeps dates within last 30 days', () => {
    const reciente = daysAgo(5)
    expect(sanitizarSaltos([reciente])).toEqual([reciente])
  })

  it('removes dates older than 30 days', () => {
    const viejo = daysAgo(60)
    expect(sanitizarSaltos([viejo])).toEqual([])
  })

  it('remixes old and recent, keeping only recent', () => {
    const viejo = daysAgo(45)
    const reciente = daysAgo(3)
    expect(sanitizarSaltos([viejo, reciente])).toEqual([reciente])
  })

  it('caps at 365 entries', () => {
    const many = Array.from({ length: 500 }, (_, i) => daysAgo(i))
    const result = sanitizarSaltos(many)
    expect(result.length).toBeLessThanOrEqual(365)
  })

  it('preserves future dates', () => {
    const futuro = daysFromNow(5)
    expect(sanitizarSaltos([futuro])).toEqual([futuro])
  })

  it('handles today date', () => {
    const hoy = todayISO()
    expect(sanitizarSaltos([hoy])).toEqual([hoy])
  })

  it('does not mutate original array', () => {
    const original = [daysAgo(5), daysAgo(60)]
    const copy = [...original]
    sanitizarSaltos(original)
    expect(original).toEqual(copy)
  })
})
