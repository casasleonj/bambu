/**
 * Tests for the role-permission matrix.
 *
 * Critical invariants:
 *   - REPARTIDOR is restricted to /repartidor + /mi-perfil (and /cambiar-contrasena)
 *     per BLOQUEAR_PRECIOS_REPARTIDOR = Opción C. Other pages send raw prices
 *     in the HTML/JSON payload — granting access would violate the rule.
 *   - ADMIN has all permissions.
 *   - Other roles have a stable minimum set.
 */
import { describe, it, expect } from 'vitest'
import {
  userCan,
  getUserPermissions,
  isRouteAllowed,
  getRedirectForRole,
} from '@/lib/permissions'
import { ROLES } from '@/lib/constants'

describe('REPARTIDOR restrictions (BLOQUEAR_PRECIOS_REPARTIDOR = Opción C)', () => {
  it('has only view:repartidor and view:mi-perfil', () => {
    const perms = getUserPermissions(ROLES.REPARTIDOR)
    expect(perms).toEqual(['view:repartidor', 'view:mi-perfil'])
  })

  it('cannot view dashboard', () => {
    expect(userCan(ROLES.REPARTIDOR, 'view:dashboard')).toBe(false)
  })

  it('cannot view pedidos', () => {
    expect(userCan(ROLES.REPARTIDOR, 'view:pedidos')).toBe(false)
  })

  it('cannot view embarques', () => {
    expect(userCan(ROLES.REPARTIDOR, 'view:embarques')).toBe(false)
  })

  it('cannot view rutas', () => {
    expect(userCan(ROLES.REPARTIDOR, 'view:rutas')).toBe(false)
  })

  it('can view repartidor', () => {
    expect(userCan(ROLES.REPARTIDOR, 'view:repartidor')).toBe(true)
  })

  it('can view mi-perfil', () => {
    expect(userCan(ROLES.REPARTIDOR, 'view:mi-perfil')).toBe(true)
  })

  it('isRouteAllowed returns false for /dashboard', () => {
    expect(isRouteAllowed('/dashboard', ROLES.REPARTIDOR)).toBe(false)
  })

  it('isRouteAllowed returns false for /pedidos', () => {
    expect(isRouteAllowed('/pedidos', ROLES.REPARTIDOR)).toBe(false)
  })

  it('isRouteAllowed returns false for /embarques', () => {
    expect(isRouteAllowed('/embarques', ROLES.REPARTIDOR)).toBe(false)
  })

  it('isRouteAllowed returns false for /rutas', () => {
    expect(isRouteAllowed('/rutas', ROLES.REPARTIDOR)).toBe(false)
  })

  it('isRouteAllowed returns true for /repartidor', () => {
    expect(isRouteAllowed('/repartidor', ROLES.REPARTIDOR)).toBe(true)
  })

  it('isRouteAllowed returns true for /mi-perfil', () => {
    expect(isRouteAllowed('/mi-perfil', ROLES.REPARTIDOR)).toBe(true)
  })

  it('getRedirectForRole returns /repartidor for REPARTIDOR', () => {
    expect(getRedirectForRole(ROLES.REPARTIDOR)).toBe('/repartidor')
  })
})

describe('ADMIN permissions', () => {
  it('has all permissions', () => {
    const perms = getUserPermissions(ROLES.ADMIN)
    expect(perms.length).toBeGreaterThan(20) // ALL_PERMISSIONS
    expect(userCan(ROLES.ADMIN, 'view:dashboard')).toBe(true)
    expect(userCan(ROLES.ADMIN, 'view:configuracion')).toBe(true)
    expect(userCan(ROLES.ADMIN, 'view:usuarios')).toBe(true)
  })
})

describe('SELLADOR permissions', () => {
  it('has only dashboard, produccion, mi-perfil', () => {
    const perms = getUserPermissions(ROLES.SELLADOR)
    expect(perms).toEqual(['view:dashboard', 'view:produccion', 'view:mi-perfil'])
  })

  it('cannot view repartidor (repartidor is for delivery, not sellado)', () => {
    expect(userCan(ROLES.SELLADOR, 'view:repartidor')).toBe(false)
  })
})

describe('Edge cases', () => {
  it('userCan returns false for undefined role', () => {
    expect(userCan(undefined, 'view:dashboard')).toBe(false)
  })

  it('getUserPermissions returns [] for unknown role', () => {
    expect(getUserPermissions('UNKNOWN' as never)).toEqual([])
  })

  it('isRouteAllowed returns true for routes not in the map (no permission required)', () => {
    // Routes like /login, /offline, /api/* don't have a mapped permission,
    // so they should be allowed for any role.
    expect(isRouteAllowed('/some-unmapped-route', ROLES.REPARTIDOR)).toBe(true)
  })
})
