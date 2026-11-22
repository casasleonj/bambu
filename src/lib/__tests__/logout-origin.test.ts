import { describe, expect, it, vi } from 'vitest'
import { cerrarSesionConservandoOrigen } from '@/lib/logout-origin'

describe('#812: cerrar sesión sin cambiar de origen', () => {
  it('termina la sesión ANTES de navegar, con ruta relativa al origen actual', async () => {
    const acciones: string[] = []
    const finalizar = vi.fn(async () => {
      acciones.push('signOut')
      return { url: 'http://0.0.0.0:3001/login' }
    })
    const navegar = vi.fn((ruta: string) => {
      acciones.push('navegar:' + ruta)
    })

    await cerrarSesionConservandoOrigen(finalizar, navegar)

    expect(acciones).toEqual(['signOut', 'navegar:/login'])
    expect(navegar).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it('no redirige a login si Auth.js no devuelve URL de salida', async () => {
    const navegar = vi.fn()
    await expect(
      cerrarSesionConservandoOrigen(async () => ({ url: null }), navegar),
    ).rejects.toThrow('No se pudo completar el cierre de sesión')
    expect(navegar).not.toHaveBeenCalled()
  })

  it('no redirige si falla la red al terminar la sesión', async () => {
    const navegar = vi.fn()
    await expect(
      cerrarSesionConservandoOrigen(async () => { throw new Error('falló la red') }, navegar),
    ).rejects.toThrow('falló la red')
    expect(navegar).not.toHaveBeenCalled()
  })
  it('la caché PWA fallida no bloquea signOut ni la navegación del mismo origen', async () => {
    const acciones: string[] = []
    const terminar = vi.fn(async () => { acciones.push('signOut'); return { url: 'http://0.0.0.0:3001/login' } })
    const navegar = vi.fn((ruta: string) => { acciones.push('navegar:' + ruta) })
    const limpiar = vi.fn(async () => { acciones.push('purge'); throw new Error('CacheStorage unavailable') })
    await cerrarSesionConservandoOrigen(terminar, navegar, limpiar)
    expect(acciones).toEqual(['purge', 'signOut', 'navegar:/login'])
    expect(terminar).toHaveBeenCalledOnce()
  })

})
