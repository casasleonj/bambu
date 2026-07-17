import { describe, it, expect } from 'vitest'
import { isRetryableStatus, calculateBackoff, shouldMoveToDLQ } from '../sync'

describe('sync pure functions', () => {
  it('isRetryableStatus: 401/409 false, 429/5xx/0 true, 4xx false', () => {
    expect(isRetryableStatus(401)).toBe(false)
    expect(isRetryableStatus(409)).toBe(false)
    expect(isRetryableStatus(429)).toBe(true)
    expect(isRetryableStatus(500)).toBe(true)
    expect(isRetryableStatus(400)).toBe(false)
    expect(isRetryableStatus(0)).toBe(true)
  })

  it('calculateBackoff: deterministic with randomFn=0', () => {
    expect(calculateBackoff(0, () => 0)).toBe(200)
    expect(calculateBackoff(1, () => 0)).toBe(400)
    expect(calculateBackoff(10, () => 0)).toBe(30000)
  })

  it('calculateBackoff: jitter adds random value', () => {
    const result = calculateBackoff(0, () => 0.5)
    expect(result).toBe(200 + 500)
  })

  it('shouldMoveToDLQ: true after MAX_ATTEMPTS', () => {
    const item = { attempts: 100, createdAt: new Date() }
    expect(shouldMoveToDLQ(item)).toBe(true)
  })

  it('shouldMoveToDLQ: true after MAX_AGE_MS', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    expect(shouldMoveToDLQ({ attempts: 0, createdAt: old })).toBe(true)
  })

  it('shouldMoveToDLQ: false when young and few attempts', () => {
    expect(shouldMoveToDLQ({ attempts: 1, createdAt: new Date() })).toBe(false)
  })
})
