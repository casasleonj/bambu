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
