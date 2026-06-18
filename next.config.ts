import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  // Permite que el dev server acepte requests desde una IP LAN además de
  // localhost. Sin esto, Next.js 16 bloquea /_next/webpack-hmr y otros
  // recursos _next/* con "Blocked cross-origin request" cuando se accede desde
  // otro dispositivo en la red. Solo aplica en `next dev`; en producción se ignora.
  // Configurar via env: NEXT_PUBLIC_DEV_LAN_ORIGIN="<ip1>,<ip2>"
  // (separadas por coma). Si no se define, queda vacío y se usa solo localhost.
  allowedDevOrigins: process.env.NEXT_PUBLIC_DEV_LAN_ORIGIN
    ? process.env.NEXT_PUBLIC_DEV_LAN_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
    : [],
  images: {
    unoptimized: true,
  },
  headers: async () => {
    if (process.env.NODE_ENV !== 'production') {
      return [
        {
          source: '/serwist/sw.js',
          headers: [
            { key: 'Service-Worker-Allowed', value: '/' },
            { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          ],
        },
      ]
    }
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.sentry.io; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; worker-src 'self' blob:;" },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/serwist/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
};

// Serwist solo en producción (PWA). En dev causa:
//   1. Parpadeo infinito: Serwist regenera el SW en cada HMR, y
//      update-notification.tsx hace window.location.reload() al detectar
//      controllerchange.
//   2. Cache stale: el SW cachea HTML con la URL del primer request. Si el
//      cliente navegó alguna vez con NEXTAUTH_URL distinto (ej. localhost
//      en vez de la IP LAN), queda sirviendo HTML viejo hasta que se
//      borre la cache del navegador.
// Patrón oficial: ver https://github.com/serwist/serwist/issues/48
// (solución de la comunidad) y docs de Serwist v9 (disable?: boolean).
const configWithPwa = process.env.NODE_ENV === 'production'
  ? withSerwist(nextConfig)
  : nextConfig;

// Serwist (inner) → Sentry (outer) → nextConfig (base)
export default withSentryConfig(configWithPwa, {
  org: process.env.SENTRY_ORG || "tu-org",
  project: process.env.SENTRY_PROJECT || "bambu-erp",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/sentry-tunnel",
  sourcemaps: { disable: true },
  silent: !process.env.CI,
  telemetry: false,
});
