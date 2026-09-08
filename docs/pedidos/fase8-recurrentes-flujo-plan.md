# Fase 8 — Recurrentes integrado en el Pedido Hub

> **For agentic workers:** slices F8-0 → F8-i → F8-ii → F8-iii → F8-iv. TDD, commits frecuentes. Detrás de `NEXT_PUBLIC_PEDIDOS_V2` (OFF). **Base:** `feat/pedidos-fase7-peek-riesgo` (PR #233). Rebasar sobre `main` cuando #233 mergee.

**Goal:** que "recurrente" deje de ser una **categoría de UI** que el usuario debe entender. El usuario piensa en dos cosas: *"repetir lo de siempre"* (ya resuelto por la intención "Repetir" en el workspace) y *"esto se repite"* (una propiedad de una operación, no un objeto aparte). La `PlantillaRecurrente` sigue en el dominio; nunca aparece esa palabra en la interfaz.

**Blueprint:** §6.1 (Recurrentes — "Repetir es intención; la plantilla desaparece como categoría de UI"). **Gate:** G2 (sin tabs / sin sub-secciones que el usuario deba comprender).

**Resuelve la deuda #3 del `00-plan`:** `recurrentes/nuevo/nuevo-client` (734 líneas) + `recurrentes/[id]/editar-client` (489 líneas) duplican la captura — se reemplazan reusando `PedidosWorkspace`.

---

## 0. Contexto técnico (investigación, 2026-09-08)

### Dominio — **se mantiene, no se toca la lógica**

| Pieza | Estado | Detalle |
|---|---|---|
| `PlantillaRecurrente` | modelo | `@unique clienteId`, `@unique negocioId` (**una plantilla por cliente/negocio**). `cadaNDias`, `canal`, `tipo`, `horaPreferida`, `saltos[]`, `pausaHasta`, `activo`, `productos: PlantillaProducto[]`, `ultimaGeneracion`, `proxGeneracion`. |
| `GET /api/recurrentes` | ACTIVO | Lista **todas** las plantillas. No acepta `?clienteId`. `requireRole` = view (los 4 roles con `view:recurrentes`). |
| `POST /api/recurrentes` | ACTIVO | `{ clienteId, canal, cadaNDias, productos:{pacaAgua,...}, notas }`. **`requireRole([ADMIN, CONTADOR])`**. Refine: **mín. 3 productos sumados**. 409 si ya existe plantilla para ese cliente (`@unique`). |
| `PUT /api/recurrentes` | ACTIVO | `{ id, cadaNDias?, canal?, productos?, saltos?, notas?, activo? }`. `requireRole([ADMIN, CONTADOR])`. |
| `DELETE /api/recurrentes` | ACTIVO (verificar) | soft-delete (`activo=false`). |
| `GET /api/pedidos/recurrentes` | ACTIVO | Preview: `previewGeneracionRecurrentes()` → `PreviewRecurrente[]` (`{ recurrenteId, clienteNombre, cadaNDias, proximaFecha, clienteBloqueado, esDomingo, pedidosPendientes/ConDeuda/Pagados, cantidadBase, sugerencias[] }`). |
| `POST /api/pedidos/recurrentes` | ACTIVO | `{ decisiones: [{ recurrenteId, decision: 'NORMAL'\|'CON_PENDIENTES'\|'SOLO_PENDIENTES'\|'APLICAR_CREDITO'\|'SALTAR' }], offlineId }`. **`requireRole([ADMIN, CONTADOR])`**. Dedup por `recurrenteBatchId`. |
| `GET /api/cron/generar-recurrentes` | ACTIVO | El cron automático — **no se toca**. |

### UI actual — a delistar / reemplazar

| Ruta | Qué es | Fase 8 |
|---|---|---|
| Nav `Pedidos > [Únicos, Recurrentes]` (`nav-data.tsx:71-74`) | sub-items | **eliminar** — `/pedidos` es el único destino (G2) |
| `/recurrentes` (`recurrentes-client`) | lista de plantillas + botón "Generar" con preview→decisiones | la **generación** se mueve al Hub (F8-iv); la lista deja de ser un destino de nav |
| `/recurrentes/nuevo` (`nuevo-client`, 734 L) | alta de plantilla (form propio, duplica captura) | **reemplazar** por "esto se repite" en el workspace (F8-ii) |
| `/recurrentes/[id]` (detalle) + `/recurrentes/[id]/editar` (`editar-client`, 489 L) | edición de plantilla | **reemplazar** por "Ajustar" desde el peek (F8-iii) |

### Lo que NO se hace / NO se inventa

- No se toca `previewGeneracionRecurrentes` / `generarPedidosRecurrentes` / el cron / el dedup `recurrenteBatchId`.
- No se crea un modelo nuevo. `PlantillaRecurrente` (`@unique` por cliente/negocio) sigue siendo la única representación.
- No se cambia la semántica de `DecisionGeneracion` (los 5 valores existentes).
- No se inventa un flujo de recurrencia por-item o multi-plantilla-por-cliente.
- **No se borran las rutas `/recurrentes/*` en esta fase** — quedan alcanzables por deep-link (compat) y se retiran en Fase 10 con el resto del legacy. Fase 8 solo las **saca del nav** y construye los caminos nuevos.

---

## 1. Preguntas abiertas para el equipo (decidir antes de F8-0)

| # | Pregunta | Opciones |
|---|---|---|
| **Q1** | **Rol.** `POST/PUT /api/recurrentes` y `POST /api/pedidos/recurrentes` son `[ADMIN, CONTADOR]`. El workspace/Hub es `[ADMIN, ASISTENTE]`. Un ASISTENTE no puede marcar "esto se repite" ni generar. | (a) extender los endpoints a `ASISTENTE`; (b) gatear "esto se repite" y "Generar" a ADMIN (ASISTENTE ve el estado, no lo cambia); (c) `CONTADOR` también entra al Hub para esto. |
| **Q2** | **Alcance del retiro.** ¿F8 borra `nuevo-client`/`editar-client` (deuda #3) o solo los delista y el borrado va a Fase 10? | Plan actual: **delistar en F8, borrar en Fase 10** (menos superficie por PR, rollback simple). |
| **Q3** | **"Generar recurrentes de hoy" — ¿foco o CTA?** ¿Es un 6º foco en el `foco-strip` o una acción contextual que aparece solo cuando hay pendientes de hoy? | Plan actual: **CTA contextual** (banner/acción en el Hub), no un foco permanente — coherente con "el color solo si hay algo que hacer hoy". |
| **Q4** | **`PlantillaRecurrente` por `negocioId`.** El modelo soporta plantilla por negocio (no solo cliente). ¿"esto se repite" desde un pedido con `negocioId` crea la plantilla sobre el negocio o el cliente? | Seguir la regla que ya usa `previewGeneracionRecurrentes` (negocio si hay `negocioId`, si no cliente) — **no** inventar. |
| **Q5** | **Confirmación de "esto se repite".** El blueprint dice "prepara la configuración y **requiere confirmación** (no crea silenciosamente)". ¿La confirmación es un paso aparte tras crear el pedido, o parte del commit del pedido? | Plan actual: **paso aparte, post-commit** — "Pedido creado. ¿Guardar como habitual?" → mini-form (frecuencia) → confirmar. Nunca en el mismo botón que "Crear pedido". |

---

## 2. Contrato de datos

### `GET /api/recurrentes` — extender con `?clienteId` (F8-0)

Opción A (elegida): agregar filtro opcional `?clienteId=X` → devuelve `[]` o `[plantilla]` (0-1 por el `@unique`). Evita traer toda la lista para el indicador del peek.
Alternativa B: el Hub trae la lista completa una vez y la indexa por `clienteId` (la lista es chica). **Decisión pendiente — Q de implementación, no de negocio.**

### `PedidoPeekExtras` — extender con `recurrencia` (F8-0)

```ts
interface PedidoPeekExtras {
  // ...
  recurrencia: {
    id: string
    cadaNDias: number
    canal: 'PUNTO' | 'DOMICILIO'
    activo: boolean
    productos: Array<{ producto: string; cantidad: number }>
    proximaFecha: string | null
  } | null   // null si el cliente/negocio del pedido no tiene plantilla
}
```
Read-only. Se resuelve por `clienteId`/`negocioId` del pedido (misma regla que el preview).

### Sin endpoints nuevos de mutación

"esto se repite" usa `POST /api/recurrentes` (o `PUT` si ya existe). "Ajustar" usa `PUT /api/recurrentes`. "Generar" usa `GET`+`POST /api/pedidos/recurrentes`. **Cero endpoints nuevos de escritura** (sujeto a Q1).

---

## 3. Slices

### F8-0 — backend read-only + nav
**Archivos:**
- `src/app/(app)/nav-data.tsx` — quitar `subItems` de Pedidos; `/pedidos` queda como item simple. `/recurrentes` deja de estar en el nav.
- `src/app/api/recurrentes/route.ts` — `GET` acepta `?clienteId` opcional (filtro).
- `src/modules/pedidos/application/dto/index.ts` — `PedidoPeekExtras += recurrencia`.
- `src/app/api/pedidos/[id]/route.ts` — resolver `recurrencia` (read-only, por cliente/negocio).
- Tests: `route-peek.test.ts` (shape + read-only), `nav-data` (sin subItems de pedidos).

### F8-i — indicador + faceta en el Hub
**Archivos:**
- `peek-relaciones.tsx` / un `PeekRecurrencia` — "Pedido habitual: {resumen} · cada {N} días · [Ajustar]" cuando `data.recurrencia`. Si `!activo` → "Habitual pausado".
- Hub: faceta/filtro "con recurrencia" (query param) — `pedidos-client` + la query de la lista.
- Tests: `peek-recurrencia.test.tsx`, filtro.

### F8-ii — "esto se repite" en el workspace (reemplaza `/recurrentes/nuevo`)
**Archivos:**
- `PedidosWorkspace` / `pedidos-client` — tras un commit exitoso de un pedido con cliente real y ≥3 productos: prompt "¿Guardar como pedido habitual de {cliente}?" → mini-form (`cada N días`, default 7; canal heredado) → confirmar → `POST /api/recurrentes` (o `PUT` si 409). Toast "Guardado como habitual". Nunca la palabra "plantilla".
- Gate por Q1 (rol) y por `NEXT_PUBLIC_PEDIDOS_V2`.
- Tests: unit del prompt (aparece solo con cliente real + ≥3 prod; no crea sin confirmar; 409 → ofrece ajustar).

### F8-iii — "Ajustar" desde el peek (reemplaza `/recurrentes/[id]/editar`)
**Archivos:**
- `PeekRecurrencia` "[Ajustar]" → abre el workspace en `modo: 'recurrencia'` (o un mini-editor dedicado si el workspace no encaja): frecuencia + productos + activo/pausar. Commit → `PUT /api/recurrentes`.
- Decidir en la implementación si reusa `PedidosWorkspace` (blueprint lo pide) o un panel más chico — la recurrencia no tiene pagos/entrega, así que puede que un subconjunto del workspace sea más limpio. **Anotar la decisión.**
- Tests: unit del editor (PUT con el diff; pausar; reactivar).

### F8-iv — acción "Generar recurrentes de hoy" en el Hub (reemplaza el botón de `/recurrentes`)
**Archivos:**
- Un `RecurrentesDelDia` — CTA contextual en el Hub cuando `GET /api/pedidos/recurrentes` devuelve items con `proximaFecha <= hoy`. Flujo: preview → por plantilla una decisión (`NORMAL` / `SALTAR` / ver sugerencias `CON_PENDIENTES`/`SOLO_PENDIENTES`/`APLICAR_CREDITO`) → `POST /api/pedidos/recurrentes` con `offlineId`. Dedup `recurrenteBatchId` sin cambios.
- Reusa la lógica de `recurrentes-client` (decisiones + toast) pero en el contexto del Hub, sin la lista de plantillas.
- Tests: unit del flujo (preview → decisiones → POST; SALTAR excluye; offline encola).
- E2E `e2e/pedidos-recurrentes.spec.ts` (gated): marcar habitual → aparece en el peek → generar del día → pedido creado con `recurrenteBatchId`.

---

## 4. Criterios de éxito

1. El nav no tiene "Únicos/Recurrentes" — `/pedidos` es el único destino (G2).
2. "Repetir lo de siempre" = la intención "Repetir" del workspace (ya existe).
3. "Esto se repite" = una propiedad que se **confirma** tras crear el pedido; el usuario nunca ve "plantilla".
4. La recurrencia de un cliente se ve y se ajusta desde el peek, sin ir a otra pantalla.
5. Generar los pedidos del día es una acción del Hub cuando hay pendientes, con la misma decisión por plantilla y el mismo dedup.
6. `nuevo-client` / `editar-client` quedan sin entrada de nav (borrado en Fase 10).

## 5. Fuera de alcance (no reabrir)

- `previewGeneracionRecurrentes` / `generarPedidosRecurrentes` / el cron / `recurrenteBatchId`.
- Los 5 valores de `DecisionGeneracion`.
- Recurrencia por-item o multi-plantilla por cliente.
- Borrado de las rutas `/recurrentes/*` (Fase 10).
- Umbrales / política de autorización (§8.2 PENDIENTE).
