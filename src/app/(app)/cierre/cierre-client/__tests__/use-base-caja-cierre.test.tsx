// @tests #688 — el cierre lee la base de caja de la fecha, se refresca y avisa si cambió; nunca inventa un valor.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useBaseCajaCierre, leerBaseDeLaFecha } from '../use-base-caja-cierre'
import { avisarBaseCajaActualizada } from '@/lib/client/base-caja-evento'

const respuesta = (valor: string | null, updatedAt = '2026-11-05T12:42:00.000Z') => valor === null
  ? { ok: false, status: 404, json: async () => ({ success: false }) }
  : { ok: true, status: 200, json: async () => ({ config: { clave: 'BASE_DIA_2026-11-05', valor, updatedAt } }) }
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('leerBaseDeLaFecha', () => {
  it('lee la base de ESA fecha; 404, 0 o texto inválido = faltante (sin valor por defecto)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta('50000'))
    expect(await leerBaseDeLaFecha('2026-11-05')).toEqual({ estado: 'ingresada', valor: 50000, actualizadaAt: '2026-11-05T12:42:00.000Z' })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/config?clave=BASE_DIA_2026-11-05')
    fetchMock.mockResolvedValueOnce(respuesta(null))
    expect((await leerBaseDeLaFecha('2026-11-05'))?.estado).toBe('faltante')
    fetchMock.mockResolvedValueOnce(respuesta('0'))
    expect((await leerBaseDeLaFecha('2026-11-05'))?.estado).toBe('faltante')
    fetchMock.mockResolvedValueOnce(respuesta('abc'))
    expect((await leerBaseDeLaFecha('2026-11-05'))?.estado).toBe('faltante')
    expect(fetchMock.mock.calls.every(c => !String(c[0]).endsWith('clave=BASE_DIA'))).toBe(true) // jamás consulta el valor por defecto
  })
  it('un error de red o del servidor devuelve null (no cambia lo que se mostraba)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await leerBaseDeLaFecha('2026-11-05')).toBeNull()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    expect(await leerBaseDeLaFecha('2026-11-05')).toBeNull()
  })
})

describe('useBaseCajaCierre', () => {
  it('carga la base y queda «ingresada»; sin base queda «faltante» con valor 0', async () => {
    fetchMock.mockResolvedValue(respuesta('50000'))
    const a = renderHook(() => useBaseCajaCierre('2026-11-05', false))
    expect(a.result.current.estado).toBe('cargando')
    await waitFor(() => expect(a.result.current.estado).toBe('ingresada'))
    expect(a.result.current.valor).toBe(50000)
    a.unmount()
    fetchMock.mockResolvedValue(respuesta(null))
    const b = renderHook(() => useBaseCajaCierre('2026-11-04', false))
    await waitFor(() => expect(b.result.current.estado).toBe('faltante'))
    expect(b.result.current.valor).toBe(0)
  })

  it('si la base cambia con la pantalla abierta (aviso de «Caja base»), se actualiza y avisa antes → ahora', async () => {
    fetchMock.mockResolvedValueOnce(respuesta('50000'))
    const { result } = renderHook(() => useBaseCajaCierre('2026-11-05', false))
    await waitFor(() => expect(result.current.valor).toBe(50000))
    expect(result.current.aviso).toBeNull()
    fetchMock.mockResolvedValueOnce(respuesta('60000'))
    act(() => avisarBaseCajaActualizada())
    await waitFor(() => expect(result.current.valor).toBe(60000))
    expect(result.current.aviso).toEqual({ antes: 50000, ahora: 60000 })
    act(() => result.current.descartarAviso())
    expect(result.current.aviso).toBeNull()
  })

  it('al volver a la pestaña vuelve a leer; y si el valor no cambió no hay aviso', async () => {
    fetchMock.mockResolvedValue(respuesta('50000'))
    const { result } = renderHook(() => useBaseCajaCierre('2026-11-05', false))
    await waitFor(() => expect(result.current.estado).toBe('ingresada'))
    const antes = fetchMock.mock.calls.length
    act(() => { window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(antes))
    expect(result.current.aviso).toBeNull()
  })

  it('se vuelve a leer cada 60 s y se detiene si está pausado (día cerrado / cerrando)', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(respuesta('50000'))
    const { rerender } = renderHook(({ p }) => useBaseCajaCierre('2026-11-05', p), { initialProps: { p: false } })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const base = fetchMock.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(fetchMock.mock.calls.length).toBe(base + 1)
    rerender({ p: true })
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
    expect(fetchMock.mock.calls.length).toBe(base + 1)
  })

  it('un error de red no borra la base que ya se mostraba', async () => {
    fetchMock.mockResolvedValueOnce(respuesta('50000'))
    const { result } = renderHook(() => useBaseCajaCierre('2026-11-05', false))
    await waitFor(() => expect(result.current.valor).toBe(50000))
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    let lectura: unknown = 'x'
    await act(async () => { lectura = await result.current.refrescar() })
    expect(lectura).toBeNull()
    expect(result.current.valor).toBe(50000)
    expect(result.current.estado).toBe('ingresada')
  })

  it('al cambiar de fecha no arrastra la base ni el aviso del día anterior', async () => {
    fetchMock.mockResolvedValueOnce(respuesta('50000'))
    const { result, rerender } = renderHook(({ f }) => useBaseCajaCierre(f, false), { initialProps: { f: '2026-11-05' } })
    await waitFor(() => expect(result.current.valor).toBe(50000))
    fetchMock.mockResolvedValueOnce(respuesta(null))
    rerender({ f: '2026-11-04' })
    await waitFor(() => expect(result.current.estado).toBe('faltante'))
    expect(result.current.valor).toBe(0)
    expect(result.current.aviso).toBeNull()
  })

  it('refrescar() devuelve la lectura nueva (para comprobarla justo antes de cerrar)', async () => {
    fetchMock.mockResolvedValueOnce(respuesta('50000'))
    const { result } = renderHook(() => useBaseCajaCierre('2026-11-05', false))
    await waitFor(() => expect(result.current.valor).toBe(50000))
    fetchMock.mockResolvedValueOnce(respuesta('65000'))
    let lectura: { estado: string; valor: number } | null = null
    await act(async () => { lectura = await result.current.refrescar() })
    expect(lectura).toMatchObject({ estado: 'ingresada', valor: 65000 })
  })
})
