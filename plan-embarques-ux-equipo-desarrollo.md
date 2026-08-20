# PLAN DE CONVERGENCIA — Reconstrucción de UX de Embarques
## Contrato de implementación para el equipo de desarrollo

**Estado:** PLAN DE IMPLEMENTACIÓN — listo para que el equipo ejecute Fase 1 en adelante
**Versión:** 1.0 — documento autónomo, cierra la Fase 0
**Se apoya en (no requiere leer primero, pero es la fuente de cada afirmación técnica):**
- `docs/embarques/00-architecture-audit.md` — auditoría de código real (Fase 0, completada 2026-08-20)
- `plan-maestro-embarques-autocontenido-equipo-desarrollo.md` — contrato de backend, **congelado y aprobado** (Gate: PASS)
- `docs/adr/*.md` (20 ADRs) — decisiones de dominio ya implementadas

**Regla de lectura:** este documento reemplaza al "Plan Técnico de Ataque y Desarrollo" original entregado antes de la auditoría en todo punto donde ambos difieran. El original describía una arquitectura conceptual (9 estados, Command Center, Preparation Flow) sin haber verificado el código. Este documento toma esa misma visión de producto y la reconcilia con lo que el código realmente hace hoy. Donde no se menciona un cambio, el plan original sigue vigente.

---

# 0. Decisión ejecutiva (confirmada, no cambia)

> **Conservar y reforzar el backend existente; reemplazar progresivamente la experiencia frontend por un Command Center + flujo de preparación + detalle de misión + conciliación.**

La auditoría de Fase 0 no solo confirma esta decisión — la refuerza. El backend de Embarques no es "suficientemente maduro": tiene un **contrato técnico explícitamente congelado y aprobado** (`GATE-APROBACION.md`, 6 gates en `PASS`), con guardrails escritos que prohíben exactamente lo que un rediseño de frontend apurado tendería a hacer mal (crear una segunda fuente de verdad, interpretar el signo de una cantidad, abrir transacciones anidadas). **No se toca ese contrato.** El trabajo de aquí en adelante es de experiencia, composición y — en los puntos que se listan en la sección 3 — plomería puntual de backend que el propio código ya señala como incompleta o inconsistente.

---

# 1. Lo que cambia respecto al plan original

| Plan original asumía | Auditoría encontró | Ajuste |
|---|---|---|
| Máquina conceptual de 9 estados (`BORRADOR→...→CERRADO`) | 4 estados reales: `ABIERTO→EN_RUTA→CERRADO`\|`CANCELADO`, sin reversibilidad | Los 9 conceptos del plan mapean a **estado de UI derivado**, nunca a un campo nuevo en `Embarque.estado` (sección 4) |
| El módulo DDD (`src/modules/embarques/`) es la fuente de verdad de comportamiento | 3 de 7 use cases (`ActualizarEmbarqueUseCase`, `EnviarEmbarqueUseCase`, `ListarEmbarquesUseCase`) **no están conectados a ningún endpoint** — la lógica real vive inline en los `route.ts` | Antes de construir el Preparation Flow sobre "crear/asignar/enviar", decidir per sección 3.1 |
| Offline-first ya es consistente en todo el feature | Mezcla real: cerrar/recovery/movimientos/botellones/cancelar/asignar usan `fetchResilient`+`offlineId`; **crear, editar, enviar-a-ruta, auto-generar, quitar-pedido, stock-estimado no** | Unificar antes de que el Preparation Flow dependa de estas rutas (sección 3.2) |
| Botellones/Físico/Recovery es una funcionalidad completa | Sustitución (`RECEPCION_DEFECTUOSA`+`ENTREGA` separados) está modelada en dominio+schema+tests pero **no tiene endpoint** — inalcanzable desde cualquier UI | Si el Mission Detail necesita exponer sustituciones, es trabajo de API antes que de UI (sección 3.3) |
| El cuadre de caja se calcula una vez, en el backend | El cliente de cierre (`cerrar-client/index.tsx`) **recalcula el cuadre completo en un `useMemo`** como preview no autoritativo — puede divergir de lo que el backend decide | La pantalla de Reconciliation debe pedir el preview al backend (dry-run), no reimplementarlo (sección 3.4) |
| Los 70 unidades / pesos de producto son un solo dato | `MAX_UNIDADES` está hardcodeado dos veces (una lee config, otra no); `PESOS_KG`/niveles de capacidad están duplicados 1:1 entre dominio y `src/lib/embarque-capacidad.ts` | Consolidar antes de que Command Center/Mission Detail consuman capacidad (sección 3.5) |

---

# 2. Restricciones que no cambian

Idénticas a las del plan original (Next.js 16.2.4 App Router, React 19.2.4, TypeScript estricto, Prisma+PostgreSQL únicamente, Dexie, Zustand, Playwright, Vitest, Zod, Serwist, ~6 usuarios concurrentes, rural 2G/3G) — ver `AGENTS.md`.

**Nota operativa:** `AGENTS.md` contiene una instrucción de leer `node_modules/next/dist/docs/` antes de escribir código. Esa ruta no existe (verificado; `node_modules` no está instalado en el entorno de auditoría, y Next.js no distribuye docs en `dist/` en ninguna versión). Tratarla como error del archivo, no como instrucción a seguir. El protocolo de investigación de 3 iteraciones de `AGENTS.md` sigue vigente para decisiones que dependan de librerías externas o de versión exacta de Next.js/React; no aplica a la lectura del propio código del repo (que es lo que produjo este documento y el de Fase 0).

---

# 3. Trabajo de plomería previo (bloqueante para las fases que dependen de él)

Estos cinco puntos no son "deuda técnica en general" — son específicamente lo que impide construir las pantallas del plan original sin heredar sus inconsistencias. Cada uno debe resolverse en el PR de la fase que lo necesita, no antes de forma aislada, salvo que se indique lo contrario.

### 3.1 Use cases muertos — decidir, no ignorar

`ActualizarEmbarqueUseCase` y `EnviarEmbarqueUseCase` existen, compilan, tienen tests de forma (verifican imports por regex), pero ningún `route.ts` los invoca. La lógica real —incluida una regla de negocio que hoy **no vive en el dominio** ("un trabajador no puede tener 2 embarques `EN_RUTA` simultáneos", solo en `enviar/route.ts`)— está inline en los controllers.

**Antes de construir Preparation Flow (Fase 4 de este plan) o el botón "Enviar" del Mission Detail (Fase 5):**
- Opción A (recomendada): mover la lógica inline de `[id]/route.ts` (PUT) y `[id]/enviar/route.ts` a `ActualizarEmbarqueUseCase`/`EnviarEmbarqueUseCase` respectivamente, incluyendo la regla de "no 2 EN_RUTA" en `EmbarqueTransitionsService` o un servicio de dominio nuevo. Los routes quedan thin, como ya lo es `cerrar/route.ts`.
- Opción B: eliminar los dos use cases muertos y documentar en `docs/embarques/02-api-contract.md` que la transición y la actualización viven en el controller por diseño.
- **No construir la Fase 4/5 sin haber tomado esta decisión explícitamente** — de lo contrario el Contrato de dominio/API (Fase 2) describiría un `ShipmentPreparationProposal` que no sabe a qué código real apunta.

### 3.2 Unificar el patrón offline-first

Extender `fetchResilient`+`offlineId` a: crear embarque (`POST /api/embarques`), editar (ya lo tiene parcialmente vía `[id]` PUT — confirmar), enviar a ruta (`POST /api/embarques/[id]/enviar`), auto-generar (`POST /api/embarques/auto`), quitar pedido (`DELETE .../pedidos/[pedidoId]`). Sin esto, "Enviar en Ruta" —la acción que arranca el reparto— puede fallar silenciosamente en 2G sin encolarse, y el Preparation Flow heredaría el mismo riesgo si reusa la llamada tal cual.

### 3.3 Sustitución — exponer o excluir explícitamente del alcance

Si el Mission Detail (plan original, sección 12/13) va a permitir registrar una sustitución de producto defectuoso, se necesita `POST /api/embarques/[id]/sustituciones` (o equivalente) que llame a `construirMovimientosSustitucion` (ya existe en `ledger-fisico.service.ts`) y persista dos `EmbarqueMovimiento` + un `Sustitucion`. Si no se va a exponer en esta ronda, decirlo explícitamente en `01-ux-contract.md` en vez de dejarlo ambiguo — hoy es inalcanzable desde cualquier cliente.

### 3.4 Cuadre de caja: preview autoritativo

La pantalla de Reconciliation (Fase 7) debe llamar a un modo dry-run de `CerrarEmbarqueUseCase` (o extraer su cálculo a un endpoint de preview) en vez de que el cliente reimplemente `calcularCaja`/`conciliarProductos` en un `useMemo`. Esto es lo único que garantiza que lo que el usuario ve antes de confirmar es exactamente lo que el backend va a decidir.

### 3.5 Consolidar capacidad/peso

Eliminar la reimplementación de `PESOS_KG` y niveles de capacidad en `src/lib/embarque-capacidad.ts`; hacer que ese archivo importe del value object de dominio (`Carga`/`CapacidadInfo`) en vez de duplicarlo. Mismo trabajo para el límite `MAX_UNIDADES_EMBARQUE`: el modal de "asignar pedidos" en el detalle debe leerlo de `/api/config` igual que el modal de creación (hoy tiene `70` hardcodeado).

**Riesgos de autorización a corregir en el mismo PR que toque cada endpoint** (no bloquean UI, pero deben entrar en el alcance de Fase 2 — Contratos dominio/API): `POST /movimientos`, `POST /recovery`, `POST /botellones` deberían validar `requireOwnership` igual que sus `GET`; `botellones` en particular permite a un `REPARTIDOR` operar sobre un embarque ajeno. `DELETE /api/embarques?id=` (solo ADMIN) y `DELETE /api/embarques/[id]` (ADMIN+ASISTENTE) deben unificarse a un solo rol para la misma acción.

---

# 4. Máquina de estados — contrato de UI sobre los 4 estados reales

**Autoridad:** `src/modules/embarques/domain/value-objects/EstadoEmbarque.ts`. No se agregan estados nuevos a `Embarque.estado` sin pasar por el flujo de ADR del contrato de backend (`plan-maestro-embarques-autocontenido-equipo-desarrollo.md` §26).

```text
ABIERTO ──► EN_RUTA ──► CERRADO
   │
   └──────► CANCELADO
```

Los conceptos del plan original mapean así:

| Concepto del plan original | Estado real subyacente | Cómo se deriva en UI (no persiste) |
|---|---|---|
| BORRADOR / PROPUESTO | `ABIERTO`, aún sin pedidos asignados | `pedidos.length === 0` |
| CONFIRMADO | `ABIERTO`, con pedidos asignados y sin excepciones bloqueantes | `pedidos.length > 0 && !hayExcepcionBloqueante` |
| PREPARANDO / LISTO | `ABIERTO` | Diferenciar por checklist de UI (¿hay carga registrada? ¿stock validado?), no por estado backend |
| EN_RUTA | `EN_RUTA` | 1:1 |
| RETORNADO / CONCILIANDO | `EN_RUTA`, con el wizard de cierre abierto | El "estado" es *estar dentro del flujo de `/embarques/[id]/cerrar`*, no un valor persistido |
| CERRADO | `CERRADO` | 1:1 |

Esto es lo que hace posible construir un Command Center que "se sienta" con más granularidad que el backend sin inventar una segunda fuente de verdad: **toda la granularidad extra vive en el cliente, calculada a partir de datos reales (pedidos, carga, excepciones), nunca escrita a la base de datos.**

---

# 5. Modelo de decisiones — aplicado a datos reales

El modelo AUTO / REVISIÓN / EXCEPCIÓN / BLOQUEO del plan original se mantiene. Ejemplos concretos con las reglas ya codificadas (auditoría, sección 4):

| Decisión | Regla real que la resuelve | Categoría |
|---|---|---|
| ¿Puedo asignar N unidades de un producto? | `EmbarqueValidationService.validarStock` (tolerancia 50% con stock&gt;0, hard cap 30 sin stock) | AUTO si dentro de tolerancia; EXCEPCIÓN si excede |
| ¿El trabajador puede llevar esta carga? | `validarCapacidadPeso` (tolerancia 110% sobre `capacidadKg`) | AUTO / EXCEPCIÓN |
| ¿Puedo enviar el embarque a ruta? | Regla inline en `enviar/route.ts`: no vacío (salvo ADMIN/ASISTENTE), trabajador sin otro `EN_RUTA` | BLOQUEO si viola cualquiera |
| ¿El cuadre de caja está correcto? | `CierreEmbarqueService.calcularCaja`/`validarPagos` (tolerancia 1%) | AUTO si dentro de tolerancia; REVISIÓN si hay discrepancia dentro de umbral; EXCEPCIÓN (`ResponsibilityCase`) si supera `UMBRAL_MINIMO_FALTANTE_CAJA` |
| ¿Hay sobrante/faltante físico? | `recovery.service.ts` (SOBRANTE exige `sourceEventId` consumible; FALTANTE no) | EXCEPCIÓN siempre — nunca AUTO, por diseño del contrato de backend |
| ¿Se puede transferir responsabilidad económica al repartidor? | `ResolverResponsibilityCaseUseCase` — exige `autorizadoPorId` humano | **Nunca AUTO** — el contrato de backend lo prohíbe explícitamente (§13 del plan maestro) |

---

# 6. Modelo de excepciones — mapeado a tipos reales

El plan original proponía una taxonomía de excepciones genérica (`STOCK_INSUFFICIENT`, `CAPACITY_EXCEEDED`, etc.). Se mantiene esa forma de presentación, pero **cada tipo debe mapear a un origen real y verificable**, no a una taxonomía nueva inventada en el frontend:

| Tipo de excepción (UI) | Origen real en backend |
|---|---|
| `STOCK_INSUFFICIENT` | Error `STOCK_EXCEDIDO`/mensajes de `EmbarqueValidationService.validarStock` |
| `CAPACITY_EXCEEDED` | Error `PESO_EXCEDIDO` de `validarCapacidadPeso`; `MAX_UNIDADES*` |
| `NO_DRIVER_AVAILABLE` | `NO_REPARTIDORES` de `POST /api/embarques/auto` |
| `PHYSICAL_MISMATCH` | `RecoveryDecision` tipo `SOBRANTE`/`FALTANTE`; discrepancia de `EmbarqueProducto` (`conciliarProductos`) |
| `MONEY_MISMATCH` | `faltanteEfectivo` &gt; `UMBRAL_MINIMO_FALTANTE_CAJA` → `ResponsibilityCase` tipo `FALTANTE_CAJA` |
| `DELIVERY_FAILED` | Rama `NO_ENTREGADO` de `ProcesarPedidoService` |
| `MISSING_DATA` | Cualquier 400 de validación Zod no cubierto arriba |
| `DOBLE_CONSUMO` (nuevo, no estaba en el plan original) | `CrearRecoveryDecisionUseCase` — un SOBRANTE ya fue consumido por otra decisión concurrente |

Cerrar `docs/embarques/03-exception-model.md` con esta tabla como base, extendida solo si aparece un caso real adicional durante la Fase 2.

---

# 7. Arquitectura objetivo (reafirmada del plan original)

Sin cambios respecto al documento original: Command Center → Preparation Flow → Mission Detail → Reconciliation, patrón DDD estilo `src/modules/dashboard/` para `src/modules/embarques/` (que **ya existe** y ya sigue ese patrón — no se crea desde cero, se completa según sección 3.1).

```text
Pedidos → Planificación → Asignación → Preparación → Salida → Entregas → Incidencias → Retorno → Conciliación → Cierre
```

Reutilizar directamente (auditoría, sección 9): `CrearEmbarqueUseCase`, `CancelarEmbarqueUseCase`, `CerrarEmbarqueUseCase` y todo lo que orquesta el cierre; `EmbarqueAdapter`/`EmbarqueDTOMapper`; `recovery.service.ts`/`botellones.service.ts`/`ledger-fisico.service.ts`; `src/lib/embarque-stats.ts`; los 20 ADRs como fuente de excepciones (sección 6).

---

# 8. Fases de ejecución (ajustadas)

```text
FASE 0  Auditoría real                              ✅ COMPLETADA — docs/embarques/00-architecture-audit.md
   ↓
FASE 1  Contrato UX                                  ← siguiente paso, ver sección 9
   ↓
FASE 2  Contratos dominio/API                        incluye decisión de sección 3.1 y tabla de sección 6
   ↓
FASE 3  Command Center
   ↓
FASE 4  Preparation Flow                              requiere 3.1 y 3.2 resueltos para "crear"/"asignar"
   ↓
FASE 5  Mission Detail                                requiere 3.1 y 3.2 resueltos para "enviar"
   ↓
FASE 6  Physical + Recovery                            requiere 3.3 si se expone sustitución
   ↓
FASE 7  Reconciliation                                 requiere 3.4
   ↓
FASE 8  Offline + Concurrency + E2E + Observability     cerrar los 4 "Parcial" de la matriz de tests (sección 10)
   ↓
FASE 9  Migración gradual
   ↓
FASE 10 Retiro de UI legacy
```

El resto de la estructura del plan original (tracks A–F, orden de PRs 1–15, formato de tickets, criterio de convergencia, DoD por feature y global, observabilidad, métricas) **se mantiene sin cambios** — no se repite aquí para no duplicar. Se aplican con los ajustes de las secciones 3–7 de este documento.

---

# 9. Gate de Fase 1 — qué debe cerrar `01-ux-contract.md`

Por el protocolo obligatorio de `AGENTS.md`, la Fase 1 requiere aprobación explícita del usuario tras su Ronda 2 antes de implementar. El contrato UX debe cerrar, citando siempre el origen real (no inventar):

- Los 4 estados reales + la tabla de mapeo de la sección 4 de este documento.
- La decisión de la sección 3.1 (conectar o eliminar los use cases muertos) — sin esto, la Fase 2 no puede escribir el contrato de API.
- La tabla de excepciones de la sección 6, cerrada o extendida.
- Qué pantallas del Mission Detail dependen de 3.3 (sustitución) y si entran en esta ronda o quedan fuera de alcance explícitamente.
- Desktop + mobile + los 4 estados de red (loading/success/offline/error) para cada pantalla nueva.

---

# 10. Prioridad de testing antes/junto con features nuevas

De la auditoría (sección 7), estos 4 puntos de la matriz mínima están solo "Parcial" y deben cerrarse en Fase 8, no dejarse para el final:

1. **Máquina de transiciones sin test dedicado** — `EstadoEmbarque`/`EmbarqueTransitionsService` no tienen archivo de test propio.
2. **Concurrencia real solo probada para Recovery** — asignación/envío/cierre solo tienen tests de "forma" (regex verificando uso de `executeSerializableWithRetry`), no concurrencia ejecutada de verdad.
3. **Timeout/offline: solo verificación estática** — ningún test simula un corte de red real y afirma el resultado en UI.
4. **`POST /api/embarques/auto` sin test unitario** — toda su cobertura depende de E2E contra Postgres real.

---

# 11. Decisiones que no deben reabrirse (extiende la lista del plan original)

Las 10 del plan original siguen vigentes. Se agregan, con evidencia de esta auditoría:

11. El contrato de backend (`plan-maestro-embarques-autocontenido-equipo-desarrollo.md` + 20 ADRs) es la autoridad de dominio. Ningún PR de UX puede introducir un estado, un lock o una fuente de verdad nueva sin pasar por su flujo de ADR (§26 de ese documento).
12. Los 4 estados de `EstadoEmbarque` son el contrato real. Cualquier granularidad adicional de UX se deriva en cliente, nunca se persiste como estado nuevo.
13. La instrucción de `AGENTS.md` sobre `node_modules/next/dist/docs/` es un error del archivo, no una fuente válida — no se sigue.

---

# 12. Próxima acción concreta

Con Fase 0 cerrada y este documento como contrato de convergencia, la siguiente acción del equipo es:

1. Tomar la decisión de la sección 3.1 (use cases muertos) — es la única decisión de esta lista que bloquea el resto.
2. Escribir `docs/embarques/01-ux-contract.md` y `docs/embarques/03-exception-model.md` siguiendo las secciones 4–6 de este documento como base.
3. Presentar ambos al usuario/product owner para la aprobación explícita que exige `AGENTS.md` tras la Ronda 2, antes de tocar código de producto.

No construir pantallas nuevas antes de ese punto.
