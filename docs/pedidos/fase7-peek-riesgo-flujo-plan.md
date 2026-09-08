# Fase 7 — Relación cruzada + riesgo en el peek

> **For agentic workers:** slices F7-i → F7-ii → F7-iii. TDD, commits frecuentes. Detrás de `NEXT_PUBLIC_PEDIDOS_V2` (OFF). **Base:** `feat/pedidos-fase6-g11` (PR #232). Rebasar sobre `main` cuando #231/#232 mergeen.

**Goal:** que desde el peek de una operación el usuario **entienda el riesgo/las excepciones reales** (consumiendo las reglas ya definidas en `alertas-config.ts`, sin inventar ni acusar) y pueda **acceder** a los dominios relacionados (Embarque, Entrega, Factura, Cartera, pedidos vinculados, N2) **sin salir de la lista y sin fusionar dominios**.

**Autoridad:** las reglas de riesgo son `src/lib/alertas-config.ts` (`GUIA_ALERTAS`) + la detección (`alertas-detector.ts` / cron) + `Caso` (`/casos`). El peek **consume y explica**, no redefine ni predice.

**Blueprint:** §5.3 (riesgo/antifraude en el flujo — "y en el peek"), §6.2 (relación Pedidos ↔ Embarques ↔ Cartera — acceso contextual, no fusión). **Gates:** G4 (peek no navega la lista), G7 (ninguna regla crítica solo en frontend).

---

## 0. Contexto técnico (investigación, 2026-09-08)

### Qué ya existe en el peek (Fase 4b + F5 + F6 — no se rehace)

| Relación (§6.2) | Estado | Dónde |
|---|---|---|
| Embarque (# · estado · repartidor) | ✅ | `peek-relaciones.tsx` `peek-rel-embarque` |
| Factura (# · estado · saldo **de la factura**) | ✅ | `peek-rel-factura` |
| Cartera (saldo **del cliente**, distinguido del saldo de la operación) | ✅ | `peek-rel-cartera` + `Saldo de esta operación` |
| Pedidos vinculados (G11.B, ambos sentidos) | ✅ (F6) | `peek-rel-vinculado-*` |
| Pendiente N2 (remanente + actividades + gestión) | ✅ (F5) | `PedidoExceptionPanel` |
| G11 "Cambiar cantidades" | ✅ (F6-i) | `PedidoCambioCantidad` |
| **Excepciones abiertas (`Caso`)** | ⚠️ **mínimo** — lista `{alertaTipo} · {status}` en caja roja, sin guía, sin severidad, sin cross-link | `peek-relaciones.tsx:97-105` |
| **Entrega (GPS · foto · cuándo)** | ❌ no está en el peek | — |
| **Riesgo preventivo** | N/A para una operación existente — el riesgo materializado ES el `Caso` | — |

### Datos disponibles

- `PedidoPeekExtras.casosAbiertos: Array<{ id, alertaTipo, severidad, status }>` (`GET /api/pedidos/[id]` `route.ts:75-78`, ya lo trae).
- `GUIA_ALERTAS: Record<AlertaTipo, GuiaAlerta>` en `alertas-config.ts` — `{ tipo, nombre, severidad, icono, definicion, comoSeAplica, ejemplos[], soluciones[], acciones[] }`. Helper `getGuiaAlerta(tipo)`.
- `Pedido` tiene `fechaEntrega`, `fotoEntrega`, `gpsLat`, `gpsLng` (`schema.prisma:713,726-728`). **No** hay `entregadoPor`.
- `CasoGuiaModal` (`src/components/caso-guia-modal.tsx`, 622 líneas) — el editor completo de resolución. **NO se reusa en el peek** (es territorio de `/casos`; frontera de dominio). El peek sólo **explica + cross-linkea**.

### Lo que NO se hace / NO se inventa

- No se redefine ninguna `AlertaTipo` ni severidad — se usa `GUIA_ALERTAS` tal cual.
- No se calcula riesgo nuevo en el cliente (G7). El `Caso` ya es el resultado de la detección.
- No se embebe el flujo de resolución de `Caso` en el peek (cambiar status, asignar, etc.) — eso vive en `/casos`.
- No se toca `alertas-detector.ts`, el cron, ni `/reportes/salud-antifraude`.
- No se agrega `entregadoPor` al schema (no existe; el peek muestra lo que hay).
- No se fusionan dominios: cada relación es un cross-link a su contexto.

---

## 1. Precisiones a respetar

| # | Precisión | Cómo se cumple |
|---|---|---|
| **P1** | **Señal ≠ Bloqueo ≠ Acusación.** El peek explica una excepción; no la juzga ni la resuelve. | `PedidoPeekRiesgo` muestra `definicion` + primera `solucion` de `GUIA_ALERTAS`; footer "Esto es una señal para revisión, no una acusación." Sin botones de resolución. |
| **P2** | **Consume `alertas-config`, no define reglas (G7).** | El componente importa `getGuiaAlerta`/`GUIA_ALERTAS`; test de fuente lo verifica. Si un `alertaTipo` no tiene guía → fallback neutro (`{tipo} · {status}`), nunca inventa texto. |
| **P3** | **Tono por severidad, disciplina de color (G6).** | `ALTA` → rojo, `MEDIA` → ámbar, `BAJA` → gris/neutro. Sin badges apilados. |
| **P4** | **Acceso, no fusión (§6.2, G4).** | Cross-link "Ver en Casos →" a `/casos` (navega, no abre modal en el peek). Entrega → link a coords en Maps + foto en nueva pestaña. El peek nunca deja de ser un peek. |
| **P5** | **La entrega es dato propio del Pedido (capa 2).** | `entregaResumen` sólo si `estadoEntrega === 'ENTREGADO'` y hay al menos un campo; read-only en `GET /api/pedidos/[id]`. |
| **P6** | **Realtime selectivo (ya existe, F5-i).** | `pedido.*` / `pago.*` / `embarque.*` invalidan el peek; se agrega que un evento de `caso`/alertas (si existe) invalide también. Si no hay evento realtime de casos, se documenta como límite (no se inventa uno). |

---

## 2. Contrato de datos

### `GET /api/pedidos/[id]` — `PedidoPeekExtras` extendido (F7-ii)

```ts
interface PedidoPeekExtras {
  // ...campos existentes...
  entregaResumen: {
    fecha: string | null          // Pedido.fechaEntrega ISO
    gpsLat: number | null
    gpsLng: number | null
    fotoUrl: string | null        // Pedido.fotoEntrega
  } | null                        // null si estadoEntrega != ENTREGADO
}
```
Read-only. Se arma en el mismo `Promise.all` del route; sin queries nuevas pesadas (los campos ya están en `found.pedido`).

### `casosAbiertos` — sin cambios de shape

`{ id, alertaTipo, severidad, status }` ya es suficiente. El componente resuelve la guía por `alertaTipo`.

---

## 3. Slices

### F7-i — `PedidoPeekRiesgo` (excepciones con guía) ✅ IMPLEMENTADO
**Archivos:**
- Crear `src/app/(app)/pedidos/pedido-hub/pedido-peek-riesgo.tsx` — props `{ casos: PedidoPeekExtras['casosAbiertos'] }`. Por cada caso: `getGuiaAlerta(alertaTipo)` → `icono + nombre`, tono por severidad, `<details>` con `definicion` + `soluciones[0]`. Footer P1. Link "Ver en Casos →" a `/casos` (uno global, no por caso). Fallback neutro si no hay guía.
- Modificar `src/app/(app)/pedidos/pedido-hub/peek-relaciones.tsx` — reemplazar el bloque `data.casosAbiertos.length > 0 && (...)` por `<PedidoPeekRiesgo casos={data.casosAbiertos} />`.
- Tests: `pedido-peek-riesgo.test.tsx` — usa guía real de `alertas-config` (p.ej. `MONTO_ANOMALO`), tono por severidad, `<details>` colapsado por defecto, footer "señal, no acusación", fallback sin guía, link a `/casos`; test de fuente: importa de `alertas-config`, no define `definicion`/`soluciones` propias.

**Criterio:** una operación sin casos → no renderiza nada. Con un caso → explica qué/por qué/qué hacer con el texto de `GUIA_ALERTAS`, tono por severidad, y un cross-link que **navega** a `/casos` (no abre modal). Cero juicio ("fraude", "culpable").

### F7-ii — entrega en el peek
**Archivos:**
- Modificar `src/modules/pedidos/application/dto/index.ts` — `PedidoPeekExtras += entregaResumen`.
- Modificar `src/app/api/pedidos/[id]/route.ts` — armar `entregaResumen` (solo si `estadoEntrega === 'ENTREGADO'`), read-only.
- Crear `src/app/(app)/pedidos/pedido-hub/peek-entrega.tsx` — props `{ entrega: PedidoPeekExtras['entregaResumen'] }`. Muestra fecha (formato Bogotá), link "Ver ubicación" a `https://www.google.com/maps?q=lat,lng` (nueva pestaña) si hay coords, "Ver foto" si hay `fotoUrl`. `null` → no renderiza.
- Modificar `peek-relaciones.tsx` — insertar `<PeekEntrega>` tras el bloque de Factura.
- Modificar `src/app/(app)/pedidos/pedido-hub/peek-cache.ts` si `PeekLayer2` tipa los extras (verificar; probablemente sólo re-exporta el DTO).
- Tests: `route.test.ts` extendido (entregaResumen null si no ENTREGADO; poblado si ENTREGADO; read-only guardrail), `peek-entrega.test.tsx` (null → nada; coords → link maps en nueva pestaña; foto → link; sin coords → sin link).

**Criterio:** un pedido ENTREGADO con GPS/foto muestra el bloque en el peek con links que abren en pestaña nueva; sin datos o no entregado → no aparece. `GET /api/pedidos/[id]` no muta nada.

### F7-iii — realtime + verificación E2E
**Archivos:**
- Modificar `src/app/(app)/pedidos/pedido-hub/index.tsx` — si existe un evento realtime de `caso.*` / `alerta.*` (verificar en `src/lib/realtime.ts`), agregarlo a `useRealtimeListener` para invalidar el peek activo. Si **no** existe, documentar el límite en un comentario (no se inventa el evento — P6).
- E2E `e2e/pedidos-peek-riesgo.spec.ts` (gated `NEXT_PUBLIC_PEDIDOS_V2`):
  - crear pedido + `POST /api/casos` (o el helper que exista) con un `alertaTipo` → abrir el peek → el bloque de riesgo muestra el nombre de la alerta + su guía; `<details>` expande la explicación; "Ver en Casos →" navega a `/casos` (la lista NO pierde el contexto → volver atrás mantiene los filtros).
  - pedido ENTREGADO con coords → el peek muestra "Ver ubicación" con `href` a maps.
- Tests unit del mapeo severidad → tono (3).

**Criterio (blueprint §5.3/§6.2):** `grep` — `PedidoPeekRiesgo` importa de `alertas-config`, no define reglas; una operación normal no muestra señales; el peek nunca abre el editor de `Caso` (sólo navega a `/casos`); la lista conserva su contexto al volver.

---

## 4. Criterios de éxito (globales)

Desde el peek de una operación, el usuario puede:
1. ver si hay una **excepción real** y entender **qué se detectó, por qué importa y qué puede hacer** — con el texto oficial de la regla, sin acusaciones;
2. distinguir el **saldo de la operación** de la **deuda del cliente** (ya cumplido);
3. acceder a Embarque, Entrega, Factura, Cartera, pedidos vinculados y N2 **sin salir de la lista y sin que los dominios se fusionen**;
4. abrir la ubicación/foto de la entrega cuando existan.

Y el peek **nunca**: calcula riesgo en el cliente, redefine una regla, juzga ("fraude"), ni embebe la resolución de un `Caso`.

## 5. Fuera de alcance (no reabrir)

- `alertas-detector.ts`, el cron de detección, `/reportes/salud-antifraude`.
- El editor de resolución de `Caso` (`CasoGuiaModal`) — vive en `/casos`.
- Umbrales monetarios / política de doble control (blueprint §8.2 PENDIENTE).
- Recurrentes (Fase 8).
- `entregadoPor` en el schema (no existe; no se agrega en esta fase).
- Consolidación de `/repartidor` en el Hub (§8.3 PENDIENTE).
