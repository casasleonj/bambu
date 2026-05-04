import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from '@/components/providers'
import { ServiceWorkerRegister } from '@/components/sw-register'

export const metadata: Metadata = {
  title: 'Agua Bambú - Sistema de Gestión',
  description: 'Sistema de gestión de ventas y producción de agua embotellada',
  manifest: '/manifest.json',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const nonce = headersList.get('x-nonce') || ''

  return (
    <html lang="es" className="light" style={{ colorScheme: 'light' }}>
      <body className="antialiased" {...(nonce ? { 'data-nonce': nonce } : {})}>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}