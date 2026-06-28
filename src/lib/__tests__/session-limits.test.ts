import { describe, it, expect } from 'vitest'
import { getSessionLimit, isLoginCapableRole, SESSION_LIMITS } from '@/lib/session-limits'
import { ROLES } from '@/lib/constants'

describe('session-limits', () => {
  it('ADMIN y ASISTENTE tienen límite 2', () => {
    expect(SESSION_LIMITS[ROLES.ADMIN]).toBe(2)
    expect(SESSION_LIMITS[ROLES.ASISTENTE]).toBe(2)
    expect(getSessionLimit(ROLES.ADMIN)).toBe(2)
    expect(getSessionLimit(ROLES.ASISTENTE)).toBe(2)
  })

  it('CONTADOR, REPARTIDOR y SELLADOR tienen límite 1', () => {
    expect(SESSION_LIMITS[ROLES.CONTADOR]).toBe(1)
    expect(SESSION_LIMITS[ROLES.REPARTIDOR]).toBe(1)
    expect(SESSION_LIMITS[ROLES.SELLADOR]).toBe(1)
    expect(getSessionLimit(ROLES.CONTADOR)).toBe(1)
    expect(getSessionLimit(ROLES.REPARTIDOR)).toBe(1)
    expect(getSessionLimit(ROLES.SELLADOR)).toBe(1)
  })

  it('getSessionLimit fallback a 1 para rol desconocido', () => {
    expect(getSessionLimit('UNKNOWN' as never)).toBe(1)
  })

  it('isLoginCapableRole acepta roles válidos', () => {
    expect(isLoginCapableRole('ADMIN')).toBe(true)
    expect(isLoginCapableRole('ASISTENTE')).toBe(true)
    expect(isLoginCapableRole('CONTADOR')).toBe(true)
    expect(isLoginCapableRole('REPARTIDOR')).toBe(true)
    expect(isLoginCapableRole('SELLADOR')).toBe(true)
  })

  it('isLoginCapableRole rechaza roles inválidos o undefined', () => {
    expect(isLoginCapableRole('EMPACADOR')).toBe(false)
    expect(isLoginCapableRole('ENTUBADOR')).toBe(false)
    expect(isLoginCapableRole(undefined)).toBe(false)
    expect(isLoginCapableRole('')).toBe(false)
  })
})
