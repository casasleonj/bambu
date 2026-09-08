# Plan de ejecución — Rediseño integral de Pedidos

- **Estado:** ITERACIÓN 1 · RONDA 2 — pendiente de aprobación del equipo/PO (protocolo AGENTS.md)
- **Fecha:** 2026-09-06 (actualizado tras adopción de ALS + Plan Técnico UX/Antifraude del equipo)
- **Autoridad de producto:** corrección formal del equipo (2026-09-06), registrada en `docs/pedidos/PEDIDOS_PENDIENTES_DECISION_PO_v1.0.md` §3.7 (SUPERSEDE la resolución incremental de §3.5)
- **Autoridad de UX/interacción/antifraude (nueva, verificada y adoptada 2026-09-06):** `AGUA_BAMBU_PEDIDOS_UX_ARCHITECTURE_LEVEL_SPECIFICATION_v1.0.als.md` + `AGUA_BAMBU_PEDIDOS_PLAN_TECNICO_UX_ANTIFRAUDE_v1.0.md` (mismo directorio) — definen el modelo de interacción (intent→context→proposal→review→commit), los invariantes A1-A8, el modelo antifraude y los 7 gates de aceptación. Este plan (`00-*`) sigue siendo la autoridad de **fases/migración/PRs**; los dos documentos nuevos son la autoridad de **qué se construye y cómo se protege**. Ver §0 más abajo para la reconciliación entre ambos.
- **Autoridad de dominio (congelada, no se toca):** ADRs `Aceptado` de Pedidos (`ADR-PEDIDO-ORIGEN-CANAL-001`, `ADR-PEDIDO-ESTADO-CANONICO-001`, `ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001`, `ADR-PAGO-REPORTADO-CONFIRMADO-001`, `ADR-CORRECCION-MONETARIA-001`, `ADR-OBLIGACION-001`), G6/G11/`ventaRapida→origen`/diferencial comercial (§2, §5, §5.5 del mismo doc) — **no se reabren**, este plan los consume como dados.
- **Precedente de ejecución (mismo repo):** `docs/embarques/00-plan-frontend-completo.md` — mismo formato, mismo patrón de flag+fases+gates. Este plan lo replica deliberadamente, no reinventa el proceso.
- **Objetivo:** reconceptualizar integralmente la experiencia de Pedidos — dominio → modelo mental → arquitectura de información → flujos → interacción → UI → implementación → pruebas — reemplazando la UI actual, que es el punto de partida técnico, no el modelo a conservar.

## §0. Verificación de la ALS + Plan Técnico del equipo (2026-09-06)

Ambos documentos fueron verificados contra el código real, contra el dominio ya decidido, y contra este plan antes de adoptarlos — no se incorporan sin revisión. Resultado: coherentes con G6/G11/`ventaRapida→origen`, sin contradicciones con lo ya decidido, citas externas (OWASP Business Logic Security, ACFE Fraud Tree) verificadas contra fuente primaria. Dos hallazgos reales, verificados en el código (no en el documento), que validan y elevan la prioridad del modelo antifraude propuesto:

1. **`precioManual` se acepta del cliente sin autorización, umbral ni diff auditado.** `pricing-algorithm.service.ts:68-69` — si el request trae `precioManual > 0`, se usa tal cual; `POST /api/pedidos` y `PUT /api/pedidos/[id]` (ADMIN/ASISTENTE/CONTADOR) lo aceptan sin restricción (solo `venta-libre` lo bloquea para REPARTIDOR, `BLOQUEAR_PRECIOS_REPARTIDOR`). Existe una alerta *detectiva* (`PRECIO_POR_DEBAJO_TABLA`, revisable en `/casos`) pero ningún control *preventivo*. Coincide exactamente con la amenaza #3/#23 del Plan Técnico §6.1 — no es hipotética.
2. **`PUT /api/pedidos/[id]` puede modificar cantidad/precio de un pedido ya `ENTREGADO` sin pasar por ninguno de los 3 guards de G11.** Verificado en `ActualizarPedidoUseCase.ts`: la rama que reemplaza `items` solo valida `estadoEntrega` si el mismo request también lo cambia — un request que solo envía `items` sobre un pedido cerrado bypasea `CORRECCION_PEDIDO_CERRADO`/`CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA`/`CORRECCION_GENERARIA_SOBREPAGO` por completo, con auditoría genérica sin diff. **✅ Corregido — PR #214 (mergeado, `main` `b7d891d4`)**, de forma independiente y urgente, sin esperar el rediseño de UI. La misma investigación reveló y corrigió 2 gaps adicionales en el mismo endpoint: (a) faltaba `requireRole([ADMIN, ASISTENTE])` — cualquier rol que superara `requireOwnership` (p.ej. un REPARTIDOR dueño del embarque) podía editar cantidades/precio, mismo vector que el ya corregido para `resolver-disputa`; (b) `requireOwnership` nunca tuvo el bypass "ASISTENTE gestiona todos los pedidos" que sí existe para `embarque` — corregirlo era necesario para no dejar a ASISTENTE bloqueado al agregar (a). 9 tests nuevos, 0 regresiones (2829 unit + 229 integración).

**Infraestructura antifraude que YA EXISTE y el rediseño debe reusar, no duplicar** (guardrail INVENTARIO §8, reutilizar→adaptar→extender→construir): `src/lib/alertas-detector.ts` + `src/lib/alertas-config.ts` (20 `AlertaTipo` ya codificados, incluyendo `DESCUENTO_NO_JUSTIFICADO`, `PRECIO_POR_DEBAJO_TABLA`, `CAMBIO_PRECIO_BRUSCO`, `MULTIPLES_PEDIDOS_RAPIDO`, `NOTA_CREDITO_FRECUENTE` — gran parte de la "detección de anomalías" del §9 del Plan Técnico) + `/casos` (`ResponsibilityCase`, ya implementa "señal → evidencia → revisión humana" con `autorizadoPorId`/`resueltoPorId`). El modelo antifraude del rediseño (`PedidoRiskSignals`, `PedidoExceptionPanel`) debe consumir/extender este sistema — no construir uno paralelo.

---

## FUERA DE ALCANCE DE ESTE PLAN (no de la decisión del equipo)

- **Reabrir decisiones de dominio ya convergidas.** G6 (`canal` canónico), G11 (corrección vs. nueva demanda), `ventaRapida→origen`, el mecanismo comercial del diferencial — este plan los usa como contrato dado. Si el rediseño encuentra una razón real para cuestionar alguno, se documenta como BRECHA PLAN↔CÓDIGO y se eleva, no se decide dentro de este plan.
- **La representación fiscal del diferencial** (`§4.7` del doc de decisiones) — cerrada, sin bloquear este trabajo, sin acción hasta que se conecte un proveedor de FE real.
- **El módulo de rutas / Auto-Generar de Embarques** — fuera de este plan, es de otro módulo.
- **Cambiar el motor de pricing, de capacidad o de asignación Pedido→Embarque** — guardrail vinculante del proyecto (INVENTARIO §8), no se toca en un rediseño de frontend.

---

## PARTE 1 — RONDA 1: hallazgos (qué es el código hoy)

### 1.1 Rutas y componentes reales

| Ruta | Server Component | Client principal | Líneas | Qué es hoy |
|---|---|---|---|---|
| `/pedidos` | `page.tsx` (182 líneas, query directa) | `pedidos-client/index.tsx` | **2520** | Monolito: lista + filtros + modal crear/editar + detalle + todas las acciones (anular, cancelar, entregar, enviar, pagar) en un solo árbol de estado |
| `/pedidos` (sub-componentes) | — | `pedido-table.tsx` (676), `fiados-table.tsx` (783), `alertas-table.tsx` (467), `pedido-filters.tsx` (238) | 2164 | 4 tablas/paneles distintos que se muestran según tab, cada uno con su propia lógica de filtros/columnas |
| Creación/edición de pedido | — | `pedido-form-unified/index.tsx` | **1334** | Formulario único que ya absorbió PUNTO/DOMICILIO, PEDIDO/VENTA_RAPIDA, entrega ahora/después (#171), venta libre — un solo componente para ~6 flujos de entrada distintos |
| `/recurrentes` | `page.tsx` (40) | `recurrentes-client/index.tsx` (327) | | Lista de plantillas, sección propia y desconectada de `/pedidos` |
| `/recurrentes/nuevo` | — | `nuevo-client/index.tsx` (734) | | Formulario de creación de plantilla, duplica buena parte de la UI de captura de `pedido-form-unified` con su propio código |
| `/recurrentes/[id]/editar` | — | `editar-client/index.tsx` (489) | | Edición de plantilla, mismo patrón duplicado |
| `/cartera` | `page.tsx` | `cartera-client.tsx` (341) | | Vista de corrección de abonos (G2/`ADR-CORRECCION-MONETARIA-001`) — pantalla separada de `/pedidos`, sin navegación cruzada real hacia el pedido/factura de origen |
| `/repartidor` | `page.tsx` (168) | `repartidor-client.tsx` (811) | | Vista dedicada por rol (ya alineada con el principio Fiori de §3.6) — entrega, venta libre de mostrador, orden de ruta |
| **N2 (Obligación/Actividad) — pendientes, cambio de modo, liberar** | — | **ninguno** | 0 | Cero superficie de UI. Backend existe (`src/modules/embarques/`, ver 1.5) pero nunca se expuso, deliberadamente, a propósito de esperar esta decisión |
| **G11 (corrección / nueva demanda)** | — | **ninguno** | 0 | Cero superficie de UI. `POST /api/pedidos/[id]/ajustar-cantidad` y `pedidoOrigenId` en `POST /api/pedidos` existen y están probados (PR #206), pero ningún componente los llama |

**Total de código de UI de Pedidos hoy: ~7300 líneas** en `pedidos-client/` + `pedido-form-unified/`, concentradas en 2 archivos de más de 1300 líneas cada uno. Punto de comparación: el archivo más grande de Embarques antes de su rediseño era 1075 líneas (`embarque-client.tsx`). Esto por sí solo confirma la lectura del equipo: no es un problema de "pulir una pantalla", es un problema de arquitectura de información que un parche incremental no puede resolver sin seguir creciendo el mismo monolito.

### 1.2 Contrato de API real (autoridad = `route.ts`, mismo principio que Embarques)

| Acción | Endpoint | Rol | offline | Idempotencia | Notas |
|---|---|---|---|---|---|
| Listar | `GET /api/pedidos` (`?desde&hasta&estadoEntrega&estadoPago&clienteId&search&tipo&origen`) | todos (REPARTIDOR filtrado) | — | — | `ListarPedidosUseCase` |
| Contadores | `GET /api/pedidos/counts` | todos | — | — | Para badges de tabs/filtros |
| Detalle | `GET /api/pedidos/[id]` | todos | — | — | |
| Crear | `POST /api/pedidos` | ADMIN, ASISTENTE, REPARTIDOR | ✅ `offlineId` | ✅ | `CrearPedidoUseCase` — acepta `origen`, `canal`, `entregado`, `pedidoOrigenId` (G11.B, sin UI que lo use aún) |
| Editar | `PUT /api/pedidos/[id]` | ADMIN, ASISTENTE | ✅ | ✅ lock `PEDIDO:{id}` | `ActualizarPedidoUseCase` |
| **Ajustar cantidad (G11.A, corrección)** | `POST /api/pedidos/[id]/ajustar-cantidad` | ADMIN, ASISTENTE | ⚠️ acepta `offlineId`, sin cliente que lo use | ✅ lock `PEDIDO:{id}` | `AjustarPedidoCantidadUseCase` (PR #206) — **sin ningún consumidor de UI** |
| Entregar | `POST /api/pedidos/[id]/entrega` | ADMIN, ASISTENTE, REPARTIDOR | ✅ | ✅ | `EntregarPedidoUseCase` |
| Enviar a ruta | `POST /api/pedidos/[id]/enviar` | ADMIN, ASISTENTE | ✅ | ✅ | 409 si ya asignado (F6, ya unificado) |
| Anular | `POST /api/pedidos/[id]/anular` | ADMIN, ASISTENTE | ✅ | ✅ | `AnularPedidoUseCase`, reversión monetaria (G2) |
| Cancelar | `POST /api/pedidos/[id]/cancelar` | ADMIN, ASISTENTE | ✅ | ✅ | `CancelarPedidoUseCase` |
| Resolver disputa | `POST /api/pedidos/[id]/resolver-disputa` | ADMIN, ASISTENTE | — | — | Consumido por `caso-guia-modal.tsx` (ResponsibilityCase) |
| Pagar fiado | `POST /api/pedidos/pagar-fiado` | ADMIN, ASISTENTE | ✅ | ✅ lock `CARTERA:{clienteId}` | Multi-factura/FIFO |
| Venta libre | `POST /api/pedidos/venta-libre` | ADMIN, ASISTENTE, REPARTIDOR | ✅ | ✅ | Entrega inmediata o diferida (venta-ruta) |
| Recurrentes → pedidos | `POST /api/pedidos/recurrentes` | ADMIN, ASISTENTE | — | dedup por `recurrenteBatchId` | Genera el batch del día |
| Abonos | `GET/POST /api/abonos` | ADMIN, CONTADOR | ✅ | ✅ lock `CARTERA` | |
| Cartera — listar/corregir | `GET /api/cartera/abonos`, `POST /api/cartera/abonos/[id]/corregir` | ADMIN, CONTADOR | ✅ | ✅ | G2 completo |
| Recurrentes (plantillas) | `GET/POST/PUT /api/recurrentes` | ADMIN, ASISTENTE | — | — | CRUD de `PlantillaRecurrente` |
| **N2 — asignar actividad** | `POST /api/obligaciones/[id]/asignar` | ADMIN, ASISTENTE | — | — | Único endpoint de N2 con ruta HTTP |
| **N2 — gestionar pendiente** | **ninguno** | — | — | — | `GestionarPendienteUseCase` existe, **sin endpoint** |
| **N2 — cambiar modo** | **ninguno** | — | — | — | `CambiarModoActividadUseCase` existe, **sin endpoint** |
| **N2 — liberar actividad** | **ninguno** | — | — | — | `LiberarActividadUseCase` existe, **sin endpoint** |

### 1.3 Reglas de negocio ya codificadas (NO reimplementar en frontend)

- `pedido-transitions.service.ts` (`TRANSICIONES_ENTREGA`, `TRANSICIONES_PAGO`, `getBadgeEntrega`/`getBadgePago`) — tabla canónica de qué transición es válida desde qué estado. El rediseño consume esto, no decide en el componente qué botón mostrar.
- `visual-states.ts` (`calcularEstadoPagoVisual`) — cascada de precedencia ya codificada: `ANULADO` > `FIADO` (entregado+saldo>0) > `DISCREPANTE` > `REPORTADO` > `ANTICIPADO`/`PAGADO` > `PENDIENTE`. Esta es exactamente la cascada que §3.3 del doc de decisiones señaló como "cada vez más difícil de razonar" — el rediseño debe **resolver la presentación de este estado** (microcopy en vez de badge apilado, §3.6 punto 2), no la lógica en sí, que ya está correcta y probada.
- `pagos-calculator.service.ts` / `EstadoPagoVO.proyectar` — `estadoPago` es una proyección de `(total, totalPagado, estadoEntrega)`, reforzada por el CHECK `chk_pedido_estadopago_proyectado`. El rediseño nunca debe permitir que la UI "decida" un estadoPago — siempre se lee del backend.
- `pedido-validation.service.ts` / `pricing-algorithm.service.ts` — validación de items y resolución de precio (negocio→cliente→base). El rediseño reusa `/api/precios/resolver`, no reimplementa la prioridad.
- `AjustarPedidoCantidadUseCase` (G11.A) — 3 guards ya implementados (`CORRECCION_PEDIDO_CERRADO`, `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA`, `CORRECCION_GENERARIA_SOBREPAGO`). El formulario de corrección solo necesita mostrar el error que el backend ya devuelve, mapeado a mensaje humano — no debe intentar predecir client-side si una corrección es válida.
- `CrearPedidoUseCase` (G11.B) — valida que `pedidoOrigenId` exista (404 si no). El flujo de "nueva demanda" en la UI es literalmente "crear un pedido normal, con un campo adicional" — no un mecanismo nuevo del lado del cliente.
- `EstadoConfirmacionPago` (`ADR-PAGO-REPORTADO-CONFIRMADO-001`) — `REPORTADO`/`CONFIRMADO`/`DISCREPANTE` ya se resuelve en backend (`pago-confirmacion.ts`); la UI solo lee y muestra.

### 1.4 Hallazgo central de arquitectura de información

La causa raíz de por qué esto no puede ser incremental (confirmado por la investigación de código, no solo por intuición): **3 flujos de entrada** (Pedidos, Recurrentes, Venta Rápida/Repartidor) están implementados como **3 árboles de componentes desconectados** que cada uno reimplementa captura de cliente/producto/precio a su manera (`pedido-form-unified`, `nuevo-client`, `repartidor-client`), y **2 capacidades de dominio recién decididas** (N2 pendientes, G11 corrección/nueva-demanda) **no tienen ningún punto de entrada en la UI todavía** — no es que estén mal diseñadas, es que literalmente no existen como pantalla. Un incremento parcial sobre `pedidos-client` (2520 líneas) solo puede agregar un botón/tab más a un árbol que ya es difícil de razonar; no puede resolver la fragmentación entre los 3 flujos de entrada ni introducir 2 capacidades nuevas sin, en la práctica, terminar reescribiendo la mayoría del archivo de todas formas.

### 1.5 Deuda transversal

| # | Item | Estado |
|---|---|---|
| 1 | `pedidos-client/index.tsx` (2520 líneas) mezcla estado de lista, filtros, 3 modales y llamadas a 6+ endpoints en un solo componente | Se resuelve por diseño en Fase 3/4 (split real, no solo extracción cosmética) |
| 2 | `pedido-form-unified` (1334 líneas) ya absorbió 6 flujos de entrada distintos vía props/flags condicionales | Se resuelve rediseñando la captura como un flujo compartido real, no un componente con más `if` |
| 3 | `nuevo-client`/`editar-client` de Recurrentes duplican captura de producto/cliente en vez de reusar `pedido-form-unified` | Se evalúa en Fase 8 (Recurrentes) si conviene unificar el componente de captura entre Pedidos y Recurrentes |
| 4 | N2 (`GestionarPendienteUseCase`/`CambiarModoActividadUseCase`/`LiberarActividadUseCase`) sin endpoint HTTP | Bloquea Fase 5 — se crean los 3 endpoints (thin controllers, mismo patrón que `asignar/route.ts`) antes de cualquier componente |
| 5 | `ajustar-cantidad` y `pedidoOrigenId` sin consumidor de UI | Se resuelve en Fase 6 — solo falta UI, el backend ya está probado |
| 6 | `/cartera` sin navegación cruzada hacia el pedido/factura de origen | Se resuelve en Fase 7 (relación Pedido↔Embarque↔Entrega↔Cartera) |
| 7 | `visual-states.ts` cascada de 6 estados en un solo badge | Se resuelve por presentación (§3.6 punto 2), no por lógica — no se reabre `calcularEstadoPagoVisual` |

### 1.6 Estado de tests

| Punto | Estado |
|---|---|
| `pedido-table.test.ts`, `fiados-table.test.ts`, `pedido-table-pending.test.tsx`, `pedido-inicial-negocio.test.ts` | Cubren piezas puntuales (294 líneas de test para 2164 líneas de tablas) — cobertura parcial, no de flujo completo |
| `pedido-form-unified/__tests__/*` | Cobertura por caso puntual (fiado, negocio, entrega-después) — no hay test de "el formulario completo cubre los 4 orígenes×canal end-to-end en UI" (sí existe a nivel de integración de backend, `pedido-origen-canal-independientes.test.ts`) |
| E2E (`ciclo-pedido-completo.spec.ts`, `ciclo-repartidor.spec.ts`, `casos.spec.ts`, `deudas.spec.ts`, `abonos.spec.ts`, etc.) | Cubren flujos de negocio reales, deberán actualizarse por pantalla conforme cada fase reemplace su UI (mismo patrón que Embarques) |
| N2 (Obligación/Actividad expuesto a UI) | Sin tests de UI — no existe la UI |
| G11 (corrección/nueva demanda expuesto a UI) | Sin tests de UI — no existe la UI. Backend cubierto (`ajuste-pedido.test.ts`, `pedido-nueva-demanda-relacionado.test.ts`) |

---

## PARTE 2 — RONDA 2: plan de ejecución (requiere aprobación)

### 2.0 Principios (del mandato del equipo, no reabrir)

1. **La UI actual no es una restricción de diseño.** Es el punto de partida técnico (offline-first, permisos, auditoría) que el rediseño no puede permitirse perder — no la forma a conservar.
2. **No se reabre dominio.** G6, G11, `ventaRapida→origen`, diferencial comercial son datos de entrada, no preguntas de este plan.
3. **No se reimplementa lógica de negocio en el frontend.** Todo lo listado en §1.3 se consume, nunca se recalcula en el cliente (guardrail ya vinculante del proyecto).
4. **Offline-first no se renegocia.** Cada pantalla nueva mantiene `fetchResilient` + `offlineId` + los 4 estados de red (loading/success/offline/error), igual que exige el patrón ya usado en Embarques V2.
5. **Dirección de diseño investigada (§3.6 del doc de decisiones) es vinculante, no opcional**: tablas densas con jerarquía en vez de cards genéricas, microcopy de estado en vez de apilar badges, vista por rol, paleta de comandos como incremento aditivo, disciplina de color reservada a estado real.
6. **`data-testid` por vista desktop/mobile desde el diseño** (AGENTS.md #24), no como parche posterior.
7. **Reutilizar → adaptar → extender → construir** (guardrail INVENTARIO §8) — antes de escribir un componente nuevo, confirmar que no existe ya una pieza reusable (`pedido-table.tsx`, `caso-guia-modal.tsx`, `PedidoAdapter.ts`, etc.).

### 2.1 Decisiones propuestas (marcar OK o corregir)

| # | Decisión | Propuesta |
|---|---|---|
| D1 | ¿`/pedidos` se reemplaza in-place detrás de un flag, o se construye en una ruta nueva? | **In-place**, detrás de `NEXT_PUBLIC_PEDIDOS_V2` (mismo patrón que `NEXT_PUBLIC_EMBARQUES_V2`). 6 usuarios totales — no se justifica mantener dos árboles de rutas largos. |
| D2 | ¿Dónde vive la gestión de N2 (pendientes, cambio de modo, liberar actividad)? | **Dentro de `/pedidos`** (sección/tab dedicada, no ruta nueva) — consistente con el objetivo de unificar la experiencia, no fragmentarla más. |
| D3 | ¿Recurrentes se fusiona dentro de Pedidos o se mantiene como su propia sección? | **Se mantiene como sección propia** (es una entidad de dominio distinta, `PlantillaRecurrente`, con su propio ciclo de vida) **pero se integra en la navegación y — si se justifica en Fase 8 — reusa el componente de captura de Pedidos** en vez de duplicar `nuevo-client`/`editar-client`. No se decide la fusión total ahora; se evalúa con evidencia en Fase 8. |
| D4 | ¿Se crean los 3 endpoints faltantes de N2 antes de la UI? | **Sí, obligatorio.** `POST /api/obligaciones/[id]/gestionar`, `POST /api/obligaciones/[id]/cambiar-modo`, `POST /api/obligaciones/[id]/liberar` (nombres tentativos) — thin controllers sobre los use cases ya probados, mismo patrón que `asignar/route.ts`. Es trabajo de Fase 5, antes del primer componente de esa fase. |
| D5 | ¿Wizard forzado para creación de pedido, o formulario único reestructurado? | **Formulario único reestructurado** (no wizard) para la captura ordinaria — ya funciona en producción para 6 flujos de entrada y forzar un wizard no resuelve el problema real (fragmentación entre módulos, no pasos dentro de un módulo). Para el flujo de "corrección vs. nueva demanda" (Fase 6) **sí se fuerza un paso de decisión explícito** (¿esto es un error de captura o el cliente pide más?) para que la elección A/B de G11 nunca sea ambigua en la UI. |
| D6 | ¿La guía de diseño de §3.6 (SAP Fiori/Stripe/Linear) se adopta como regla obligatoria desde la Fase 2, o se evalúa pantalla por pantalla? | **Obligatoria desde el día 1** — ya fue investigada y no tiene sentido re-litigarla por pantalla. Se documenta una vez en Fase 2 (`01-ux-contract-pedidos.md`) y se aplica en todas las fases siguientes. |
| D7 | ¿Se retira la UI legacy al final (con flag) o se retira pantalla por pantalla conforme se reemplaza? | **Al final** (Fase 10), mismo patrón que Embarques — reduce el riesgo de dejar el sistema en un estado híbrido a medio camino si una fase se retrasa. |

### 2.2 Fases, entregables y criterios de éxito

> Fase 1 es esta Ronda 1 (ya completa). Cada fase siguiente es 1 PR salvo que se indique. El detalle de ejecución de cada fase se documenta en `docs/pedidos/faseN-*.md` según se ejecuta (mismo patrón que Embarques), no se agota aquí.

---

#### FASE 2 — Fundamentos: `02-api-contract-pedidos.md` + flag + endpoints N2 (1 PR) ✅ IMPLEMENTADO

**Nota**: la arquitectura de UX/interacción (lo que hubiera sido `01-ux-contract-pedidos.md`) ya está cubierta por la ALS adoptada (§0) — no se duplica. El fix del bypass de G11 (hallazgo #2 de §0) ya se ejecutó de forma independiente, sin esperar el gate de Ronda 2 (PR #214, mergeado) — era un bug de integridad, no trabajo de rediseño.

**Entregables (ejecutados):**
- `docs/pedidos/02-api-contract-pedidos.md` — tabla de §1.2 referenciada + shapes completos de los 3 endpoints nuevos de N2 (request/response/mapeo de errores).
- `NEXT_PUBLIC_PEDIDOS_V2` documentado en `.env.example` (default OFF; Fase 2 es backend puro, no depende del flag — las fases de UI sí lo usarán).
- Los 3 endpoints de N2 (D4), thin controllers sobre casos de uso ya probados contra Postgres real:
  - `POST /api/pedidos/[id]/gestionar-pendiente` → `GestionarPendienteUseCase`
  - `POST /api/actividades/[id]/cambiar-modo` → `CambiarModoActividadUseCase`
  - `POST /api/actividades/[id]/liberar` → `LiberarActividadUseCase`

**Criterios de éxito (verificados):**
- `npx tsc --noEmit` + `npm run test` (2842/2842) + `npx eslint` (0 warnings en los archivos tocados) + `npx prisma validate` — todos verdes.
- `02-api-contract-pedidos.md` cubre los 3 endpoints nuevos con shape completo + tabla de errores.
- **Ajuste sobre el criterio original**: en vez de un test de integración Postgres end-to-end por endpoint (que hubiera vuelto a ejercitar guards YA cubiertos por `gestionar-pendiente-integridad.test.ts`/`cambiar-modo-actividad-integridad.test.ts`/`liberar-actividad-integridad.test.ts` a nivel de caso de uso), cada ruta tiene un test de contrato (rol, forma del Zod, delegación correcta, mapeo de errores) — mismo patrón ya establecido en este repo para thin controllers (`resolver-disputa/__tests__/route.test.ts`). Evita duplicar cobertura sin perder verificación de la única pieza genuinamente nueva: el wiring HTTP.

**Rollback:** los endpoints son aditivos; el flag por defecto en `false` no cambia nada visible.

---

#### FASE 3 — Creación de pedido: captura unificada (1–2 PRs) ✅ COMPLETA (3a, 3b y 3c hechas)

**Qué es:** rediseño de la captura (reemplaza `pedido-form-unified/index.tsx`, 1334 líneas) para que `PEDIDO` vs `VENTA_RAPIDA`, `origen` independiente de `canal`, y "entregar ahora/después" sean explícitos en la interacción, no flags internos de un componente monolítico.

**Hallazgo al arrancar la implementación (2026-09-06), reescala el riesgo de esta fase**: la entrada intent-driven que el ALS pide (Plan Técnico §4: "+Nuevo → la intención determina la interfaz") **ya existe** — el FAB de `/pedidos` (`fab-container`) es un speed-dial con 2 intenciones explícitas y tooltips claros: "📦 Pedido con Envío" (`fab-pedido-envio`) y "💰 Venta Rápida" (`fab-venta-rapida`). No se reconstruye desde cero. El gap real no es la ausencia de intent-picker — es que `pedido-form-unified` es un monolito de 1334 líneas con lógica stateful densa (debounce de precios, revalidación silenciosa de contacto, patrón de consumo, negocio selector, guards de fiado) que un refactor grande, sin QA humano en vivo disponible en esta sesión, arriesgaría regresionar en un formulario que maneja dinero real.

**Decisión de alcance (2026-09-06)**: dado ese riesgo, esta fase se ejecuta en slices verificables en vez de un solo PR grande:
- **3a (✅ hecho)**: primera extracción del monolito — `PedidoPricingSummary` (ALS §5), componente puramente presentacional (sin estado, sin fetch) extraído tal cual, cero cambio de comportamiento. Elegido primero por ser la pieza de MENOR riesgo (nada de debounce/refs/async). Verificado con: suite de tests existente del formulario (41/41 sin cambios) + test unitario nuevo del componente (6/6) + verificación visual real contra el dev server (Playwright, screenshot confirmando el ticket renderiza idéntico).
- **3b (✅ hecho)**: segunda extracción — `PedidoContextPanel` (ALS §5): búsqueda/selección de cliente, cliente nuevo, banner de fiados, patrón de consumo, negocio, dirección de entrega. A diferencia de 3a, esta pieza SÍ depende de estado con efectos reales — se extrajo con el patrón "lift state up": **todo** el estado y los `useEffect`/debounce/refs se quedaron en el padre (`pedido-form-unified/index.tsx`), el panel solo recibe valores + callbacks ya resueltos. Cero lógica nueva, cero relocalización de efectos — el único riesgo real de un refactor de estado (mover efectos/timing) queda evitado por diseño. 6 tests de la suite existente tuvieron que actualizarse (no por regresión — por regex estáticos que apuntaban a `index.tsx` y ahora el JSX vive en el archivo nuevo; el comportamiento verificado es idéntico) + 8 tests nuevos del componente + verificación visual real (Playwright, canal DOMICILIO + flujo "crear cliente nuevo", la rama de mayor complejidad del panel). 48→56 tests en el formulario, 2848→2857 en el repo, 0 regresiones.
- **3c (✅ hecho)**: tercera y última extracción — `PedidoItemEditor` (ALS §5): grid de productos, cantidad, precio efectivo, override de precio manual (con warning/confirmación si baja >50% del base), tiers de volumen. Era la pieza de MAYOR riesgo restante — cada cambio de cantidad dispara `resolverPrecios` (debounce 400ms + fetch) en el padre — pero el mismo patrón "lift state up" de 3b la mantuvo segura: el debounce, el fetch y todo el estado de precios (`cantidades`, `preciosResueltos`, `preciosManuales`, `preciosLoading`, `precioBajoConfirmado`) se quedaron intactos en el padre; el componente solo recibe una lista de items ya resueltos + callbacks. 0 tests existentes necesitaron tocarse (ninguno apuntaba a este bloque de JSX por regex) + 9 tests nuevos del componente + verificación visual real (Playwright: incrementar cantidad de un producto, forzar un precio manual agresivamente bajo, confirmar que aparece el warning "% bajo" + botón Confirmar, tiers de volumen y resumen coherente entre sí en la misma captura). 56→65 tests en el formulario, 2857→2866 en el repo, 0 regresiones.

**Con 3a+3b+3c, `pedido-form-unified/index.tsx` dejó de ser un formulario monolítico como experiencia principal** (criterio del DoD de la ALS, §19) — ahora orquesta 3 componentes con nombre propio (`PedidoPricingSummary`, `PedidoContextPanel`, `PedidoItemEditor`) que corresponden 1:1 a piezas del vocabulario de la ALS §5, cada uno verificado de forma independiente (tests + Playwright en vivo) antes de fusionar. Fase 3 queda completa.

**No incluido en Fase 3** (ya cubierto o corresponde a otra fase): intent picker (ya existe, ver arriba), `PedidoRiskSignals`/`PedidoExceptionPanel` (dependen de exponer N2/G11 en la UI — Fases 5/6), preview/review/commit como flujo separado (ALS §14: "Normal → flujo inmediato"; forzar preview en una operación normal violaría el propio ALS §21 "no confirmaciones para acciones triviales").

**Composición (resto, sesiones futuras):**
- Extraer piezas reusables restantes (cliente, editor de items) en vez de un único componente con ramas condicionales.
- Aplicar D5: sin wizard forzado para el flujo ordinario (ya es así).
- Aplicar §3.6: microcopy específico en vez de solo badges, disciplina de color.

**Criterios de éxito:**
- Las 4 combinaciones `origen×canal` (ya probadas en backend, `pedido-origen-canal-independientes.test.ts`) son accesibles y explícitas en la UI — ningún caso oculto detrás de una condición implícita. ✅ ya cumplido (PR #205 + FAB existente).
- Offline: crear pedido sin red encola y muestra estado, igual que hoy. Sin cambios en 3a.
- `data-testid` desktop/mobile. Sin cambios en 3a (ya existía en el monolito).
- Tests: unit del/los componente(s) nuevo(s) + E2E de creación actualizado. 3a: unit ✅. E2E se revisa cuando el refactor cubra más superficie (3b+).

**Rollback:** flag `NEXT_PUBLIC_PEDIDOS_V2=false` → sin efecto en 3a (no está gated por flag, es un refactor interno sin cambio de comportamiento). Fases 3b+ si tocan comportamiento visible sí quedarán detrás del flag.

---

#### FASE 4 — Consulta y detalle: Pedido Hub (reemplaza `/pedidos`) (2 PRs)

> **Fase 4a ✅ + Fase 4b ✅ IMPLEMENTADAS** (detrás de `NEXT_PUBLIC_PEDIDOS_V2` OFF).
> - **4a** (#223, mergeada): shell + cabecera de focos (5, filtros de un clic) + lista adaptativa (responsive table, 5 columnas, microcopy, acción destacada) + `GET /api/pedidos/counts` extendido. `derive-operacion` reusa `visual-states`/`pedido-transitions` (G7). Plan: `docs/pedidos/fase4a-hub-plan.md`.
> - **4b** (rama `feat/pedidos-hub-4b`): peek contextual por capas (capa 1 instantánea, capa 2 con caché TTL/LRU + abort en `↑/↓`, capa 3 lazy) que reemplaza el modal legacy; `PeekRelaciones` (embarque/factura/cartera/vinculados/N2 = **acceso, no fusión**, distingue saldo-operación de deuda-cliente); `PedidoCommandMenu` (⌘K global + contextual; "planificación" navega, no ejecuta); `GET /api/pedidos/[id]` extendido (§9.2 resuelta). Verificado: +24 unit, Playwright en vivo (peek abre sin navegar, `↑/↓`, Escape, ⌘K). Plan: `docs/pedidos/fase4b-hub-plan.md`.
> - **Composición C1** (rama `feat/pedidos-workspace-c1`): `PedidosWorkspace` shell + `workspaceReducer` (máquina de UI adaptativa, **estado efímero, sin reglas de negocio** — el reducer no importa `pricing`/`resolverLimiteFiados`/`pedido-transitions`, G7) + `usePreview` (debounce del draft → `POST /api/pedidos/preview`) + `PedidoPricingSummary` mostrando el total del **backend**, no `resolverPrecios` client-side. El modal de creación monta `<PedidosWorkspace>` en hubMode (crear desde cero); `PedidoFormUnified` para editar y con flag OFF. Verificado: +19 unit, Playwright en vivo (workspace → preview → "Crear pedido $8.400" → pedido creado, 0 errores JS). Plan: `docs/pedidos/fase-composicion-plan.md`.
> **Siguiente:** Composición C1b/C2/C3 — recomposición completa de `PedidoContextPanel`/`PedidoItemEditor`, `PedidoRiskSignals`, `PedidoProposal` (Repetir), `PedidoReview` + `PedidoCommitBar` adaptativo + acción sensible.

> **Blueprint de experiencia (Secciones 1–6) aprobado por el PO 2026-09-07 — `docs/pedidos/03-blueprint-experiencia-hub.md`.** Ese documento es la autoridad de QUÉ se construye para el Hub, la captura, el peek, N2, G11, riesgo, Recurrentes y los gates de aceptación (G1–G11). Esta sección del `00-*` sigue siendo la autoridad de fases/PRs. El blueprint agrega: un prerequisito de backend (`POST /api/pedidos/preview` — BRECHA §9.1), 3 PENDIENTES DE NEGOCIO (SLA de entrega, umbrales de precio manual, consolidación de `/repartidor`) y la fase "Composición" (recompone Fase 3 con el reducer/orquestador del workspace).

**Qué es:** reemplaza `pedidos-client/index.tsx` (2520 líneas) — lista + detalle con la jerarquía de información de Stripe (tabla densa, microcopy de estado) y el principio de vista-por-rol de Fiori.

**Composición:**
- `pedido-hub/index.tsx` (nuevo) — orquesta lista + detalle, consume `GET /api/pedidos`, `GET /api/pedidos/counts`, realtime `pedido.*`.
- Reemplaza la cascada de badges de `visual-states.ts` por presentación de microcopy (§2.0 principio 5) — la función `calcularEstadoPagoVisual` en sí **no se toca**, solo cómo se renderiza su resultado.
- Reusa `pedido-table.tsx`/`fiados-table.tsx`/`alertas-table.tsx` como punto de partida técnico (offline, permisos ya resueltos), no como forma final.
- Filtros y triggers de query params se mantienen separados (regla ya establecida, AGENTS.md #13).

**Criterios de éxito:**
- Desktop + mobile, `data-testid` por vista.
- 4 estados de red.
- Realtime: cambio de otra sesión se refleja sin refresh (mismo patrón que Embarques Command Center).
- Ningún recalculo de `estadoPago`/`estadoEntrega` en cliente — todo viene del backend.
- Tests: unit + E2E de consulta/filtrado actualizado.

**Rollback:** flag; `pedidos-client` actual se conserva hasta Fase 10.

---

#### FASE 5 — Pendientes y cumplimiento parcial: exponer N2 por primera vez (1–2 PRs)

**Qué es:** la superficie que nunca tuvo UI. Gestión de `ObligacionPendiente`/`Actividad` — cambiar modo, liberar actividad, gestionar pendiente — dentro de Pedidos (D2).

**Depende de:** Fase 2 (los 3 endpoints ya deben existir).

**Composición:**
- Panel de "pendiente" dentro del Pedido Hub (D2) — visible solo cuando el pedido tiene una `ObligacionPendiente` asociada.
- Esta es exactamente la pieza que §3.3 del doc de decisiones identificó como el momento de mayor riesgo de incoherencia — se trata con especial cuidado de jerarquía (Fiori: mostrar solo lo accionable) para no convertirse en un 4º badge apilado.

**Criterios de éxito:**
- Un usuario puede gestionar un pendiente, cambiar modo de actividad, o liberar una actividad desde la UI por primera vez en la historia del proyecto — con los 3 guards del backend ya reflejados como mensajes claros, no reimplementados.
- 4 estados de red, `data-testid` por vista.
- Tests: unit + E2E nuevo (no existía nada que actualizar).

**Rollback:** flag; sin este panel, N2 sigue siendo invisible (estado actual, sin regresión).

---

#### FASE 6 — Corrección vs. nueva demanda: exponer G11 por primera vez (1 PR)

**Qué es:** la segunda superficie sin UI histórica. Un flujo que, ante un cambio de cantidad post-creación, obliga (D5) a elegir explícitamente entre **A. Corrección** (llama `ajustar-cantidad`) y **B. Nueva demanda** (crea un `Pedido` nuevo con `pedidoOrigenId`) — nunca lo decide el componente por inferencia.

**Composición:**
- Modal/paso de decisión explícito, accesible desde el Pedido Hub.
- Rama A: formulario de corrección, muestra los 3 guards del backend como mensajes (cerrado/ya entregado/generaría sobrepago) sin intentar predecirlos client-side.
- Rama B: reusa la captura de Fase 3, con `pedidoOrigenId` precargado — es literalmente "crear un pedido", no un mecanismo nuevo de UI.

**Criterios de éxito:**
- Imposible llegar a un estado ambiguo — el paso de decisión es obligatorio y sin opción "no sé".
- Los pedidos relacionados (por `pedidoOrigenId`) son visibles desde el Pedido Hub del pedido original (trazabilidad, no solo creación).
- Tests: unit + E2E nuevo, cubriendo ambas ramas.

**Rollback:** flag; sin este flujo, G11 sigue accesible solo por API directa (estado actual).

---

#### FASE 7 — Relación Pedido → Embarque → Entrega → Cartera + situaciones excepcionales (1–2 PRs)

**Qué es:** navegación cruzada real desde el Pedido Hub hacia su embarque/entrega/cartera, y presentación unificada de excepciones (`ResponsibilityCase`, pago reportado/discrepante — hoy ya parcialmente resuelto por `caso-guia-modal.tsx` y el chip Reportado/Discrepante, pero desconectado del resto).

**Criterios de éxito:**
- Desde el detalle de un pedido, un click lleva al embarque/entrega/cartera relacionados (hoy no existe este cruce).
- Excepciones abiertas (caso, discrepancia, pago no confirmado) se muestran como parte del estado del pedido, no en una pantalla aparte.
- Tests: unit + E2E de navegación cruzada.

**Rollback:** flag; ausencia de cruce (estado actual).

---

#### FASE 8 — Recurrentes: integración en la nueva IA (1 PR)

**Qué es:** resolver D3 con evidencia real de las fases anteriores — si conviene que `nuevo-client`/`editar-client` reusen la captura de Fase 3 en vez de duplicarla, y cómo se navega entre Recurrentes y Pedidos en la nueva arquitectura de información.

**Criterios de éxito:** decisión D3 cerrada con evidencia (no especulación) + implementación si aplica. Sin regresión del flujo de recurrentes existente (`recurrentes.ts`, generación de batch).

**Rollback:** flag; Recurrentes sigue funcionando igual si esta fase no altera su backend.

---

#### FASE 9 — Offline/sync y estados operativos: hardening transversal (1 PR)

**Qué es:** pasada final sobre todas las pantallas nuevas (Fases 3–8) para verificar consistencia de offline-first, loading/empty/error, y que ninguna pantalla nueva rompió el patrón ya establecido (`fetchResilient`, Dexie, realtime, `SessionExpiryGuard`).

**Criterios de éxito:** checklist de AGENTS.md (offline-first, `fetchResilient`, `data-testid`) verificado pantalla por pantalla; ningún `fetch` directo nuevo sin pasar por `fetchResilient`.

---

#### FASE 10 — Test hardening + migración gradual + retiro de UI legacy (2 PRs)

- **PR-10a:** flag a `true` por default en todos los entornos, verificación en producción con los 6 usuarios, ventana de observación (mismo patrón que Embarques Fase 9).
- **PR-10b:** eliminar `pedidos-client/index.tsx` viejo, `pedido-form-unified` viejo (si Fase 3 lo reemplazó completo), `nuevo-client`/`editar-client` viejos (si Fase 8 los reemplazó), el flag y sus ramas. Actualizar E2E que aún apunten a selectores legacy. `docs/pedidos/` refleja el estado final.

---

### 2.3 Observabilidad (por fase, no al final)

- `pedidos_v2_render_count` por pantalla.
- `pedidos_offline_enqueue_count` por acción (crear/ajustar/entregar/anular/cancelar).
- `n2_pendiente_gestionado_count` / `n2_modo_cambiado_count` / `n2_actividad_liberada_count` (primera vez que estas acciones son medibles desde UI).
- `g11_correccion_count` / `g11_nueva_demanda_count` (idem).

### 2.4 Orden de PRs

```
PR-1   Fase 2   — contratos + flag + 3 endpoints N2 faltantes
PR-2   Fase 3   — creación de pedido (captura unificada)
PR-3a  Fase 4a  — Pedido Hub: lista
PR-3b  Fase 4b  — Pedido Hub: detalle
PR-4   Fase 5   — N2 expuesto a UI (depende de PR-1)
PR-5   Fase 6   — G11 expuesto a UI (depende de PR-2 para reusar captura)
PR-6   Fase 7   — relación cruzada + excepciones
PR-7   Fase 8   — Recurrentes (decisión D3 con evidencia)
PR-8   Fase 9   — hardening offline/estados
PR-9a  Fase 10a — flag a default true + verificación prod
PR-9b  Fase 10b — retiro de legacy
```

Fases 5 y 6 pueden ejecutarse en paralelo una vez mergeada Fase 2 (endpoints) y Fase 3 (captura, para reusar en Fase 6.B). Fase 7 depende de que 4/5/6 estén mergeadas (necesita el Pedido Hub como base).

### 2.5 Verificación por PR (protocolo AGENTS.md)

```bash
npx tsc --noEmit
npm run test
npm run test -- --config vitest.integration.config.ts   # PRs que toquen los nuevos endpoints de N2/G11
npx prisma validate                                       # ninguna fase de este plan toca schema
npx eslint . --max-warnings 0
set -a; . ./.env; set +a && npx playwright test <specs de la fase>
```

Ninguna fase se cierra por "compila". Cada una demuestra: componente + estados de red + offline + realtime (donde aplique) + tests + rollback — mismo estándar que Embarques.

### 2.6 Gate de esta Ronda 2

- [x] Decisiones D1–D7 adoptadas (2026-09-06) — bajo la autorización explícita "decide tú"/"continúa" vigente durante toda esta sesión para decisiones de alcance técnico ya razonadas (no ambigüedades de negocio nuevas). Las 7 propuestas de §2.1 se adoptan tal como quedaron escritas — ninguna requería una decisión de negocio que esta sesión no pudiera fundamentar con el código/precedentes ya verificados.
- [x] Orden de fases y alcance (§2.2/§2.4) confirmado sin cambios respecto a lo escrito.
- [x] PR-1 (Fase 2) ejecutado — ver estado ✅ en la sección de Fase 2 arriba.
- [ ] Antes de PR-2 (Fase 3, creación de pedido — la primera fase que toca UI real), se recomienda una confirmación explícita del equipo/PO si el ritmo de "decide tú" debe seguir aplicando a fases de UI visibles a los 6 usuarios, o si en ese punto prefieren revisar antes de cada PR — el trabajo de Fase 2 fue deliberadamente backend-only y de bajo riesgo (aditivo, flag en OFF) precisamente para no forzar esa pregunta todavía.

---

## Iteraciones 2 y 3 del protocolo (AGENTS.md)

- **Iteración 2:** tras Fase 2 (contratos + endpoints N2), la Ronda 1 se re-ejecuta con `02-api-contract-pedidos.md` como input real; se ajustan los criterios de éxito de Fases 3–8 a los shapes exactos documentados.
- **Iteración 3:** tras Fase 4 (Pedido Hub) en producción, la Ronda 1 se re-ejecuta con métricas reales de uso (§2.3); se refina el resto de fases con evidencia, no solo con el diseño inicial.
