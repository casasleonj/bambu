# Spec: Rediseño de UX para notificaciones push

**Fecha:** 2026-06-29  
**Estado:** En revisión  
**Autor:** Asistente de código  
**Stack:** Next.js 16.2.4, React 19.2.4, TypeScript 5.9.3, Serwist 9.5.7 (`@serwist/turbopack`), Auth.js v5, Sonner 2.0.7, web-push

---

## 1. Contexto y objetivos

El usuario reporta que la actual superficie de notificaciones push es **demasiado intrusiva** y que en Android el permiso aparece **bloqueado por el navegador** sin una guía clara de recuperación.

La implementación actual tiene el permiso pedido en **tres lugares simultáneamente**:

1. Un **banner azul en `/dashboard`** en cada login (patrón "BAD UX" de web.dev: pedir permiso sin contexto).
2. Un **bloque permanente en el sidebar** (ocupa espacio incluso si no se usa).
3. Un **bloque en el dropdown del header** (duplicado del sidebar).

Además, cuando llega un push, el service worker siempre muestra una **notification nativa**, incluso si el usuario ya está mirando la app (`requireInteraction: true` en alertas ALTA).

### Objetivos de negocio

- Reducir la fricción visual: cero banners de permiso en el flujo principal.
- Centralizar el control de notificaciones en `/configuracion`.
- Pedir permiso **solo cuando hay valor claro** (primer acceso con contexto de casos críticos).
- Recuperar usuarios que denegaron el permiso con guía paso a paso por OS.
- Evitar notificaciones nativas redundantes cuando el usuario ya tiene la app abierta y visible.

### Objetivos técnicos

- No migrar a librerías externas (OneSignal, Firebase, etc.). Se mantiene `web-push` + Serwist.
- No agregar dependencias nuevas.
- Mantener la arquitectura offline-first y la compatibilidad con PWA.
- Mantener todos los tests existentes verdes.

---

## 2. Limitaciones técnicas que aceptamos

| Limitación | Impacto | Mitigación en este diseño |
|---|---|---|
| iOS requiere PWA instalada (standalone) para push. | En Safari iOS sin instalar, el prompt nativo no funciona. | El opt-in no se muestra en iOS sin standalone; el `PwaInstallBanner` existente guía la instalación. |
| Safari iOS en modo standalone no permite re-configurar notificaciones por sitio. | Si el usuario bloquea en standalone, no hay UI del sistema para desbloquear. | La mini-guía lo documenta honestamente y remite al administrador del dispositivo. |
| Web Push no soporta "inbox" persistente en el servidor. | Si el permiso está denegado, el push se pierde. | Se mantiene el listado de casos en `/casos` como fuente de verdad; el push es un reenvío, no un store. |
| `clients.matchAll()` solo ve clients de la misma origin. | Si el user tiene la app abierta en otra origin (imposible en este producto), no se detecta. | No aplica. |

---

## 3. Alcance

### Dentro del alcance

- Quitar `PushPermissionBanner` del dashboard.
- Quitar `PushSettings` del sidebar y del header dropdown.
- Mantener `PushSettings` como **único punto de control** en `/configuracion`.
- Agregar un **opt-in toast discreto** (top-right, debajo del header) que se muestra una vez por sesión.
- Modificar el service worker para:
  - No mostrar notification nativa si hay al menos un client abierto.
  - Enviar `postMessage` a todos los clients cuando la app está abierta.
- Crear `InAppPushListener` para mostrar un toast Sonner cuando llega un push mientras la app es visible.
- Mejorar `PushSettings` con:
  - Mini-guía para desbloquear el permiso según OS (Android, iOS web, iOS standalone, Desktop).
  - Re-evaluación del estado al volver a la pestaña (`visibilitychange`).
- Tests unitarios y E2E.

### Fuera del alcance

- Crear un inbox in-app persistente de alertas.
- Agregar sonido o vibración custom.
- Agregar `caso` al sistema realtime (SSE). El push sigue siendo el mecanismo de alerta fuera de la app.
- Cambiar la lógica del cron (`alertas-batch`) ni la severidad ALTA.

---

## 4. Arquitectura general

```
┌─────────────────────────────────────────────────────────────────┐
│                       (app)/layout.tsx                           │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │ InAppPushListener   │  │ PushOptInToast      │               │
│  │ (escucha SW msg)    │  │ (prompt contextual) │               │
│  └─────────────────────┘  └─────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    src/app/sw.ts
                    - push event
                    - clients.matchAll()
                    - postMessage or showNotification
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    App focused (clients > 0)          App closed (clients == 0)
    postMessage a todos los clients    showNotification nativa
              │                               │
              ▼                               ▼
    InAppPushListener              Bandeja nativa del SO
    toast Sonner "Ver caso"        click → abre /casos/{id}

Configuración centralizada:
    /configuracion
    └── PushSettings (toggle + mini-guía denied)
```

---

## 5. Decisiones técnicas clave

| Decisión | Justificación | Alternativas descartadas |
|---|---|---|
| Opt-in como **toast custom** (no Sonner) | Evita conflicto visual con `PwaInstallBanner` (fixed bottom-0) y con la pila de toasts de Sonner. | Sonner toast: se solaparía con install banner en móvil. Banner inline: ocuparía espacio en layout. |
| `postMessage` a **todos los clients** y el listener filtra con `document.hasFocus()` | El patrón canónico `isClientFocused()` de web.dev falla en multi-tab: la tab inactiva se queda sin feedback. | `isClientFocused()`: tab inactiva pierde alerta. Siempre showNotification: duplica toast nativo cuando la app está abierta. |
| Native notification solo si **clients.length === 0** | Si hay alguna tab abierta, la alerta se maneja in-app; si no, va nativa. | `clients.length > 0 && !focused`: nativa aunque haya tab inactiva (duplicado con postMessage). |
| Tag por caso (`caso-${id}`) | Cada alerta ALTA es independiente; agruparlas haría perder visibilidad de casos anteriores. | Tag por día: colapsa en bandeja Android pero pierde info de casos individuales. |
| Opt-in gating por **rol** (ADMIN, ASISTENTE, CONTADOR) | REPARTIDOR y SELLADOR no reciben casos antifraude; mostrarles el prompt sería ruido. | Mostrar a todos: más conversiones pero peor UX para roles que no necesitan la alerta. |
| Guard `iOS sin standalone` | En Safari iOS web, push no funciona; el prompt nativo siempre deniega. | Mostrar igual: user frustrado, denegación permanente. |
| Flags: `localStorage.push-opt-in-dismissed` + `sessionStorage.push-opt-in-shown-this-session` | "Dismissed" es permanente; "shown this session" evita el spam intra-sesión. | Solo sessionStorage: re-aparece en cada sesión (aceptable) pero dismissed no persiste. Solo localStorage dismissed: nunca se vuelve a mostrar, incluso si el usuario cambia de opinión (pero puede ir a /configuracion). |

---

## 6. Fases de implementación

### Fase 1: Limpieza de superficies intrusivas

**Archivos a modificar:**
- `src/app/(app)/dashboard/page.tsx`: quitar import y `<PushPermissionBanner />`.
- `src/app/(app)/sidebar.tsx`: quitar import y bloque "Notificaciones".
- `src/app/(app)/header.tsx`: quitar import y `<PushSettings />` del dropdown.

**Archivos a eliminar:**
- `src/components/push-permission-banner.tsx`
- `src/components/__tests__/push-permission-banner.test.tsx`

### Fase 2: Service Worker inteligente

**Archivo:** `src/app/sw.ts`

Cambios en el handler `push`:
1. Agregar helper `handlePush(event)`.
2. Obtener `clients` con `matchAll({ type: 'window', includeUncontrolled: true })`.
3. Si `clients.length === 0`: `showNotification(title, options)`.
4. Si `clients.length > 0`: iterar y `client.postMessage({ type: 'in-app-alert', payload })`.
5. Mantener `tag: caso-${id}` y `requireInteraction: true`.
6. Atrapar errores con `.catch()` para no matar el SW.

### Fase 3: Listener in-app

**Archivo nuevo:** `src/components/in-app-push-listener.tsx`

- Client component.
- `useEffect` que espera `navigator.serviceWorker.ready`.
- Handler de `message`:
  - Valida `event.data?.type === 'in-app-alert'`.
  - Valida `document.hasFocus()`.
  - Muestra `toast(title, { description, action: { label: 'Ver caso', onClick: () => router.push(url) }, duration: 10000 })`.
- Cleanup remueve listener y cancela pending attach.

**Montaje:** `src/app/(app)/layout.tsx` dentro de `<RealtimeProvider>`, antes de `AppShell`.

### Fase 4: Opt-in toast contextual

**Archivos nuevos:**
- `src/hooks/use-push-opt-in.ts`
- `src/components/push-opt-in-toast.tsx`

**Hook `usePushOptIn`:**
- Lee `useSession().user.role`.
- Lee `isIosDevice()` e `isStandaloneMode()`.
- Lee `Notification.permission`.
- Lee `localStorage.push-opt-in-dismissed` y `sessionStorage.push-opt-in-shown-this-session`.
- Expone `{ shouldShow, accept, dismiss, loading, error }`.
- `accept()`:
  - Llama `usePushSubscription().subscribe()`.
  - No setea flags; `Notification.permission` se actualiza automáticamente y gating futuro.
- `dismiss()`:
  - Setea `push-opt-in-dismissed=1` en localStorage.
  - Setea `push-opt-in-shown-this-session=1` en sessionStorage.

**Componente `PushOptInToast`:**
- `fixed top-20 inset-x-4 sm:left-auto sm:right-4 sm:max-w-sm z-50`.
- Fondo blanco, sombra, bordes redondeados.
- `role="status" aria-live="polite"`.
- `data-testid="push-opt-in-toast"`.
- Copy: "Recibí alertas al instante cuando entren casos críticos."
- Botón "Activar" (deshabilitado mientras `loading`, texto "Activando...").
- Botón "Más tarde" (llama `dismiss`).
- Auto-dismiss con `setTimeout(8000)` + cleanup.

**Montaje:** `src/app/(app)/layout.tsx` junto a `InAppPushListener`.

### Fase 5: Settings mejorado

**Archivo:** `src/components/push-settings.tsx`

Cambios:
1. En `getPushState()` para `permission === 'denied'`, retornar hint con mini-guía por OS:
   - Android: candado URL → Notificaciones → Permitir.
   - iOS sin standalone: instalar app primero.
   - iOS con standalone: limitación del sistema, contactar admin.
   - Desktop: candado barra de direcciones → Notificaciones → Permitir.
2. Agregar `useEffect` con `visibilitychange`:
   - Cuando `document.hidden` vuelve a `false`, re-lee `Notification.permission` y actualiza state.
3. Asegurar `aria-live="polite"` en el bloque de estado.

### Fase 6: Tests

| Tipo | Archivo | Cobertura |
|---|---|---|
| Unit | `src/hooks/__tests__/use-push-opt-in.test.ts` | Estados por permission, rol, iOS/standalone, dismissed, session, accept, dismiss. |
| Unit | `src/components/__tests__/in-app-push-listener.test.tsx` | Attach listener, message type filter, `document.hasFocus()` filter, unsupported SW. |
| Unit | `src/components/__tests__/push-opt-in-toast.test.tsx` | Render condicional, accept, dismiss, loading, auto-dismiss. |
| Unit | `src/components/__tests__/push-settings.test.tsx` | Mini-guía por OS, `visibilitychange` re-eval. |
| E2E | `e2e/notificaciones/opt-in-toast.spec.ts` | Stub `Notification.permission='default'`, assert toast visible, click accept/dismiss. |
| E2E | `e2e/notificaciones/permission-flow.spec.ts` | Estados default/granted/denied en `/configuracion`. |
| E2E | `e2e/menu-reorder.spec.ts`, `e2e/mobile-header.spec.ts` | Assert que el bloque "Notificaciones" no está en sidebar/header. |

---

## 7. Flujos detallados

### 7.1 Usuario nuevo, primera sesión

1. Usuario hace login → `/dashboard`.
2. No hay banner de push.
3. Navega a cualquier página de `(app)`.
4. `PushOptInToast` aparece top-right (rol permitido, permission=default, iOS OK, no dismissed).
5. Usuario clickea "Activar".
6. Prompt nativo del navegador aparece.
7. Usuario permite → `permission='granted'` → toast desaparece, no vuelve a aparecer.
8. Si deniega → `permission='denied'` → toast desaparece. Puede ir a `/configuracion` para ver la guía de recuperación.
9. Si clickea "Más tarde" → toast desaparece, no vuelve esta sesión; en la próxima sesión puede aparecer de nuevo.

### 7.2 Usuario con permiso denegado

1. Usuario va a `/configuracion`.
2. `PushSettings` muestra "Bloqueadas" con mini-guía OS-específica.
3. Sigue los pasos, cambia el permiso en configuración del navegador.
4. Vuelve a la pestaña de la app.
5. Evento `visibilitychange` dispara re-evaluación.
6. El estado pasa a "Inactivas" (permission=default) o "Activas" (permission=granted).
7. El botón se habilita.

### 7.3 Llegada de un caso ALTA

1. Cron `alertas-batch` crea caso con `severidad='ALTA'`.
2. Llama `broadcastPush({ title, body, url, tag })`.
3. Push service entrega al SW.
4. SW ejecuta `handlePush`:
   - Si no hay tabs abiertas → `showNotification` nativa.
   - Si hay tabs abiertas → `postMessage` a todas.
5. Cada tab recibe el mensaje.
   - La tab focused muestra un toast Sonner con "Ver caso".
   - Las tabs no focused ignoran el mensaje.
6. Si el usuario clickea la notificación nativa (caso app cerrada) → abre `/casos/{id}`.
7. Si el usuario clickea el action del toast (caso app abierta) → `router.push('/casos/{id}')`.

---

## 8. Hooks y componentes nuevos

### 8.1 `usePushOptIn`

```ts
interface UsePushOptInReturn {
  shouldShow: boolean
  accept: () => Promise<void>
  dismiss: () => void
  loading: boolean
  error: string | null
}
```

Responsabilidades:
- Determinar si el toast opt-in debe mostrarse.
- Orquestar la suscripción.
- Gestionar flags de persistencia.

### 8.2 `PushOptInToast`

Responsabilidades:
- Renderizar la UI del opt-in.
- Auto-dismiss y cleanup.
- Exponer `data-testid` para tests.

### 8.3 `InAppPushListener`

Responsabilidades:
- Escuchar mensajes del SW.
- Mostrar toast Sonner cuando la app está visible.
- Ignorar mensajes cuando el tab no tiene foco.

---

## 9. Modificaciones de archivos existentes

| Archivo | Cambio |
|---|---|
| `src/app/(app)/layout.tsx` | Montar `<InAppPushListener />` y `<PushOptInToast />`. |
| `src/app/(app)/dashboard/page.tsx` | Quitar `<PushPermissionBanner />`. |
| `src/app/(app)/sidebar.tsx` | Quitar bloque "Notificaciones". |
| `src/app/(app)/header.tsx` | Quitar `<PushSettings />` del dropdown. |
| `src/app/sw.ts` | Reescribir handler `push` con lógica multi-tab. |
| `src/components/push-settings.tsx` | Mini-guía denied + `visibilitychange` listener. |

---

## 10. Rollback

Si las métricas de activación de push caen > 30% tras 2 semanas:
1. Revertir Fase 1: re-agregar `<PushPermissionBanner />` en `/dashboard`.
2. Revertir Fase 2: volver al handler `push` original (siempre `showNotification`).
3. Mantener mejoras de mini-guía y `visibilitychange` (value-adds independientes).

---

## 11. Criterios de aceptación

- [ ] `npx tsc --noEmit` pasa.
- [ ] `npm run test` pasa incluyendo los 4 tests unitarios nuevos.
- [ ] `npx playwright test e2e/notificaciones/` pasa.
- [ ] `/dashboard` no muestra banner de notificaciones.
- [ ] Sidebar no muestra bloque "Notificaciones".
- [ ] Header dropdown no muestra `PushSettings`.
- [ ] `/configuracion` muestra el toggle con mini-guía correcta según OS cuando `permission='denied'`.
- [ ] Un push de prueba con app abierta y focused muestra toast Sonner, no notification nativa.
- [ ] Un push de prueba con app cerrada muestra notification nativa.
