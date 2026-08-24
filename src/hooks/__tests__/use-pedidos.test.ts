// @tests use-pedidos.ts — race condition guard (Bug 6)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { useEffect } from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePedidos } from '@/hooks/use-pedidos'

const hookPath = join(process.cwd(), 'src/hooks/use-pedidos.ts')
const source = readFileSync(hookPath, 'utf-8')

describe('FIX Bug 6: usePedidos ignora resultados de requests stale', () => {
  it('FIX: incrementa un requestId por fetch y lo compara con una ref actual', () => {
    expect(source).toMatch(/requestIdRef\.current/)
    expect(source).toMatch(/\+\+requestIdRef\.current/)
    expect(source).toMatch(/requestIdRef\.current\s*===\s*requestId/)
  })

  it('FIX: abandona si el request ya fue superado antes de empezar', () => {
    expect(source).toMatch(/if\s*\(\s*!isCurrent\(\)\)\s*return/)
  })

  it('FIX: no aplica setError/setLoading/setPedidos si el request es stale', () => {
    // Cada estado mutante debe estar guardado por isCurrent()
    expect(source).toMatch(/if\s*\(\s*!isCurrent\(\)\)\s*return[\s\S]*setPedidos/)
    expect(source).toMatch(/if\s*\(\s*!isCurrent\(\)\)\s*return[\s\S]*setError/)
    expect(source).toMatch(/if\s*\(\s*isCurrent\(\)\)\s*setLoading\(\s*false\s*\)/)
  })

  it('FIX: limpia error explicitamente en el camino de exito', () => {
    expect(source).toMatch(/setError\(\s*null\s*\)/)
  })
})

// Incidente: bucle de requests en Pedidos (banner "Verlos" -> ?atrasados=true).
// Ver docs del incidente. Reproduce el patrón real de pedidos-client/index.tsx
// para las vistas autocontenidas (atrasados/enRiesgo): usePedidos recibe un
// objeto `params` literal nuevo en cada render, y un efecto EXTERNO al hook
// dispara refetch() cuando la referencia de `refetch` cambia. Si buildUrl
// dentro de usePedidos depende de la referencia cruda de `params` (en vez de
// paramsKey), fetchPedidos/refetch cambian de identidad en cada render,
// causando un loop autosostenido: fetch -> setState -> re-render -> nuevo
// `params` -> nuevo refetch -> efecto se dispara -> fetch...
describe('FIX: usePedidos no entra en loop con params inline recreados en cada render', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ success: true, pedidos: [], total: 0 }),
        }),
      ) as unknown as typeof fetch,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('vista autocontenida (ej. atrasados): 1 objeto params nuevo por render + refetch() en efecto externo -> 1 sola request', async () => {
    function useAtrasadosView(active: boolean) {
      // Mismo patrón que pedidos-client/index.tsx: objeto literal nuevo en
      // cada render, autoFetch:false, refetchOnParamsChange:false.
      const { refetch, loading } = usePedidos(
        { atrasados: true },
        { all: true, autoFetch: false, refetchOnParamsChange: false },
      )
      useEffect(() => {
        if (active) refetch()
      }, [active, refetch])
      return { loading }
    }

    renderHook(() => useAtrasadosView(true))

    await waitFor(() => expect(fetch).toHaveBeenCalled())

    // Deja correr varios ciclos de render/efecto para darle oportunidad al
    // loop de manifestarse si el bug reaparece.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('scope-based (ej. fiados/alertas): objeto params inline con refetchOnParamsChange:true no re-fetchea en renders sin cambio de contenido', async () => {
    const { rerender } = renderHook(
      () => usePedidos({ scope: 'fiados' }, { all: true, autoFetch: true, refetchOnParamsChange: true }),
    )

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    // Fuerza varios re-renders del hook; cada uno recrea el objeto params
    // inline `{ scope: 'fiados' }` pero con contenido lógico idéntico.
    rerender()
    rerender()
    rerender()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('cambio real de params (contenido distinto) sigue disparando un nuevo fetch', async () => {
    const { result, rerender } = renderHook(
      ({ desde }: { desde: string }) =>
        usePedidos({ desde }, { all: true, autoFetch: true, refetchOnParamsChange: true }),
      { initialProps: { desde: '2026-01-01' } },
    )

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    rerender({ desde: '2026-02-01' })

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(result.current).toBeTruthy()
  })
})
