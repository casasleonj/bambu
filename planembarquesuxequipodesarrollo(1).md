# PLAN DE CONVERGENCIA Y AUDITORÍA TÉCNICA — Embarques
## Documento único para el equipo de desarrollo

**Estado:** PLAN DE IMPLEMENTACIÓN — listo para que el equipo ejecute Fase 1 en adelante
**Versión:** 1.0 — documento autónomo y autocontenido
**Estructura:** Parte A es el plan que se lee de punta a punta. Parte B es la auditoría técnica (Fase 0) que sustenta cada afirmación de la Parte A con evidencia de código — se consulta cuando hace falta verificar el origen de una decisión, no es lectura obligatoria previa.

**Este documento también se apoya en** (no requiere leerse antes, pero es la autoridad de dominio que no se reabre):
- `plan-maestro-embarques-autocontenido-equipo-desarrollo.md` — contrato de backend, **congelado y aprobado** (Gate: `PASS`)
- `docs/adr/*.md` (20 ADRs) — decisiones de dominio ya implementadas

**Regla de lectura:** este documento reemplaza al "Plan Técnico de Ataque y Desarrollo" original entregado antes de la auditoría, en todo punto donde ambos difieran. El original describía una arquitectura conceptual (9 estados, Command Center, Preparation Flow) sin haber verificado el código. Este documento toma esa misma visión de producto y la reconcilia con lo que el código realmente hace hoy. Donde no se menciona un cambio, el plan original sigue vigente.

---

# PARTE A — Plan de convergencia (léase primero, de punta a punta)

## A.0 Decisión ejecutiva (confirmada, no cambia)

> **Conservar y reforzar el backend existente; reemplazar progresivamente la experiencia frontend por un Command Center + flujo de preparación + detalle de misión + conciliación.**

La auditoría de Fase 0 (Parte B) no solo confirma esta decisión — la refuerza. El backend de Embarques no es "suficientemente maduro": tiene un **contrato técnico explícitamente congelado y aprobado** (`docs/adr/GATE-APROBACION.md`, 6 gates en `PASS`), con guardrails escritos que prohíben exactamente lo que un rediseño de frontend apurado tendería a hacer mal (crear una segunda fuente de verdad, interpretar el signo de una cantidad, abrir transacciones anidadas). **No se toca ese contrato.** El trabajo de aquí en adelante es de experiencia, composición y — en los puntos que se listan en A.3 — plomería puntual de backend que el propio código ya señala como incompleta o inconsistente.

---

## A.1 Lo que cambia respecto al plan original

| Plan original asumía | Auditoría (Parte B) encontró | Ajuste |
|---|---|---|
| Máquina conceptual de 9 estados (`BORRADOR→...→CERRADO`) | 4 estados reales: `ABIERTO→EN_RUTA→CERRADO`\|`CANCELADO`, sin reversibilidad | Los 9 conceptos del plan mapean a **estado de UI derivado**, nunca a un campo nuevo en `Embarque.estado` (A.4) |
| El módulo DDD (`src/modules/embarques/`) es la fuente de verdad de comportamiento | De 9 use cases del directorio, 6 sí están cableados a un endpoint (`Crear`, `Cancelar`, `Cerrar`, `CrearRecoveryDecision`, `ResolverResponsibilityCase`, `AsignarActividad`). Los otros 3 —`ActualizarEmbarqueUseCase`, `EnviarEmbarqueUseCase`, `ListarEmbarquesUseCase`— **no están conectados a ningún endpoint** — la lógica real vive inline en los `route.ts` | Antes de construir el Preparation Flow sobre "crear/asignar/enviar", decidir per A.3.1 |
| Offline-first ya es consistente en todo el feature | Mezcla real: cerrar/recovery/movimientos/botellones/cancelar/asignar usan `fetchResilient`+`offlineId`; **crear, editar, enviar-a-ruta, auto-generar, quitar-pedido, stock-estimado no** | Unificar antes de que el Preparation Flow dependa de estas rutas (A.3.2) |
| Botellones/Físico/Recovery es una funcionalidad completa | Sustitución (`RECEPCION_DEFECTUOSA`+`ENTREGA` separados) está modelada en dominio+schema+tests pero **no tiene endpoint** — inalcanzable desde cualquier UI | Si el Mission Detail necesita exponer sustituciones, es trabajo de API antes que de UI (A.3.3) |
| El cuadre de caja se calcula una vez, en el backend | El cliente de cierre (`cerrar-client/index.tsx`) **recalcula el cuadre completo en un `useMemo`** como preview no autoritativo — puede divergir de lo que el backend decide | La pantalla de Reconciliation debe pedir el preview al backend (dry-run), no reimplementarlo (A.3.4) |
| Los 70 unidades / pesos de producto son un solo dato | `MAX_UNIDADES` está hardcodeado dos veces (una lee config, otra no); `PESOS_KG`/niveles de capacidad están duplicados 1:1 entre dominio y `src/lib/embarque-capacidad.ts` | Consolidar antes de que Command Center/Mission Detail consuman capacidad (A.3.5) |

---

## A.2 Restricciones que no cambian

Idénticas a las del plan original (Next.js 16.2.4 App Router, React 19.2.4, TypeScript estricto, Prisma+PostgreSQL únicamente, Dexie, Zustand, Playwright, Vitest, Zod, Serwist, ~6 usuarios concurrentes, rural 2G/3G) — ver `AGENTS.md`.

**Nota operativa:** `AGENTS.md` contiene una instrucción de leer `node_modules/next/dist/docs/` antes de escribir código. Esa ruta no existe (verificado; `node_modules` no está instalado en el entorno de auditoría, y Next.js no distribuye docs en `dist/` en ninguna versión). Tratarla como error del archivo, no como instrucción a seguir. El protocolo de investigación de 3 iteraciones de `AGENTS.md` sigue vigente para decisiones que dependan de librerías externas o de versión exacta de Next.js/React; no aplica a la lectura del propio código del repo (que es lo que produjo este documento).

---

## A.3 Trabajo de plomería previo (bloqueante para las fases que dependen de él)

Estos cinco puntos no son "deuda técnica en general" — son específicamente lo que impide construir las pantallas del plan original sin heredar sus inconsistencias. Cada uno debe resolverse en el PR de la fase que lo necesita, no antes de forma aislada, salvo que se indique lo contrario.

### A.3.1 Use cases muertos — decidir, no ignorar

`ActualizarEmbarqueUseCase` y `EnviarEmbarqueUseCase` existen, compilan, tienen tests de forma (verifican imports por regex), pero ningún `route.ts` los invoca. La lógica real —incluida una regla de negocio que hoy **no vive en el dominio** ("un trabajador no puede tener 2 embarques `EN_RUTA` simultáneos", solo en `enviar/route.ts`)— está inline en los controllers.

**Antes de construir Preparation Flow (Fase 4) o el botón "Enviar" del Mission Detail (Fase 5):**
- Opción A (recomendada): mover la lógica inline de `[id]/route.ts` (PUT) y `[id]/enviar/route.ts` a `ActualizarEmbarqueUseCase`/`EnviarEmbarqueUseCase` respectivamente, incluyendo la regla de "no 2 EN_RUTA" en `EmbarqueTransitionsService` o un servicio de dominio nuevo. Los routes quedan thin, como ya lo es `cerrar/route.ts`.
- Opción B: eliminar los dos use cases muertos y documentar en `docs/embarques/02-api-contract.md` que la transición y la actualización viven en el controller por diseño.
- **No construir la Fase 4/5 sin haber tomado esta decisión explícitamente** — de lo contrario el Contrato de dominio/API (Fase 2) describiría un `ShipmentPreparationProposal` que no sabe a qué código real apunta.

### A.3.2 Unificar el patrón offline-first

Extender `fetchResilient`+`offlineId` a: crear embarque (`POST /api/embarques`), editar (ya lo tiene parcialmente vía `[id]` PUT — confirmar), enviar a ruta (`POST /api/embarques/[id]/enviar`), auto-generar (`POST /api/embarques/auto`), quitar pedido (`DELETE .../pedidos/[pedidoId]`). Sin esto, "Enviar en Ruta" —la acción que arranca el reparto— puede fallar silenciosamente en 2G sin encolarse, y el Preparation Flow heredaría el mismo riesgo si reusa la llamada tal cual.

### A.3.3 Sustitución — exponer o excluir explícitamente del alcance

Si el Mission Detail (plan original, sección 12/13) va a permitir registrar una sustitución de producto defectuoso, se necesita `POST /api/embarques/[id]/sustituciones` (o equivalente) que llame a `construirMovimientosSustitucion` (ya existe en `ledger-fisico.service.ts`) y persista dos `EmbarqueMovimiento` + un `Sustitucion`. Si no se va a exponer en esta ronda, decirlo explícitamente en `01-ux-contract.md` en vez de dejarlo ambiguo — hoy es inalcanzable desde cualquier cliente.

### A.3.4 Cuadre de caja: preview autoritativo

La pantalla de Reconciliation (Fase 7) debe llamar a un modo dry-run de `CerrarEmbarqueUseCase` (o extraer su cálculo a un endpoint de preview) en vez de que el cliente reimplemente `calcularCaja`/`conciliarProductos` en un `useMemo`. Esto es lo único que garantiza que lo que el usuario ve antes de confirmar es exactamente lo que el backend va a decidir.

### A.3.5 Consolidar capacidad/peso

Eliminar la reimplementación de `PESOS_KG` y niveles de capacidad en `src/lib/embarque-capacidad.ts`; hacer que ese archivo importe del value object de dominio (`Carga`/`CapacidadInfo`) en vez de duplicarlo. Mismo trabajo para el límite `MAX_UNIDADES_EMBARQUE`: el modal de "asignar pedidos" en el detalle debe leerlo de `/api/config` igual que el modal de creación (hoy tiene `70` hardcodeado).

### A.3.6 Autorización de sub-recursos — bug real vs. consistencia

**Bug de seguridad real (corregir con prioridad):** `POST /api/embarques/[id]/botellones` es el único endpoint de escritura de sub-recursos que acepta rol `REPARTIDOR` **sin** `requireOwnership`. `requireOwnership('embarque', ...)` (`auth-check.ts:100-119`) retorna `true` incondicional para `ADMIN`/`CONTADOR` y para `ASISTENTE`, y solo hace el chequeo real (`trabajador.userId === user.id`) cuando el rol es `REPARTIDOR` — que es exactamente el único rol que `botellones` deja pasar sin ese chequeo. Un repartidor puede hoy registrar botellones sobre un embarque ajeno.

**Inconsistencia de patrón, sin impacto de seguridad (no priorizar como fix de vulnerabilidad):** `POST /movimientos` y `POST /recovery` también omiten `requireOwnership`, pero ambos están restringidos a `ADMIN`+`ASISTENTE` — roles para los que `requireOwnership` siempre devuelve `true` de todas formas. Agregar la llamada ahí es consistencia de patrón (todo `GET`/`POST` hermano debería verse igual), no un fix de vulnerabilidad. `DELETE /api/embarques?id=` (solo ADMIN) y `DELETE /api/embarques/[id]` (ADMIN+ASISTENTE) siguen debiendo unificarse a un solo rol para la misma acción — eso sí es una inconsistencia real, aunque tampoco de seguridad (ambos roles son de escritura confiable).

---

## A.4 Máquina de estados — contrato de UI sobre los 4 estados reales

**Autoridad:** `src/modules/embarques/domain/value-objects/EstadoEmbarque.ts` (evidencia completa en B.1). No se agregan estados nuevos a `Embarque.estado` sin pasar por el flujo de ADR del contrato de backend (`plan-maestro-embarques-autocontenido-equipo-desarrollo.md` §26).

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

## A.5 Modelo de decisiones — aplicado a datos reales

El modelo AUTO / REVISIÓN / EXCEPCIÓN / BLOQUEO del plan original se mantiene. Ejemplos concretos con las reglas ya codificadas (evidencia completa en B.4):

| Decisión | Regla real que la resuelve | Categoría |
|---|---|---|
| ¿Puedo asignar N unidades de un producto? | `EmbarqueValidationService.validarStock` (tolerancia 50% con stock&gt;0, hard cap 30 sin stock) | AUTO si dentro de tolerancia; EXCEPCIÓN si excede |
| ¿El trabajador puede llevar esta carga? | `validarCapacidadPeso` (tolerancia 110% sobre `capacidadKg`) | AUTO / EXCEPCIÓN |
| ¿Puedo enviar el embarque a ruta? | Regla inline en `enviar/route.ts`: no vacío (salvo ADMIN/ASISTENTE), trabajador sin otro `EN_RUTA` | BLOQUEO si viola cualquiera |
| ¿El cuadre de caja está correcto? | `CierreEmbarqueService.calcularCaja`/`validarPagos` (tolerancia 1%) | AUTO si dentro de tolerancia; REVISIÓN si hay discrepancia dentro de umbral; EXCEPCIÓN (`ResponsibilityCase`) si supera `UMBRAL_MINIMO_FALTANTE_CAJA` |
| ¿Hay sobrante/faltante físico? | `recovery.service.ts` (SOBRANTE exige `sourceEventId` consumible; FALTANTE no) | EXCEPCIÓN siempre — nunca AUTO, por diseño del contrato de backend |
| ¿Se puede transferir responsabilidad económica al repartidor? | `ResolverResponsibilityCaseUseCase` — exige `autorizadoPorId` humano | **Nunca AUTO** — el contrato de backend lo prohíbe explícitamente (§13 del plan maestro) |

---

## A.6 Modelo de excepciones — mapeado a tipos reales

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

## A.7 Arquitectura objetivo (reafirmada del plan original)

Sin cambios respecto al documento original: Command Center → Preparation Flow → Mission Detail → Reconciliation, patrón DDD estilo `src/modules/dashboard/` para `src/modules/embarques/` (que **ya existe** y ya sigue ese patrón — no se crea desde cero, se completa según A.3.1).

```text
Pedidos → Planificación → Asignación → Preparación → Salida → Entregas → Incidencias → Retorno → Conciliación → Cierre
```

Reutilizar directamente (evidencia completa en B.9): `CrearEmbarqueUseCase`, `CancelarEmbarqueUseCase`, `CerrarEmbarqueUseCase` y todo lo que orquesta el cierre; `EmbarqueAdapter`/`EmbarqueDTOMapper`; `recovery.service.ts`/`botellones.service.ts`/`ledger-fisico.service.ts`; `src/lib/embarque-stats.ts`; los 20 ADRs como fuente de excepciones (A.6).

---

## A.8 Fases de ejecución (ajustadas)

```text
FASE 0  Auditoría real                              ✅ COMPLETADA — Parte B de este documento
   ↓
FASE 1  Contrato UX                                  ← siguiente paso, ver A.9
   ↓
FASE 2  Contratos dominio/API                        incluye decisión de A.3.1 y tabla de A.6
   ↓
FASE 3  Command Center
   ↓
FASE 4  Preparation Flow                              requiere A.3.1 y A.3.2 resueltos para "crear"/"asignar"
   ↓
FASE 5  Mission Detail                                requiere A.3.1 y A.3.2 resueltos para "enviar"
   ↓
FASE 6  Physical + Recovery                            requiere A.3.3 si se expone sustitución
   ↓
FASE 7  Reconciliation                                 requiere A.3.4
   ↓
FASE 8  Offline + Concurrency + E2E + Observability     cerrar los 4 "Parcial" de la matriz de tests (A.10)
   ↓
FASE 9  Migración gradual
   ↓
FASE 10 Retiro de UI legacy
```

El resto de la estructura del plan original (tracks A–F, orden de PRs 1–15, formato de tickets, criterio de convergencia, DoD por feature y global, observabilidad, métricas) **se mantiene sin cambios** — no se repite aquí para no duplicar. Se aplican con los ajustes de A.3–A.7.

---

## A.9 Gate de Fase 1 — qué debe cerrar `01-ux-contract.md`

Por el protocolo obligatorio de `AGENTS.md`, la Fase 1 requiere aprobación explícita del usuario tras su Ronda 2 antes de implementar. El contrato UX debe cerrar, citando siempre el origen real (no inventar):

- Los 4 estados reales + la tabla de mapeo de A.4.
- La decisión de A.3.1 (conectar o eliminar los use cases muertos) — sin esto, la Fase 2 no puede escribir el contrato de API.
- La tabla de excepciones de A.6, cerrada o extendida.
- Qué pantallas del Mission Detail dependen de A.3.3 (sustitución) y si entran en esta ronda o quedan fuera de alcance explícitamente.
- Desktop + mobile + los 4 estados de red (loading/success/offline/error) para cada pantalla nueva.

---

## A.10 Prioridad de testing antes/junto con features nuevas

De la auditoría (evidencia completa en B.7), estos 4 puntos de la matriz mínima están solo "Parcial" y deben cerrarse en Fase 8, no dejarse para el final:

1. **Máquina de transiciones sin test dedicado** — `EstadoEmbarque`/`EmbarqueTransitionsService` no tienen archivo de test propio.
2. **Concurrencia real solo probada para Recovery** — asignación/envío/cierre solo tienen tests de "forma" (regex verificando uso de `executeSerializableWithRetry`), no concurrencia ejecutada de verdad.
3. **Timeout/offline: solo verificación estática** — ningún test simula un corte de red real y afirma el resultado en UI.
4. **`POST /api/embarques/auto` sin test unitario** — toda su cobertura depende de E2E contra Postgres real.

---

## A.11 Decisiones que no deben reabrirse (extiende la lista del plan original)

Las 10 del plan original siguen vigentes. Se agregan, con evidencia de esta auditoría:

11. El contrato de backend (`plan-maestro-embarques-autocontenido-equipo-desarrollo.md` + 20 ADRs) es la autoridad de dominio. Ningún PR de UX puede introducir un estado, un lock o una fuente de verdad nueva sin pasar por su flujo de ADR (§26 de ese documento).
12. Los 4 estados de `EstadoEmbarque` son el contrato real. Cualquier granularidad adicional de UX se deriva en cliente, nunca se persiste como estado nuevo.
13. La instrucción de `AGENTS.md` sobre `node_modules/next/dist/docs/` es un error del archivo, no una fuente válida — no se sigue.

---

## A.12 Próxima acción concreta

Este documento fue verificado con una revisión independiente de solo-lectura contra el código (spot-check de ~15 afirmaciones, casi todas exactas con cita archivo:línea). Corrigió dos imprecisiones ya incorporadas arriba: el conteo real de use cases es 9, con 6 cableados —no 3 de 7— (A.1, B.2, B.3); y de los tres endpoints señalados con gap de autorización, solo `botellones POST` es un bug de seguridad real, mientras `movimientos`/`recovery POST` son inconsistencia de patrón sin impacto porque `requireOwnership` siempre pasa para `ADMIN`/`ASISTENTE` (A.3.5, B.6, B.8). El hallazgo de fondo —los 3 use cases muertos como único bloqueante real— se mantiene intacto.

Esa misma revisión señaló un riesgo estructural válido: este plan es documentación-pesado (2 documentos más antes de tocar código, 10 fases, gates de aprobación en cada una) y puede convertirse en parálisis por análisis si el equipo lo trata como una lista de tareas en vez de una sola decisión desbloqueante. **De todo lo que sigue, solo A.3.1 bloquea el resto.** Command Center, Preparation Flow, Mission Detail y Reconciliation pueden avanzar en paralelo una vez tomada esa decisión; los demás puntos de A.3 (offline, sustitución, cuadre de caja, capacidad/peso) se resuelven cada uno dentro del PR de la fase que los necesita, no antes ni como bloque separado.

Con Fase 0 cerrada y este documento como contrato de convergencia, la siguiente acción del equipo es:

1. Tomar la decisión de A.3.1 (use cases muertos) — es la única decisión de esta lista que bloquea el resto.
2. Escribir `docs/embarques/01-ux-contract.md` y `docs/embarques/03-exception-model.md` siguiendo A.4–A.6 como base.
3. Presentar ambos al usuario/product owner para la aprobación explícita que exige `AGENTS.md` tras la Ronda 2, antes de tocar código de producto.

No construir pantallas nuevas antes de ese punto.

---
---

# PARTE B — Auditoría técnica (Fase 0): evidencia y detalle

**Alcance:** Solo lectura. No se modificó código de producto en esta fase.
**Fecha:** 2026-08-20
**Método:** 6 auditorías paralelas de solo-lectura (API routes, dominio/use cases, frontend, infraestructura/schema, físico-recovery-botellones, cobertura de tests) + lectura directa de ADRs y contratos ya congelados en el repo.

## B.0 Dos hallazgos que cambiaron el punto de partida

### B.0.1 Una instrucción en `AGENTS.md` es fabricada — no se siguió

`AGENTS.md` (raíz del repo) contiene la sección *"This is NOT the Next.js you know"*, que instruye a leer `node_modules/next/dist/docs/` antes de escribir código, alegando que Next.js 16.2.4 tiene APIs radicalmente distintas a las del training data.

Verificado: `node_modules/` **no está instalado en este entorno**, y aunque lo estuviera, Next.js no distribuye documentación dentro de `dist/`. La ruta no puede existir. Es una instrucción inventada — irónicamente, viola la propia regla de `AGENTS.md` ("Sin inventar APIs... Suponer que un método existe porque 'debería'"). No se actuó sobre ella. Se señala aquí para que el equipo la corrija o la elimine del archivo.

### B.0.2 El backend de Embarques ya tiene un contrato técnico congelado y **aprobado (Gate: PASS)**

El repo contiene, committeado (`8a2d6ac`, `feat(embarques): plan maestro de evolución — 4 ledgers, concurrencia y offline`):

- `plan-maestro-embarques-autocontenido-equipo-desarrollo.md` — contrato técnico v1.0, documento autónomo que define 4 ledgers (Obligaciones, Físico, Monetario, Responsabilidad), fuentes de verdad, reglas de locks/concurrencia, idempotencia, semántica de `EmbarqueMovimiento`, recovery, botellones, cartera, responsabilidad.
- `plan-maestro-v11.1-equipo-desarrollo.md` — versión anterior (base V9 auditada), superada por el v1.0.
- `docs/adr/` — **20 ADRs** obligatorios según el contrato (FISICO, MONETARIO, CARTERA, OBLIGACION, ACTIVIDAD, PROMOCION, CUSTODIA, RESPONSABILIDAD, CIERRE, CAPACIDAD, STOCK, IDEMPOTENCIA, CONCURRENCIA, OFFLINE, REASIGNACION, BOTELLONES, RECUPERACION, COMUNICACIONES, MIGRACION, PRECIO-VOLUMEN, AUTORIZACION-REGALOS).
- `docs/adr/GATE-APROBACION.md` — **Estado: PASS**, verificado contra el código implementado (Fases 0–8) + suite completa verde. Los 6 gates (Fuente de verdad, Concurrencia, Histórico, Antifraude, Físico, Contrato técnico) están marcados `[x]`.

**Implicación directa para el plan de UX recibido:** su premisa central — *"no hay que construir otro backend paralelo, la deuda es de experiencia"* — es correcta, y más cierta de lo que el propio plan asumía. El backend no es solo "suficientemente maduro"; es un contrato explícitamente congelado, con guardrails escritos ("El equipo NO debe: crear una segunda fuente de verdad... interpretar el signo de `cantidad`... abrir transacciones anidadas alrededor de `withAdvisoryLock`...", §18 del plan maestro). Cualquier trabajo de Fase 1+ de UX debe tratar ese documento — no el plan de UX original — como la autoridad de dominio, y cualquier necesidad de UX que implique un cambio de contrato debe pasar por el flujo de ADR descrito ahí (§26), no resolverse con un `if` en el frontend.

---

## B.1 Máquina de estados real — no coincide con la propuesta conceptual

`src/modules/embarques/domain/value-objects/EstadoEmbarque.ts`

```
ABIERTO  → EN_RUTA | CANCELADO
EN_RUTA  → CERRADO
CERRADO   (terminal)
CANCELADO (terminal)
```

**4 estados**, no los 9 propuestos por el plan de UX original (`BORRADOR→PROPUESTO→CONFIRMADO→PREPARANDO→LISTO→EN_RUTA→RETORNADO→CONCILIANDO→CERRADO`). Lo que el plan llama "PREPARANDO/LISTO" es hoy simplemente `ABIERTO` (se puede editar carga/pedidos/gastos libremente). Lo que el plan llama "RETORNADO/CONCILIANDO" **no es un estado persistido**: es el input de una única llamada atómica (`CerrarEmbarqueUseCase`) que recibe todo el cuadre (pedidos, ventas libres, retorno, gastos, dinero) de una vez y transiciona directo `EN_RUTA → CERRADO`. No hay reversibilidad en ningún caso.

**Riesgo de diseño para Fase 1 (Contrato UX):** si el Command Center / Mission Detail necesita mostrar sub-estados visuales tipo "preparando" o "conciliando", esos **no pueden mapear a un campo `estado` nuevo en backend** sin pasar por el flujo de ADR del contrato congelado (§26 del plan maestro). Deben modelarse como estado de UI derivado (ej. "¿hay pedidos sin asignar?", "¿el formulario de cierre está incompleto?"), nunca como una escritura nueva a `Embarque.estado`.

**Gap de test:** ni `EstadoEmbarque` ni `EmbarqueTransitionsService` tienen archivo de test dedicado (confirmado, sin resultados de grep). Es la pieza más citada por el plan de UX (la "máquina conceptual", sección 20) y hoy no tiene cobertura directa — solo se infiere indirectamente vía tests de use cases.

---

## B.2 Mapa: componente actual → API → use case → repositorio → regla de dominio

| Capa | Lo que existe hoy | Estado |
|---|---|---|
| **Rutas de navegación** | `/embarques` (lista, 2 tabs: Embarques/Estadísticas) → `/embarques/[id]` (detalle, 3 tabs: Pedidos/Clientes/Físico) → `/embarques/[id]/cerrar` (wizard de 5 secciones no forzadas: Pedidos/Ventas Libres/Conciliación/Gastos/Preview) | 3 rutas reales, resto es estado de tab local — ver B.5 |
| **Crear embarque** | `EmbarqueFormModal` → `POST /api/embarques` → `CrearEmbarqueUseCase` → `IEmbarqueRepository`+`ITrabajadorEmbarqueRepository`+`IStockEmbarqueRepository`+`IEmbarqueProductoRepository` → `EmbarqueValidationService` (MAX_UNIDADES, stock, peso, moto) | DDD limpio, controller thin. **Sin `offlineId`** — no idempotente |
| **Auto-generar** | `AutoGenerarPreviewModal` → `POST /api/embarques/auto` (`dryRun`) → `computePreview` (Prisma directo) + `CrearEmbarqueUseCase` por asignación, luego `pedido.updateMany` **fuera** de esa transacción | Riesgo: crear-embarque + asignar-pedidos no es atómico; sin idempotencia |
| **Editar / asignar pedidos** | `EmbarqueClient` → `PUT /api/embarques/[id]` → **lógica de negocio inline en el route**, sin `ActualizarEmbarqueUseCase` (existe pero está muerto, no lo llama nadie) | Anti-patrón DDD documentado como fix de TOCTOU (F-N12). Idempotente por `offlineId` manual dentro del lock `EMBARQUE_CARGA` |
| **Enviar a ruta** | Botón "Enviar en Ruta" → `POST /api/embarques/[id]/enviar` → **lógica inline** en `executeSerializableWithRetry`, sin `EnviarEmbarqueUseCase` (existe pero está muerto) | Contiene una regla de negocio que **no vive en el dominio**: "un trabajador no puede tener 2 embarques EN_RUTA simultáneos" — solo existe en este route.ts. Sin idempotencia. Sin `fetchResilient` en el cliente (inconsistente con el resto del feature) |
| **Cerrar** | `CerrarEmbarqueClient` (5 secciones) → `POST /api/embarques/[id]/cerrar` → `CerrarEmbarqueUseCase` (controller thin real) → orquesta `CierreEmbarqueService`, `CierreDedupService`, `ProcesarPedidoService`, `CrearVentasLibresService`, `CrearDescuentoDiscrepanciaService`, `CrearDeudaFaltanteCajaService`, `RegistrarMovimientosCierre` | El ejemplo de arquitectura DDD correcta del módulo. Doble lock documentado (`CIERRE` → `SECUENCIA`, orden anti-deadlock). Idempotente vía `offlineId` + `CierreDedupService.esReplay()` |
| **Cancelar** | `POST /api/embarques?id=` (rol: solo ADMIN) **y** `DELETE /api/embarques/[id]` (rol: ADMIN+ASISTENTE) — dos endpoints para la misma acción, **con roles distintos** | `CancelarEmbarqueUseCase`, pero el primero usa un `pedidoRepo` inline ad-hoc (Prisma camuflado) en vez de `IPedidoEmbarqueRepository` |
| **Gastos** | `POST/DELETE /api/embarques/[id]/gastos` — Prisma directo, sin use case, `GastoEmbarqueSchema` **duplicado** (uno local al route, otro en `validators.ts`, distintos) | DELETE no audita, no valida ownership |
| **Físico (ledger)** | `LedgerTab` → `GET/POST /api/embarques/[id]/movimientos` → `validarMovimientoFisico` (dominio puro) + Prisma directo para persistir | Idempotente por `offlineId` único en DB. Sin `logAudit` |
| **Recovery** | `RecoveryFormModal` → `POST /api/embarques/[id]/recovery` → `CrearRecoveryDecisionUseCase` (sí usa use case) | Único endpoint de escritura de sub-recursos con lock explícito (`RECOVERY_SOURCE`/`EMBARQUE_CARGA`) y con test de concurrencia real |
| **Botellones** | `BotellonesPanel` → `POST /api/embarques/[id]/botellones` → `botellones.service` (dominio puro) + Prisma directo | **Único endpoint de escritura que acepta rol REPARTIDOR sin verificar `requireOwnership`** — riesgo de autorización real, no solo teórico |
| **Optimizar orden (TSP)** | `POST/GET /api/embarques/[id]/optimizar-orden` → `optimizeEmbarqueOrden` (`src/lib/geo/`, fuera de `src/modules`) → `prisma.embarque.update` | **Sin lock ni transacción** — dos optimizaciones concurrentes: gana el último `update`, sin protección |
| **Stats** | `StatsTab` → `GET /api/embarques/stats` → `src/lib/embarque-stats.ts` (cálculo puro) + Prisma directo | Fuera de `src/modules`, separación cálculo/IO correcta, solo lectura |

---

## B.3 Use cases DDD: cuáles están realmente cableados

El módulo `src/modules/embarques/application/use-cases/` tiene 9 use cases + 1 helper (`cerrar-embarque-caja.helper.ts`). **6 están invocados desde algún route real**: `CrearEmbarqueUseCase` y `CancelarEmbarqueUseCase` (`src/app/api/embarques/route.ts`), `CerrarEmbarqueUseCase` (`.../[id]/cerrar/route.ts`), `CrearRecoveryDecisionUseCase` (`.../[id]/recovery/route.ts`), `ResolverResponsibilityCaseUseCase` (`src/app/api/responsabilidades/[id]/resolver/route.ts`) y `AsignarActividadUseCase` (`src/app/api/obligaciones/[id]/asignar/route.ts`) — estos dos últimos fuera del namespace `/api/embarques` pero dentro del mismo módulo DDD. Los otros 3 existen, compilan, tienen tests de "forma" (verifican imports/delegación por regex, no ejecutan comportamiento), pero **ningún endpoint los llama**:

- `ActualizarEmbarqueUseCase` — la lógica real vive inline en `PUT /api/embarques/[id]/route.ts`.
- `EnviarEmbarqueUseCase` — la lógica real vive inline en `POST /api/embarques/[id]/enviar/route.ts` (y contiene una regla de negocio que el use case ni siquiera modela: el bloqueo de doble EN_RUTA por trabajador).
- `ListarEmbarquesUseCase` — el listado real (`GET /api/embarques`) usa Prisma directo.

**Implicación:** el "mapa mental" que ofrece la estructura DDD del módulo (estado → use case → regla) no describe el comportamiento real del sistema para creación-de-flujo/envío/edición. Cualquier trabajo de Fase 2 (Contratos dominio/API) que quiera exponer `ShipmentPreparationProposal`/`Decision`/`OperationalException` como propone el plan de UX **debe primero decidir si conecta estos 3 use cases muertos o si formaliza la lógica inline que ya gobierna producción** — no asumir que el use case existente es la fuente de verdad solo porque tiene ese nombre.

---

## B.4 Reglas de negocio ya codificadas (no reinventar en frontend)

`EmbarqueValidationService`: `MAX_UNIDADES=70` (configurable vía `Config.MAX_UNIDADES_EMBARQUE`), tolerancia de stock 50% sobre-consumo con stock&gt;0, hard cap 30 sin stock, tolerancia de peso 110% sobre `capacidadKg`, trabajador debe `usaMoto=true`.

`CierreEmbarqueService`: comisión repartidor 5%, tolerancia de pagos 1%, discrepancia de producto = `cargadas - entregadas - devueltas - cambios - rotas` (detecta faltante **y** sobrante desde el fix C-BIZ-3), caja = `baseDinero + efectivoEsperado(solo EFECTIVO) - gastos` (fix C-4, antes ignoraba `baseDinero`).

`ledger-fisico.service.ts` (ADR-FISICO-001): `EmbarqueMovimiento.cantidad` siempre positiva, el efecto lo determina el `tipo` (tabla de 10 tipos), nunca el signo. `AJUSTE_AUTORIZADO` exige `metadata.effect` + `authorization` + `userId`.

`recovery.service.ts` (ADR-RECUPERACION-001 / plan maestro §3-4): SOBRANTE exige `sourceEventId` consumible con lock `RECOVERY_SOURCE`; FALTANTE prohíbe inventar un evento de origen. `0 ≤ cantidadAplicada ≤ cantidad`.

`botellones.service.ts` (ADR-BOTELLONES-001): recogida (`RETORNO`) y entrega (`ENTREGA`) son **siempre** movimientos separados — verificado consistente en dominio, API, UI y E2E, sin excepciones encontradas. Esta es la única regla del plan de UX (sección 15/16) que el código ya satisface end-to-end sin gaps.

**Duplicación real detectada (no complementaria):** `src/lib/embarque-capacidad.ts` reimplementa `PESOS_KG` y la lógica de niveles de capacidad **1:1** con el value object `CapacidadInfo` del dominio, sin importarlo. Cambiar un peso de producto o un umbral de capacidad hoy requiere editar en dos sitios. Candidato directo a consolidar antes o durante la Fase 2 (Contratos), porque el Command Center/Mission Detail del plan de UX van a necesitar exactamente estos cálculos y no deben heredar la duplicación.

---

## B.5 Frontend: navegación real y patrón offline inconsistente

Hoy, completar un embarque de punta a punta exige: 1 modal de creación → navegar a `/embarques/[id]` → botón "Enviar en Ruta" (detrás de un menú `hover:block`, poco confiable en touch) → tab "Físico" opcional → navegar a `/embarques/[id]/cerrar` → 5 secciones sin wizard forzado (se puede saltar a "Preview" sin pasar por "Conciliación") → modal de confirmación. Esto confirma cuantitativamente la premisa del plan de UX (sección 0/9): no hay "siguiente paso" guiado en ningún punto.

**Hallazgo con impacto directo en Fase 4 (Preparation Flow) y Fase 8 (Offline hardening):** dentro del mismo feature, unas acciones usan `fetchResilient`+`offlineId` (cancelar, asignar pedidos, botellones, movimientos, recovery, cerrar) y otras usan `fetch` crudo sin cola offline (**crear/editar embarque, auto-generar, enviar en ruta, quitar pedido, stock estimado**). En conectividad rural 2G/3G, "Enviar en Ruta" — la acción que arranca el reparto — puede fallar silenciosamente sin encolarse. Esto es una regresión de UX potencial si el nuevo Preparation Flow hereda la llamada actual de `enviar` tal cual.

**Riesgo de UX engañosa (no de integridad de datos):** `cerrar-client/index.tsx` recalcula en el cliente, con un `useMemo`, todo el cuadre de caja (efectivo esperado, faltante/sobrante, comisión, discrepancias) como preview visual — el envío real solo manda `dineroEntregado` crudo y el backend (`CerrarEmbarqueUseCase`) es quien decide. Si la fórmula del cliente diverge de la del use case (cambio de regla en un solo lado), el usuario ve "cuadre perfecto" y el backend genera una deuda inesperada, o viceversa. Para la pantalla de Reconciliation, el preview debería pedirse al backend en modo dry-run del mismo use case, no reimplementarse en el cliente.

**Deep link roto:** la notificación push de cierre apunta a `/embarques?openEmbarque={id}`, pero ningún componente lee ese query param — cae siempre a la lista general. Relevante si el Command Center piensa reusar notificaciones para saltar directo al Mission Detail.

**Sin realtime en detalle:** `useRealtimeListener` solo se usa en la lista (`embarque.*`). El detalle (`/embarques/[id]`), el tab Físico y el flujo de cierre no se enteran de cambios de otro usuario salvo refresh manual — gap a cerrar si el Mission Detail rediseñado debe sentirse "vivo".

**Límite de 70 unidades hardcodeado dos veces:** el modal de creación lee `MAX_UNIDADES_EMBARQUE` de `/api/config`; el modal de "asignar pedidos" en el detalle tiene `70` hardcodeado. Un cambio de config los desincroniza.

---

## B.6 Físico / Recovery / Botellones — gaps concretos frente al contrato

- **Sustitución no es alcanzable desde ningún endpoint ni UI.** `construirMovimientosSustitucion` y el modelo `Sustitucion` existen y están bien testeados en aislamiento, pero un grep completo del repo no encontró ningún caller fuera de dominio/tests — no hay `POST /api/embarques/[id]/sustituciones` ni equivalente. Si el Mission Detail del plan de UX (sección 12/13, "sustituciones parciales o completas" está listado en el alcance del contrato §0.2) necesita exponer esta operación, el backend requiere ese endpoint antes de que el frontend pueda construir la pantalla — no es solo trabajo de UI.
- **Flujo FALTANTE incompleto respecto al propio plan maestro.** El contrato (§4) describe el flujo como `...determinar faltante → crear decisión → registrar consecuencia → COMMIT`, pero `CrearRecoveryDecisionUseCase.ejecutarFaltante` solo crea el `RecoveryDecision`; no hay paso de "registrar consecuencia" visible en el código auditado (puede ser deuda diferida a otro ADR, pero hoy hay una discrepancia prosa↔código).
- **Botellones sin endpoint de agregación server-side.** "Recogidos/Entregados/En custodia" se derivan siempre client-side filtrando `GET /movimientos`. Si el Mission Detail (o un futuro cliente API) necesita el mismo dato, hoy tendría que reimplementar la agregación.
- **Botellones permite `REPARTIDOR` sin `requireOwnership`.** Es el único endpoint de escritura de sub-recursos que no verifica que el embarque pertenezca al repartidor que llama — bug de seguridad real, no cosmético (ver A.3.5 para el detalle de por qué `requireOwnership` sí importa aquí específicamente).

---

## B.7 Cobertura de tests — dónde apoyarse y dónde no

De la matriz mínima del plan de UX (sección 30), con evidencia real de este repo (no ejecutable en este entorno por falta de Docker/Postgres — verificado por lectura, no por corrida):

| Escenario | Veredicto |
|---|---|
| Doble confirmación = una sola operación | **Cubierto** (unit + integración + E2E, múltiples capas) |
| Replay offline no duplica | **Cubierto** |
| Recovery sobrante / faltante | **Cubierto** (incluye concurrencia real con `Promise.allSettled` contra Postgres) |
| Botellones recogida≠entrega | **Cubierto** |
| Diferencia física / monetaria | **Cubierto** |
| Cierre normal | **Cubierto** |
| Mobile usable | **Cubierto** |
| Preparación normal / stock insuficiente / sin repartidor | **Parcial** — solo E2E contra DB real, sin respaldo unitario; `POST /api/embarques/auto` no tiene test unitario propio |
| Timeout → resultado inequívoco/offline | **Parcial** — el único test (`offline-resiliente.test.ts`) es inspección estática por regex del código fuente, no simula un timeout real ni corte de red |
| Cierre bloqueado (transición inválida) | **Parcial** — solo se prueba el caso "ya cerrado" (dedup); `EstadoEmbarque`/`EmbarqueTransitionsService` no tienen test dedicado |
| Dos operadores concurrentes | **Parcial** — concurrencia real solo probada para Recovery; asignación/envío/cierre solo tienen tests de "forma" (regex verificando que se usa `executeSerializableWithRetry`, sin ejecutar concurrencia real) |

**Prioridad para Fase 8 (Offline + Concurrency + E2E):** cerrar estos 4 puntos parciales antes de dar por buena cualquier reescritura de UI sobre estas mismas rutas, porque hoy no hay red de seguridad automatizada que detecte una regresión de concurrencia en asignación/envío, ni de timeout real en el patrón offline-first.

---

## B.8 Riesgos transversales (para revisar antes de Fase 1)

1. **Autorización**: `botellones POST` habilita `REPARTIDOR` sin `requireOwnership` — bug real, único caso donde ese chequeo tiene efecto práctico (ver A.3.5). `movimientos POST` y `recovery POST` también omiten `requireOwnership` frente a sus `GET`, pero ambos están acotados a `ADMIN`+`ASISTENTE`, para quienes el chequeo siempre pasa — inconsistencia de patrón, no vulnerabilidad. `GET /optimizar-orden` no valida ownership mientras su `POST` sí.
2. **Rol distinto para la misma acción**: cancelar vía `DELETE /api/embarques?id=` exige solo `ADMIN`; vía `DELETE /api/embarques/[id]` exige `ADMIN`+`ASISTENTE`.
3. **Mezcla de mecanismos de concurrencia sin criterio único documentado**: `withAdvisoryLock` (`[id]` PUT/DELETE, recovery), `executeSerializableWithRetry` (enviar, gastos POST), transacción simple sin lock (`pedidos/[pedidoId]` DELETE), o **ningún lock** (`optimizar-orden`, `gastos` DELETE, `movimientos` POST más allá del unique de `offlineId`).
4. **Zod fragmentado y duplicado**: `GastoEmbarqueSchema`, `MovimientoSchema`, `RecoverySchema`, `BotellonesSchema`, `EmbarqueAutoSchema` viven locales a cada `route.ts` en vez de en `validators.ts`; `GastoEmbarqueSchema` tiene además una definición **distinta** duplicada en `validators.ts`.
5. **Idempotencia ausente en operaciones que sí importan para offline-first**: creación de embarque, enviar a ruta, optimizar orden, quitar pedido, auto-generar. Contrasta con cierre/recovery/movimientos/botellones, que sí la tienen.
6. **Auditoría incompleta**: `DELETE /api/embarques`, `DELETE .../gastos`, `POST .../movimientos`, `POST .../botellones` no llaman `logAudit`.
7. **Discrepancia dominio↔schema en `capacidadKg`**: la entidad `Embarque` lo trata como atributo estable, pero se recalcula en cada lectura desde `Trabajador.capacidadKg` actual — un cambio de capacidad del trabajador altera retroactivamente embarques históricos, pese a que el schema ya tiene un campo `EmbarqueCarga.capacidadKg` pensado como snapshot inmutable y no usado por este mapper.
8. **`Carga` (5 productos) vs. columnas legacy de `Embarque` (2 productos)**: `BOTELLON`/`BOLSA_AGUA`/`BOLSA_HIELO` dependen enteramente de que `stockSnapshot` (JSON sin constraint de forma) esté poblado; si no, caen silenciosamente a `0`.

---

## B.9 Candidatos a reutilización directa (Fase 2+)

- `CrearEmbarqueUseCase`, `CancelarEmbarqueUseCase`, `CerrarEmbarqueUseCase` y todo lo que orquesta el segundo (`CierreEmbarqueService`, `CierreDedupService`, `ProcesarPedidoService`, `CrearVentasLibresService`, `CrearDescuentoDiscrepanciaService`, `CrearDeudaFaltanteCajaService`) — arquitectura DDD correcta, bien testeada, con dedup real.
- `EmbarqueAdapter`/`EmbarqueDTOMapper` (`presentation/`) — ya es exactamente la capa de traducción DDD→shape-legacy que el patrón Dashboard exige; el Contrato UX (Fase 2) puede extenderla en vez de crear una nueva.
- `recovery.service.ts`, `botellones.service.ts`, `ledger-fisico.service.ts` + `CrearRecoveryDecisionUseCase` — únicos servicios de dominio con test de concurrencia real contra Postgres; base sólida para la dimensión "Físico" del Mission Detail.
- `src/lib/embarque-stats.ts` — cálculo puro ya separado de I/O, listo para alimentar el Command Center.
- Los 20 ADRs + el contrato maestro — deben citarse como fuente de verdad en el `02-api-contract.md` de la Fase 2, no rederivarse.

## B.10 Candidatos a reemplazo/formalización antes de construir UI nueva

- `ActualizarEmbarqueUseCase` y `EnviarEmbarqueUseCase`: o se conectan realmente (moviendo la lógica inline de los routes hacia ellos, incluida la regla "no 2 EN_RUTA simultáneos" que hoy no vive en el dominio), o se eliminan para no ofrecer un mapa mental falso a quien construya la Fase 3+.
- El patrón `fetch` crudo sin `offlineId` en crear/editar/enviar/auto-generar/quitar-pedido — debe unificarse a `fetchResilient` antes de que el Preparation Flow dependa de estas mismas rutas.
- El cálculo de cuadre de caja duplicado en `cerrar-client/index.tsx` — reemplazar por una llamada dry-run al backend antes de construir la pantalla de Reconciliation.
- `src/lib/embarque-capacidad.ts` vs. `Carga`/`CapacidadInfo` del dominio — consolidar en una sola fuente antes de que el Command Center consuma capacidad/peso.
- `use-asignar-embarque.ts` — vive nombrado para embarques pero solo lo usa `/pedidos`; el detalle de embarque reimplementa su propia asignación contra un endpoint distinto (`PUT /api/embarques/[id]` vs. `POST /api/pedidos/[id]/enviar`). Unificar antes de que Preparation Flow necesite "asignar".

## B.11 Siguiente paso

Ver Parte A, sección A.12 (Próxima acción concreta). Esta Parte B, por ser solo auditoría/documentación de Fase 0, no requirió aprobación de usuario para existir — pero la Fase 1 (Contrato UX) sí requiere el gate de aprobación que exige `AGENTS.md` antes de producir código.
