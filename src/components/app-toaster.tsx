'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'

/** Alto del encabezado fijo de la app (px); los avisos de arriba quedan por debajo. */
const ALTO_ENCABEZADO = 56
const SEPARACION = 8

/**
 * Pantallas con botón flotante «+» abajo a la derecha. Ahí los avisos van arriba
 * para no tapar el botón ni su menú: un aviso encima del botón lo deja sin
 * poder pulsarse y, con ratón, le quita el cursor y cierra el menú (#828).
 */
export function avisosArriba(pathname: string | null): boolean {
  return pathname === '/pedidos'
}

/** Un solo contenedor de avisos: solo cambia de posición, no se recrea al navegar. */
export function AppToaster() {
  const arriba = avisosArriba(usePathname())
  const top = ALTO_ENCABEZADO + SEPARACION
  return arriba ? (
    <Toaster position="top-right" offset={{ top, right: 16 }} mobileOffset={{ top, left: 12, right: 12 }} />
  ) : (
    <Toaster position="bottom-right" />
  )
}
