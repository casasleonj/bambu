'use client'

import { createContext, useContext } from 'react'
import { usePushOptIn, type UsePushOptInReturn } from '@/hooks/use-push-opt-in'

/**
 * Estado único del aviso de notificaciones (#595). La franja (en el contenido) y la
 * campana (en el encabezado) tienen que verse y reaccionar juntas —«Más tarde» en la
 * franja enciende la campana—, así que comparten una sola instancia del hook.
 *
 * Sin proveedor el contexto es `null` y ambos componentes no pintan nada.
 */
const PushOptInContext = createContext<UsePushOptInReturn | null>(null)

export function PushOptInProvider({ children }: { children: React.ReactNode }) {
  const value = usePushOptIn()
  return <PushOptInContext.Provider value={value}>{children}</PushOptInContext.Provider>
}

export function usePushOptInContext(): UsePushOptInReturn | null {
  return useContext(PushOptInContext)
}
