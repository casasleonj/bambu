'use client'

import { SessionProvider } from 'next-auth/react'
import type { Session } from 'next-auth'
import { ReactNode } from 'react'

export function Providers({
  children,
  session = null,
}: {
  children: ReactNode
  session?: Session | null
}) {
  // FIX REGRESION mobile 2026-06-10: pasar la sesion del server como prop
  // al SessionProvider. Sin esto, useSession() arranca con data: null,
  // status: 'loading' y todos los componentes cliente que dependen de la
  // sesion renderizan con fallbacks (e.g. avatar "U" en lugar de "A/J").
  //
  // `session` es opcional con default `null` para layouts que no
  // requieren autenticacion (e.g. root layout, login). El (app)/layout
  // SIEMPRE debe pasar la session real.
  // Ver (app)/layout.tsx para el contexto completo.
  return <SessionProvider session={session}>{children}</SessionProvider>
}