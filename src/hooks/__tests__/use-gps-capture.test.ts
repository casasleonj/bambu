// @tests use-gps-capture — Fase 2 GPS hook

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGpsCapture } from '@/hooks/use-gps-capture'

function makePosition(lat: number, lng: number, accuracy?: number): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: accuracy ?? 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as GeolocationPosition
}

function makeError(code: number): GeolocationPositionError {
  return {
    code,
    message: 'test error',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError
}

describe('useGpsCapture', () => {
  let getCurrentPositionMock: ReturnType<typeof vi.fn>
  let queryPermissionMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getCurrentPositionMock = vi.fn()
    queryPermissionMock = vi.fn().mockResolvedValue({ state: 'prompt' })

    Object.defineProperty(global, 'navigator', {
      value: {
        geolocation: {
          getCurrentPosition: getCurrentPositionMock,
        },
        permissions: {
          query: queryPermissionMock,
        },
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('captura coordenadas exitosamente', async () => {
    getCurrentPositionMock.mockImplementation((success) => {
      success(makePosition(4.65, -74.05, 15))
    })

    const { result } = renderHook(() => useGpsCapture())
    await act(async () => {
      await result.current.capture()
    })

    expect(result.current.coordinates).toEqual({ lat: 4.65, lng: -74.05, accuracy: 15 })
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('reintenta hasta 3 veces en TIMEOUT y luego reporta error', async () => {
    getCurrentPositionMock.mockImplementation((_, error) => {
      error(makeError(3)) // TIMEOUT
    })

    const { result } = renderHook(() => useGpsCapture())
    await act(async () => {
      await result.current.capture()
    })

    expect(getCurrentPositionMock).toHaveBeenCalledTimes(4) // intento inicial + 3 reintentos
    expect(result.current.error?.code).toBe('TIMEOUT')
    expect(result.current.coordinates).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('no reintenta en PERMISSION_DENIED', async () => {
    getCurrentPositionMock.mockImplementation((_, error) => {
      error(makeError(1)) // PERMISSION_DENIED
    })

    const { result } = renderHook(() => useGpsCapture())
    await act(async () => {
      await result.current.capture()
    })

    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1)
    expect(result.current.error?.code).toBe('PERMISSION_DENIED')
    expect(result.current.loading).toBe(false)
  })

  it('reporta NOT_SUPPORTED si geolocation no existe', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    })

    const { result } = renderHook(() => useGpsCapture())
    await act(async () => {
      await result.current.capture()
    })

    expect(result.current.error?.code).toBe('NOT_SUPPORTED')
    expect(result.current.loading).toBe(false)
  })

  it('reset limpia coordenadas y errores', async () => {
    getCurrentPositionMock.mockImplementation((success) => {
      success(makePosition(4.65, -74.05))
    })

    const { result } = renderHook(() => useGpsCapture())
    await act(async () => {
      await result.current.capture()
    })
    expect(result.current.coordinates).not.toBeNull()

    act(() => {
      result.current.reset()
    })

    expect(result.current.coordinates).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })
})
