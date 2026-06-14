/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist, NetworkOnly } from "serwist";

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the
// actual precache manifest. By default, this string is set to
// `"self.__SW_MANIFEST"`.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  // clientsClaim: false para evitar blank page en SSR streaming.
  // Razón documentada (GhostClass, marzo 2026): con clientsClaim: true, el
  // SW reclama el tab en mid-stream de un SSR response (Next.js force-dynamic
  // + Suspense), abortándolo. El usuario ve una página en blanco en install
  // fresh. Un refresh manual siempre funciona porque el SW ya está activo.
  // Ver protocolo: docs de Serwist + patrón Workbox-window.
  clientsClaim: false,
  navigationPreload: true,
  // API routes: network-only (never cache authenticated responses)
  runtimeCaching: [
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// =====================================================================
// commit 4b plan antifraude: Web Push handler
// =====================================================================
//
// Cuando el cron (3.3 / 4) crea un Caso ALTA, llama broadcastPush()
// (src/lib/push.ts) que envia un push via web-push. Este SW recibe el
// push y muestra una notification nativa.
//
// Payload esperado:
//   {
//     title: 'Nueva alerta antifraude',
//     body: 'Cliente X: 5 NCs en 30 dias',
//     url: '/casos/{casoId}',  // donde clickear abre
//     tag: 'caso-{casoId}',    // dedup de notifications del mismo caso
//   }
//
// Si el usuario clickea la notification, abrimos la URL en un tab nuevo
// (o lo enfocamos si ya existe).

interface PushPayload {
  title?: string
  body?: string
  url?: string
  tag?: string
}

self.addEventListener("push", (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = (event.data?.json() ?? {}) as PushPayload
  } catch {
    // Payload invalido (no es JSON): usar defaults
  }

  const title = payload.title ?? "Nueva alerta"
  const options: NotificationOptions = {
    body: payload.body,
    tag: payload.tag,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    data: { url: payload.url },
    // requireInteraction: true → la notification no se cierra
    // automaticamente (el user debe actuar). Importante para
    // alertas antifraude que requieren atencion inmediata.
    requireInteraction: true,
    // tag dedup: si llega otro push con mismo tag, el browser
    // reemplaza en vez de apilar multiples notifications.
  }

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.error("[sw] showNotification fallo:", err)
    }),
  )
})

// Click en la notification: abrir la URL en un client del SW
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  const notification = event.notification
  const url = (notification.data as { url?: string } | undefined)?.url

  notification.close()

  if (!url) return

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Si ya hay un tab con la URL, enfocarlo
        for (const client of clientList) {
          if ("focus" in client && client.url.includes(url)) {
            return (client as WindowClient).focus()
          }
        }
        // Si no, abrir nuevo tab
        return self.clients.openWindow(url)
      }),
  )
})
