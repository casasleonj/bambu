import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/providers'
import { ServiceWorkerRegister } from '@/components/sw-register'

export const metadata: Metadata = {
  title: 'Agua Bambú - Sistema de Gestión',
  description: 'Sistema de gestión de ventas y producción de agua embotellada',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}