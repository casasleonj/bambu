import { Providers } from '@/components/providers'
import { RealtimeProvider } from '@/components/realtime-provider'
import { Toaster } from 'sonner'
import { BaseCajaLoader } from '@/components/base-caja-loader'
import { UpdateNotification } from '@/components/update-notification'
import { PwaInstallBanner } from '@/components/pwa-install-banner'
import { InAppPushListener } from '@/components/in-app-push-listener'
import { PushOptInToast } from '@/components/push-opt-in-toast'
import { AppShell } from './app-shell'
import { MustChangePasswordGuard } from '@/components/must-change-password-guard'
import { SessionExpiryGuard } from '@/components/session-expiry-guard'
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

  // FIX hydration error: el Header es Client Component y usaba `new Date()`
  // directamente. Eso generaba texto diferente entre SSR (timezone del
  // servidor) e hidratacion (timezone del navegador). Generamos la fecha
  // una sola vez en el servidor con timezone fijo America/Bogota y la
  // pasamos como string. El Header la usa tal cual.
  const formatterLarga = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const formatterCorta = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
  })
  const now = new Date()
  const headerFechaLarga = formatterLarga.format(now)
  const headerFechaCorta = formatterCorta.format(now)

  return (
    <Providers session={session}>
      <RealtimeProvider>
        <MustChangePasswordGuard />
        <SessionExpiryGuard />
        <InAppPushListener />
        <PushOptInToast />
        <AppShell fechaLarga={headerFechaLarga} fechaCorta={headerFechaCorta}>
          {children}
        </AppShell>
        <BaseCajaLoader />
        <UpdateNotification />
        <Toaster />
        <PwaInstallBanner />
      </RealtimeProvider>
    </Providers>
  )
}
