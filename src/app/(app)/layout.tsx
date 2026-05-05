import { Providers } from '@/components/providers'
import { Toaster } from 'sonner'
import dynamic from 'next/dynamic'
import { UpdateNotification } from '@/components/update-notification'
import { AppShell } from './app-shell'

const BaseCajaModal = dynamic(() => import('@/components/base-caja-modal'), { ssr: false })

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AppShell>
        {children}
      </AppShell>
      <BaseCajaModal />
      <UpdateNotification />
      <Toaster />
    </Providers>
  )
}
