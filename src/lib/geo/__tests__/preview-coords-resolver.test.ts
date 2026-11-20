import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewCoordsResolver } from '../preview-coords-resolver'

const link = 'https://maps.app.goo.gl/AbC'
const coords = { lat: 10.45, lng: -73.25 }
afterEach(() => vi.useRealTimers())

describe('#891 — expansión de enlace, solo preview', () => {
  it('dedup concurrente y secuencial, sin compartir objetos mutables', async () => {
    const fresh = vi.fn().mockResolvedValue(coords)
    const resolve = createPreviewCoordsResolver(fresh)
    const [a, b] = await Promise.all([resolve(link, 'scope-A'), resolve(link, 'scope-A')])
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    a!.lat = 0
    expect(await resolve(link, 'scope-A')).toEqual(coords)
    expect(fresh).toHaveBeenCalledTimes(1)
  })
  it('aísla scopes, enlaces (case-sensitive) y omite memoización sin scope o URL larga', async () => {
    const fresh = vi.fn().mockResolvedValue(coords)
    const resolve = createPreviewCoordsResolver(fresh)
    await resolve(link, 'A')
    await resolve(link, 'B')
    await resolve(link.toLowerCase(), 'A')
    await resolve(link)
    await resolve(link)
    await resolve('https://www.google.com/maps?q=10.45,-73.25', 'A')
    await resolve('https://www.google.com/maps?q=10.45,-73.25', 'A')
    expect(fresh).toHaveBeenCalledTimes(7)
  })
  it('caduca desde el éxito y vuelve a resolver', async () => {
    vi.useFakeTimers()
    const fresh = vi.fn().mockResolvedValue(coords)
    const resolve = createPreviewCoordsResolver(fresh)
    await resolve(link, 'A')
    vi.advanceTimersByTime(59_999)
    await resolve(link, 'A')
    expect(fresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await resolve(link, 'A')
    expect(fresh).toHaveBeenCalledTimes(2)
  })
  it('fallo, rechazo y coordenadas inválidas no se cachean', async () => {
    const fresh = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce({ lat: 0, lng: 0 }).mockResolvedValue(coords)
    const resolve = createPreviewCoordsResolver(fresh)
    expect(await resolve(link, 'A')).toBeNull()
    await expect(resolve(link, 'A')).rejects.toThrow('red')
    expect(await resolve(link, 'A')).toEqual({ lat: 0, lng: 0 })
    expect(await resolve(link, 'A')).toEqual(coords)
    expect(await resolve(link, 'A')).toEqual(coords)
    expect(fresh).toHaveBeenCalledTimes(4)
  })
  it('límite de memoria y evicción no resucitan una promesa vieja', async () => {
    let finish!: (value: typeof coords) => void
    const newer = { lat: 10.46, lng: -73.26 }
    const fresh = vi.fn().mockImplementationOnce(() => new Promise<typeof coords>(r => { finish = r })).mockResolvedValue(newer)
    const resolve = createPreviewCoordsResolver(fresh)
    const old = resolve(link, 'A')
    await Promise.resolve()
    for (let n = 0; n < 50; n++) await resolve(link, 'scope-' + n)
    expect(await resolve(link, 'A')).toEqual(newer)
    finish(coords)
    expect(await old).toEqual(coords)
    expect(await resolve(link, 'A')).toEqual(newer)
    expect(fresh).toHaveBeenCalledTimes(52)
  })
})
