import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBaseCaja } from '@/hooks/use-base-caja'
import { getTodayString } from '@/lib/dates'

describe('useBaseCaja', () => {
  function getTodayKey() {
    return `baseDia_${getTodayString()}`
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('mantiene referencias estables de setBaseDia y clearBaseDia entre renders', () => {
    const { result, rerender } = renderHook(() => useBaseCaja())

    const setBaseDia1 = result.current.setBaseDia
    const clearBaseDia1 = result.current.clearBaseDia

    rerender()

    expect(result.current.setBaseDia).toBe(setBaseDia1)
    expect(result.current.clearBaseDia).toBe(clearBaseDia1)
  })

  it('persiste el valor en localStorage y actualiza el estado', () => {
    const { result } = renderHook(() => useBaseCaja())

    act(() => {
      result.current.setBaseDia('75000')
    })

    expect(result.current.baseDia).toBe('75000')
    expect(localStorage.getItem(getTodayKey())).toBe('75000')
  })

  it('limpia el valor de localStorage y del estado', () => {
    const { result } = renderHook(() => useBaseCaja())

    act(() => {
      result.current.setBaseDia('75000')
      result.current.clearBaseDia()
    })

    expect(result.current.baseDia).toBeNull()
    expect(localStorage.getItem(getTodayKey())).toBeNull()
  })

  it('sincroniza cambios de otras pestañas via storage event', () => {
    const { result } = renderHook(() => useBaseCaja())

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: getTodayKey(), newValue: '120000' }))
    })

    expect(result.current.baseDia).toBe('120000')
  })
})
