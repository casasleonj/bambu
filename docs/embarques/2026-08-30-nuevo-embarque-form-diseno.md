# Diseño — Rediseño del formulario "Nuevo Embarque"

- **Estado:** LISTO PARA PLAN — todas las decisiones del PO tomadas, verificaciones técnicas resueltas (2026-08-31)
- **Fecha:** 2026-08-30 (rev. 2026-08-31)
- **Autor:** sesión de rework de frontend de Embarques
- **Depende de:** PR #144 (`feat(rutas): Planificador de Distribución`) mergeado a `main`
- **NO toca:** backend congelado de Embarques (`src/modules/embarques/**`, 23 ADRs), ni el Planificador (`src/modules/planificador/**`)

---

## 1. Contexto

Tras el Planificador de Distribución (PR #144), la creación de embarques tiene **dos caminos con roles distintos**:

| Camino | Qué hace | Estado |
|---|---|---|
| **Planificar día** (`/rutas`) | Arma el plan del día completo: agrupa todos los pedidos pendientes por geografía, propone repartidor + secuencia, y al confirmar crea N embarques de una. Reemplazó al viejo "Auto-Generar". | ✅ Hecho (PR #144) |
| **Nuevo Embarque** (`embarque-form-modal.tsx`) | Crear **un** embarque suelto, de último momento, **fuera del plan**. Ejemplo real: *"Carlos sale ahora mismo con estos 3 pedidos que entraron tarde."* | ⚠️ Sin tocar — **este documento** |

ADR-PLANIFICADOR-003 §3 conserva explícitamente el camino manual. No se elimina; se rediseña.

## 2. Estado actual del formulario

`src/app/(app)/embarques/embarques-client/embarque-form-modal.tsx` — **495 líneas, un solo `<Modal>` con scroll**, sirve `create` y `edit`.

### Campos (en orden de aparición)

1. **Repartidor** (select, requerido) — al elegirlo, autocompleta la ruta si el repartidor tiene una asociada.
2. **Ruta** (select, opcional) — "Sin ruta" por defecto.
3. **Tipo de moto** (texto libre, opcional) — placeholder "Ej: Moto carro grande".
4. **Panel "Stock disponible hoy"** (informativo) + panel "Stock estimado activo" (si aplica).
5. **Carga del Motocarga** — 5 inputs numéricos (PACA_AGUA, PACA_HIELO, BOTELLON, BOLSA_AGUA, BOLSA_HIELO), con peso por línea y aviso si excede stock.
6. **Barra de capacidad** — peso total kg / capacidad kg / %, + avisos de "stock insuficiente" (con checkbox de override + motivo si el déficit > 10) y "máximo 70 unidades".
7. **Hora de salida** (time, requerido) + **Base dinero** (número, "cambio").
8. **Observaciones** (textarea, opcional).

### Flujo actual

```
Abrir modal → llenar 8 campos a mano → POST /api/embarques → (guided) navegar a
/embarques/[id]?step=asignar → abrir modal "Asignar pedidos" → buscar y tildar
los pedidos → PUT /api/embarques/[id] { pedidoIds }
```

### Contrato de backend (NO cambia)

- `POST /api/embarques` — `EmbarqueCreateSchema`: `trabajadorId` (req), `rutaId?`, `tipoMoto?`, `horaSalida` (req, "HH:MM"), `baseDinero` (default 0), `obs?` (≤500), `carga: [{producto, cargadas}]` (≥1), `overrideMotivo?`, `offlineId?`. **No acepta `pedidoIds`.**
- `PUT /api/embarques/[id]` — `EmbarqueUpdateSchema`: acepta `pedidoIds: string[]` (≤100) para asignar. Solo en estado `ABIERTO`.
- `DELETE /api/embarques/[id]/pedidos/[pedidoId]` — quita un pedido, idempotente.
- Todo vía `fetchResilient` + `offlineId` (ADR-OFFLINE-001 / offline-first).

## 3. El problema de UX

El caso de uso real es **"tengo estos pedidos, sáquenlos ya"** — el humano parte de los **pedidos**. El formulario actual va al revés:

1. **Pedís la carga del camión antes de saber qué pedidos llevás.** Los 5 inputs de carga se llenan a mano *antes* de seleccionar los pedidos. Después hay que asignar los pedidos en otra pantalla y rezar que la carga tecleada alcance.
2. **La asignación de pedidos es un segundo viaje** (otro modal, otra pantalla, otra llamada). Para 3 pedidos es fricción pura.
3. **Campos que estorban en un embarque exprés:** tipo de moto (texto libre), ruta (para un embarque fuera del plan casi nunca aplica), hora de salida (casi siempre "ahora"). La base de dinero **sí** hay que ingresarla siempre a conciencia (§5.4) — pero está enterrada entre campos que no importan.
4. **Densidad**: 8 grupos de campos + 3 paneles informativos en un modal con scroll. En móvil es una tira larga.
5. **El form mezcla `create` y `edit`** en un componente de 495 líneas con `useState` disperso y `useEffect` de sincronización frágil (patrón que ya dio bugs en otros forms — ver AGENTS.md #22/#23).
6. **No hay proyección de capacidad contra los pedidos elegidos** — la barra de capacidad reacciona a la carga tecleada, no a "lo que estos 3 pedidos necesitan".

## 4. Objetivo del rediseño

- **Pedidos primero.** El humano elige pedidos; la carga se **deriva** de esos pedidos (editable, pero pre-llenada correctamente).
- **Menos decisiones.** Lo que tiene un default seguro (hora, carga derivada) se pre-llena. Lo que es sensible al contexto y propenso a error (repartidor, base de dinero) se pide explícito, sin autocompletar.
- **Un camino, no dos pantallas.** Crear + asignar en un solo flujo.
- **Móvil de primera clase** — el asistente puede estar en el depósito con el celular.
- **Separar `create` de `edit`** — este rediseño es solo `create`. `edit` se queda como está (o se extrae a su propio componente sin cambios de comportamiento).

## 5. Propuesta — flujo "pedidos-primero" en pasos

Un wizard corto de **2 pasos** (no 4), dentro del `<Modal>` actual (opción A, confirmada por el PO).

### Paso 1 — Pedidos

- Lista de **pedidos pendientes cuya fecha de entrega corresponde a hoy o está vencida**
  (decisión del PO). Regla:
  - `estadoEntrega ∈ {PENDIENTE, NO_ENTREGADO}` **y** `embarqueId = null` (no está en otro embarque).
  - **y** (`fechaEntrega <= fin del día de hoy (Bogotá)` **o** `fechaEntrega = null`).
    Los pedidos "entregar en 8 días" NO aparecen; los de "hoy antes de las 4pm", "mañana"
    (si ya es mañana), y los vencidos, sí.
  - Toggle **"Ver pedidos futuros"** para incluir los de fecha posterior (caso: adelantar una entrega).
- Cada fila: cliente/negocio, barrio, productos del pedido, `horaPreferida` si tiene
  ("antes 4pm"), fecha de entrega, indicador de fiado/pago.
- Ordenados por urgencia: vencidos → hoy con hora → hoy sin hora → sin fecha.
- Selección múltiple con checkbox. Buscador por nombre.
- **Lista viva (evita doble asignación — ver §5.3):** la lista se refresca por realtime
  (`pedido.updated`, `embarque.updated`). Si otro asistente asigna un pedido mientras
  este wizard está abierto, ese pedido se marca como "ya asignado por otro" y se
  deselecciona con aviso.
- **Al seleccionar, en vivo:** se suma la **carga derivada** (Σ productos de los pedidos
  elegidos) y se muestra el total de unidades y peso. La **proyección de capacidad**
  (`getCapacidadInfo`) aparece recién en el Paso 2, cuando ya hay repartidor elegido.
- CTA: **"Siguiente" (N pedidos · M unidades · P kg)** — habilitada siempre (0 pedidos
  también avanza, ver §8.8).

### Paso 2 — Confirmar

Campos en una sola vista corta:

| Campo | Comportamiento | Editable |
|---|---|---|
| **Repartidor** | **Sin default — siempre se elige** (decisión del PO). Select vacío, requerido. | Sí (select, requerido) |
| **Carga** | Derivada de los pedidos del Paso 1. Botón "restaurar a lo que piden los pedidos". | Sí — inputs numéricos pre-llenados |
| **Hora de salida** | Default: ahora (`HH:MM` local Bogotá). | Sí (time) |
| **Base de dinero** | **Default $0, siempre ingreso manual** (decisión del PO — ver §5.4). NO se sugiere "último usado". | Sí (número) |
| **Ruta** | Ninguna. Colapsada tras "Más opciones". | Sí (select) |
| **Tipo de moto** | Vacío. Colapsado tras "Más opciones". | Sí |
| **Observaciones** | Vacío. Colapsado tras "Más opciones". | Sí |

- Panel de **stock disponible** + override de stock insuficiente: **igual que hoy**.
- **Capacidad excedida → solo advierte + sugiere** (decisión del PO — ver §5.5). Nunca bloquea.
- CTA: **"Crear embarque y asignar {N} pedidos"** (habilitada solo con repartidor elegido).

### 5.3 — Doble asignación de pedidos (riesgo señalado por el PO)

Dos asistentes (o el mismo en dos pestañas, o repartidores desde su vista) pueden tener
el wizard abierto a la vez y **elegir el mismo cliente/pedido**. Si ambos confirman, el
segundo `PUT` intentaría re-asignar un pedido ya asignado.

**Buena noticia: el backend YA resuelve esto.** `PUT /api/embarques/[id]` (líneas 327-342
de `route.ts`) asigna con `updateMany` filtrando `embarqueId: null` (solo lo libre) y, si
`count < pedidoIds.length`, **devuelve 409 con la lista de pedidos que ya estaban
asignados**. Nunca pisa. No hace falta cambio de backend.

Lo que falta es del lado del cliente:

1. **Lista viva por realtime** (arriba): reduce la ventana antes de confirmar.
2. **Manejar el 409 del `PUT` con gracia:** el embarque ya se creó (paso 1 del POST);
   ante 409 se muestra *"El embarque #N se creó. Estos pedidos ya estaban en otro
   embarque y no se asignaron: [nombres]. Revisá."* y se navega igual al detalle. No
   se cancela el embarque, no se reintenta a la fuerza.
3. **Offline (ver §5.6):** el `syncWithServer()` aplica la misma regla — el 409 del PUT
   en replay se traduce a un item de "conflictos para revisar", nunca doble-asignación.

### 5.4 — Base de dinero (riesgo señalado por el PO)

El manejo de la base es propenso a errores en la operación real:
- El primer embarque del día el repartidor **trae/entrega** una base; más tarde **vuelve
  a salir con otra base** distinta.
- A veces la base la ingresa el asistente, a veces el repartidor.
- Distintos embarques del día tienen bases distintas.

Por eso: **default $0, ingreso manual siempre, sin autocompletar con "último valor"**
(autocompletar acá induce el error de dejar la base del viaje anterior). Además:
- Aviso claro cuando la base queda en $0 al confirmar (como hoy: *"Base $0 — ¿seguro que
  no necesita cambio?"*), pero **no bloquea**.
- **Corrección desde el detalle:** verificado — `EmbarqueUpdateSchema` **sí** acepta
  `baseDinero` y `PUT /api/embarques/[id]` lo permite editar mientras el embarque está
  `ABIERTO` (en `EN_RUTA` solo se permiten `pedidoIds`). O sea: si el asistente se
  equivoca en la base, la corrige desde el modal "Editar" del detalle sin cancelar/rehacer.
  El modal de edición ya tiene el campo. **No hay trabajo extra acá** — solo asegurar que
  ese camino quede claro en la UI.

### 5.5 — Capacidad excedida: advertir + sugerir

Cuando la carga derivada + editada excede las 70 unidades o el peso recomendado del
repartidor elegido, **no se bloquea**. Se muestra un aviso con **la mejor sugerencia
concreta**, en este orden:

1. Si otro repartidor activo tiene capacidad para esta carga → *"La carga ({P} kg) excede
   la moto de {repartidor} ({cap} kg). {OtroRepartidor} tiene capacidad para {P} kg."*
2. Si no → *"Quitá ~{X} unidades para entrar en la capacidad de {repartidor}, o dividí en
   dos embarques."*
3. Si igual quiere seguir → puede; el backend ya valida el límite duro real y devuelve
   400 si de verdad no entra (ese sí es tope).

### Qué pasa al confirmar

```
1. POST /api/embarques { carga derivada/editada, trabajadorId, horaSalida, baseDinero, ... , offlineId: uuid }
2. con el id de la respuesta → PUT /api/embarques/[id] { pedidoIds }
   → si algún pedido ya fue asignado por otro → se avisa y se sigue con el resto (§5.3)
3. toast "Embarque #N creado con {N} pedidos" → navegar a /embarques/[id]
```

Dos llamadas encadenadas del lado del cliente. **No requiere cambio de backend.**

### 5.6 — Estados de red (offline-first)

- **Online:** el flujo de arriba.
- **Offline (decisión del PO — encolar todo, con revisión de conflictos):**
  - Se encola el `POST` del embarque **y** los `pedidoIds` juntos: el item de
    `requestQueue` lleva `body` del embarque + `metadata: { pedidoIds }`.
  - `syncWithServer()` procesa: (a) `POST` embarque → obtiene id real; (b) `PUT` los
    `pedidoIds`; (c) **por cada pedido que ya esté asignado a otro embarque, NO lo
    re-asigna** — lo agrega a una lista de conflictos que se le muestra al asistente
    al reconectar: *"El embarque #N se creó, pero estos pedidos ya estaban en otro
    embarque: [nombres]. Decidí qué hacer."*
  - Toast al encolar: *"Sin conexión — el embarque y sus {N} pedidos se registrarán al
    recuperar la red. Si otro repartidor tomó alguno, te avisamos."*
  - **Motivo (PO):** dos repartidores pueden estar entregando en paralelo y ambos ver
    el mismo cliente como pendiente; sin la revisión de conflicto, la sync silenciosa
    generaría doble entrega. La regla es: **crear siempre, asignar solo lo libre,
    reportar lo demás.**
  - Requiere extender el `syncWithServer()` de `src/lib/db/sync.ts` para el paso de
    asignación post-creación con detección de conflicto. Es la parte más delicada de
    la implementación.

## 6. Alternativas consideradas

| Opción | Descripción | Trade-off |
|---|---|---|
| **A — Wizard de 2 pasos en modal** ✅ elegida | Lo de §5, dentro del `<Modal>` actual. | Menor cambio de navegación, consistente con el resto de embarques (todo es modal). El modal se hace un poco alto en el Paso 1. |
| **B — Pantalla dedicada** `/embarques/nuevo` | Ruta propia, SSR de pedidos pendientes, wizard a pantalla completa. | Mejor en móvil, más espacio, deep-link (`?pedidos=id,id`). Pero rompe el patrón "todo modal" y agrega una ruta. Más trabajo. |
| **C — Un solo paso, pedidos arriba** | Sin wizard: la lista de pedidos arriba, los campos (con defaults) abajo, todo en una vista scrolleable. | Menos clicks, pero vuelve a la tira larga del form actual. Difícil en móvil. |
| **D — No rediseñar, solo derivar la carga** | Dejar el form como está pero agregar "traer carga de pedidos seleccionados". | Mínimo esfuerzo. No resuelve el problema de fondo (asignación en dos viajes, densidad). |

**Decisión del PO: A** — wizard de 2 pasos en modal.

## 7. Diseño técnico

### Componentes (nuevos, bajo `embarques-client/nuevo-embarque/`)

| Archivo | Responsabilidad |
|---|---|
| `index.tsx` (`NuevoEmbarqueWizard`) | Orquesta los 2 pasos, mantiene el estado del wizard, hace las 2 llamadas al confirmar. Reemplaza el `mode='create'` de `EmbarqueFormModal`. |
| `paso-pedidos.tsx` | Lista + selección de pedidos pendientes, cálculo en vivo de carga derivada + capacidad. |
| `paso-confirmar.tsx` | Campos con default, panel de stock, override, CTA final. |
| `derivar-carga.ts` | Función pura: `pedidos[] → Record<producto, cantidad>`. Testeable aislada. |
| `filtrar-pedidos-hoy.ts` | Función pura: filtro por `fechaEntrega` (hoy/vencido/null) + orden por urgencia. |
| `sugerir-capacidad.ts` | Función pura: dada la carga y los repartidores, devuelve el aviso + la mejor sugerencia (§5.5). |
| `defaults.ts` | Función pura: hora actual `HH:MM` Bogotá. (Repartidor y base **no** tienen default — decisión del PO.) |

### Estado

- Un solo objeto de estado del wizard (`useState` o `useReducer`), no `useState` disperso.
- **Sin `useEffect` de sincronización desde props** (anti-patrón AGENTS.md #22/#23). Los pedidos pendientes se pasan como prop del `EmbarquesClient` (ya los tiene para el modal de asignar) o se cargan una vez al abrir.
- `offlineId` estable por apertura del wizard (se regenera al cerrar/reabrir), como en `sustitucion-form-modal.tsx`.

### Reutilización (no reconstruir)

- `getCapacidadInfo`, `calcularPesoDesdeCarga`, `PESOS_KG` — `src/lib/embarque-capacidad.ts`.
- `useProductosDomicilio`, `getProductoEmoji` — hook existente.
- Lógica de stock disponible + override — extraer del form actual a un hook `useStockDisponible()` compartido (hoy está inline).
- Consumidor de pedidos pendientes — el mismo que usa el modal "Asignar pedidos".
- `fetchResilient` + toasts `success`/`info`/`error`.

### API

- **Sin cambios de backend.** 2 llamadas cliente: `POST /api/embarques` → `PUT /api/embarques/[id] { pedidoIds }`.
- `PUT` ya devuelve **409 con la lista de pedidos ya asignados** si hubo carrera (verificado
  en `route.ts:327-342`). El cliente lo traduce al aviso de §5.3 — sin ADR.
- Lista de pedidos del Paso 1: reusa `GET /api/pedidos?all=true` (como el modal de
  asignar) + filtro cliente por `fechaEntrega`. Si el volumen crece, considerar un
  query param `?entregarHasta=<fecha>` (additivo a la route, sin tocar dominio).
- **Optimización futura (requiere ADR):** aceptar `pedidoIds` en `EmbarqueCreateSchema`
  para crear+asignar en una llamada atómica. Fuera de alcance de este rediseño.

### Realtime

- El Paso 1 se suscribe a `pedido.updated` / `embarque.updated` (hook `use-realtime-listener`
  ya existe) para mantener la lista de pedidos libres al día y desmarcar los que otro
  asistente tomó (§5.3).

### `EmbarqueFormModal` (el archivo de 495 líneas)

- Se parte: `mode='create'` → nuevo wizard. `mode='edit'` → se extrae a `editar-embarque-modal.tsx` **sin cambios de comportamiento** (mismo form, mismos campos), solo se saca del componente compartido.
- El prop `guided` desaparece (el wizard siempre navega al detalle tras crear).

### Integración con el Command Center

- El botón "Nuevo Embarque" del `embarques-client/index.tsx` abre el wizard en vez del modal viejo.
- Las CTA de tarjetas en fase BORRADOR/PREPARANDO que hoy llevan a "registrar carga" se revisan (¿siguen teniendo sentido si el wizard ya crea con carga?).

## 8. Preguntas — respuestas del PO (2026-08-31)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Modal o pantalla dedicada? | **Modal** (opción A). |
| 2 | Offline con pedidos | **Encolar todo junto** (embarque + pedidos), pero al sincronizar **detectar conflicto de doble asignación y reportarlo** — nunca doble-asignar en silencio (§5.6). |
| 3 | Repartidor por defecto | **Sin default — siempre se elige.** |
| 4 | Base de dinero por defecto | **$0, ingreso manual siempre.** NO autocompletar con "último usado" (induce el error de dejar la base del viaje anterior). Es un punto propenso a errores en la operación — ver §5.4. |
| 5 | Ruta en ad-hoc | *(sin respuesta explícita)* → propuesta: colapsada tras "Más opciones", default ninguna. |
| 6 | Filtro de la lista del Paso 1 | **Todos los pendientes cuya fecha de entrega sea hoy o esté vencida** (más los sin fecha). Los "entregar en 8 días" NO aparecen. Toggle para ver futuros. `horaPreferida` se muestra como dato. Ver §5 Paso 1. |
| 7 | Capacidad excedida | **Solo advierte + sugiere la mejor opción** (otro repartidor / cuántas unidades quitar). Nunca bloquea (§5.5). |
| 8 | ¿Crear con 0 pedidos? | **Permitir, pero con confirmación.** Se puede confirmar con 0 pedidos; aparece *"Vas a crear un embarque sin pedidos asignados. ¿Seguro?"*. El "Siguiente" del Paso 1 no se bloquea por 0 selección. |

### Verificaciones técnicas — RESUELTAS

- **§5.3** — `PUT /api/embarques/[id]` **ya** rechaza doble asignación (updateMany
  `embarqueId: null` + 409 con la lista). Sin cambio de backend.
- **§5.4** — `baseDinero` **ya** es editable desde el detalle en estado `ABIERTO`
  (`EmbarqueUpdateSchema` + route lo permiten). Sin trabajo extra.

Todas las decisiones necesarias para implementar están tomadas.

## 9. Fuera de alcance

- Rediseño de "Auto-Generar" / Planificador — ya hecho (PR #144).
- Cambios de backend (schema, endpoints, `CrearEmbarqueUseCase`).
- El flujo de `edit` de embarque (se extrae tal cual, sin rediseñar).
- Mapa / selección geográfica de pedidos.
- Asignación de pedidos a embarques que ya existen (ese modal se queda).

## 10. Integración y orden

- **Prerequisito:** PR #144 en `main`. Este trabajo arranca desde ahí.
- **Archivo compartido:** `embarques-client/index.tsx` — PR #144 cambia el botón "Auto-Generar"→"Planificar día" (18 líneas, región del botón). Este rediseño cambia el botón "Nuevo Embarque" (región adyacente). Si #144 mergea primero, sin conflicto.
- **Sin dependencia con el Planificador en runtime** — son flujos independientes.

## 11. Criterios de éxito

- Crear un embarque ad-hoc con 3 pedidos: **≤ 2 pantallas, ≤ 6 taps**, la carga sale pre-llenada correcta.
- En móvil (375px) no hay scroll horizontal; los targets son ≥ 44px.
- `npx tsc --noEmit` limpio, `npx eslint` limpio.
- Unit: `derivar-carga.test.ts`, `filtrar-pedidos-hoy.test.ts`, `sugerir-capacidad.test.ts`,
  `defaults.test.ts`, test del wizard (navegación de pasos, gating del CTA por repartidor,
  confirmación de "0 pedidos", las 2 llamadas al confirmar, manejo del 409).
- E2E `e2e/embarques-nuevo.spec.ts` (nuevo): flujo pedidos→confirmar→embarque creado con
  los pedidos asignados; crear con 0 pedidos (confirmación); caso offline; stock
  insuficiente + override; capacidad excedida muestra sugerencia y deja seguir.
- Con el flujo viejo desactivado, no queda `AutoGenerar*` ni `mode='create'` colgando en `EmbarqueFormModal`.

## 12. Estimación gruesa

| Bloque | Tamaño |
|---|---|
| Extraer `editar-embarque-modal.tsx` + `useStockDisponible()` del form actual | S |
| Funciones puras: `derivar-carga` · `filtrar-pedidos-hoy` · `sugerir-capacidad` · `defaults` + tests | S |
| `paso-pedidos.tsx` (lista + filtro fecha + selección + realtime) | M |
| `paso-confirmar.tsx` (campos + panel stock + override + sugerencia capacidad) | M |
| `NuevoEmbarqueWizard` (orquestación + 2 llamadas + manejo 409) | M |
| Offline: extender `syncWithServer()` para create→assign con conflictos | M — la parte más delicada |
| Wiring en `index.tsx` + E2E | S |

Total: ~1 unidad de trabajo mediana-grande. Sin cambios de backend.
