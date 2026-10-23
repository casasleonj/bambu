// @tests PR-1B — el GPS se toma solo y nunca bloquea la entrega.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { capturarGpsSilencioso } from '../gps-silencioso'

const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'geolocation')

function mockGeo(getCurrentPosition: (ok: PositionCallback, err: PositionErrorCallback) => void) {
  Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
}

afterEach(() => {
  vi.useRealTimers()
  if (original) Object.defineProperty(globalThis.navigator, 'geolocation', original)
  else delete (globalThis.navigator as unknown as Record<string, unknown>).geolocation
})

describe('capturarGpsSilencioso', () => {
  it('devuelve la posición del dispositivo', async () => {
    mockGeo((ok) => ok({ coords: { latitude: 4.7, longitude: -74.07, accuracy: 12 } } as GeolocationPosition))
    expect(await capturarGpsSilencioso()).toEqual({ lat: 4.7, lng: -74.07, accuracy: 12 })
  })

  it('permiso denegado o error → null (no lanza ni bloquea)', async () => {
    mockGeo((_ok, err) => err({ code: 1, message: 'denied' } as GeolocationPositionError))
    expect(await capturarGpsSilencioso()).toBeNull()
  })

  it('sin soporte de geolocalización → null', async () => {
    delete (globalThis.navigator as unknown as Record<string, unknown>).geolocation
    expect(await capturarGpsSilencioso()).toBeNull()
  })

  it('si el navegador nunca responde, corta por tiempo y devuelve null', async () => {
    vi.useFakeTimers()
    mockGeo(() => { /* permiso pendiente: nunca llama */ })
    const p = capturarGpsSilencioso(1000)
    await vi.advanceTimersByTimeAsync(1600)
    expect(await p).toBeNull()
  })
})
