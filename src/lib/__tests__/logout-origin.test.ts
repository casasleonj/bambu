import { describe, expect, it, vi } from 'vitest'
import { cerrarSesionConservandoOrigen } from '@/lib/logout-origin'

describe('#812: cerrar sesión sin cambiar de origen', () => {
  it('termina la sesión ANTES de navegar, con ruta relativa al origen actual', async () => {
    const acciones: string[] = []
    const finalizar = vi.fn(async () => {
      acciones.push('signOut')
      return { ok: true }
    })
    const navegar = vi.fn((ruta: string) => {
      acciones.push('navegar:' + ruta)
    })

    await cerrarSesionConservandoOrigen(finalizar, navegar)

    expect(acciones).toEqual(['signOut', 'navegar:/login'])
    expect(navegar).toHaveBeenCalledExactlyOnceWith('/login')
  })

  it('no redirige a login si la API de revocación devuelve error', async () => {
    const navegar = vi.fn()
    await expect(
      cerrarSesionConservandoOrigen(async () => ({ ok: false }), navegar),
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
})
