# Blueprint de experiencia — Pedido Hub (rediseño integral, Fase 4+)

- **Estado:** BASE DE IMPLEMENTACIÓN — Secciones 1–6 aprobadas por el PO (2026-09-07), con correcciones incorporadas ronda por ronda.
- **Fecha:** 2026-09-07
- **Autoridad de UX/interacción:** `AGUA_BAMBU_PEDIDOS_UX_ARCHITECTURE_LEVEL_SPECIFICATION_v1.0.als.md` (ALS) + `AGUA_BAMBU_PEDIDOS_PLAN_TECNICO_UX_ANTIFRAUDE_v1.0.md` (Plan Técnico). Este documento **materializa** ambos para el Pedido Hub; no los reemplaza.
- **Autoridad de fases/migración/PRs:** `00-plan-frontend-rediseno-integral.md`.
- **Autoridad de contratos de API:** el código real (`route.ts`) + `02-api-contract-pedidos.md`.
- **Autoridad de dominio (congelada, no se reabre):** ADRs `Aceptado` de Pedidos (incl. `ADR-OBLIGACION-001`), G6 (`canal` canónico), G11 (corrección vs nueva demanda), **N2 (Obligación/Actividad/diferencial — backend cerrado #194–#198)**, `ventaRapida→origen`, independencia `origen × canal`, `CONSUMIDOR_FINAL` como ausencia de cliente real. El blueprint los **consume**; no altera ninguno.

## §0. Cómo leer este documento

Cada elemento del blueprint se especifica con la cadena de trazabilidad:

**Decisión** (de dónde viene) → **Especificación** (qué se construye, sin ambigüedad) → **Implementación** (fase + archivos) → **Pruebas** (qué las verifica) → **Verificación** (cómo se comprueba que cumple).

Reglas rectoras que aplican a **todo** el blueprint:

- **System prepares; user decides.** El sistema infiere, calcula, precarga, propone y prepara. El usuario conserva la decisión final sobre toda acción con impacto de negocio o financiero.
- **La fricción es proporcional al riesgo y al impacto.** El flujo `INTENT → CONTEXT → PROPOSAL → REVIEW → COMMIT` es adaptativo: para una operación normal es `intención → propuesta → confirmar`; `REVIEW` / `IMPACT` / `AUTHORIZATION` aparecen solo cuando el riesgo, el impacto o la incertidumbre lo justifican.
- **Refactorización ≠ rediseño.** #216–#219 (Fases 2–3) es trabajo técnico válido y se conserva; las fases siguientes deben **demostrar el modelo mental nuevo**, no reorganizar la UI existente.
- **Responsive ≠ dos aplicaciones.** Mismo modelo mental, mismas reglas, mismas derivaciones, mismas transiciones, mismos permisos, misma semántica de acciones. Solo cambia la presentación.
- **Foco ≠ categoría de dominio. Acción contextual ≠ botón genérico.**
- **La estrategia de carga nunca degrada la capacidad del usuario para tomar la decisión que la interfaz le solicita.**
- **La UI nunca es el control de seguridad.** Toda regla con impacto financiero o de integridad vive en backend/DB/transacción. La UI guía, explica, previene errores y solicita autorización.
- **Ninguna regla de negocio se duplica en frontend** (transiciones, pricing, riesgo, diferencial, guards G11).
- **No se introduce IA por apariencia de modernidad.** La inteligencia viene primero de contexto, historial, reglas, permisos y estado real.
- **Mecanismos (command menu, peek, progressive disclosure, lazy/partial loading, prefetch) se usan solo cuando reducen carga cognitiva, navegación, espera o errores** — nunca como decoración ni checklist tecnológico.

---

## §1. Modelo mental + mapa de intenciones

### 1.1 Cambio de modelo mental

| | Hoy | Nuevo |
|---|---|---|
| Unidad | "un registro en la tabla de pedidos" | "una operación comercial y su estado" |
| El usuario piensa en | **dónde está** la información (¿tab Hoy? ¿Fiados? ¿Recurrentes? ¿Casos? ¿Cartera?) | **qué quiere hacer** (encontrar / crear / repetir / corregir / continuar / revisar) |
| Únicos, Recurrentes, Alertas, Fiados, Casos | destinos de navegación | **facetas** de la misma operación, en su contexto |
| Estado | badges apilados (`[ENTREGADO][FIADO][VENCIDO]`) | microcopy legible (*"Entregado · debe $12.000 · 3 días"*) |

**Decisión:** Plan Técnico §1, §19; ALS §22; corrección PO Sección 1 (2026-09-07).

**Principios verificables:**

1. **Una operación, un lugar — de acceso, no de fusión.** Pedido, Embarque, Factura, Cartera y Actividad siguen siendo entidades de dominio independientes. Desde la operación el usuario **accede al contexto relacionado por peek/detalle sin abandonar su contexto** ni reconstruir información navegando árboles. No se fusiona nada.
2. **El estado se lee, no se descifra.** `calcularEstadoPagoVisual` (`src/modules/pedidos/presentation/visual-states.ts`) no se toca; cambia su presentación (microcopy en vez de badge apilado).
3. **El sistema llega con una propuesta.** Crear/repetir arranca con un draft armado; el usuario confirma o ajusta.
4. **Origen, canal, entrega y pago son semánticamente independientes y se presentan contextualmente.** No son cuatro controles visuales permanentes: aparecen cuando son relevantes para la intención y el estado. Nunca se colapsan artificialmente en un "tipo".
5. **Lo sensible se frena; lo normal fluye** (= regla rectora de fricción proporcional).

### 1.2 Catálogo de intenciones

| # | Intención | Qué prepara el sistema | Qué pregunta | Fricción | Camino de dominio |
|---|---|---|---|---|---|
| 1 | **Encontrar** una operación | búsqueda instantánea (cliente/#/teléfono) + focos accionables | nada | ninguna | `GET /api/pedidos` |
| 2 | **Crear** una operación | cliente probable (si hay contexto), canal habitual, precios en vivo, patrón de consumo como guía | cliente · productos+cantidades · canal · cuándo se entrega · cómo se paga | normal → alta si precio manual/descuento | `POST /api/pedidos` (+ `POST /api/pedidos/preview`, BRECHA §9) |
| 3 | **Repetir** una operación | patrón: última operación válida del cliente · `PatronConsumo` de `GET /api/clientes/[id]` · `PlantillaRecurrente` si existe → draft completo con total calculado | confirmar o ajustar | mínima | `POST /api/pedidos` |
| 4 | **Corregir** (G11.A) | antes→después, recálculo de impacto, los 3 guards del backend | qué cambia + motivo | **alta** si cerrado/entregado o generaría sobrepago | `POST /api/pedidos/[id]/ajustar-cantidad` |
| 5 | **Nueva demanda** (G11.B) | pedido nuevo independiente con `pedidoOrigenId`, precarga cliente/canal del original, items en blanco | productos/cantidades de lo adicional | normal | `POST /api/pedidos` (`pedidoOrigenId`) |
| 6 | **Gestionar un pendiente** (N2) | remanente por producto, modo propuesto, diferencial recalculado en vivo por el backend | cuánto · qué modo · motivo | media | `POST /api/pedidos/[id]/gestionar-pendiente`, `/api/actividades/[id]/cambiar-modo`, `/api/actividades/[id]/liberar` |
| 7 | *(mecanismo)* **Avanzar la operación** | deriva la acción concreta del estado — §1.3 | — | según la acción derivada | transiciones canónicas |
| 8 | **Revisar una excepción** | señal + evidencia + acción sugerida (`alertas-config` / `Caso`) | la resolución | **alta** | `/api/pedidos/[id]/resolver-disputa`, `/casos` |
| 9 | **Deshacer / revertir** (cancelar, anular, liberar) | impacto monetario de la reversión (G2), estado anterior→nuevo | motivo (obligatorio) | **alta** — siempre revisión | `/anular`, `/cancelar`, `/api/actividades/[id]/liberar` |
| 10 | **Consultar contexto** (cartera/factura/embarque/actividad) | la relación ya resuelta dentro del peek | nada | ninguna | lecturas |
| 11 | **Registrar / aplicar pago** | resuelve a distinto camino según el caso — §1.4 | monto · método (· factura si multi) | media → alta según el caso | §1.4 |

### 1.3 "Avanzar la operación" — mecanismo, no intención genérica

El Hub **nunca** muestra un "Continuar" genérico. Para cada operación **destaca la acción de mayor prioridad contextual** según estado, intención, riesgo, permisos y contexto. Las demás acciones aplicables quedan como acciones contextuales (`⋯` / command menu). El sistema **determina** la prioridad; puede haber varias acciones, o ninguna (estado terminal).

**Heurística de prioridad** (deriva de `pedido-transitions.service.ts` + `visual-states.ts`, no la redefine):

| Estado de la operación | Acción destacada (verbo concreto) |
|---|---|
| PENDIENTE de entrega, sin embarque | Planificar / Enviar a ruta |
| EN_RUTA | Registrar entrega |
| Entrega parcial (remanente) | Completar pendiente (N2) |
| ENTREGADO con saldo > 0 | Registrar pago |
| Pago reportado sin confirmar | Confirmar pago |
| Excepción abierta (disputa / discrepancia / alerta ALTA / cliente bloqueado) | Resolver excepción |
| Bloqueado / promesa de pago vencida | Ver cartera / negociar |
| CANCELADO / ANULADO (terminal) | — (ninguna) |

### 1.4 Registrar / aplicar pago — respeta `venta ≠ cobro ≠ cartera ≠ efectivo`

La intención **no** se esconde dentro de "crear" ni de "avanzar". Resuelve a distinto camino de dominio según el caso; cada uno lo habilita el **permiso**, con el backend como autoridad:

| Caso | Camino de dominio | Rol |
|---|---|---|
| Prepago al crear (anticipado) | `pagos[]` en `POST /api/pedidos` | ADMIN/ASISTENTE/REPARTIDOR |
| Cobro de un fiado (entregado con saldo) | `POST /api/pedidos/pagar-fiado` — lock `CARTERA:{clienteId}`, multi-factura FIFO | ADMIN/ASISTENTE |
| Abono a cuenta / corrección de abono | `/api/abonos`, `/api/cartera/abonos/[id]/corregir` (G2) | ADMIN/CONTADOR |
| Confirmar un pago reportado | `/pagos-confirmar` (flag `NEXT_PUBLIC_PAGO_CONFIRMACION`) | según config |
| Cierre de caja | `/cierre` | — |

Desde una operación con saldo, "Registrar pago" abre el flujo de **cobro de fiado** (`pagar-fiado`), no un input genérico. El peek enlaza a factura/cartera para el resto. **El rediseño de Pedidos no rediseña Cartera.**

**Implementación:** Fase 4 (intenciones 1, 7, 10), Fase 5 (6), Fase 6 (4, 5), Fase 7 (8, 11-cobro), Composición (2, 3).
**Pruebas:** unit del reducer/orquestador (derivación de acción destacada, value origin, presentación de fricción); E2E happy (crear, repetir, venta rápida PUNTO/DOMICILIO, pedido PUNTO/DOMICILIO, corrección, nueva demanda — ALS §18).
**Verificación:** las 11 intenciones son accesibles; ninguna operación muestra "Continuar" genérico; la acción destacada corresponde a la heurística §1.3 en cada estado.

---

## §2. Arquitectura de información del Hub

### 2.1 Shell (ALS §3)

```
Header contextual     título · rango temporal · estado de conexión
Barra de foco         búsqueda / ⌘K   ·   [ + Nueva operación ]
Focos del día         3–5 chips-filtro accionables
Lista de operaciones  ┃  Peek (detalle contextual)
(responsive table)    ┃
```

### 2.2 Focos del día — capa de priorización, no clasificación

**Decisión:** Enfoque C aprobado (2026-09-07); corrección PO Sección 2 (#1, #2).

**Especificación:**

- Un foco es una **capa de triage/priorización**, **no** una clasificación exhaustiva. Una operación puede estar en **varios focos a la vez**. Una que no esté en ninguno sigue siendo encontrable por búsqueda, rango temporal, filtros avanzados o "Todo".
- **"Todo" no es un tab** — es el estado del Hub sin foco aplicado.
- Cada foco es un **filtro de un clic** sobre la misma lista.
- Default al entrar: **sin foco → operaciones con actividad hoy** (creadas / en ruta / entregadas / con saldo). No una tab.
- **Cambiar un filtro nunca hace saltar la vista a "hoy".** El rango temporal es un control propio, explícito, persistente en URL, independiente de los focos.
- **Disciplina de color:** número siempre; color (ámbar/rojo) **solo si hay algo que requiere acción hoy**; sin color si está en cero o es informativo.

| Foco | Qué agrupa (derivado, no persistido) | Color |
|---|---|---|
| Por planificar | PENDIENTE sin embarque, de hoy o atrasados | ámbar si hay atrasados — regla existente `findPedidosEnRiesgoIds` / `findPedidosHoyEnRiesgoIds` (`src/lib/pedidos-sin-asignar.ts`) |
| En ruta | EN_RUTA hoy | **sin color** hasta que exista un SLA de entrega (PENDIENTE §8.1) |
| Esperando pago | ENTREGADO con saldo > 0 | rojo si promesa de pago vencida / `estadoPago` VENCIDO (regla existente); muestra `$` total |
| Pendientes (N2) | operaciones con `ObligacionPendiente` activa | ámbar si hay alguna sin gestionar |
| Excepciones | disputa abierta / pago discrepante / alerta ALTA / cliente bloqueado | rojo si hay ALTA |

Los umbrales temporales usan **solo reglas operacionales que ya existen**. No se inventa ningún umbral desde UX.

### 2.3 Fiados, Alertas, Recurrentes dejan de ser destinos

| Hoy | Nuevo | Qué se mantiene aparte |
|---|---|---|
| tab "Fiados" | foco **Esperando pago** + factura/cartera en el peek | `/cartera` (corrección de abonos G2) — tarea contable, no faceta de la operación |
| tab "Alertas" | foco **Excepciones** + `PedidoRiskSignals` en el peek (§5.4) | `/reportes/salud-antifraude` — análisis agregado |
| "Únicos" vs "Recurrentes" en el nav | desaparece el par; "Repetir" es intención (§6.1) | `PlantillaRecurrente` en el dominio |

### 2.4 Lista de operaciones (responsive table adaptativa)

**Decisión:** SAP Fiori — la *responsive table* es la tabla por defecto (adaptativa, hasta ~1000 filas); la *grid table* no es responsive y no se usa. "Tabla densa" ≠ "meter todo en una grid". Corrección PO Sección 2 (#3).

**Columnas por defecto (desktop, 5):**

1. **Operación** — # + cliente/negocio (usa `Negocio` formal, no `nombreNegocio` legacy) + origen (chip discreto solo si ≠ PEDIDO)
2. **Qué** — resumen de items + canal (ícono, solo si DOMICILIO)
3. **Estado** — microcopy legible (nunca badges apilados)
4. **Total** — monto + señal de pago (anticipado/parcial) sin apilar
5. **Acción destacada** — el verbo concreto de §1.3

**Columnas bajo demanda:** fecha·hora, embarque, repartidor, dirección, creado por, precio-origen (*sujeto a permiso* — §2.6).

**Interacción:**

- hover/focus de fila → acciones contextuales (`⋯` → command menu) + hint de peek (`Espacio`). Menú **controlado por estado**, nunca `hidden group-hover` (AGENTS.md #24).
- **Selección múltiple** (`X` / checkbox) → solo acciones idempotentes y con sentido en lote: planificar / enviar a ruta, exportar. **Nunca** sensibles en lote (anular, corregir, cobrar). Selección con estados incompatibles → acción deshabilitada con motivo.

### 2.5 Densidad por dispositivo y rol — una superficie, modos adaptativos

**Desktop** `data-testid="pedido-hub-desktop"` — lista + peek lado a lado.
**Mobile** `data-testid="pedido-hub-mobile"` — lista de tarjetas 1 columna; focos = scroll horizontal; peek = bottom sheet; sin sidebar permanente; command menu por botón. Prioridad ALS §12: contexto → operación → total → CTA.

`1024px` es un **parámetro técnico inicial**, no una decisión de producto: se valida en dev contra espacio disponible, densidad e interacción; puede moverse.

| Rol | Modo del Hub |
|---|---|
| ADMIN | completo |
| ASISTENTE | igual, menos acciones reservadas por permiso (UI las oculta **además** del enforcement backend — ALS A6) |
| CONTADOR | lectura + foco "Esperando pago" prominente. Capacidades **separadas**, cada una por permiso: (a) consultar estado financiero, (b) consultar factura/cartera, (c) registrar/aplicar pago, (d) corregir/revertir pago. Sin crear/corregir/entregar operaciones. |
| REPARTIDOR | modo "mi cola de ruta": solo sus operaciones asignadas, orden TSP, acción destacada = "Registrar entrega"; ruta/mapa **enlazan a Embarques Mission Detail** (no se ejecutan desde Pedidos). La consolidación de `/repartidor` dentro del Hub es **PENDIENTE de validación UX/arquitectónica** (§8.3) — no está aprobada. |

Transiciones, pricing y riesgo **no se duplican por viewport ni por rol**.

### 2.6 Datos sensibles — bajo demanda + permiso

`precio-origen`, condiciones especiales, precios manuales y descuentos son **datos contextuales sujetos a permiso**. No todos los roles los ven. Coherente con el modelo antifraude (§5): quien no puede autorizar un precio excepcional tampoco necesita verlo por defecto.

**Implementación:** Fase 4.
**Pruebas:** unit de derivación de focos (multi-pertenencia, sin color hasta que haya regla) · unit de columnas (default vs on-demand, permiso de precio-origen) · `responsiveContainer(page, 'pedido-hub-mobile', 'pedido-hub-desktop')` E2E · E2E: cambiar filtro no salta a "hoy".
**Verificación:** 0 tabs · rango temporal independiente de los focos · una operación aparece en todos los focos que le aplican · CONTADOR no puede crear/entregar · precio-origen oculto sin permiso.

---

## §3. Captura / `PedidosWorkspace`

### 3.1 Entrada — intent picker

`[ + Nueva operación ]` abre un picker de **intención**, no un formulario. Reemplaza el FAB speed-dial actual (que colapsa `origen`+`canal` en "Pedido con Envío").

| Intención del picker | `origen` derivado | Cómo se lanza |
|---|---|---|
| Tomar un pedido | `PEDIDO` | picker |
| Vender ahora (mostrador / ruta) | `VENTA_RAPIDA` (oficina) / `VENTA_LIBRE` (repartidor, sin cliente real) | picker / modo repartidor |
| Repetir lo de un cliente | `PEDIDO` o `RECURRENTE` según fuente del patrón | picker / command menu / peek del cliente |
| Registrar nueva demanda (G11.B) | `PEDIDO` con `pedidoOrigenId` | desde una operación existente |
| Gestionar un pendiente (N2) | — (no crea Pedido) | desde una operación con remanente |
| Corregir (G11.A) | — (no crea Pedido) | desde una operación existente |

`canal` (`PUNTO` | `DOMICILIO`) y "cuándo se entrega" se preguntan **en contexto**, siempre override-ables. Las 4 combinaciones `origen × canal` posibles (ALS §7).

### 3.2 Workspace de composición (ALS §4) — adaptativo, ni wizard ni formulario monolítico

Una sola superficie; **cada zona aparece cuando es relevante**:

| Zona | Componente | Aparece |
|---|---|---|
| Contexto | `PedidoContextPanel` *(existe, #218)* | siempre; auto-resuelto si el cliente viene precargado |
| Operación | `PedidoItemEditor` *(existe, #219)* | siempre; canal y "cuándo se entrega" se preguntan **aquí** |
| Cálculo | `PedidoPricingSummary` *(existe, #217)* | siempre; total del backend en vivo, desglose bajo demanda |
| Señales | `PedidoRiskSignals` *(nuevo)* | **solo si hay señales** — §5.4 |
| Revisión | `PedidoReview` *(nuevo)* | **solo** en alto impacto |
| Commit | `PedidoCommitBar` *(nuevo)* | el **estado de commit** está disponible siempre que la operación sea válida; su **representación** se adapta a contexto y viewport (sticky, contextual, integrada, u otra). No es una barra visual permanente obligatoria. |

**Flujo adaptativo:**

- **Normal** (cliente conocido, precios de tabla, sin señales) → `Contexto auto-resuelto → Operación → Cálculo en vivo → Commit`. Sin paso de Revisión.
- **Riesgo medio** → aparece la zona Señales: explica *qué se detectó · por qué importa · qué puede hacer el usuario*. Reconocimiento/autorización **solo si la política de la regla lo requiere** (no un checkbox genérico).
- **Alto impacto** → se inserta `PedidoReview` (antes→después / autorizado vs propuesto / motivo) + `AUTHORIZATION` antes del commit (ALS §10).

> El `EMPTY → CONTEXT_READY → DRAFTING → PREVIEW_READY → REVIEW_REQUIRED → AUTHORIZATION_REQUIRED → COMMITTING → COMMITTED` de la ALS §6 es la **ruta máxima**. El flujo adaptativo **omite** `REVIEW_REQUIRED` / `AUTHORIZATION_REQUIRED` cuando la regla de riesgo / política no los exige (regla rectora de fricción proporcional). Es un refinamiento aprobado de la ALS, no una contradicción.

### 3.3 Reducer/orquestador del workspace

**Decisión:** corrección PO Sección 3 (#2).

Maneja el **estado efímero de la experiencia y sus condiciones de presentación** (qué zona se muestra, estado de red, draft local, value origins), **consumiendo** las máquinas de estado, permisos, transiciones y reglas canónicas del dominio/backend. **No replica ni redefine reglas de negocio.** No se crea una segunda máquina de estados de negocio en React; el backend/dominio es la autoridad.

Separa (Plan Técnico §12): server state · draft state · derived state · authorization state · risk state · offline/sync state.

### 3.4 Los tres flujos de composición

**Repetir** (intención 3) — el sistema arma el draft desde el patrón: última operación válida del cliente · `PatronConsumo` (`frecuenciaSugerida` + `productosSugeridos`, ya en `GET /api/clientes/[id]`) · `PlantillaRecurrente` si existe. Se muestra como `PedidoProposal` ya armada; cada valor lleva su procedencia (`ValueOrigin`: `USER | HISTORY | RULE | CALCULATION | DEFAULT` — ALS §8). "Ajustar" abre el workspace completo precargado. **No se construye un motor de patrones nuevo** — se reusa la infra existente.

**Nueva demanda** (intención 5, G11.B) — se lanza **desde una operación existente**. Workspace con cliente + canal del original, `pedidoOrigenId` seteado, **items en blanco**. Commit crea un `Pedido` independiente.

**Crear desde cero** (intención 2) — flujo completo. Los "pasos" desaparecen/reordenan según contexto: si el cliente tiene dirección única y canal habitual, son **valores ya resueltos que el usuario revisa**, no campos que llena.

### 3.5 Peek / detalle contextual

**Decisión:** Linear peek pattern; corrección PO Sección 2 (#4 responsive), Sección 3 (#1 disclosure).

Vista de la operación **al lado** de la lista (desktop) o **bottom sheet** (mobile), sin navegar. `Espacio` / clic abre; `↑/↓` recorren actualizando el peek.

| Capa | Contenido | Fetch |
|---|---|---|
| 1 (siempre) | cliente/negocio · estado legible · qué se pidió/entregó · **total y saldo de esta operación** · acción destacada + contextuales | ninguno — ya en el payload de la lista |
| 2 (1 gesto) | desglose de items con precio y origen *(si permiso)* · `PedidoActivityTimeline` · relaciones (embarque, factura, cartera, pedidos vinculados, pendiente N2) | un fetch |
| 3 (bajo demanda) | `PedidoAuditDiff` · GPS/foto de entrega · reglas aplicadas | fetch al expandir; componentes `dynamic()` |

**Detalle completo** (`/pedidos/[id]`, deep-link `?openPedido=`): **sigue existiendo** para deep-links y casos que el peek no cubre (auditoría extensa, disputa con hilo largo). "Sin salto de contexto" significa **eliminar navegación innecesaria** para las tareas frecuentes, **no** prohibir deep links ni rutas especializadas.

### 3.6 Acciones contextuales

Acciones visibles = (transiciones válidas desde el estado · permisos del rol · contexto). La UI las oculta **además** del enforcement backend (ALS A6).

- **Acción destacada** — mayor prioridad contextual (§1.3). Prominente en fila y peek.
- **Acciones contextuales** — el resto de aplicables, en `⋯` / command menu.
- **Acciones sensibles** (anular, corregir cerrado, revertir pago) — siempre en el menú, nunca destacadas, siempre con flujo de fricción alta.

### 3.7 Command menu (`PedidoCommandMenu`)

- **Global** (`⌘/Ctrl+K` / botón en mobile): "nueva operación", "repetir pedido de…", "buscar cliente…", **"Abrir planificación de hoy"** (navega, no ejecuta — Pedidos no absorbe Auto-Generar de Embarques), "ir a cartera".
- **Contextual** (sobre una operación / `⋯`): las acciones de esa operación, teclado + mouse + touch, cerca del elemento invocado.
- **No ejecuta operaciones sensibles sin review/autorización** (ALS §11).
- Accesible (ALS §17): teclado, focus visible, `aria-live`, mouse y touch.

**Implementación:** Composición (workspace + reducer + `PedidoProposal`/`PedidoReview`/`PedidoRiskSignals`/`PedidoCommitBar`), Fase 4 (peek, command menu), Fase 6 (nueva demanda reusa workspace).
**Pruebas:** unit del reducer (transiciones de la máquina de UI, no de negocio; value origin; fricción derivada de riesgo) · unit de cada zona · E2E happy paths (ALS §18) · E2E de peek (`↑/↓` cancela fetch stale) · E2E abuse (precio manipulado, cliente manipulado, origen/canal manipulado, salto de estado, replay, concurrencia — ALS §18).
**Verificación:** no existe formulario monolítico como experiencia principal (ALS DoD) · una operación normal se crea sin paso de Revisión · repetir no reintroduce datos conocidos · el peek abre instantáneo (capa 1 sin fetch).

---

## §4. Estrategia de carga de datos + progressive disclosure + estados

### 4.1 Cinco mecanismos distintos

**Decisión:** corrección PO Sección 3 (#1), Sección 4 (#1).

| Mecanismo | Pregunta que responde | En el Hub |
|---|---|---|
| Progressive disclosure | qué información se muestra y cuándo | capas del peek · columnas default vs on-demand · desglose de precio |
| Data fetching | cuándo se piden datos al backend | SSR de la lista + conteos · fetch de capa 2/3 del peek · refetch por realtime/polling |
| Lazy loading / code splitting | cuándo se descarga código | `dynamic()`: `PedidoAuditDiff`, `PedidoActivityTimeline`, visor GPS/foto, editor de composición |
| Prefetch | qué se anticipa antes de que el usuario lo pida | warm del peek en hover *si es barato y probable* |
| Loading / streaming | cómo se representa la espera de una ruta/segmento | `loading.tsx` de `/pedidos` (partial prefetching Next 16) |

No son sinónimos. `loading.tsx` es **loading/streaming**, no prefetch.

### 4.2 Carga inicial del Hub

- **SSR** (`src/app/(app)/pedidos/page.tsx`, ya existe): lista paginada (`ListarPedidosUseCase`) + enriquecimiento batch de cliente/negocio en `Promise.all` (ya sin waterfall). Lo mínimo para **representar** cada operación y **derivar su acción destacada**.
- **Focos:** **máximo un request adicional**, en paralelo, y **preferiblemente derivado de la misma operación** cuando el contrato lo permita (`GET /api/pedidos/counts` existe). **Prohibido un request por foco.**
- **No se carga de entrada:** desglose con precio-origen, timeline, auditoría, relaciones completas, GPS/foto.

### 4.3 Carga del peek, por capas

| Capa | Fetch | Mecanismo (elegido por garantías requeridas, no por dogma) |
|---|---|---|
| 1 | ninguno — viene en el payload de la lista | peek abre **instantáneo** |
| 2 | un fetch al abrir | garantías necesarias: caché corta + invalidación por realtime, sin encolado offline → patrón `panel-prefetch.ts` de `/clientes` (TTL ~60s + LRU ~20). **Requiere** extender `GET /api/pedidos/[id]` (o endpoint dedicado) para incluir `ObligacionPendiente`/`Actividad` y relaciones — hoy solo incluye `factura` + cliente/negocio (§9.2) |
| 3 | fetch al expandir | `dynamic()` |

**Navegación rápida `↑/↓`:** cada cambio de operación **cancela** el fetch de capa 2 anterior (`AbortController` + `requestId`, patrón ya en `usePedidos`). Muestra capa 1 al instante; skeleton solo en la franja de capa 2.

### 4.4 Sin waterfalls

Lista + enriquecimiento + conteos: paralelo. Peek capa 2: **un** fetch trae todo lo de esa capa. Regla: dos datos que se necesitan juntos para una capa → una sola llamada o `Promise.all`, nunca encadenados.

### 4.5 Prefetch — solo si es barato y probable

**Decisión:** corrección PO Sección 4 (#4).

- El hover es **señal de intención, no requisito ni regla universal**. Solo con **alta probabilidad de apertura inmediata + coste bajo + conexión/recursos que lo permitan** (`navigator.connection` ≠ 2g). Patrón `warmClienteDetail` (fetch no-cache que despierta el recurso, no almacena).
- **Nunca:** prefetch masivo de todas las filas, prefetch de capa 3, prefetch especulativo de composición, caché de la lista en Dexie (decisión ya tomada en Embarques Command Center — offline = última lista en memoria + badge).
- **El peek funciona correctamente aunque jamás haya ocurrido prefetch.**

### 4.6 Percepción de velocidad

Peek capa 1 instantáneo · skeleton **por zona**, no pantalla completa · `useTransition` para cambios de filtro/foco (patrón ya usado en `/clientes`) · mutación optimista **solo** cuando el resultado es suficientemente determinista, recuperable ante rechazo y compatible con concurrencia/autorización — sensible o incierto → **"Aplicando…"**.

### 4.7 Catálogo explícito de estados

**Decisión:** corrección PO Sección 4 (#6, #7, #8).

| Estado | Cuándo | Presentación |
|---|---|---|
| loading | primer render sin datos SSR | skeleton de lista (`loading.tsx`) |
| skeleton | zona esperando su fetch | skeleton local a la zona |
| empty | query válida, cero resultados | mensaje + acción sugerida; nunca pantalla en blanco |
| error | fetch falló, no es error de lógica | mensaje + **retry**; si había datos previos, se conservan |
| offline | **no se puede contactar correctamente el backend** — considera `navigator.onLine` (heurística) **y el resultado real de las solicitudes** | badge "sin conexión, se sincroniza"; datos en memoria intactos; **nunca** `ErrorState` si ya había datos |
| stale | hay datos conocidos que pueden no ser los más recientes (evento realtime llegó, fetch pendiente) | indicador sutil "actualizando…"; **puede coexistir con online**; no bloquea |
| retry | acción explícita tras error | reintenta el último fetch; spinner en el botón |
| mutation pending | commit enviado, sin respuesta | CTA "aplicando…", operación marcada, resto de la UI usable |
| mutation success | 2xx | toast `success` (online) / `info` (encolado offline) |
| mutation conflict | 409 | **éxito silencioso SOLO** si el contrato demuestra inequívocamente que la misma operación ya fue aplicada por el mismo identificador de idempotencia (`offlineId`). Otros conflictos → recuperación contextual: refresh del peek + comparación + revisión (`conflict → refresh/review`, ALS §6) |

### 4.8 Lazy ≠ ocultar información para decidir

**Prioridad:** datos para **decidir** → datos para **ejecutar** → datos para **verificar** → datos para **investigar/explicar**. La optimización de performance **nunca** difiere un dato necesario para decidir.

| Se carga con la vista (decisión / ejecución) | Se difiere (verificar / investigar) |
|---|---|
| saldo de la operación, estado legible, items-resumen, acción destacada (lista) | `PedidoAuditDiff` |
| qué se pidió/entregó, total (peek capa 1) | GPS / foto de entrega |
| señales de riesgo activas que condicionan el commit | timeline de actividad completo |

Desglose de **precio-origen**: se difiere **y** está sujeto a permiso (§2.6).

**Implementación:** Fase 4 (carga del Hub + peek), Fase 9 (hardening de estados).
**Pruebas:** unit de `panel-prefetch` extendido (invalidación selectiva por evento — §6.2) · unit del catálogo de estados (offline≠stale, 409 no-dedup → recovery) · E2E offline (red cortada tras cargar: badge, datos intactos, sin `ErrorState`) · E2E de `↑/↓` (cancela fetch stale).
**Verificación:** `grep` — cero request por foco · el peek capa 1 no dispara fetch · un 409 sin `offlineId` coincidente muestra recovery, no "éxito" · online + stale se representa como "actualizando", no como error.

---

## §5. N2 (pendientes) · G11 (corrección vs nueva demanda) · riesgo/antifraude en el flujo

### 5.0 Principio común

La operación normal **sigue siendo rápida**. La fricción aparece solo cuando el estado, el impacto o la política lo exigen. El **backend es la autoridad** (guards, diferencial, riesgo, autorización). La UI **explica, no acusa**. Nada se muta silenciosamente (ALS A8).

**Conceptos separados (no se mezclan):** **Señal** (se detectó una condición relevante) ≠ **Bloqueo** (el backend impide continuar) ≠ **Autorización** (una persona con permisos habilita, cuando la política lo permite). Una alerta **no implica** bloqueo ni autorización automáticos. `señal → evidencia → revisión humana → decisión`. Nunca `señal → acusación de fraude`.

### 5.1 N2 — Pendientes (cumplimiento parcial)

**Decisión:** N0/N1/N2 backend cerrados (#194–#198); 3 endpoints HTTP (Fase 2, #216); contrato en `02-api-contract-pedidos.md`; corrección PO Sección 5 (#1).

**Especificación:**

- **Dónde aparece:** foco "Pendientes (N2)" · peek capa 1 ("Entregado 15 de 20 · 5 pendientes") · `PedidoExceptionPanel` en el peek **solo si existe** una `ObligacionPendiente`/`Actividad` activa (nunca un 4º badge apilado).
- **Flujo "Gestionar pendiente" (intención 6):**

| Paso | Qué pasa | Endpoint |
|---|---|---|
| INTENT | desde el peek, "Completar pendiente" | — |
| CONTEXT | remanente por producto (`cantPedido - cantEntrega`) · modo **propuesto por defecto** (el del pedido original — reversible) · **diferencial recalculado fresco por el backend contra el modo destino** (nunca reusa un preview previo) | `POST /api/pedidos/[id]/gestionar-pendiente` |
| PROPOSAL | "5 pacas agua · Domicilio · diferencial +$X" — `[Confirmar] [Cambiar modo] [Liberar]` | — |
| cambiar modo | si el usuario cambia el modo, se **recalcula** el diferencial | `POST /api/actividades/[id]/cambiar-modo` |
| liberar | **motivo obligatorio** (ALS A8); muestra el monto que se revierte de `Pedido.total` | `POST /api/actividades/[id]/liberar` |
| COMMIT + AUDIT | | |

- **El frontend no reproduce, aproxima ni duplica** la lógica de cálculo del diferencial — viene siempre del backend.
- **Límite conocido (se muestra, no se resuelve):** un diferencial negativo ya acreditado a `Cliente.saldoFavor` que el backend **no** revierte automáticamente — la UX muestra **qué se revirtió, qué permanece y la consecuencia financiera real**. No aparenta una reversión completa.

**Implementación:** Fase 5 — `PedidoExceptionPanel`, flujo de gestión de pendiente en el peek.
**Pruebas:** unit del panel (aparece solo con obligación activa; muestra remanente; presenta la reversión parcial sin aparentar completa) · E2E: gestionar / cambiar modo / liberar desde la UI (no existía nada que actualizar) · E2E abuse: liberar sin motivo → rechazado.
**Verificación:** un usuario gestiona un pendiente, cambia el modo de una actividad y libera una actividad desde la UI por primera vez · el diferencial mostrado == el que devuelve el endpoint (no recalculado en cliente).

### 5.2 G11 — Corrección vs Nueva demanda (elección explícita, nunca inferida)

**Decisión:** G11 (decisión PO 2026-09-06, #206); `AjustarPedidoCantidadUseCase` con 3 guards; `pedidoOrigenId` en `CrearPedidoInput`; D5 del `00-plan`; corrección PO Sección 5 (#2).

**El punto de decisión (obligatorio, sin opción "no sé"):**

> **¿Qué pasó?**
> — **Me equivoqué al capturar** → *Corrección*
> — **El cliente pidió más / menos** → *Nueva demanda*

El componente **nunca** decide por inferencia. La selección es una **declaración de intención/causa, no una autorización** para ejecutar: después siguen validaciones, preview, impacto, autorización (si corresponde), commit y auditoría. Si el usuario no puede determinar la causa, el flujo **explica por qué la distinción es necesaria para continuar correctamente** — no inventa una clasificación.

**Rama A — Corrección** (`POST /api/pedidos/[id]/ajustar-cantidad`) — flujo sensible (ALS §10):
`INTENT → PREVIEW (antes→después por producto) → IMPACT (Δ total, Δ saldo, ¿sobrepago?) → [AUTHORIZATION si la política lo pide] → COMMIT → AUDIT`

Los **3 guards del backend se muestran como mensajes**, no se predicen client-side:

| Guard | Mensaje |
|---|---|
| `CORRECCION_PEDIDO_CERRADO` | "Este pedido ya está cerrado. Corregirlo requiere [autorización / nota]." |
| `CORRECCION_SOBRE_CANTIDAD_YA_ENTREGADA` | "Ya se entregaron N unidades; no se puede corregir por debajo de lo entregado." |
| `CORRECCION_GENERARIA_SOBREPAGO` | "El cliente ya pagó $X; bajar la cantidad generaría saldo a favor de $Y. [Revisar]" |

`PedidoAuditDiff` registra antes/después con motivo y actor.

**Rama B — Nueva demanda** (`POST /api/pedidos` con `pedidoOrigenId`): reusa el workspace de §3 (cliente/canal precargados, items en blanco). Pedido normal → fricción normal. Vínculo visible en el peek de ambos (§6.2).

**Implementación:** Fase 6 — punto de decisión + rama A (formulario de corrección con mapeo de guards) + rama B (reusa workspace).
**Pruebas:** unit del punto de decisión (sin "No sé"; explica la distinción) · unit de mapeo de los 3 guards a mensaje · E2E ambas ramas · E2E abuse (ALS §18): corrección convertida en demanda / demanda convertida en corrección · alterar cantidad después de entrega.
**Verificación:** imposible llegar a un estado ambiguo · los pedidos vinculados por `pedidoOrigenId` son visibles desde el peek del original y viceversa.

### 5.3 Riesgo / antifraude — en el flujo, no en una pantalla aparte

**Decisión:** ALS §14, Plan Técnico §6–9; hallazgos verificados de `00-plan` §0; corrección PO Sección 5 (#3, #4, #5, #6).

**Tres niveles de fricción, derivados de la regla de riesgo aplicable:**

| Nivel | Cuándo | UX |
|---|---|---|
| Normal | sin señales | flujo inmediato |
| Advertencia (medio) | señal de una regla de `alertas-config.ts` | `PedidoRiskSignals` explica *qué se detectó · por qué importa · qué puede hacer*; `[Revisar]`/`[Solicitar autorización]` **solo si la política de esa regla lo requiere** |
| Alto impacto | precio excepcional que requiere autorización · descuento fuera de política · corrección sobre cerrado · cambio de cliente sensible | `PedidoReview` (antes→después) + motivo obligatorio + `AUTHORIZATION` antes del COMMIT |

**Reutiliza, no duplica:**

- `src/lib/alertas-detector.ts` + `src/lib/alertas-config.ts` — 20 `AlertaTipo` con severidad, definición, ejemplos y acciones. `PedidoRiskSignals` **consume** estas reglas. La detección detectiva (cron `alertas-batch`) sigue; el rediseño agrega la capa **preventiva/contextual** en el flujo.
- `Caso` (ResponsibilityCase) + `/casos` + `caso-guia-modal.tsx` — `PedidoExceptionPanel` **consume** esto (`autorizadoPorId`/`resueltoPorId` ya existen).
- `/reportes/salud-antifraude` — el análisis agregado no se toca.
- Si una señal (p.ej. "cliente no verificado") ya existe como regla formal, se usa **su definición exacta** (`CLIENTE_NO_VERIFICADO` existe en `alertas-config.ts`). Lo que no exista como regla formal queda **PENDIENTE/PROPUESTA** — no se inventa.

**Gaps reales a cerrar:**

- **`precioManual` se acepta sin umbral ni autorización** (`pricing-algorithm.service.ts:68` — control detectivo `PRECIO_POR_DEBAJO_TABLA`, ninguno preventivo). El blueprint: al forzar precio manual, `PedidoRiskSignals` muestra *autorizado $X · propuesto $Y · diferencia $Z · motivo ___*. Los **umbrales monetarios y la política de doble control NO se inventan en esta fase** (§8.2, PENDIENTE DE NEGOCIO). Hasta esa decisión: **advertencia contextual + motivo obligatorio + auditoría**, sin umbral inventado.

**Alcance:** las señales aparecen en el flujo de la operación (composición, corrección, cobro) **y** en el peek. Pueden aparecer en puntos del flujo de Pedidos con operación financiera relevante, **sin absorber ni rediseñar Cartera**.

**Implementación:** Composición (`PedidoRiskSignals` en el workspace), Fase 7 (`PedidoRiskSignals`/`PedidoExceptionPanel` en el peek).
**Pruebas:** unit de `PedidoRiskSignals` (consume `alertas-config`; presenta señal ≠ bloqueo ≠ autorización; no acusa) · E2E abuse (ALS §18): precio manipulado, descuento sin autorización, campos ocultos manipulados · unit: sin política de umbral, precio manual → advertencia + motivo, no bloqueo.
**Verificación:** `grep` — `PedidoRiskSignals` importa de `alertas-config`/`alertas-detector`, no define reglas propias · una operación normal no muestra señales · un precio manual sin umbral configurado se puede confirmar con motivo (no se bloquea).

---

## §6. Recurrentes · relación Pedidos ↔ Embarques ↔ Cartera · gates de aceptación

### 6.1 Recurrentes — "Repetir" es intención; la plantilla desaparece como categoría de UI

**Decisión:** corrección PO Sección 1 (D3 resuelta) + Sección 6 (#1, #2, #3).

`PlantillaRecurrente` / `PlantillaProducto` **siguen en el dominio**. Desaparece: el par "Únicos / Recurrentes" del nav y las pantallas `/recurrentes`, `/recurrentes/nuevo`, `/recurrentes/[id]/editar` como **destinos que el usuario deba comprender para operar**.

| Capacidad | Nuevo |
|---|---|
| Repetir la operación de un cliente | intención "Repetir" (§3.4): propuesta ya armada desde el patrón |
| Marcar que una operación se repite | propiedad "esto se repite" sobre una operación → **prepara la configuración de la recurrencia y requiere confirmación** (no crea una recurrencia silenciosamente). Tras confirmar, crea/vincula la `PlantillaRecurrente`; el usuario nunca ve el concepto "plantilla" |
| Editar frecuencia / productos de la recurrencia | desde el peek del cliente o de una operación recurrente ("Pedido habitual: 20 pacas · semanal · [Ajustar]") — reusa el workspace de §3, no un editor propio |
| Generar los pedidos recurrentes del día | acción operativa en el Hub cuando hay recurrentes pendientes de generar hoy → flujo **preview → decisión por plantilla (NORMAL/SKIP/ajustar) → generación**, con la **deduplicación existente** (`recurrenteBatchId`). `POST /api/pedidos/recurrentes` sin cambios |
| Ver qué clientes tienen recurrencia | filtro/faceta del Hub + indicador en el peek del cliente |

Resuelve la **deuda #3** del `00-plan` (`nuevo-client`/`editar-client`, 1223 líneas, duplican la captura) — se eliminan al reusar `PedidosWorkspace`.

### 6.2 Relación Pedidos ↔ Embarques ↔ Cartera — acceso contextual, no fusión

**Decisión:** corrección PO Sección 6 (#4, #5, #6).

Desde el **peek de una operación** (capa 2), sin salir de la lista. **Pedidos, Embarques y Cartera mantienen sus fronteras de dominio.** El peek provee contexto y navegación, no fusión.

| Relación | Qué muestra el peek | Origen del dato | Cross-link |
|---|---|---|---|
| Embarque | # · estado · repartidor (si EN_RUTA) | `Pedido.embarqueId` + `GET /api/embarques/[id]` | peek/detalle del embarque |
| Entrega | GPS · foto · quién · cuándo | dato propio del Pedido (capa 2/3) | — |
| **Factura** | # de factura · estado de la factura · saldo **de la factura** | entidad puente `Factura` (`GET /api/pedidos/[id]` ya la incluye) | `/facturas?openFactura=` |
| **Cartera** (info del **cliente**, no del pedido) | saldo **del cliente** (agregado multi-factura) · deuda más antigua | agregado de Cartera — **claramente distinguido** del saldo de esta operación | `/cartera` |
| Pedidos vinculados (G11.B) | "Nueva demanda: #124" / "Origen: #98" | `Pedido.pedidoOrigenId` | peek del pedido vinculado |
| Pendiente N2 | remanente + estado de la actividad | `ObligacionPendiente` / `Actividad` | `PedidoExceptionPanel` en el mismo peek |

**Distinción obligatoria en el peek:** *"esta operación: total $X · pagado $Y · saldo $Z"* (info del Pedido) vs *"el cliente debe $W en total"* (info de Cartera) — nunca se confunden.

**Dirección de entrega efectiva:** el peek muestra la dirección resuelta (`pickDireccionTexto`: snapshot del pedido → negocio → cliente) **y su fuente**.

**Cierra la deuda #6** (`/cartera` sin cruce): las filas de abono en `/cartera` enlazan a factura → peek del pedido.

**Realtime — invalidación selectiva** (corrección PO Sección 6 #6): cada evento invalida **solo** los paneles realmente afectados.

| Evento | Invalida |
|---|---|
| `pedido.updated` | capa 1 (estado, total, saldo) + acción destacada de esa operación |
| `pago.created` | panel de pago/factura + saldo de esa operación (si el `pedidoId` coincide) |
| `embarque.updated` / `embarque.deleted` | panel de embarque de las operaciones de ese embarque |
| `route_plan.updated` | foco "Por planificar" + panel de planificación **solo** de las operaciones en ese plan |
| `cliente.updated` | panel de contexto (nombre/dirección) de las operaciones de ese cliente |

**Qué NO es:** no se fusionan entidades · no se edita un embarque ni un abono desde el peek del pedido · no se mueve lógica de Embarques/Cartera a Pedidos.

**Implementación:** Fase 7 (relación cruzada + `PedidoExceptionPanel`), Fase 8 (Recurrentes integrado).
**Pruebas:** unit del peek (distinción saldo-operación vs deuda-cliente; invalidación selectiva por evento) · unit de "esto se repite" (requiere confirmación; no crea silenciosamente) · E2E: navegación cruzada pedido→embarque→cartera sin perder el contexto de la lista · E2E: generar recurrentes (preview → decisión → dedup).
**Verificación:** desde el peek se llega a embarque/factura/cartera en un click, la lista no se pierde · el peek nunca muestra la deuda del cliente como si fuera el saldo del pedido · marcar "se repite" no persiste hasta confirmar.

### 6.3 Gates de aceptación — "¿es realmente un rediseño?"

Los siguientes son **gates de aceptación (pass/fail)**, no métricas. Fase N **no se cierra** si alguno falla.

| # | Gate | Cómo se comprueba |
|---|---|---|
| G1 | No existe formulario monolítico como experiencia principal | inspección: el workspace se compone de zonas que aparecen por contexto, no un form con `if` |
| G2 | El usuario nunca navega a "Recurrentes" / "Únicos" / "Alertas" / "Fiados" como destinos | `nav-data.tsx` no los tiene como ítems; E2E no los visita |
| G3 | Repetir un pedido habitual no reintroduce datos que el sistema ya sabe | E2E: contar campos con input manual en el flujo "Repetir" == 0 para un cliente con patrón |
| G4 | Para las tareas frecuentes, toda la información de una operación es accesible desde su peek sin cambiar de ruta | E2E: crear/cobrar/planificar/resolver-excepción sin `page.goto` intermedio |
| G5 | Origen / canal / entrega / pago nunca aparecen colapsados en un "tipo" | inspección de UI + `grep` sin un control único "tipo" |
| G6 | El estado se lee como microcopy, no como badges apilados | inspección: la celda "Estado" renderiza texto, no ≥2 badges |
| G7 | Ninguna regla crítica vive solo en frontend | `grep`: transiciones desde `pedido-transitions`, pricing desde `/api/precios/resolver`, riesgo desde `alertas-*`, diferencial desde el endpoint, guards G11 del backend |
| G8 | Preview y commit separados para operaciones sensibles; autorización cuando la política lo pide | E2E: corrección sobre cerrado exige preview + motivo + (autorización si hay política) |
| G9 | Offline muestra estado real; nunca "confirmado" sin confirmación server-side | E2E offline: mutación encolada muestra "pendiente", no "confirmado" |
| G10 | Playwright cubre happy paths + abuse paths (ALS §18) + responsive + offline | conteo de specs por categoría |
| G11 | La prueba del usuario | si al probarlo un usuario dice *"es la misma pantalla, pero más ordenada"* → **no cumple** |

### 6.4 Métricas comparativas (informativas, contra el baseline de Ronda 1)

Objetivamente medibles (sin "N gestos" ni términos ambiguos):

| Métrica | Baseline (Ronda 1, dev, `admin`) | Se mide con |
|---|---|---|
| nº de inputs con valor manual — crear pedido habitual | 7 (buscar cliente + 5 steppers + notas) | Playwright: contar `input`/`textarea` tocados hasta el commit |
| nº de rutas/pantallas distintas visitadas — repetir una operación | ≥ 2 (ir a `/recurrentes` + volver) | Playwright: contar `page.url()` distintas |
| nº de round-trips de red antes de completar "cobrar un fiado" | — (baseline a medir) | Playwright: contar requests a `/api/*` |
| nº de botones visibles en el shell | ~50 | Playwright: contar `button` visibles |
| nº de chips de filtro siempre visibles | ~20 | Playwright |
| tiempo hasta primera interacción útil en `/pedidos` | ~3.5 s (dev) | Playwright: `performance` API |

Instrumentación en runtime (ALS §16 / Plan Técnico §14): `pedidos_v2_render_count`, `pedidos_offline_enqueue_count`, `n2_pendiente_gestionado_count` / `n2_modo_cambiado_count` / `n2_actividad_liberada_count`, `g11_correccion_count` / `g11_nueva_demanda_count`.

---

## §7. Mapa a fases de implementación (`00-plan`)

El blueprint es holístico; la implementación sigue el `00-plan` por fases.

| Fase | Qué construye | Depende de | Gates que debe pasar |
|---|---|---|---|
| **Backend preview** (BRECHA §9.1) | `POST /api/pedidos/preview` conforme al contrato del Plan Técnico §13 | — | contrato definido y probado (integración Postgres) |
| **Fase 4** | Pedido Hub: shell + focos + lista adaptativa + peek + command menu (§2, §4) | preview | G2, G4, G5, G6, G9, G10 |
| **Composición** | `PedidosWorkspace` recompone Fase 3 con reducer/orquestador + `PedidoProposal`/`PedidoReview`/`PedidoRiskSignals`/`PedidoCommitBar` (§3, §5.3) | preview | G1, G3, G7, G8 |
| **Fase 5** | N2 en el flujo — `PedidoExceptionPanel`, gestión de pendiente (§5.1) | endpoints N2 (Fase 2, hechos) | G4, G7 |
| **Fase 6** | G11 — punto de decisión + ramas A/B (§5.2) | Composición | G7, G8 |
| **Fase 7** | Relación cruzada + `PedidoExceptionPanel` + riesgo en el peek (§5.3, §6.2) | Hub | G4, G7 |
| **Fase 8** | Recurrentes integrado (§6.1) | Composición | G2 |
| **Fase 9** | hardening offline/estados (§4.7) | todas | G9 |
| **Fase 10** | migración gradual + retiro de legacy | todas | todos |

Verificación por PR (protocolo AGENTS.md): `npx tsc --noEmit` · `npm run test` · integración Postgres para PRs de endpoints · `npx eslint . --max-warnings 0` · Playwright de la fase. Ninguna fase se cierra por "compila".

---

## §8. PENDIENTES DE NEGOCIO (no se resuelven en el blueprint)

### 8.1 SLA de entrega
No existe hoy una regla que determine cuándo un pedido EN_RUTA lleva "demasiado" sin entregar. El foco "En ruta" es informativo (sin color) hasta que negocio defina el SLA. No se inventa un umbral desde UX.

### 8.2 Umbrales monetarios y política de control
PENDIENTE: umbrales monetarios · cuándo un precio manual requiere autorización · cuándo aplica doble control · separación de funciones (quien prepara no aprueba). Hasta esa decisión: advertencia contextual + motivo obligatorio + auditoría. No se inventan valores ni políticas.

### 8.3 Consolidación de `/repartidor` dentro del Hub
PENDIENTE de validación UX/arquitectónica. El Pedido representa la obligación comercial; Embarque/Ruta representa la ejecución logística. El blueprint solo define los puntos de contacto (una operación creada/corregida en el Hub fluye a la cola del repartidor con dirección-snapshot, señales de riesgo y pendientes N2). La fusión no está aprobada.

---

## §9. BRECHAS PLAN ↔ CÓDIGO

### 9.1 `POST /api/pedidos/preview` no existe
El Plan Técnico §13 recomienda una operación de preview server-side que devuelva `{ calculation, permissions, allowedActions, warnings, riskSignals, requiresAuthorization, auditPreview }`. Hoy solo existe `/api/precios/resolver` (precio) + derivación client-side de transiciones. **Clasificación: BRECHA PLAN ↔ CÓDIGO.** Es prerequisito de las Fases 4 y Composición.
**Contrato definido (2026-09-07) en `02-api-contract-pedidos.md` § "Endpoint nuevo (Fase 4)"** — request/response completos, autoridad reutilizada (cero lógica nueva), read-only garantizado, `requiresAuthorization` siempre `false` hasta que exista la política de §8.2. Pendiente: aprobación del contrato → plan de implementación (writing-plans) → código.

### 9.2 `GET /api/pedidos/[id]` no incluye N2 ni relaciones completas
Hoy incluye `factura` (lazy) + enriquecimiento de cliente/negocio. La capa 2 del peek necesita además `ObligacionPendiente`/`Actividad`, resumen de embarque y pedidos vinculados por `pedidoOrigenId`. **Clasificación: gap de contrato, additivo.** Se extiende el endpoint (o se crea uno dedicado para el peek) en la Fase 4/7. Sin cambio de schema.

### 9.3 `PatronConsumo` solo se expone vía `GET /api/clientes/[id]`
"Repetir" (intención 3) lo reusa junto con la última operación válida y la `PlantillaRecurrente`. **No es una brecha** — es la fuente correcta; se documenta para que no se construya un "motor de patrones" nuevo.

---

## §10. Revisión final de consistencia

Pasada de auditoría pedida por el PO (2026-09-07). Contradicciones, ambigüedades, reglas inventadas, alcance accidental, diferencias decidido ↔ código.

| # | Hallazgo | Clasificación | Resolución en este documento |
|---|---|---|---|
| C1 | La ALS §6 describe la máquina de estados como secuencia lineal; el blueprint la hace adaptativa | Refinamiento aprobado, no contradicción | §3.2 lo declara explícito: la secuencia de la ALS es la ruta máxima; el flujo adaptativo omite REVIEW/AUTHORIZATION cuando la política no los exige |
| C2 | `POST /api/pedidos/preview` asumido por el blueprint, no existe | BRECHA PLAN ↔ CÓDIGO | §9.1 — se construye conforme al Plan Técnico §13 antes de Fase 4 |
| C3 | El peek capa 2 necesita datos que `GET /api/pedidos/[id]` no devuelve (N2, relaciones) | Gap de contrato additivo | §9.2 — se extiende el endpoint, sin schema |
| C4 | Foco "En ruta" rojo requería un umbral temporal inexistente | Regla que se evitó inventar | §2.2 + §8.1 — sin color hasta que negocio defina el SLA |
| C5 | Umbral de precio manual / doble control | Regla que se evitó inventar | §5.3 + §8.2 — advertencia + motivo + auditoría, sin umbral |
| C6 | "Repetir" podía leerse como un motor de patrones nuevo | Riesgo de alcance accidental | §3.4 + §9.3 — reusa `PatronConsumo` + última operación + `PlantillaRecurrente`, no construye nada |
| C7 | `/repartidor` → absorción en el Hub | Alcance accidental evitado | §8.3 — PENDIENTE de validación, no aprobado |
| C8 | "cobro" podía expandirse a rediseñar Cartera | Alcance accidental evitado | §1.4 + §5.3 + §6.2 — Pedidos no rediseña Cartera; solo señales en puntos financieros del flujo |
| C9 | Comando "planificar hoy" podía ejecutar Auto-Generar de Embarques | Alcance accidental evitado | §3.7 — "Abrir planificación de hoy" navega, no ejecuta |
| C10 | Info de Cartera (deuda del cliente) vs saldo del Pedido podían confundirse en el peek | Ambigüedad resuelta | §6.2 — distinción obligatoria y explícita en el peek |
| C11 | `CLIENTE_NO_VERIFICADO` y otras señales — usar definición existente | Regla inventada evitada | §5.3 — se usa la definición exacta de `alertas-config.ts`; lo inexistente queda PROPUESTA |
| C12 | `nombreNegocio` legacy vs `Negocio` formal | Diferencia decidido ↔ código | §2.4 — el Hub usa `Negocio` formal (coherente con CLAUDE.md #19) |

Sin contradicciones abiertas. Los PENDIENTES (§8) y BRECHAS (§9) están clasificados, no resueltos por invención.

---

## Anexo — Componentes (ALS §5) y su estado

| Componente | Estado | Fase |
|---|---|---|
| `PedidoContextPanel` | existe (#218) — se recompone | Composición |
| `PedidoItemEditor` | existe (#219) — se recompone | Composición |
| `PedidoPricingSummary` | existe (#217) — se recompone | Composición |
| `PedidosWorkspace` | nuevo | Composición |
| `PedidoIntentPicker` | nuevo (el FAB actual es el punto de partida) | Fase 4 |
| `PedidoProposal` | nuevo | Composición |
| `PedidoRiskSignals` | nuevo — consume `alertas-*` | Composición / Fase 7 |
| `PedidoReview` | nuevo | Composición |
| `PedidoCommitBar` | nuevo — representación adaptativa | Composición |
| `PedidoActivityTimeline` | nuevo | Fase 4 (peek capa 2) |
| `PedidoCommandMenu` | nuevo | Fase 4 |
| `PedidoAuditDiff` | nuevo | Fase 6 (peek capa 3) |
| `PedidoExceptionPanel` | nuevo — consume `Caso` / N2 | Fase 5 / 7 |
