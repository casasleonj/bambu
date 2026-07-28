import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'

const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}))

function setWindowSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search },
    writable: true,
  })
  // Keep useSearchParams mock in sync with the real URL so initial reads
  // match (simulating SSR/hydration where both agree).
  mockSearchParams.forEach((_, key) => mockSearchParams.delete(key))
  const params = new URLSearchParams(search)
  for (const [k, v] of params) {
    mockSearchParams.append(k, v)
  }
}

function createPushStateSpy(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(window.history, 'pushState').mockImplementation(
    (_data: unknown, _unused: string, url?: string | URL | null) => {
      const href =
        typeof url === 'string' ? url : url?.href || window.location.href
      const urlObj = new URL(href, window.location.origin)
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: urlObj.search, href: urlObj.href },
        writable: true,
      })
    },
  )
}

function createReplaceStateSpy(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(window.history, 'replaceState').mockImplementation(
    (_data: unknown, _unused: string, url?: string | URL | null) => {
      const href =
        typeof url === 'string' ? url : url?.href || window.location.href
      const urlObj = new URL(href, window.location.origin)
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: urlObj.search, href: urlObj.href },
        writable: true,
      })
    },
  )
}

describe('useShallowSearchParams', () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    setWindowSearch('')
    pushStateSpy = createPushStateSpy()
    replaceStateSpy = createReplaceStateSpy()
  })

  afterEach(() => {
    pushStateSpy.mockRestore()
    replaceStateSpy.mockRestore()
  })

  describe('lectura inicial', () => {
    it('lee params con get y getAll', () => {
      setWindowSearch('?search=foo&tipo=DOMICILIO&tipo=PUNTO')

      const { result } = renderHook(() => useShallowSearchParams())

      expect(result.current.get('search')).toBe('foo')
      expect(result.current.getAll('tipo')).toEqual(['DOMICILIO', 'PUNTO'])
    })

    it('get devuelve null si el param no existe', () => {
      setWindowSearch('?search=foo')

      const { result } = renderHook(() => useShallowSearchParams())

      expect(result.current.get('inexistente')).toBeNull()
    })

    it('getAll devuelve array vacío si el param no existe', () => {
      setWindowSearch('?search=foo')

      const { result } = renderHook(() => useShallowSearchParams())

      expect(result.current.getAll('inexistente')).toEqual([])
    })
  })

  describe('set', () => {
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

    it('set con string vacío elimina el param', () => {
      setWindowSearch('?search=foo')
      const { result } = renderHook(() => useShallowSearchParams())

      act(() => {
        result.current.set({ search: '' })
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

    it('get refleja el nuevo param tras set (lee de window.location)', () => {
      setWindowSearch('')
      const { result } = renderHook(() => useShallowSearchParams())

      act(() => {
        result.current.set({ search: 'bar' })
      })

      expect(result.current.get('search')).toBe('bar')
    })
  })

  describe('estabilidad de referencias', () => {
    it('mantener referencia estable entre renders', () => {
      setWindowSearch('')
      const { result, rerender } = renderHook(() => useShallowSearchParams())
      const set1 = result.current.set

      rerender()

      expect(result.current.set).toBe(set1)
    })

    it('get tiene referencia estable entre renders', () => {
      setWindowSearch('')
      const { result, rerender } = renderHook(() => useShallowSearchParams())
      const get1 = result.current.get

      rerender()

      expect(result.current.get).toBe(get1)
    })

    it('getAll tiene referencia estable entre renders', () => {
      setWindowSearch('')
      const { result, rerender } = renderHook(() => useShallowSearchParams())
      const getAll1 = result.current.getAll

      rerender()

      expect(result.current.getAll).toBe(getAll1)
    })
  })

  describe('notificación cross-consumer', () => {
    it('dos instancias: set en una fuerza get actualizado en la otra', () => {
      setWindowSearch('')
      const { result: r1 } = renderHook(() => useShallowSearchParams())
      const { result: r2 } = renderHook(() => useShallowSearchParams())

      act(() => {
        r1.current.set({ search: 'cross' })
      })

      // r2 debe ver el nuevo valor aunque no haya llamado set()
      expect(r2.current.get('search')).toBe('cross')
    })
  })
})
