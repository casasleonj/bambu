import { Providers } from '@/components/providers'
import { Toaster } from 'sonner'
import { BaseCajaLoader } from '@/components/base-caja-loader'
import { UpdateNotification } from '@/components/update-notification'
import { AppShell } from './app-shell'
import { MustChangePasswordGuard } from '@/components/must-change-password-guard'
import { auth } from '@/lib/auth'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // FIX REGRESION mobile 2026-06-10: pasar la sesion del server al
  // <SessionProvider> para que `useSession()` retorne data completa en el
  // primer render del cliente, sin necesidad de fetch a /api/auth/session.
  // Sin esto, todos los componentes que usan useSession (Header, Sidebar)
  // arrancan con data: null, status: 'loading' durante el primer frame,
  // causando:
  // - Avatar "U" en el header (en vez de la inicial del user)
  // - Nav vacio en el Sidebar (permissions=[] filtra todos los items)
  // - Falsos errores en fetches de cliente (e.g. "No se pudieron cargar
  //   los clientes") porque el fetch del cliente puede no estar
  //   sincronizado con la sesion real.
  // Patron oficial de Next.js 16 + Auth.js v5: el server layout hace
  // `await auth()` y pasa `session` al `<SessionProvider session={session}>`.
  const session = await auth()

  return (
    <Providers session={session}>
      <MustChangePasswordGuard />
      <AppShell>
        {children}
      </AppShell>
      <BaseCajaLoader />
      <UpdateNotification />
      <Toaster />
    </Providers>
  )
}
