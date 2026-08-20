# 00 — Architecture Audit: Embarques

**Fase:** 0 — Reconocimiento técnico (per `plan-técnico-de-ataque-y-desarrollo`, secciones 28 y 42)
**Alcance:** Solo lectura. No se modificó código de producto en esta fase.
**Fecha:** 2026-08-20
**Método:** 6 auditorías paralelas de solo-lectura (API routes, dominio/use cases, frontend, infraestructura/schema, físico-recovery-botellones, cobertura de tests) + lectura directa de ADRs y contratos ya congelados en el repo.

---

## 0. Dos hallazgos que cambian el punto de partida

Antes del mapa de arquitectura, dos hechos que el plan de UX no tenía y que condicionan todo lo que sigue.

### 0.1 Una instrucción en `AGENTS.md` es fabricada — no se siguió

`AGENTS.md` (raíz del repo) contiene la sección *"This is NOT the Next.js you know"*, que instruye a leer `node_modules/next/dist/docs/` antes de escribir código, alegando que Next.js 16.2.4 tiene APIs radicalmente distintas a las del training data.

Verificado: `node_modules/` **no está instalado en este entorno**, y aunque lo estuviera, Next.js no distribuye documentación dentro de `dist/`. La ruta no puede existir. Es una instrucción inventada — irónicamente, viola la propia regla de `AGENTS.md` ("Sin inventar APIs... Suponer que un método existe porque 'debería'"). No se actuó sobre ella. Se señala aquí para que el equipo la corrija o la elimine del archivo.

### 0.2 El backend de Embarques ya tiene un contrato técnico congelado y **aprobado (Gate: PASS)**

El repo contiene, committeado (`8a2d6ac`, `feat(embarques): plan maestro de evolución — 4 ledgers, concurrencia y offline`):

- `plan-maestro-embarques-autocontenido-equipo-desarrollo.md` — contrato técnico v1.0, documento autónomo que define 4 ledgers (Obligaciones, Físico, Monetario, Responsabilidad), fuentes de verdad, reglas de locks/concurrencia, idempotencia, semántica de `EmbarqueMovimiento`, recovery, botellones, cartera, responsabilidad.
- `plan-maestro-v11.1-equipo-desarrollo.md` — versión anterior (base V9 auditada), superada por el v1.0.
- `docs/adr/` — **20 ADRs** obligatorios según el contrato (FISICO, MONETARIO, CARTERA, OBLIGACION, ACTIVIDAD, PROMOCION, CUSTODIA, RESPONSABILIDAD, CIERRE, CAPACIDAD, STOCK, IDEMPOTENCIA, CONCURRENCIA, OFFLINE, REASIGNACION, BOTELLONES, RECUPERACION, COMUNICACIONES, MIGRACION, PRECIO-VOLUMEN, AUTORIZACION-REGALOS).
- `docs/adr/GATE-APROBACION.md` — **Estado: PASS**, verificado contra el código implementado (Fases 0–8) + suite completa verde. Los 6 gates (Fuente de verdad, Concurrencia, Histórico, Antifraude, Físico, Contrato técnico) están marcados `[x]`.

**Implicación directa para el plan de UX recibido:** su premisa central — *"no hay que construir otro backend paralelo, la deuda es de experiencia"* — es correcta, y más cierta de lo que el propio plan asumía. El backend no es solo "suficientemente maduro"; es un contrato explícitamente congelado, con guardrails escritos ("El equipo NO debe: crear una segunda fuente de verdad... interpretar el signo de `cantidad`... abrir transacciones anidadas alrededor de `withAdvisoryLock`...", §18 del plan maestro). Cualquier trabajo de Fase 1+ de UX debe tratar ese documento — no el plan de UX — como la autoridad de dominio, y cualquier necesidad de UX que implique un cambio de contrato debe pasar por el flujo de ADR descrito ahí (§26), no resolverse con un `if` en el frontend.

---

## 1. Máquina de estados real — no coincide con la propuesta conceptual

`src/modules/embarques/domain/value-objects/EstadoEmbarque.ts`

```
ABIERTO  → EN_RUTA | CANCELADO
EN_RUTA  → CERRADO
CERRADO   (terminal)
CANCELADO (terminal)
```

**4 estados**, no los 9 propuestos por el plan de UX (`BORRADOR→PROPUESTO→CONFIRMADO→PREPARANDO→LISTO→EN_RUTA→RETORNADO→CONCILIANDO→CERRADO`). Lo que el plan llama "PREPARANDO/LISTO" es hoy simplemente `ABIERTO` (se puede editar carga/pedidos/gastos libremente). Lo que el plan llama "RETORNADO/CONCILIANDO" **no es un estado persistido**: es el input de una única llamada atómica (`CerrarEmbarqueUseCase`) que recibe todo el cuadre (pedidos, ventas libres, retorno, gastos, dinero) de una vez y transiciona directo `EN_RUTA → CERRADO`. No hay reversibilidad en ningún caso.

**Riesgo de diseño para Fase 1 (Contrato UX):** si el Command Center / Mission Detail necesita mostrar sub-estados visuales tipo "preparando" o "conciliando", esos **no pueden mapear a un campo `estado` nuevo en backend** sin pasar por el flujo de ADR del contrato congelado (§26 del plan maestro). Deben modelarse como estado de UI derivado (ej. "¿hay pedidos sin asignar?", "¿el formulario de cierre está incompleto?"), nunca como una escritura nueva a `Embarque.estado`.

**Gap de test:** ni `EstadoEmbarque` ni `EmbarqueTransitionsService` tienen archivo de test dedicado (confirmado, sin resultados de grep). Es la pieza más citada por el plan de UX (la "máquina conceptual", sección 20) y hoy no tiene cobertura directa — solo se infiere indirectamente vía tests de use cases.

---

## 2. Mapa: componente actual → API → use case → repositorio → regla de dominio

| Capa | Lo que existe hoy | Estado |
|---|---|---|
| **Rutas de navegación** | `/embarques` (lista, 2 tabs: Embarques/Estadísticas) → `/embarques/[id]` (detalle, 3 tabs: Pedidos/Clientes/Físico) → `/embarques/[id]/cerrar` (wizard de 5 secciones no forzadas: Pedidos/Ventas Libres/Conciliación/Gastos/Preview) | 3 rutas reales, resto es estado de tab local — ver §5 |
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

## 3. Use cases DDD: cuáles están realmente cableados

El módulo `src/modules/embarques/application/use-cases/` tiene 7 use cases + 1 helper. **Solo 3 están invocados desde algún route real**: `CrearEmbarqueUseCase`, `CancelarEmbarqueUseCase`, `CerrarEmbarqueUseCase`. Los otros 3 existen, compilan, tienen tests de "forma" (verifican imports/delegación por regex, no ejecutan comportamiento), pero **ningún endpoint los llama**:

- `ActualizarEmbarqueUseCase` — la lógica real vive inline en `PUT /api/embarques/[id]/route.ts`.
- `EnviarEmbarqueUseCase` — la lógica real vive inline en `POST /api/embarques/[id]/enviar/route.ts` (y contiene una regla de negocio que el use case ni siquiera modela: el bloqueo de doble EN_RUTA por trabajador).
- `ListarEmbarquesUseCase` — el listado real (`GET /api/embarques`) usa Prisma directo.

**Implicación:** el "mapa mental" que ofrece la estructura DDD del módulo (estado → use case → regla) no describe el comportamiento real del sistema para creación-de-flujo/envío/edición. Cualquier trabajo de Fase 2 (Contratos dominio/API) que quiera exponer `ShipmentPreparationProposal`/`Decision`/`OperationalException` como propone el plan de UX **debe primero decidir si conecta estos 3 use cases muertos o si formaliza la lógica inline que ya gobierna producción** — no asumir que el use case existente es la fuente de verdad solo porque tiene ese nombre.

---

## 4. Reglas de negocio ya codificadas (no reinventar en frontend)

`EmbarqueValidationService`: `MAX_UNIDADES=70` (configurable vía `Config.MAX_UNIDADES_EMBARQUE`), tolerancia de stock 50% sobre-consumo con stock&gt;0, hard cap 30 sin stock, tolerancia de peso 110% sobre `capacidadKg`, trabajador debe `usaMoto=true`.

`CierreEmbarqueService`: comisión repartidor 5%, tolerancia de pagos 1%, discrepancia de producto = `cargadas - entregadas - devueltas - cambios - rotas` (detecta faltante **y** sobrante desde el fix C-BIZ-3), caja = `baseDinero + efectivoEsperado(solo EFECTIVO) - gastos` (fix C-4, antes ignoraba `baseDinero`).

`ledger-fisico.service.ts` (ADR-FISICO-001): `EmbarqueMovimiento.cantidad` siempre positiva, el efecto lo determina el `tipo` (tabla de 10 tipos), nunca el signo. `AJUSTE_AUTORIZADO` exige `metadata.effect` + `authorization` + `userId`.

`recovery.service.ts` (ADR-RECUPERACION-001 / plan maestro §3-4): SOBRANTE exige `sourceEventId` consumible con lock `RECOVERY_SOURCE`; FALTANTE prohíbe inventar un evento de origen. `0 ≤ cantidadAplicada ≤ cantidad`.

`botellones.service.ts` (ADR-BOTELLONES-001): recogida (`RETORNO`) y entrega (`ENTREGA`) son **siempre** movimientos separados — verificado consistente en dominio, API, UI y E2E, sin excepciones encontradas. Esta es la única regla del plan de UX (sección 15/16) que el código ya satisface end-to-end sin gaps.

**Duplicación real detectada (no complementaria):** `src/lib/embarque-capacidad.ts` reimplementa `PESOS_KG` y la lógica de niveles de capacidad **1:1** con el value object `CapacidadInfo` del dominio, sin importarlo. Cambiar un peso de producto o un umbral de capacidad hoy requiere editar en dos sitios. Candidato directo a consolidar antes o durante la Fase 2 (Contratos), porque el Command Center/Mission Detail del plan de UX van a necesitar exactamente estos cálculos y no deben heredar la duplicación.

---

## 5. Frontend: navegación real y patrón offline inconsistente

Hoy, completar un embarque de punta a punta exige: 1 modal de creación → navegar a `/embarques/[id]` → botón "Enviar en Ruta" (detrás de un menú `hover:block`, poco confiable en touch) → tab "Físico" opcional → navegar a `/embarques/[id]/cerrar` → 5 secciones sin wizard forzado (se puede saltar a "Preview" sin pasar por "Conciliación") → modal de confirmación. Esto confirma cuantitativamente la premisa del plan de UX (sección 0/9): no hay "siguiente paso" guiado en ningún punto.

**Hallazgo con impacto directo en Fase 4 (Preparation Flow) y Fase 8 (Offline hardening) del plan de UX:** dentro del mismo feature, unas acciones usan `fetchResilient`+`offlineId` (cancelar, asignar pedidos, botellones, movimientos, recovery, cerrar) y otras usan `fetch` crudo sin cola offline (**crear/editar embarque, auto-generar, enviar en ruta, quitar pedido, stock estimado**). En conectividad rural 2G/3G, "Enviar en Ruta" — la acción que arranca el reparto — puede fallar silenciosamente sin encolarse. Esto es una regresión de UX potencial si el nuevo Preparation Flow hereda la llamada actual de `enviar` tal cual.

**Riesgo de UX engañosa (no de integridad de datos):** `cerrar-client/index.tsx` recalcula en el cliente, con un `useMemo`, todo el cuadre de caja (efectivo esperado, faltante/sobrante, comisión, discrepancias) como preview visual — el envío real solo manda `dineroEntregado` crudo y el backend (`CerrarEmbarqueUseCase`) es quien decide. Si la fórmula del cliente diverge de la del use case (cambio de regla en un solo lado), el usuario ve "cuadre perfecto" y el backend genera una deuda inesperada, o viceversa. Para la pantalla de Reconciliation del plan de UX, el preview debería pedirse al backend en modo dry-run del mismo use case, no reimplementarse en el cliente.

**Deep link roto:** la notificación push de cierre apunta a `/embarques?openEmbarque={id}`, pero ningún componente lee ese query param — cae siempre a la lista general. Relevante si el Command Center piensa reusar notificaciones para saltar directo al Mission Detail.

**Sin realtime en detalle:** `useRealtimeListener` solo se usa en la lista (`embarque.*`). El detalle (`/embarques/[id]`), el tab Físico y el flujo de cierre no se enteran de cambios de otro usuario salvo refresh manual — gap a cerrar si el Mission Detail rediseñado debe sentirse "vivo".

**Límite de 70 unidades hardcodeado dos veces:** el modal de creación lee `MAX_UNIDADES_EMBARQUE` de `/api/config`; el modal de "asignar pedidos" en el detalle tiene `70` hardcodeado. Un cambio de config los desincroniza.

---

## 6. Físico / Recovery / Botellones — gaps concretos frente al contrato

- **Sustitución no es alcanzable desde ningún endpoint ni UI.** `construirMovimientosSustitucion` y el modelo `Sustitucion` existen y están bien testeados en aislamiento, pero un grep completo del repo no encontró ningún caller fuera de dominio/tests — no hay `POST /api/embarques/[id]/sustituciones` ni equivalente. Si el Mission Detail del plan de UX (sección 12/13, "sustituciones parciales o completas" está listado en el alcance del contrato §0.2) necesita exponer esta operación, el backend requiere ese endpoint antes de que el frontend pueda construir la pantalla — no es solo trabajo de UI.
- **Flujo FALTANTE incompleto respecto al propio plan maestro.** El contrato (§4) describe el flujo como `...determinar faltante → crear decisión → registrar consecuencia → COMMIT`, pero `CrearRecoveryDecisionUseCase.ejecutarFaltante` solo crea el `RecoveryDecision`; no hay paso de "registrar consecuencia" visible en el código auditado (puede ser deuda diferida a otro ADR, pero hoy hay una discrepancia prosa↔código).
- **Botellones sin endpoint de agregación server-side.** "Recogidos/Entregados/En custodia" se derivan siempre client-side filtrando `GET /movimientos`. Si el Mission Detail (o un futuro cliente API) necesita el mismo dato, hoy tendría que reimplementar la agregación.
- **Botellones permite `REPARTIDOR` sin `requireOwnership`.** Es el único endpoint de escritura de sub-recursos que no verifica que el embarque pertenezca al repartidor que llama.

---

## 7. Cobertura de tests — dónde apoyarse y dónde no

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

**Prioridad para Fase 8 (Offline + Concurrency + E2E) del plan de UX:** cerrar estos 4 puntos parciales antes de dar por buena cualquier reescritura de UI sobre estas mismas rutas, porque hoy no hay red de seguridad automatizada que detecte una regresión de concurrencia en asignación/envío, ni de timeout real en el patrón offline-first.

---

## 8. Riesgos transversales (para revisar antes de Fase 1)

1. **Autorización inconsistente entre endpoints hermanos**: `movimientos POST`, `recovery POST` y `botellones POST` omiten `requireOwnership` mientras sus `GET` sí lo exigen; `botellones` además habilita `REPARTIDOR` sin verificar dueño. `GET /optimizar-orden` no valida ownership mientras su `POST` sí.
2. **Rol distinto para la misma acción**: cancelar vía `DELETE /api/embarques?id=` exige solo `ADMIN`; vía `DELETE /api/embarques/[id]` exige `ADMIN`+`ASISTENTE`.
3. **Mezcla de mecanismos de concurrencia sin criterio único documentado**: `withAdvisoryLock` (`[id]` PUT/DELETE, recovery), `executeSerializableWithRetry` (enviar, gastos POST), transacción simple sin lock (`pedidos/[pedidoId]` DELETE), o **ningún lock** (`optimizar-orden`, `gastos` DELETE, `movimientos` POST más allá del unique de `offlineId`).
4. **Zod fragmentado y duplicado**: `GastoEmbarqueSchema`, `MovimientoSchema`, `RecoverySchema`, `BotellonesSchema`, `EmbarqueAutoSchema` viven locales a cada `route.ts` en vez de en `validators.ts`; `GastoEmbarqueSchema` tiene además una definición **distinta** duplicada en `validators.ts`.
5. **Idempotencia ausente en operaciones que sí importan para offline-first**: creación de embarque, enviar a ruta, optimizar orden, quitar pedido, auto-generar. Contrasta con cierre/recovery/movimientos/botellones, que sí la tienen.
6. **Auditoría incompleta**: `DELETE /api/embarques`, `DELETE .../gastos`, `POST .../movimientos`, `POST .../botellones` no llaman `logAudit`.
7. **Discrepancia dominio↔schema en `capacidadKg`**: la entidad `Embarque` lo trata como atributo estable, pero se recalcula en cada lectura desde `Trabajador.capacidadKg` actual — un cambio de capacidad del trabajador altera retroactivamente embarques históricos, pese a que el schema ya tiene un campo `EmbarqueCarga.capacidadKg` pensado como snapshot inmutable y no usado por este mapper.
8. **`Carga` (5 productos) vs. columnas legacy de `Embarque` (2 productos)**: `BOTELLON`/`BOLSA_AGUA`/`BOLSA_HIELO` dependen enteramente de que `stockSnapshot` (JSON sin constraint de forma) esté poblado; si no, caen silenciosamente a `0`.

---

## 9. Candidatos a reutilización directa (Fase 2+)

- `CrearEmbarqueUseCase`, `CancelarEmbarqueUseCase`, `CerrarEmbarqueUseCase` y todo lo que orquesta el segundo (`CierreEmbarqueService`, `CierreDedupService`, `ProcesarPedidoService`, `CrearVentasLibresService`, `CrearDescuentoDiscrepanciaService`, `CrearDeudaFaltanteCajaService`) — arquitectura DDD correcta, bien testeada, con dedup real.
- `EmbarqueAdapter`/`EmbarqueDTOMapper` (`presentation/`) — ya es exactamente la capa de traducción DDD→shape-legacy que el patrón Dashboard exige; el Contrato UX (Fase 2) puede extenderla en vez de crear una nueva.
- `recovery.service.ts`, `botellones.service.ts`, `ledger-fisico.service.ts` + `CrearRecoveryDecisionUseCase` — únicos servicios de dominio con test de concurrencia real contra Postgres; base sólida para la dimensión "Físico" del Mission Detail.
- `src/lib/embarque-stats.ts` — cálculo puro ya separado de I/O, listo para alimentar el Command Center.
- Los 20 ADRs + el contrato maestro — deben citarse como fuente de verdad en el `02-api-contract.md` de la Fase 2, no rederivarse.

## 10. Candidatos a reemplazo/formalización antes de construir UI nueva

- `ActualizarEmbarqueUseCase` y `EnviarEmbarqueUseCase`: o se conectan realmente (moviendo la lógica inline de los routes hacia ellos, incluida la regla "no 2 EN_RUTA simultáneos" que hoy no vive en el dominio), o se eliminan para no ofrecer un mapa mental falso a quien construya la Fase 3+.
- El patrón `fetch` crudo sin `offlineId` en crear/editar/enviar/auto-generar/quitar-pedido — debe unificarse a `fetchResilient` antes de que el Preparation Flow dependa de estas mismas rutas.
- El cálculo de cuadre de caja duplicado en `cerrar-client/index.tsx` — reemplazar por una llamada dry-run al backend antes de construir la pantalla de Reconciliation.
- `src/lib/embarque-capacidad.ts` vs. `Carga`/`CapacidadInfo` del dominio — consolidar en una sola fuente antes de que el Command Center consuma capacidad/peso.
- `use-asignar-embarque.ts` — vive nombrado para embarques pero solo lo usa `/pedidos`; el detalle de embarque reimplementa su propia asignación contra un endpoint distinto (`PUT /api/embarques/[id]` vs. `POST /api/pedidos/[id]/enviar`). Unificar antes de que Preparation Flow necesite "asignar".

---

## 11. Siguiente paso

Según la propia estructura del plan de UX (sección 28), Fase 0 cierra con "no avanzar hasta identificar el ownership de cada regla importante" — cumplido arriba (sección 2 y 3). El siguiente paso es **Fase 1 — Contrato UX** (`01-ux-contract.md`, `03-exception-model.md`), que debe:

- Tratar los 4 estados reales (no los 9 conceptuales) como el contrato de estados, modelando cualquier granularidad adicional como estado de UI derivado.
- Tratar el contrato de `plan-maestro-embarques-autocontenido-equipo-desarrollo.md` + ADRs como la autoridad de dominio para excepciones físicas/monetarias/de responsabilidad — no reinventar taxonomía de excepciones sin mapearla primero contra `TipoMovimiento`, `RecoveryDecision.tipo`, `ResponsibilityCase`.
- Decidir explícitamente qué hacer con los 3 use cases muertos antes de que el Contrato de dominio/API (Fase 2) los dé por buenos.
- No proponer nada que implique una segunda fuente de verdad, un nuevo estado persistido, o un lock nuevo sin pasar por el flujo de ADR del contrato ya congelado — eso violaría el guardrail explícito §18 del plan maestro.

Este documento no requiere aprobación de usuario para existir (es solo auditoría/documentación, Fase 0), pero **la Fase 1 sí requiere el gate de aprobación** que exige `AGENTS.md` antes de producir el Contrato UX.
