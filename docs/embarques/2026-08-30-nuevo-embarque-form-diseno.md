# Diseño — Rediseño del formulario "Nuevo Embarque"

- **Estado:** BORRADOR para revisión del equipo técnico + PO
- **Fecha:** 2026-08-30
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
3. **Campos que el humano no debería tener que pensar** en un embarque exprés: tipo de moto (texto libre), ruta (para un embarque fuera del plan casi nunca aplica), hora de salida (es "ahora"), base de dinero (casi siempre el mismo monto).
4. **Densidad**: 8 grupos de campos + 3 paneles informativos en un modal con scroll. En móvil es una tira larga.
5. **El form mezcla `create` y `edit`** en un componente de 495 líneas con `useState` disperso y `useEffect` de sincronización frágil (patrón que ya dio bugs en otros forms — ver AGENTS.md #22/#23).
6. **No hay proyección de capacidad contra los pedidos elegidos** — la barra de capacidad reacciona a la carga tecleada, no a "lo que estos 3 pedidos necesitan".

## 4. Objetivo del rediseño

- **Pedidos primero.** El humano elige pedidos; la carga se **deriva** de esos pedidos (editable, pero pre-llenada correctamente).
- **Menos decisiones.** Todo lo que se pueda defaultear con un valor sensato, se defaultea. El humano solo confirma o corrige.
- **Un camino, no dos pantallas.** Crear + asignar en un solo flujo.
- **Móvil de primera clase** — el asistente puede estar en el depósito con el celular.
- **Separar `create` de `edit`** — este rediseño es solo `create`. `edit` se queda como está (o se extrae a su propio componente sin cambios de comportamiento).

## 5. Propuesta — flujo "pedidos-primero" en pasos

Un wizard corto de **2 pasos** (no 4), dentro del mismo `<Modal>` o como pantalla dedicada (ver §6).

### Paso 1 — Pedidos

- Lista de **pedidos pendientes de asignar** (los que no están en ningún embarque abierto). Reusa la query/consumidor que ya alimenta el modal "Asignar pedidos" actual.
- Cada fila: cliente/negocio, barrio, productos del pedido, indicador de fiado/pago.
- Selección múltiple con checkbox. Buscador por nombre.
- **Al seleccionar, en vivo:**
  - Se suma la **carga derivada** (Σ productos de los pedidos elegidos).
  - Se muestra la **proyección de capacidad** contra el repartidor por defecto (peso kg / capacidad kg / %), usando `getCapacidadInfo` (ya existe).
  - Aviso si excede las 70 unidades o el peso recomendado (misma lógica que hoy).
- CTA: **"Siguiente" (N pedidos · M unidades · P kg)**.

### Paso 2 — Confirmar

Campos, todos con default, en una sola vista corta:

| Campo | Default | Editable |
|---|---|---|
| **Repartidor** | El que tenga menos embarques abiertos hoy, o el último usado. Si hay 1 solo activo, ese. | Sí (select) |
| **Carga** | Derivada de los pedidos del Paso 1. | Sí — inputs numéricos pre-llenados, con "restaurar a lo que piden los pedidos" |
| **Hora de salida** | Ahora (`HH:MM` local Bogotá). | Sí (time) |
| **Base de dinero** | Último valor usado / valor de config si existe. | Sí (número) |
| **Ruta** | Ninguna (los embarques ad-hoc no suelen tener ruta del plan). | Sí (select, colapsado tras "Más opciones") |
| **Tipo de moto** | Vacío. | Sí (colapsado tras "Más opciones") |
| **Observaciones** | Vacío. | Sí (colapsado tras "Más opciones") |

- Panel de **stock disponible** + override de stock insuficiente: **igual que hoy** (misma lógica, mismo checkbox + motivo).
- CTA: **"Crear embarque y asignar {N} pedidos"**.

### Qué pasa al confirmar

```
1. POST /api/embarques { carga derivada/editada, trabajadorId, horaSalida, baseDinero, ... , offlineId: uuid }
2. con el id de la respuesta → PUT /api/embarques/[id] { pedidoIds }
3. toast "Embarque #N creado con {N} pedidos" → navegar a /embarques/[id]
```

Dos llamadas encadenadas del lado del cliente. **No requiere cambio de backend.**

### Estados de red (offline-first)

- **Online:** el flujo de arriba.
- **Offline:** `POST` se encola (`fetchResilient` → `requestQueue`). Como no hay id de servidor, el `PUT` de asignación **no puede encadenarse**. Opción propuesta: encolar el `POST` con los `pedidoIds` en el `metadata` del item de cola y **procesar la asignación en `syncWithServer()`** cuando el `POST` resuelva con un id real. Toast: *"Sin conexión — el embarque y sus {N} pedidos se crearán al recuperar la red."*
  - **Alternativa más simple (recomendada para v1):** offline solo encola el `POST` del embarque; los pedidos quedan **sin asignar** y se avisa al usuario que los asigne cuando vuelva la red. Menos código, cubre el 95% (el asistente en el depósito suele tener algo de señal). **← pregunta abierta §8.**

## 6. Alternativas consideradas

| Opción | Descripción | Trade-off |
|---|---|---|
| **A — Wizard de 2 pasos en modal** (recomendada) | Lo de §5, dentro del `<Modal>` actual. | Menor cambio de navegación, consistente con el resto de embarques (todo es modal). El modal se hace un poco alto en el Paso 1. |
| **B — Pantalla dedicada** `/embarques/nuevo` | Ruta propia, SSR de pedidos pendientes, wizard a pantalla completa. | Mejor en móvil, más espacio, deep-link (`?pedidos=id,id`). Pero rompe el patrón "todo modal" y agrega una ruta. Más trabajo. |
| **C — Un solo paso, pedidos arriba** | Sin wizard: la lista de pedidos arriba, los campos (con defaults) abajo, todo en una vista scrolleable. | Menos clicks, pero vuelve a la tira larga del form actual. Difícil en móvil. |
| **D — No rediseñar, solo derivar la carga** | Dejar el form como está pero agregar "traer carga de pedidos seleccionados". | Mínimo esfuerzo. No resuelve el problema de fondo (asignación en dos viajes, densidad). |

**Recomendación: A.** Wizard de 2 pasos en modal. Si el equipo prefiere B por el móvil, es aceptable pero cuesta más.

## 7. Diseño técnico

### Componentes (nuevos, bajo `embarques-client/nuevo-embarque/`)

| Archivo | Responsabilidad |
|---|---|
| `index.tsx` (`NuevoEmbarqueWizard`) | Orquesta los 2 pasos, mantiene el estado del wizard, hace las 2 llamadas al confirmar. Reemplaza el `mode='create'` de `EmbarqueFormModal`. |
| `paso-pedidos.tsx` | Lista + selección de pedidos pendientes, cálculo en vivo de carga derivada + capacidad. |
| `paso-confirmar.tsx` | Campos con default, panel de stock, override, CTA final. |
| `derivar-carga.ts` | Función pura: `pedidos[] → Record<producto, cantidad>`. Testeable aislada. |
| `defaults.ts` | Función pura: repartidor sugerido, base de dinero sugerida, hora actual. |

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
- **Optimización futura (requiere ADR):** aceptar `pedidoIds` en `EmbarqueCreateSchema` para hacerlo en una sola llamada atómica. Fuera de alcance de este rediseño.

### `EmbarqueFormModal` (el archivo de 495 líneas)

- Se parte: `mode='create'` → nuevo wizard. `mode='edit'` → se extrae a `editar-embarque-modal.tsx` **sin cambios de comportamiento** (mismo form, mismos campos), solo se saca del componente compartido.
- El prop `guided` desaparece (el wizard siempre navega al detalle tras crear).

### Integración con el Command Center

- El botón "Nuevo Embarque" del `embarques-client/index.tsx` abre el wizard en vez del modal viejo.
- Las CTA de tarjetas en fase BORRADOR/PREPARANDO que hoy llevan a "registrar carga" se revisan (¿siguen teniendo sentido si el wizard ya crea con carga?).

## 8. Preguntas abiertas para el equipo / PO

1. **¿Opción A (modal) u B (pantalla dedicada)?** A es menos trabajo y consistente; B es mejor en móvil.
2. **Offline con pedidos:** ¿encolar create+assign encadenados (más código), o v1 encola solo el create y los pedidos se asignan al volver la red (más simple)?
3. **Repartidor por defecto:** ¿"el que tiene menos embarques hoy", "el último usado", o **sin default** (siempre elegir)? Depende de cuántos repartidores activos hay en la práctica.
4. **Base de dinero por defecto:** ¿existe un monto estándar de config, o el "último usado", o siempre $0? Hoy el form arranca en $0 y avisa.
5. **Ruta en un embarque ad-hoc:** ¿alguna vez tiene sentido, o se puede sacar del todo del flujo rápido (solo en "Más opciones")?
6. **¿La lista del Paso 1 muestra solo pedidos `DOMICILIO` sin asignar, o también otros canales?** ¿Filtra por fecha (hoy) o todos los pendientes?
7. **Límite de 70 unidades / capacidad:** ¿bloquea la creación (como hoy con `excedeUnidades`) o solo advierte?
8. **¿Se permite crear un embarque ad-hoc con 0 pedidos?** (repartidor sale "en blanco" y se le asignan cosas en ruta). Hoy el form no exige pedidos porque la asignación es aparte.

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
- Unit: `derivar-carga.test.ts`, `defaults.test.ts`, test del wizard (pasos, gating, 2 llamadas al confirmar).
- E2E `e2e/embarques.spec.ts` (o nuevo `embarques-nuevo.spec.ts`): flujo pedidos→confirmar→embarque creado con los pedidos asignados; caso offline; caso stock insuficiente + override.
- Con el flujo viejo desactivado, no queda `AutoGenerar*` ni `mode='create'` colgando en `EmbarqueFormModal`.

## 12. Estimación gruesa

| Bloque | Tamaño |
|---|---|
| Extraer `editar-embarque-modal.tsx` + `useStockDisponible()` | S |
| `derivar-carga.ts` + `defaults.ts` + tests | S |
| `paso-pedidos.tsx` (lista + selección + proyección) | M |
| `paso-confirmar.tsx` (campos + defaults + override) | M |
| `NuevoEmbarqueWizard` (orquestación + 2 llamadas + offline) | M |
| Wiring en `index.tsx` + E2E | S |

Total: ~1 unidad de trabajo mediana. Sin riesgo de backend.
