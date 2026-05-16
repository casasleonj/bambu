import { Providers } from '@/components/providers'
import { Toaster } from 'sonner'
import { BaseCajaLoader } from '@/components/base-caja-loader'
import { UpdateNotification } from '@/components/update-notification'
import { AppShell } from './app-shell'
import { MustChangePasswordGuard } from '@/components/must-change-password-guard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
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
