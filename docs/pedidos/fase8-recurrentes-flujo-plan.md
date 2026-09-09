# Fase 8 — Recurrentes integrado en el Pedido Hub

> **For agentic workers:** slices F8-0 → F8-i → F8-ii → F8-iii → F8-iv. TDD, commits frecuentes. Detrás de `NEXT_PUBLIC_PEDIDOS_V2` (OFF). **Base:** `feat/pedidos-fase7-peek-riesgo` (PR #233). Rebasar sobre `main` cuando #233 mergee.

> **Revisión del equipo (2026-09-08) — INCORPORADA.** Q1/Q2/Q3/Q5 resueltas (§1). Q4 = **BRECHA PLAN↔CÓDIGO** de contexto cliente/negocio (§1bis) — debe cerrarse **antes** de F8-0. Además el equipo incorporó **AHORA** un requisito transversal del Hub: **resolución + suficiencia de la información de entrega** → spec dedicada `docs/pedidos/entrega-suficiencia-plan.md`, **prerrequisito de F8-0** (F8-ii/F8-iv preparan pedidos DOMICILIO → dependen de esa autoridad).

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

## 1. Q1–Q5 — RESUELTAS por el equipo (2026-09-08)

| # | Decisión |
|---|---|
| **Q1 — Roles** | **ADMIN + ASISTENTE** son los roles operativos del Hub para recurrencia: marcar "esto se repite", ajustar, pausar/reactivar, preparar y ejecutar la generación. **CONTADOR NO entra al Hub** solo por conservar la autorización histórica. → F8-0 **extiende** `POST/PUT /api/recurrentes` y `POST /api/pedidos/recurrentes` a `ASISTENTE` (además de ADMIN; CONTADOR se mantiene por compat con `/recurrentes` legacy hasta Fase 10). El backend sigue siendo la autoridad — ocultar en frontend no basta. `DELETE` sigue siendo operación administrativa distinta; **"pausar" ≠ borrado físico** (`activo=false`, nunca `delete`). |
| **Q2 — Retiro `nuevo-client`/`editar-client`** | **F8: retirar de navegación y del flujo principal. Fase 10: eliminación definitiva** tras verificar (a) ninguna ruta nueva depende de ellos, (b) ningún deep-link crítico los necesita, (c) sin imports activos desde el Hub, (d) el flujo nuevo cubre **creación y edición** de recurrencias. No eliminar anticipadamente. |
| **Q3 — "Generar recurrentes de hoy"** | **CTA contextual**, no foco permanente. Aparece cuando hay algo accionable. El sistema **prepara**: recurrencias pendientes · cliente/negocio · productos · cantidades · fecha · pedidos pendientes · deuda/crédito · decisiones disponibles · advertencias. Luego el usuario decide. **No** generación silenciosa. |
| **Q4 — Cliente vs Negocio** | **BRECHA PLAN↔CÓDIGO** — ver §1bis. Debe cerrarse antes de F8-0. |
| **Q5 — "Esto se repite"** | **Acción posterior al commit del Pedido**, transacción **separada**. Flujo: crear Pedido → commit OK → propuesta "¿Guardar como habitual?" → usuario decide → configura frecuencia → confirma → crea/ajusta recurrencia. **Nunca el mismo botón que "Crear Pedido".** Si el Pedido se crea y guardar la recurrencia falla: **no** revertir el Pedido, **no** crear otro, informar el fallo, permitir reintentar. Si ya existe recurrencia (409): **NO** convertir automáticamente en `PUT` — el usuario decide explícitamente si quiere revisar/ajustar la existente. |

---

## 1bis. Q4 — BRECHA PLAN↔CÓDIGO: contexto Cliente vs Negocio

**Hallazgo.** `previewGeneracionRecurrentes()` y `generarPedidosRecurrentes()` **ya** contemplan plantillas por `negocioId` y resuelven el cliente efectivo vía el negocio (`include: { negocio: { include: { cliente: true } } }`). Pero el **contrato de creación** (`POST /api/recurrentes` `RecurrenteCreateSchema`) trabaja **solo con `clienteId`**. Dos semánticas distintas → **no se implementa Fase 8 así**.

**Regla formal única (aplica a POST · GET · peek · "esto se repite" · generación · unicidad · resolución de datos · tests):**

> La recurrencia pertenece a **un** contexto comercial concreto:
> - **si el Pedido tiene `negocioId` → el contexto es el Negocio** (`PlantillaRecurrente.negocioId`);
> - **si no → el contexto es el Cliente** (`PlantillaRecurrente.clienteId`).
>
> Determinista, sin fallback silencioso cliente ↔ negocio. La unicidad (`@unique negocioId` / `@unique clienteId`) se evalúa sobre el contexto resuelto. La resolución de datos de entrega usa la misma regla (`pickCoords`/`pickDireccionTexto`: negocio gana si tiene, si no cliente).

**Trabajo F8-0 para cerrarla:**
- `RecurrenteCreateSchema` → aceptar `{ clienteId }` **o** `{ negocioId }` (exactamente uno; `.refine`). El route resuelve el contexto y valida unicidad sobre él.
- `GET /api/recurrentes?clienteId` → **también** `?negocioId`; o mejor `?contexto=cliente:ID|negocio:ID`.
- `PedidoPeekExtras.recurrencia` → se resuelve por el contexto del pedido (negocio si `pedido.negocioId`, si no cliente).
- Documentar la regla en `schema.prisma` (comentario del modelo) y en un test que la fije (`recurrente-contexto.test.ts`).
- **No** tocar `previewGeneracionRecurrentes`/`generarPedidosRecurrentes` (ya la implementan bien) — solo alinear el contrato de creación/lectura.

---

## 1ter. Requisito transversal — Información de entrega (incorporado AHORA)

El equipo incorporó formalmente al rediseño del Hub la **resolución + suficiencia de la información de entrega**: para un Pedido DOMICILIO el sistema exige información **suficiente** para identificar y ejecutar la entrega, **no** un set fijo de campos (`dirección *` + `barrio *` dejan de ser requisitos universales independientes).

**Spec dedicada: `docs/pedidos/entrega-suficiencia-plan.md`** — definición formal de "ubicación suficiente" (Vía A geo / Vía B textual), 3 estados (SUFICIENTE / SUFICIENTE+COMPLEMENTARIA FALTANTE / INSUFICIENTE), UI adaptativa, **única autoridad de dominio para Preview y Commit**, 22 criterios de aceptación.

**Relación con Fase 8:** es **prerrequisito de F8-0**. F8-ii ("esto se repite") y F8-iv ("generar recurrentes") preparan pedidos DOMICILIO y deben consumir esa autoridad — no re-resolver la dirección por su cuenta. §15 de la revisión: al preparar un pedido recurrente se **re-resuelve** la info actual de Cliente/Negocio (la plantilla no es autoridad absoluta de la dirección).

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

### F8-0 — contrato cliente/negocio + roles + nav + peek read-only ✅ IMPLEMENTADO
**Prerrequisito:** `entrega-suficiencia-plan.md` F-ENTREGA-0 (autoridad de dominio) mergeado o en el mismo tren.
**Archivos:**
- `src/lib/validators.ts` (`RecurrenteCreateSchema`) — aceptar `clienteId` **XOR** `negocioId` (`.refine` exactamente uno). `RecurrenteUpdateSchema` sin cambios (opera por `id`).
- `src/app/api/recurrentes/route.ts` — `POST` resuelve el **contexto** (§1bis regla) y valida unicidad sobre él. `GET` acepta `?clienteId` **o** `?negocioId`. `POST` + `PUT` + `POST /api/pedidos/recurrentes` → `requireRole` extendido a **`ASISTENTE`** (Q1). `DELETE` sin cambios (administrativo).
- `src/app/(app)/nav-data.tsx` — quitar `subItems` de Pedidos; `/pedidos` item simple; `/recurrentes` fuera del nav.
- `src/modules/pedidos/application/dto/index.ts` — `PedidoPeekExtras += recurrencia` (resuelto por el **contexto** del pedido — negocio si `negocioId`, si no cliente).
- `src/app/api/pedidos/[id]/route.ts` — resolver `recurrencia` read-only.
- `prisma/schema.prisma` — comentario en `PlantillaRecurrente` fijando la regla de contexto.
- Tests: `recurrente-contexto.test.ts` (XOR cliente/negocio, unicidad sobre el contexto resuelto, sin fallback silencioso), `recurrentes-role.test.ts` (ASISTENTE puede POST/PUT/generar, no DELETE), `route-peek.test.ts` (shape `recurrencia` + read-only), `nav-data.test` (sin subItems de pedidos).

**Criterio:** una sola semántica cliente/negocio en creación, lectura, peek y generación. ASISTENTE opera recurrencia desde el backend. "pausar" nunca borra.

### F8-i — indicador + faceta en el Hub
**Archivos:**
- `peek-relaciones.tsx` / un `PeekRecurrencia` — "Pedido habitual: {resumen} · cada {N} días · [Ajustar]" cuando `data.recurrencia`. Si `!activo` → "Habitual pausado".
- Hub: faceta/filtro "con recurrencia" (query param) — `pedidos-client` + la query de la lista.
- Tests: `peek-recurrencia.test.tsx`, filtro.

### F8-ii — "esto se repite" en el workspace (reemplaza `/recurrentes/nuevo`)
**Archivos:**
- `PedidosWorkspace` / `pedidos-client` — **tras** un commit exitoso (transacción separada, Q5) de un pedido con contexto real (cliente o negocio) y ≥3 productos: propuesta "¿Guardar como pedido habitual de {contexto}?" → mini-form (`cada N días`, default 7; canal heredado) → confirmar → `POST /api/recurrentes` con el **contexto resuelto** (§1bis).
- **Fallo de la recurrencia ≠ fallo del pedido** (Q5): el pedido ya está creado; si el `POST /api/recurrentes` falla → toast de error + "Reintentar", **nunca** revertir/recrear el pedido.
- **409 (ya existe)**: NO auto-`PUT`. Mostrar "Este {contexto} ya tiene un pedido habitual" + acción explícita "Revisar el habitual" (lleva al peek/ajuste). El usuario decide.
- Gate por rol (ADMIN/ASISTENTE) y `NEXT_PUBLIC_PEDIDOS_V2`. Nunca la palabra "plantilla".
- Tests: unit (propuesta aparece solo post-commit con contexto real + ≥3 prod; no crea sin confirmar; fallo recurrente no toca el pedido; 409 → acción explícita, no PUT automático).

### F8-iii — "Ajustar" desde el peek (reemplaza `/recurrentes/[id]/editar`)
**Archivos:**
- `PeekRecurrencia` "[Ajustar]" → abre el workspace en `modo: 'recurrencia'` (o un mini-editor dedicado si el workspace no encaja): frecuencia + productos + activo/pausar. Commit → `PUT /api/recurrentes`.
- Decidir en la implementación si reusa `PedidosWorkspace` (blueprint lo pide) o un panel más chico — la recurrencia no tiene pagos/entrega, así que puede que un subconjunto del workspace sea más limpio. **Anotar la decisión.**
- Tests: unit del editor (PUT con el diff; pausar; reactivar).

### F8-iv — acción "Generar recurrentes de hoy" en el Hub (reemplaza el botón de `/recurrentes`)
**Archivos:**
- Un `RecurrentesDelDia` — CTA contextual en el Hub cuando `GET /api/pedidos/recurrentes` devuelve items con `proximaFecha <= hoy`. Flujo: preview → por plantilla una decisión (`NORMAL` / `SALTAR` / ver sugerencias `CON_PENDIENTES`/`SOLO_PENDIENTES`/`APLICAR_CREDITO`) → `POST /api/pedidos/recurrentes` con `offlineId`. Dedup `recurrenteBatchId` sin cambios.
- Reusa la lógica de `recurrentes-client` (decisiones + toast) pero en el contexto del Hub, sin la lista de plantillas.
- **El sistema prepara todo** (Q3): recurrencias pendientes · contexto cliente/negocio · productos · cantidades · fecha · pedidos pendientes · deuda/crédito · decisiones disponibles · advertencias. Al preparar cada pedido recurrente se **re-resuelve** la info actual de entrega (§15 revisión — la plantilla no es autoridad de la dirección) vía la autoridad de `entrega-suficiencia-plan.md`.
- Tests: unit del flujo (preview → decisiones → POST; SALTAR excluye; offline encola; re-resolución de entrega).
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
- Recurrencia por-item o multi-plantilla por cliente/negocio.
- Borrado de las rutas `/recurrentes/*` (Fase 10).
- Umbrales / política de autorización monetaria (§8.2 PENDIENTE).
- **Venta Libre** (§18 revisión): Fase 8 NO introduce Venta Libre. No se genera VL desde una recurrencia, ni desde el Pedido Hub, ni desde una discrepancia de inventario. La decisión vigente (captura en ruta / conciliación del Embarque) permanece — ver `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md`.
- Políticas cuantitativas de geolocalización (precisión mínima, cobertura formal, antigüedad de coords) — PENDIENTE de negocio, ver `entrega-suficiencia-plan.md`.

## 6. Clasificación (revisión del equipo §19)

- **HECHO:** `Cliente` tiene dirección/barrio/`linkUbicacion`/lat-lng/`geocodeOrigen`; `Pedido` tiene snapshot dirección/barrio; la generación de recurrentes ya contempla contexto de negocio.
- **ESTADO TÉCNICO ACTUAL:** el contrato de creación de recurrencias no expresa el contexto cliente/negocio (§1bis); el flujo de Pedido requiere la revisión de condiciones de entrega (`entrega-suficiencia-plan.md`).
- **DECISIÓN:** ADMIN+ASISTENTE roles del Hub · "Generar de hoy" contextual · "esto se repite" con confirmación post-commit · cliente y negocio son contextos distintos · Venta Libre fuera del Hub · info de entrega por suficiencia no por obligatoriedad universal.
- **PENDIENTE:** solo políticas cuantitativas de geo (si el negocio las define después).
