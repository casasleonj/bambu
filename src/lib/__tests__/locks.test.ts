import { describe, it, expect } from 'vitest'
import {
  LOCK_NAMESPACES,
  advisoryLockKey,
  withAdvisoryLock,
  withAdvisoryLockTx,
  acquireAdvisoryLockTx,
} from '@/lib/locks'

describe('LOCK_NAMESPACES (contrato §5/§6)', () => {
  it('define todos los namespaces del contrato', () => {
    expect(LOCK_NAMESPACES).toContain('CARTERA')
    expect(LOCK_NAMESPACES).toContain('PEDIDO')
    expect(LOCK_NAMESPACES).toContain('RECOVERY_SOURCE')
    expect(LOCK_NAMESPACES).toContain('OBLIGACION')
    expect(LOCK_NAMESPACES).toContain('EMBARQUE_CARGA')
    expect(LOCK_NAMESPACES).toContain('CIERRE')
    expect(LOCK_NAMESPACES).toContain('SECUENCIA')
  })

  it('tiene exactamente 7 namespaces', () => {
    expect(LOCK_NAMESPACES).toHaveLength(7)
  })
})

describe('advisoryLockKey', () => {
  it('deriva "namespace:entityKey" determinista', () => {
    expect(advisoryLockKey('CARTERA', 'cliente-1')).toBe('CARTERA:cliente-1')
    expect(advisoryLockKey('CIERRE', 'embarque-9')).toBe('CIERRE:embarque-9')
  })
})

describe('API de locks', () => {
  it('withAdvisoryLock es una función async', () => {
    expect(typeof withAdvisoryLock).toBe('function')
    expect(withAdvisoryLock.constructor.name).toBe('AsyncFunction')
  })

  it('withAdvisoryLock recibe (namespace, entityKey, fn)', () => {
    expect(withAdvisoryLock.length).toBe(3)
  })

  it('withAdvisoryLockTx es la variante explícita con tx ya abierta', () => {
    expect(typeof withAdvisoryLockTx).toBe('function')
    expect(withAdvisoryLockTx.length).toBe(4)
  })

  it('acquireAdvisoryLockTx es el primitivo de bajo nivel', () => {
    expect(typeof acquireAdvisoryLockTx).toBe('function')
    expect(acquireAdvisoryLockTx.length).toBe(3)
  })
})
