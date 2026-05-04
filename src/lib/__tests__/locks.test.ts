import { describe, it, expect } from 'vitest'
import { LOCK_IDS, withAdvisoryLock } from '@/lib/locks'

describe('LOCK_IDS', () => {
  it('defines all expected lock keys', () => {
    expect(LOCK_IDS).toHaveProperty('PEDIDO')
    expect(LOCK_IDS).toHaveProperty('FACTURA')
    expect(LOCK_IDS).toHaveProperty('EMBARQUE')
    expect(LOCK_IDS).toHaveProperty('ABONO')
    expect(LOCK_IDS).toHaveProperty('COMPRA')
    expect(LOCK_IDS).toHaveProperty('FACTURA_NUM')
    expect(LOCK_IDS).toHaveProperty('CIERRE')
  })

  it('has exactly 7 entries', () => {
    expect(Object.keys(LOCK_IDS)).toHaveLength(7)
  })

  it('all values are unique', () => {
    const values = Object.values(LOCK_IDS)
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it('all values are positive integers', () => {
    const values = Object.values(LOCK_IDS)
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
  })

  it('has sequential values from 1 to 7', () => {
    const values = Object.values(LOCK_IDS).sort((a, b) => a - b)
    expect(values).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('PEDIDO lock has ID 1', () => {
    expect(LOCK_IDS.PEDIDO).toBe(1)
  })

  it('CIERRE lock has ID 7', () => {
    expect(LOCK_IDS.CIERRE).toBe(7)
  })

  it('all keys are valid input for withAdvisoryLock type', () => {
    const keys = Object.keys(LOCK_IDS) as (keyof typeof LOCK_IDS)[]
    for (const key of keys) {
      expect(LOCK_IDS[key]).toBeDefined()
    }
  })
})

describe('withAdvisoryLock', () => {
  it('is a function', () => {
    expect(typeof withAdvisoryLock).toBe('function')
  })

  it('is an async function', () => {
    expect(withAdvisoryLock.constructor.name).toBe('AsyncFunction')
  })

  it('is named withAdvisoryLock', () => {
    expect(withAdvisoryLock.name).toBe('withAdvisoryLock')
  })

  it('accepts a lock name and a callback function', () => {
    expect(withAdvisoryLock.length).toBe(2)
  })
})
