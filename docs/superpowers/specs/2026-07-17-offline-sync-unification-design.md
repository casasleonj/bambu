# Design Doc — M7: Offline Sync Resilience + Unificación syncQueue → requestQueue

**Fecha:** 2026-07-17  
**Rama:** `feat/qa-07-offline-sync`  
**Objetivo:** Eliminar bugs críticos del sync offline, unificar los dos mecanismos de cola (`syncQueue` legacy y `requestQueue` moderna) y garantizar la mejor UX para repartidores en 2G/3G.

---

## 1. Contexto

Hoy existen dos mecanismos offline:

| Mecanismo | Dónde se usa | Características | Problemas |
|---|---|---|---|
| `requestQueue` | `fetchResilient` (hooks modernos) | `offlineId`, `attempts`, `lastAttemptAt`, `lastError`, DLQ | Bien, pero contador de pendientes ignora `syncQueue` |
| `syncQueue` + `offlineDb.pedidos` | `queuePedidoOffline` (venta libre del repartidor) | Sin `attempts`, sin backoff, sin DLQ, sin timeout | Reintentos infinitos, riesgo de duplicados, cuelgues |

`queuePedidoOffline` es el único caller activo de `syncQueue`. Unificar a `requestQueue` elimina la deuda técnica de mantener dos mecanismos.

---

## 2. Cambios principales

### 2.1 Unificación: `queuePedidoOffline` escribe a `requestQueue`

- Se elimina la creación de items en `syncQueue`.
- Se crea un item en `offlineDb.pedidos` (status `pending`) para que el repartidor siga viendo la venta pendiente.
- Se crea un item en `offlineDb.requestQueue` con:
  - `url`: `/api/pedidos/venta-libre`
  - `method`: `POST`
  - `body`: JSON serializado con los campos del pedido, incluyendo `offlineId: localId`
  - `offlineId`: mismo `localId` (permite correlacionar con `offlineDb.pedidos`)
  - `localEndpoint`: `'venta-libre'`

### 2.2 `syncWithServer` deja de procesar `syncQueue` para nuevos items

- Se mantiene un shim de compatibilidad que procesa items existentes en `syncQueue` hasta vaciarla.
- Los nuevos items son siempre `requestQueue`.
- El shim convierte cada item legacy en un `requestQueue` equivalente (construye body y `offlineId`) y lo procesa con la misma función interna; no duplica lógica.

### 2.3 Correlación `requestQueue` ↔ `offlineDb.pedidos`

Tras procesar un `requestQueue` item con `offlineId`:

- **200/201**: buscar `offlineDb.pedidos.where({ localId: req.offlineId }).first()` y actualizar:
  - `syncStatus: 'synced'`
  - `numero` (del server response)
  - `serverId` (del server response) — nuevo campo opcional
- **409**: mismo status update a `synced` (dedup resuelto por server). Si el body de respuesta contiene `pedido`, extraer `id` como `serverId` y `numero`.
- **4xx lógico**: mover a DLQ y actualizar `offlineDb.pedidos.syncStatus = 'conflict'`.
- **5xx / red**: mantener en cola y no cambiar `syncStatus`.

### 2.4 Fixes de robustez

1. **401 no purga cola**: redirigir a `/login?reason=expired`, devolver `sessionExpired: true`, NO ejecutar `requestQueue.clear()` ni `syncQueue.clear()`.
2. **Mutex de sync**: `syncWithServer` usa una promise-chain de módulo. Si ya corre, devuelve `{ alreadyRunning: true }`.
3. **Timeout en sync requests**: cada `fetch` usa `AbortController` con 10s.
4. **429 backoff**: no bloquear; incrementar `attempts`, aplicar `calculateBackoff`, mantener en cola.
5. **Contador de pendientes**: suma `requestQueue.count()` + `syncQueue.count()` en ambos indicadores (header y repartidor).

### 2.5 Tests

- **Unit tests** `src/lib/db/__tests__/sync.test.ts`:
  - `queuePedidoOffline` crea pedido + requestQueue
  - `syncWithServer` success actualiza `syncStatus` y `numero`
  - `syncWithServer` 401 no purga cola
  - `syncWithServer` 429 incrementa attempts y aplica backoff
  - `syncWithServer` 5xx retry + DLQ tras max attempts
  - `syncWithServer` concurrente devuelve `alreadyRunning`
  - Timeout aborta request y mantiene en cola

- **E2E** `e2e/qa/07-offline-sync/`:
  - M7-E2E-01: repartidor venta libre offline → sync → pedido persistido
  - M7-E2E-02: recargar página conserva cola offline
  - M7-E2E-03: múltiples requests offline se drenan en orden
  - M7-E2E-04: 4xx lógico no reintenta infinitamente
  - M7-E2E-05: 401 durante sync redirige a login y conserva cola

---

## 3. Schema / datos

No se requiere bump de Dexie. `syncQueue` se mantiene como tabla para compatibilidad con items existentes, pero no se agregan nuevos items. Se agrega campo opcional `serverId` a `OfflinePedido` (sin cambiar índices).

---

## 4. UX

- Indicador de conectividad y repartidor muestran contador correcto de ambas colas.
- Toast informativo si hay items en DLQ (sin construir UI completa).
- Botón de sync manual ya existe en el indicador; se mantiene.
- Sync ya no se queda bloqueado por 429 o requests sin timeout.

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Items legacy en `syncQueue` quedan sin procesar | Shim de compatibilidad que drena `syncQueue` antes de `requestQueue` en cada `syncWithServer`. |
| AbortController interrumpe request que ya llegó al server | Reintento usa `offlineId`; dedup server-side evita duplicados. |
| Unificación cambia forma de contar pedidos pendientes | Se mantiene `offlineDb.pedidos` para display; solo cambia el mecanismo de sync. |
| `offlineId` en venta libre no llega al server por error | El body se serializa con `offlineId: localId` y el endpoint `/api/pedidos/venta-libre` ya espera `offlineId`. |
| Mutex en memoria no protege cross-tab | Protege dentro del mismo tab. Cross-tab sync simultáneo es raro y server-side dedup lo cubre. |

---

## 6. Criterios de hecho (verificables)

- `npm run test` pasa (incluyendo nuevos tests unitarios).
- `npx tsc --noEmit` pasa.
- `npx playwright test e2e/qa/07-offline-sync` pasa (5 specs).
- No hay `syncQueue.add` en código productivo (solo tests/shim de compatibilidad).
- 401 no ejecuta `offlineDb.requestQueue.clear()` ni `offlineDb.syncQueue.clear()`.
