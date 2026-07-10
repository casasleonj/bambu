import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'

const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

describe('useShallowSearchParams', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockSearchParams.forEach((_, key) => mockSearchParams.delete(key))
    pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
  })

  afterEach(() => {
    pushStateSpy.mockRestore()
    replaceStateSpy.mockRestore()
  })

  function setWindowSearch(search: string) {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search },
      writable: true,
    })
  }

  it('lee params con get y getAll', () => {
    mockSearchParams.set('search', 'foo')
    mockSearchParams.append('tipo', 'DOMICILIO')
    mockSearchParams.append('tipo', 'PUNTO')

    const { result } = renderHook(() => useShallowSearchParams())

    expect(result.current.get('search')).toBe('foo')
    expect(result.current.getAll('tipo')).toEqual(['DOMICILIO', 'PUNTO'])
  })

  it('set actualiza la URL con pushState por defecto', () => {
    setWindowSearch('')
    const { result } = renderHook(() => useShallowSearchParams())

    act(() => {
      result.current.set({ search: 'bar' })
    })

    expect(pushStateSpy).toHaveBeenCalledOnce()
    const url = new URL(pushStateSpy.mock.calls[0][2] as string)
    expect(url.searchParams.get('search')).toBe('bar')
    expect(replaceStateSpy).not.toHaveBeenCalled()
  })

  it('set con history: replace usa replaceState', () => {
    setWindowSearch('')
    const { result } = renderHook(() => useShallowSearchParams())

    act(() => {
      result.current.set({ search: 'baz' }, { history: 'replace' })
    })

    expect(replaceStateSpy).toHaveBeenCalledOnce()
    expect(pushStateSpy).not.toHaveBeenCalled()
  })

  it('set con arrays maneja multi-value params', () => {
    setWindowSearch('')
    const { result } = renderHook(() => useShallowSearchParams())

    act(() => {
      result.current.set({ tipo: ['DOMICILIO', 'PUNTO'] })
    })

    const url = new URL(pushStateSpy.mock.calls[0][2] as string)
    expect(url.searchParams.getAll('tipo')).toEqual(['DOMICILIO', 'PUNTO'])
  })

  it('set con undefined elimina el param', () => {
    setWindowSearch('?search=foo')
    const { result } = renderHook(() => useShallowSearchParams())

    act(() => {
      result.current.set({ search: undefined })
    })

    const url = new URL(pushStateSpy.mock.calls[0][2] as string)
    expect(url.searchParams.has('search')).toBe(false)
  })

  it('no empuja al history si la URL no cambia', () => {
    setWindowSearch('?search=foo')
    const { result } = renderHook(() => useShallowSearchParams())

    act(() => {
      result.current.set({ search: 'foo' })
    })

    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(replaceStateSpy).not.toHaveBeenCalled()
  })

  it('mantener referencia estable entre renders', () => {
    setWindowSearch('')
    const { result, rerender } = renderHook(() => useShallowSearchParams())
    const set1 = result.current.set

    rerender()

    expect(result.current.set).toBe(set1)
  })
})
