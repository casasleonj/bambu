# Design Doc — M7: Offline Sync Resilience + Unificación syncQueue → requestQueue

**Fecha:** 2026-07-17  
**Rama:** `feat/qa-07-offline-sync`  
**Estado:** Convergido tras 4 iteraciones de auditoría au.md  
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

### 2.1 Unificación: `queuePedidoOffline` escribe a `requestQueue` en transacción

- Se elimina la creación de items en `syncQueue`.
- Se crea un item en `offlineDb.pedidos` (status `pending`) para que el repartidor siga viendo la venta pendiente.
- Se crea un item en `offlineDb.requestQueue` dentro de la misma transacción Dexie:
  - `url`: `/api/pedidos/venta-libre`
  - `method`: `POST`
  - `body`: JSON de `{ clienteId, items, pagos, embarqueId, obs, fotoEntrega, gpsLat, gpsLng, offlineId }`  
    (`items` incluye `precioManual` si existe; `offlineId` es el mismo `localId`).
  - `offlineId`: mismo `localId` (permite correlacionar con `offlineDb.pedidos`).
  - `localEndpoint`: `'venta-libre'`.
  - `createdAt`: fecha actual.
- Si la transacción falla, ninguna de las dos escrituras persiste. El caller muestra error al usuario.

### 2.2 `syncWithServer` deja de procesar `syncQueue` para nuevos items

- Se mantiene un shim de compatibilidad que, antes de procesar `requestQueue`, convierte items existentes en `syncQueue` a `requestQueue` equivalentes y los borra de `syncQueue`.
- El shim conserva el `createdAt` original del item legacy para que la edad respete DLQ.
- Si el shim no encuentra el pedido asociado a un `localId`, mueve el item a DLQ y lo borra de `syncQueue` (no reintentar items huérfanos).
- Los nuevos items son siempre `requestQueue`.

### 2.3 Correlación `requestQueue` ↔ `offlineDb.pedidos`

Tras procesar un `requestQueue` item con `offlineId`:

- **200/201**: transacción Dexie que actualiza `offlineDb.pedidos` (`syncStatus: 'synced'`, `numero` del server response) y borra el item de `requestQueue`.
- **409**: misma transacción con status `synced` (dedup resuelto por server). Si el body contiene `pedido`, extraer `numero`.
- **4xx lógico**: transacción que mueve a DLQ y actualiza `offlineDb.pedidos.syncStatus = 'conflict'`.
- **5xx / red / timeout**: mantener en cola y no cambiar `syncStatus`.

### 2.4 Fixes de robustez

1. **401 no purga cola**: redirigir a `/login?reason=expired`, devolver `sessionExpired: true`, NO ejecutar `offlineDb.requestQueue.clear()` ni `offlineDb.syncQueue.clear()`.
2. **Mutex de sync**: `syncWithServer` usa una promise-chain de módulo. Si ya corre, devuelve `{ alreadyRunning: true }` sin procesar.
3. **Timeout en sync requests**: cada `fetch` usa `AbortController` con **60s** (fotos de venta libre en 2G/3G).
4. **429 backoff**: no bloquear; incrementar `attempts`, aplicar `calculateBackoff`, mantener en cola.
5. **Contador de pendientes**: suma `requestQueue.count()` + `syncQueue.count()` en `connectivity-indicator` y `repartidor-client`.

### 2.5 Dead code a eliminar

- `processSyncQueue` (no se importa).
- `queueClienteOffline` (no se usa).
- `getConflicts` (no se importa).
- `resolveConflict` (no se importa).
- Tipos `ConflictResolution` y `ConflictStrategy`.

### 2.6 UX

- Indicador de conectividad y repartidor muestran contador correcto de ambas colas.
- Badge rojo en el indicador cuando `failedItems.count() > 0`.
- Toast de DLQ **solo en sync manual** (click del indicador o botón del repartidor), con `sessionStorage` `bambu:dlq-notified` como respaldo anti-repetición en el mismo tab.
- Sync ya no se queda bloqueado por 429 o requests sin timeout.

### 2.7 Tipos

```ts
function calculateBackoff(attempts: number, randomFn?: () => number): number

interface SyncResult {
  synced: number
  failed: number
  conflicts: number
  remaining: number
  drained: boolean
  failedPermanently: number
  sessionExpired: boolean
  alreadyRunning?: boolean
}
```

---

## 3. Schema / datos

No se requiere bump de Dexie. `syncQueue` se mantiene como tabla vacía para compatibilidad; no se agregan nuevos items. No se agrega `serverId` a `OfflinePedido` (YAGNI).

---

## 4. Tests

### Unit tests puros (`src/lib/db/__tests__/sync-pure.test.ts`)

- `isRetryableStatus` para 401, 409, 429, 4xx, 5xx, 0.
- `calculateBackoff` con `randomFn` inyectado.
- `shouldMoveToDLQ` con intentos y edad.

### Unit tests con mocks (`src/lib/db/__tests__/sync-offline.test.ts`)

- `queuePedidoOffline` crea pedido + requestQueue con body correcto.
- `queuePedidoOffline` usa transacción: si `requestQueue.add` falla, `pedidos.add` no persiste.
- `syncWithServer` success actualiza `syncStatus` y `numero`.
- `syncWithServer` 401 no purga colas.
- `syncWithServer` concurrente devuelve `alreadyRunning`.

### E2E (`e2e/qa/07-offline-sync/`)

- **M7-E2E-01**: repartidor venta libre offline → sync → pedido persistido.
- **M7-E2E-02**: recargar página conserva cola offline.
- **M7-E2E-03**: múltiples requests offline se drenan en orden.
- **M7-E2E-04**: 4xx lógico no reintenta infinitamente (DLQ + badge rojo).
- **M7-E2E-05**: 401 durante sync redirige a login y conserva cola.

Técnicas E2E:
- Offline: `context.setOffline(true)`.
- 401: borrar cookie de sesión antes de sync o interceptar el endpoint con 401.
- Timeout: interceptar con Playwright `route.fulfill` con delay 70s.

---

## 5. Riesgos residuales conocidos

| Riesgo | Impacto | Mitigación actual | Próximo paso |
|---|---|---|---|
| Dispositivos compartidos: cola offline no etiquetada con `userId` | Un usuario distinto podría sync ventas de otro o recibir 403/DLQ | Server-side dedup y verificación de embarque | Post-M7: agregar `userId` a `requestQueue` items y saltar items de otro usuario |
| Embarque cerrado antes del sync | Venta libre va a DLQ y no se recupera | Es regla de negocio: venta libre requiere embarque abierto | UX: mostrar claramente `syncStatus='conflict'` con mensaje explicativo |
| Mutex solo en memoria (no cross-tab) | Dos tabs pueden sync simultáneamente | Raro para 6 usuarios; server-side dedup cubre | Aceptado para M7 |

---

## 6. Criterios de hecho (verificables)

- `npm run test` pasa (incluyendo nuevos tests unitarios).
- `npx tsc --noEmit` pasa.
- `npx playwright test e2e/qa/07-offline-sync` pasa (5 specs).
- No hay `syncQueue.add` en código productivo (solo tests/shim de compatibilidad).
- 401 no ejecuta `offlineDb.requestQueue.clear()` ni `offlineDb.syncQueue.clear()`.
- No quedan exports muertos: `processSyncQueue`, `queueClienteOffline`, `getConflicts`, `resolveConflict`, `ConflictResolution`, `ConflictStrategy`.

---

## 7. Ejemplos de negocio

**Ejemplo 1: la foto que no sube**
Yesid vende una paca en una finca con señal de 2G. Toma la foto, guarda la venta offline. Cuando vuelve al pueblo y hay 3G, la app intenta enviar la venta. La foto pesa 3 MB. Con el timeout de 10 segundos, la app se cansa antes de que suba, cancela y vuelve a intentar. Yesid ve "Sincronizando" una y otra vez, gastando datos móviles. Con 60 segundos, la foto sube tranquila.

**Ejemplo 2: el celular compartido**
En la oficina hay un solo celular. Yesid lo usa en la mañana y deja una venta offline. Por la tarde, Lilia (admin) toma el mismo celular, cierra sesión y entra como admin. Si la app no sabe quién creó cada venta pendiente, podría intentar enviar la venta de Yesid con la sesión de Lilia. El server dirá "este embarque no es tuyo" y la venta se va a la caja negra. Hoy no tenemos forma de evitar eso; es un riesgo que dejamos documentado para arreglar después.

**Ejemplo 3: la moto con dos colas**
Hoy la app tiene dos motos repartiendo el mismo barrio: una moto vieja (`syncQueue`) y una moto nueva (`requestQueue`). La vieja no tiene seguro, no hace mantenimiento y no tiene límite de viajes. La nueva sí. La unificación propuesta manda todo por la moto nueva, pero deja la vieja aparcada por si alguien todavía tiene un paquete antiguo. Una vez que todos entreguen sus paquetes viejos, la moto vieja se puede desechar.

**Ejemplo 4: el toast que no molesta**
Yesid tiene 3 ventas offline. Una falla porque el embarque se cerró. Antes, cada 30 segundos la app le recordaba "tienes ventas sin sincronizar". Era como un vecino que toca la puerta cada media hora. Ahora, la puerta del indicador se pone roja para que él la vea cuando quiera, y solo suena el timbre cuando él toca el botón de sync.
