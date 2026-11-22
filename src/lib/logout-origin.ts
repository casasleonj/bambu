'use client'

import { signOut } from 'next-auth/react'
import { purgeSWCache } from '@/lib/purge-sw-cache'

/**
 * #812. Auth.js puede devolver un destino construido con el host de escucha
 * del servidor (ej. 0.0.0.0:3001). No usar esa URL para navegar.
 *
 * Completar primero la revocación vía Auth.js (CSRF/cookies/sincronización de
 * pestañas), y SOLO entonces navegar con una ruta relativa que el navegador
 * resuelve contra el origen actual. Sin callback externo ni open redirect.
 *
 * Las dependencias son inyectables para probar éxito/fallo sin un navegador.
 */
export async function cerrarSesionConservandoOrigen(
  finalizarSesion: () => Promise<{ url: string | null }> = () => signOut({ redirect: false }),
  navegar: (ruta: string) => void = ruta => window.location.replace(ruta),
  limpiarCache: () => Promise<void> = purgeSWCache,
): Promise<void> {
  // Un fallo de CacheStorage (permisos, PWA dañada, cuota) no debe
  // dejar la sesión activa por impedir la llamada a Auth.js.
  // CacheStorage puede quedarse pendiente (SW bloqueado, pestaña en segundo
  // plano). Limitar el tiempo para que la limpieza no secuestre el logout.
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    await Promise.race([
      limpiarCache(),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 3000) }),
    ])
  } catch {
    // La sesión sigue revocándose y las APIs deben rechazarla.
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
  const resultado = await finalizarSesion()
  // next-auth@5.0.0-beta.31 SignOutResponse solo contiene `url`.
  // No existe `ok`: validar ese campo haría fallar hasta un logout correcto.
  if (typeof resultado?.url !== 'string' || !resultado.url) {
    throw new Error('No se pudo completar el cierre de sesión')
  }
  navegar('/login')
}
