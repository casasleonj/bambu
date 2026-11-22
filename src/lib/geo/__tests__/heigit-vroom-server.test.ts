import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import {
  configuracionHeiGit,
  HeiGitRutaNoDisponibleError,
  optimizarRecorridoHeiGit,
} from '../heigit-vroom-server'
import {
  comprobarProveedorRecorridoVial,
  proveedorRecorridoVial,
  ProveedorVialInvalidoError,
} from '../recorrido-vial-proveedor-server'

const salida = new Date('2026-11-21T15:00:00Z')
const input = {
  origen: { lat: 10.035, lng: -73.235 },
  paradas: [
    { pedidoId: 'A-PRIVADO', lat: 10.036, lng: -73.240, tipo: 'ENTREGA' as const },
    { pedidoId: 'B-PRIVADO', lat: 10.037, lng: -73.241, tipo: 'COBRO' as const },
  ],
  salida,
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('#930 HeiGIT VROOM: seguridad, modo gratuito y backend', () => {
  it('deshabilitado por defecto, no emite solicitudes ni envía coordenadas', async () => {
    vi.stubEnv('HEIGIT_VROOM_ENABLED', 'false')
    vi.stubEnv('HEIGIT_VROOM_QUOTA_CONFIRMED', 'true')
    const fetcher = vi.fn()
    await expect(optimizarRecorridoHeiGit(input, fetcher as unknown as typeof fetch))
      .rejects.toMatchObject({ codigo: 'HEIGIT_DESHABILITADO' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('no habilita el servicio sin confirmar cuota y clave de servidor', () => {
    expect(() => configuracionHeiGit({
      HEIGIT_VROOM_ENABLED: 'true', HEIGIT_VROOM_API_KEY: 'token-de-prueba-de-longitud-suficiente',
    })).toThrow(HeiGitRutaNoDisponibleError)
    expect(() => configuracionHeiGit({
      HEIGIT_VROOM_ENABLED: 'true', HEIGIT_VROOM_QUOTA_CONFIRMED: 'true',
      HEIGIT_VROOM_API_KEY: 'short',
    })).toThrow(HeiGitRutaNoDisponibleError)
  })
  it('selecciona Google o HeiGIT explícitamente, nunca ante error de otro', () => {
    expect(proveedorRecorridoVial({ RECORRIDO_VIAL_PROVIDER: 'google' })).toBe('google')
    expect(proveedorRecorridoVial({ RECORRIDO_VIAL_PROVIDER: 'heigit' })).toBe('heigit')
    expect(() => proveedorRecorridoVial({ RECORRIDO_VIAL_PROVIDER: 'fallback-to-google' }))
      .toThrow(ProveedorVialInvalidoError)
    vi.stubEnv('RECORRIDO_VIAL_PROVIDER', 'heigit')
    vi.stubEnv('HEIGIT_VROOM_ENABLED', 'false')
    expect(() => comprobarProveedorRecorridoVial()).toThrow(HeiGitRutaNoDisponibleError)
  })
  it('retorna SOLO IDs reordenados y llama a la API nueva con token privado', async () => {
    vi.stubEnv('HEIGIT_VROOM_ENABLED', 'true')
    vi.stubEnv('HEIGIT_VROOM_QUOTA_CONFIRMED', 'true')
    vi.stubEnv('HEIGIT_VROOM_API_KEY', 'token-sintetico-que-nunca-se-usara-en-red')
    const fetcher = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      expect(String(url)).toBe('https://api.heigit.org/vroom/v0')
      expect(options?.headers).toEqual({
        Authorization: 'token-sintetico-que-nunca-se-usara-en-red',
        'Content-Type': 'application/json',
      })
      const requestBody = String(options?.body)
      expect(requestBody).not.toContain('A-PRIVADO')
      expect(requestBody).not.toContain('B-PRIVADO')
      const parsed: unknown = JSON.parse(requestBody)
      expect(parsed).toMatchObject({
        vehicles: [{ id: 1, profile: 'car', start: [-73.235, 10.035] }],
        jobs: [{ id: 1 }, { id: 2 }],
      })
      return Response.json({
        code: 0, summary: { unassigned: 0 }, unassigned: [],
        routes: [{ vehicle: 1, steps: [
          { type: 'start' }, { type: 'job', id: 2 },
          { type: 'job', id: 1 }, { type: 'end' },
        ] }],
      })
    }) as unknown as typeof fetch
    const result = await optimizarRecorridoHeiGit(input, fetcher)
    expect(result.ordenPedidoIds).toEqual(['B-PRIVADO', 'A-PRIVADO'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([403, 429, 500])('HTTP %i nunca activa una segunda solicitud facturable', async status => {
    vi.stubEnv('HEIGIT_VROOM_ENABLED', 'true')
    vi.stubEnv('HEIGIT_VROOM_QUOTA_CONFIRMED', 'true')
    vi.stubEnv('HEIGIT_VROOM_API_KEY', 'token-sintetico-que-nunca-se-usara-en-red')
    const fetcher = vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch
    await expect(optimizarRecorridoHeiGit(input, fetcher)).rejects.toBeInstanceOf(HeiGitRutaNoDisponibleError)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
