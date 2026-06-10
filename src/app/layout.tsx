import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from '@/components/providers'
import { SerwistProvider } from '@serwist/turbopack/react'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Android Chrome 108+ y derivados. iOS Safari lo ignora silenciosamente
  // (WebKit no soporta la spec todavia). Cuando lo soporte, hara que el
  // layout viewport se redimensione cuando aparece el teclado virtual en
  // lugar de quedar tapado detras. iOS Safari sigue requiriendo
  // scrollIntoView en el onFocus (ver AuthShell + login).
  interactiveWidget: 'resizes-content',
  themeColor: '#2563eb',
}

export const metadata: Metadata = {
  title: 'Agua Bambú - Sistema de Gestión',
  description: 'Sistema de gestión de ventas y producción de agua embotellada',
  manifest: '/manifest.json',
  applicationName: 'Agua Bambú',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Agua Bambú',
  },
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
        <SerwistProvider swUrl="/serwist/sw.js">
          <Providers>{children}</Providers>
        </SerwistProvider>
      </body>
    </html>
  )
}