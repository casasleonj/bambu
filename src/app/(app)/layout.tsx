import { Providers } from '@/components/providers'
import { Toaster } from 'sonner'
import { BaseCajaLoader } from '@/components/base-caja-loader'
import { UpdateNotification } from '@/components/update-notification'
import { AppShell } from './app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>
        {children}
      </AppShell>
      <BaseCajaLoader />
      <UpdateNotification />
      <Toaster />
    </Providers>
  )
}
