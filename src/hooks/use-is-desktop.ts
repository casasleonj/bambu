'use client'

import { useEffect, useState } from 'react'

/**
 * FIX Fase 4 §6.4: hook para detectar el breakpoint responsive.
 * Patrón Material Design "navigation drawer" temporal vs permanente.
 *
 * Devuelve `true` cuando el viewport es >= md (768px) — desktop.
 * Devuelve `false` cuando es < md — móvil.
 *
 * En SSR retorna `false` (móvil) por default para evitar hydration
 * mismatch; el `useEffect` actualiza al estado real del cliente.
 */
export function useIsDesktop(breakpoint = 768): boolean {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`)
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [breakpoint])

  return isDesktop
}
