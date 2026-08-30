# INVENTARIO DE CAPACIDADES — Distribución / Rutas / Planificador

**Entregable:** Fase 0 del Plan Técnico Rutas + Planificador v4.
**Fecha:** 2026-08-30
**Base:** repositorio verificable. Rama inspeccionada: `fix/e2e-recuperacion-8-8`
(los contratos del backend de Embarques — `docs/embarques/00-plan-frontend-completo.md`,
`02-api-contract.md`, `ONBOARDING-EQUIPO.md`, `PENDIENTE.md` — **no** están en esta
rama; viven en las ramas `feat/embarques-fase*`. Consultarlos ahí para F1/ADR-003).
**Método:** lectura directa de `prisma/schema.prisma`, `src/lib/**`,
`src/app/api/**`, `src/app/(app)/**`, `src/modules/embarques/**` + queries contra la
DB (ver §12).

---

## 0. Resumen ejecutivo

### 0.a — Estado de los datos y decisión de alcance (2026-08-30)

Las queries de §12 contra Supabase producción muestran **poca demanda de reparto
histórica** (Jun 8 · Jul 4 · Ago 3 pedidos `DOMICILIO` planificables/mes) y una
**base geográfica casi vacía** (1.1% de clientes con coordenadas, 0 pedidos con
GPS, 0% con `rutaId`, 7 embarques en toda la historia).

**Contexto que explica esos números (aportado por el PO):** el conteo bajo **no es
señal de demanda** — es un artefacto de instrumentación:
- **El módulo de Embarques no funcionaba** (recién reescrito: backend de 23 ADRs +
  rework de frontend fases 5-10). El reparto no se registraba porque la
  herramienta estaba rota.
- **La app aún no se entregó a los repartidores.** Por eso `Pedido.gpsLat/gpsLng`
  está en 0 — no hay nadie capturando GPS todavía. No es un bug: es un rollout
  pendiente.
- Las rutas **también se crean a mano**, y los datos se van recolectando poco a
  poco a medida que la operación entra en régimen.

**Decisión (PO):** **se construye F2–F7.** El Planificador debe estar listo
*cuando* el reparto entre en régimen, no meses después. Los números actuales se
tratan como **piso, no como techo**.

**Ajustes al plan que imponen los datos** (no cambian el alcance, cambian el orden
y el diseño):

1. **La base geográfica es prerequisito duro de F2**, independiente del volumen.
   Con 1% de coords el motor no produce nada útil. Antes o en paralelo con F2:
   - Backfill desde `linkUbicacion` (62 clientes activos con link; 58 con coords
     inline + 2 short URLs resueltas = **60 recuperables**). Script listo:
     `scripts/backfill-coords-clientes.ts` (usa `backfillClienteCoords` canónico,
     resuelve short URLs, idempotente). Correr contra prod:
     `DATABASE_URL="$DIRECT_URL" npx tsx scripts/backfill-coords-clientes.ts --dry-run`
     y luego sin `--dry-run`. Sube cobertura de coords de **1% → ~35%**.
   - Asegurar que el rollout de la app de repartidores capture GPS en la entrega,
     para que el historial se acumule (la palanca de backfill "mediana GPS"
     depende de esto).
2. **El motor debe degradar con gracia a bajo volumen.** Para 2-3 paradas no debe
   hacer clustering pesado: "acá están los pedidos de hoy, este es un orden
   sensato, confirmá". El valor de DBSCAN/TSP multi-grupo aparece a escala; el
   motor tiene que servir en ambos extremos (criterio de aceptación de F2).
3. **La creación manual de ruta/plan es un camino de primera clase, no un
   fallback.** El humano puede armar el plan del día a mano cuando quiera; el
   sistema propone pero no obliga. Va en la misma pantalla "Hoy", no en un CRUD
   separado.
4. **F7 (validación) no puede ser baseline comparativo todavía** — no hay
   operación previa contra la cual comparar. F7 pasa a ser **modo sombra /
   dogfood** durante las primeras semanas de reparto real, más los E2E
   deterministas.
5. **Calibración de pesos del optimizador (v4 §17): diferida** hasta tener semanas
   de operación real. F2 arranca con pesos por defecto documentados en ADR-001.

### 0.b — Decisiones del PO (2026-08-30) sobre los ADRs

- **`/api/embarques/auto` → DEPRECADO.** El Planificador lo reemplaza, no coexisten.
  Se marca `@deprecated` ahora; en F6 el botón "Auto-Generar" de Embarques se
  re-apunta al flujo del plan; cleanup del endpoint post-validación. Esto
  **desbloquea** el rework diferido de crear-embarque/auto-generar
  (`memory/embarques-auto-generar-es-el-objetivo`). Ver ADR-PLANIFICADOR-003 §3.
- **Cobros SÍ se va a necesitar** (no "si acaso"). El schema del MVP ya soporta
  `PlanActividad tipo=COBRO|RECOGIDA_BOTELLON`; el código del MVP es entregas-only.
  Epic de cobros = siguiente, con 2 ADRs prerequisito nombrados
  (`ADR-EMBARQUES-ACTIVIDAD-PLAN`, `ADR-PLANIFICADOR-CARTERA`). Ver ADR-PLANIFICADOR-006.
- **UI del MVP = reconstrucción completa** (v4 §35), no las 4 pantallas mínimas.
  F5 rehace arquitectura de información, layouts, navegación, formularios,
  tablas/listas, filtros, estados, mapa, interacciones, responsive, a11y.
- **Motor marca-para-revisión** (no auto-recalcula) en el MVP. ADR-PLANIFICADOR-005.
- Nombres: `PlanDia / PlanGrupo / PlanParada / PlanActividad`. Módulo
  `src/modules/planificador/`. API `/api/rutas/planes/*`.

**Disparador de recalibración:** re-correr §12 cada mes. Cuando `DOMICILIO`
planificable pase de ~1/semana a decenas/día, subir la agresividad del motor
(clustering, multi-grupo, penalización de estabilidad) y calibrar pesos.

Números completos en §16. El inventario técnico (§1–§15) es el mapa de
composición para F2.

---

### 0.b — Inventario técnico (válido cuando se retome)

**El motor MVP se construye por composición, no desde cero.** El ~60-70% de las
piezas algorítmicas ya existen y están testeadas:

- **Clustering geográfico:** DBSCAN completo (`src/lib/geo/dbscan.ts` + `cluster-clientes.ts`).
- **Secuenciación:** TSP heurístico NN + 2-opt (`src/lib/geo/tsp.ts` + `optimize-ruta.ts`).
- **Distancia:** Haversine (`src/lib/geo/haversine.ts`).
- **Agrupación + capacidad + repartidor:** `POST /api/embarques/auto` (`computePreview`)
  + `src/lib/embarque-auto.ts` (`splitPedidosByCapacity`, `unidadesPedido`, `pesoPedido`).
- **Coords efectivas / ruta efectiva:** `pickCoords`, `pickRutaId`.
- **Afinidad barrio→repartidor + conflictos de territorio:** `src/lib/route-analysis.ts`.
- **Demanda por cliente (R/F, score, valor típico):** `src/lib/demanda/**` + cron diario.
- **Concurrencia / idempotencia / offline:** `withAdvisoryLock`, `executeSerializableWithRetry`,
  `fetchResilient`, `requestQueue` Dexie v5, patrón `offlineId @unique`.
- **Auditoría / realtime / logging:** `logAudit` + `Historial`, `publishRealtimeEvent`, pino, Sentry.

**Lo que hay que CONSTRUIR** (ver §11): el agregado de planificación y su
persistencia, el orquestador del motor (pipeline elegibilidad→…→propuesta), la
capa de scoring/estabilidad, el modelo de excepciones del planificador, el
versionado, la explicabilidad, la API, y la UI completa.

**Lo que NO se toca:** el backend de Embarques (congelado, 23 ADRs), `/api/embarques/auto`
(hasta ADR-003), el sistema de auth, y NO se implementa multitenancy/RLS.

**Decisión de arranque:** el MVP **puede empezar por F2 (motor) sin depender de una
población perfecta de `Cliente.rutaId`**, usando la jerarquía de señales del v4 §11.
Condición: correr las queries de §12 **contra Supabase producción** y confirmar que
el % de clientes activos con coords o con barrio utilizable supera un piso operable
(propuesta de piso: ver §12). Si no lo supera → sprint de backfill primero
(`backfillClienteCoords` ya existe, ver §4).

---

## 1. Tabla maestra de capacidades

Clasificación: **REUTILIZAR** (usar tal cual) · **ENVOLVER** (adaptador fino
alrededor, sin tocar el original) · **ADAPTAR** (cambio menor en el original) ·
**EXTENDER** (agregar capacidad al original) · **REEMPLAZAR** · **CONSTRUIR**.

| # | Capacidad | Archivo(s) | Estado real | Acción | Notas / riesgo |
|---|---|---|---|---|---|
| 1 | Distancia geodésica | `src/lib/geo/haversine.ts` | Completo, testeado | **REUTILIZAR** | Sin distancia vial. §13 ADR-004 decide si alcanza |
| 2 | Clustering espacial | `src/lib/geo/dbscan.ts`, `cluster-clientes.ts` | DBSCAN completo (eps 1.5km, minPts 3); `previewClusters()` corre sobre `Cliente` con coords | **ENVOLVER** | Hoy filtra por `pedidos.some(estado IN PENDIENTE/EN_RUTA)`. El planificador necesita clusterizar la *demanda elegible de una fecha*, no "clientes con pedidos abiertos". Envolver con el set de pedidos elegibles de ADR-002 |
| 3 | Secuenciación (TSP) | `src/lib/geo/tsp.ts`, `optimize-ruta.ts` | NN + 2-opt, ≤25 stops; `optimizeEmbarqueOrden(embarqueId)` persiste en `Embarque.ordenVisita` | **ENVOLVER** | `optimize-ruta.ts` está atado a `embarqueId`. Extraer un `secuenciar(puntos: TSPPoint[])` puro (el core `optimizeRuta` de `tsp.ts` ya es puro — usarlo directo) |
| 4 | Agrupación por ruta/barrio | `src/app/api/embarques/auto/route.ts` `computePreview()` | Agrupa `negocio.rutaId ?? cliente.rutaId ?? barrio ?? 'SIN_RUTA'`; elige repartidor disponible (`ruta.repartidorId` o hash); `dryRun` devuelve propuesta | **ENVOLVER / REFERENCIA** | **No modificar** (v4 §23, ADR-003). Es la referencia de "cómo se agrupa hoy". El planificador reimplementa la agrupación con más señales; ADR-003 decide si `auto` pasa a consumir el plan |
| 5 | Split por capacidad | `src/lib/embarque-auto.ts` `splitPedidosByCapacity`, `unidadesPedido`, `pesoPedido` | Greedy chunking puro, testeado (`__tests__`) | **REUTILIZAR** | Usa `PESOS_KG` (§6). `MAX_UNIDADES = 70`, override por config `MAX_UNIDADES_EMBARQUE` |
| 6 | Pesos por producto | `src/lib/embarque-capacidad.ts` `PESOS_KG` | PACA_AGUA 10, PACA_HIELO 11, BOTELLON 20, BOLSA_AGUA 0.25, BOLSA_HIELO 0.55 (kg) | **REUTILIZAR** | — |
| 7 | Coords efectivas del pedido | `src/lib/geo/pedido-coords.ts` `pickCoords` | Regla única: negocio gana, fallback cliente; salta `null` antes del cast | **REUTILIZAR** | Contrato documentado en `schema.prisma`. 5 consumidores ya alineados |
| 8 | Ruta efectiva del pedido | `src/lib/pedido-ruta.ts` `pickRutaId` | negocio.rutaId → cliente.rutaId → `null` | **REUTILIZAR** | ⚠️ devuelve `null` para la mayoría de pedidos de domicilio (ver §5). Señal, no partición |
| 9 | Dirección efectiva | `src/lib/geo/pedido-direccion.ts` `pickDireccionTexto` | override pedido → negocio → cliente → 'ninguna' | **REUTILIZAR** | — |
| 10 | Backfill de coords cliente | `src/lib/geo/backfill-cliente-coords.ts` | `linkUbicacion` parseado → mediana GPS histórico (50) → `negocioDefault` → null; persiste `geocodeOrigen`+`geocodeAt` | **REUTILIZAR** | Herramienta clave si §12 muestra baja cobertura de coords |
| 11 | Backfill de coords negocio | `src/lib/geo/backfill-negocio-coords.ts` | idem sin auditoría de origen | **REUTILIZAR** | — |
| 12 | Expansión short-URL Maps | `src/lib/geo/expand-short-maps-url.ts` | Server-only, allowlist SSRF, tope redirects | **REUTILIZAR** | — |
| 13 | Afinidad barrio→repartidor + conflictos | `src/lib/route-analysis.ts` `analizarPatronesEntrega` | Hasta 5000 pedidos `ENTREGADO` con embarque; % share por barrio/repartidor; sugerencias "asignar barrio a ruta" | **ENVOLVER / EXTENDER** | Señal histórica valiosa disponible **sin** `Cliente.rutaId`. Extender para exponer "afinidad de este pedido con grupo X" |
| 14 | Barrios sin ruta | `src/lib/route-analysis.ts` `obtenerBarriosSinRuta` | — | **REUTILIZAR** | Alimenta métrica de cobertura |
| 15 | Demanda por cliente (R/F) | `src/lib/demanda/rfm.ts` | `intervaloMediano` (mediana de intervalos, filtra outliers), `proxEsperada`, `diasAtraso` | **REUTILIZAR** | Señal, no restricción (v4 §16) |
| 16 | Score de llamada | `src/lib/demanda/scoring.ts` | `diasAtraso*1.0 + valorTipico/50000*0.5` | **REUTILIZAR** | Insumo de preventa (post-MVP). No usar en el motor de agrupación v1 |
| 17 | Forecast por día de semana | `src/lib/demanda/forecasting.ts` | Agregado para producción (promedio/desv por weekday) | **REUTILIZAR (post-MVP)** | No es forecast por cliente. Fuera del MVP del motor |
| 18 | Recompute demanda (cron) | `src/lib/demanda/recompute-cliente.ts` + `src/app/api/cron/recompute-scores/route.ts` | Idempotente; escribe campos de demanda en `Cliente`; corre 6am Colombia | **REUTILIZAR** | — |
| 19 | Campos de demanda persistidos | `Cliente.intervaloMediano/proxEsperada/diasAtraso/scoreLlamada/valorTipico/scoreRecalculadoEn/ultimaLlamada` + `frecuencia/cadaNDias/ultEntrega/proxEntrega` | Ya en schema, indexados (`scoreLlamada`, `diasAtraso`, `proxEntrega`, `frecuencia`) | **REUTILIZAR** | — |
| 20 | Pedidos en riesgo / sin asignar | `src/lib/pedidos-sin-asignar.ts` | `whereAtrasadosSinAsignar()`, `findPedidosHoyEnRiesgoIds()` (usa `UMBRAL_EMBARQUES_RIESGO=3`, `business-hours.ts`) | **REUTILIZAR / EXTENDER** | Buen punto de partida para "elegibilidad" (ADR-002) |
| 21 | Modelo `Ruta` | `prisma/schema.prisma:282` | `nombre, dias (CSV string), repartidorId, repartidorRespaldoId, horarioInicio/Fin, clientes[], negocios[], embarques[]` | **EXTENDER** | Sin paradas, sin secuencia, sin capacidad, sin polígono. "Ruta habitual" del v4 §4 necesita señales derivadas (afinidad/cobertura) — probablemente calculadas, no columnas |
| 22 | CRUD `/rutas` + análisis | `src/app/api/rutas/**`, `src/app/(app)/rutas/**` | Lista + form (nombre/días/repartidor/horario) + `/rutas/analisis` (dashboard de `route-analysis`) | **REEMPLAZAR (UI)** | `POST/PUT /api/rutas` ya tienen tx + optimistic lock por `updatedAt`. La UI es CRUD "arma ruta a mano" → modelo equivocado, se reconstruye (v4 §35) |
| 23 | Cluster preview API | `src/app/api/clientes/cluster-preview/route.ts` | `GET`, auth ADMIN/ASISTENTE, corre `previewClusters` | **REUTILIZAR / EXTENDER** | Sin consumidor de UI hoy. Base para la vista "Análisis" |
| 24 | `Actividad` / `ObligacionPendiente` | `prisma/schema.prisma:1112,1136` | `Actividad` cuelga de `ObligacionPendiente`, opcional `embarqueId`; `ActividadTipo {ENTREGA,RECOGIDA_BOTELLON,COBRO}`; en prod **siempre `ENTREGA`** | **VERIFICAR (ADR-006)** | Dominio Fase 3 de Embarques (**congelado**). Reusarlo puede requerir un ADR *de Embarques*. `COBRO`/`RECOGIDA_BOTELLON` nunca se producen |
| 25 | `CrearEmbarqueUseCase` | `src/modules/embarques/application/use-cases/CrearEmbarqueUseCase.ts` | Input `{trabajadorId, rutaId?, carga, tipoMoto?, baseDinero?, horaSalida, obs?, offlineId?, maxUnidades?, verificarStock?}`; lock `EMBARQUE_CARGA:{trabajadorId}:{fecha}`; dedup por `offlineId`; valida moto/unidades/peso/stock | **REUTILIZAR (materialización)** | Candidato para "confirmar plan → crear embarques" (ADR-003) |
| 26 | Auth / permisos | `src/lib/auth-check.ts`, `src/lib/permissions.ts`, `src/proxy.ts` | NextAuth JWT → `requireAuth` → `requireRole`/`requireOwnership`; permiso `view:rutas` (ADMIN, ASISTENTE, CONTADOR; **no** REPARTIDOR); roles DB `app_read`/`app_write` | **REUTILIZAR** | Sin RLS. Sin multitenancy. `requireOwnership` solo chequea real para REPARTIDOR |
| 27 | Concurrencia | `src/lib/locks.ts` (`withAdvisoryLock`, namespaces `CARTERA/PEDIDO/RECOVERY_SOURCE/OBLIGACION/EMBARQUE_CARGA/CIERRE/SECUENCIA`), `src/lib/serializable.ts` (`executeSerializableWithRetry`, 3 retries P2034) | Maduro, usado en todo el dominio crítico | **EXTENDER** | Agregar namespace `PLAN` (o similar) a `LOCK_NAMESPACES` |
| 28 | Optimistic locking | patrón `updateMany where {id, updatedAt}` (ej. `PUT /api/rutas`) | — | **REUTILIZAR** | Para el `expectedVersion` del confirm (v4 §32) |
| 29 | Idempotencia offline | `Pedido.{offlineId,envioOfflineId,entregaOfflineId,anulacionOfflineId,cancelacionOfflineId}` `@unique`; `Cliente/Actividad/GpsTrack/... .offlineId @unique` | Patrón "ADR-IDEMPOTENCIA-001" | **EXTENDER** | Clave idempotente dedicada por comando reintentable del plan |
| 30 | Offline infra | `src/lib/fetch-resilient.ts`, `src/lib/db/offline.ts` (Dexie v5: `requestQueue`, `failedItems` DLQ), `src/lib/db/sync.ts` (`syncWithServer`) | Maduro | **REUTILIZAR** | Corte del v4 §33: generar = online; consultar + overrides = offline |
| 31 | Realtime | `src/lib/realtime.ts` `publishRealtimeEvent(type, id)` (Redis pub/sub, canal `bambu:events`), `/api/realtime` SSE | Entidades: `cliente/pedido/embarque/pago/gasto/compra/produccion/trabajador/config`; acciones `created/updated/deleted` | **EXTENDER** | Agregar entidad `route_plan` (o similar). Evento pequeño `{type,id,timestamp}` |
| 32 | Auditoría | `src/lib/audit.ts` `logAudit({entidad,registroId,accion,datos,usuarioId})` → tabla `Historial` (`prisma/schema.prisma:1962`) | Acciones `CREATE/UPDATE/DELETE/RESTORE/LOGIN/...` | **REUTILIZAR** | Cubre versionado/overrides/replanificación del plan |
| 33 | Logging / errores | pino (`src/lib/logger.ts`), Sentry 10.55 | estructurado, request-id | **REUTILIZAR** | — |
| 34 | Config runtime | `getConfigInt('MAX_UNIDADES_EMBARQUE', …)` etc. (`src/lib/config.ts`) | Keys existentes: `MAX_UNIDADES_EMBARQUE`, `UMBRAL_HORAS_HABILES_RIESGO`, `BASE_DIA`, `LIMITE_PEDIDOS_FIADOS_DEFAULT`, `REQUIERE_GPS_PARA_ENTREGA`, … | **REUTILIZAR / EXTENDER** | Pesos del optimizador (v4 §17) como config, no hardcode |
| 35 | Horarios / turnos | `src/lib/business-hours.ts` (`minutosHabilesTranscurridos`, turnos configurables), enum `Turno {MANANA,TARDE,NOCHE}` | — | **REUTILIZAR** | Para restricciones horarias del §16 |
| 36 | API helpers | `apiSuccess`/`apiError` (`src/lib/api-response.ts`), `requireAuth`/`requireRole`, Zod, paginación (`src/lib/pagination.ts`) | Convención del proyecto | **REUTILIZAR** | La API del planificador sigue este envelope |

---

## 2. Elegibilidad de pedidos — estado real (insumo ADR-002)

`Pedido` (`prisma/schema.prisma:640`) lleva **estados desacoplados**:

- `estado` (`EstadoPedido`, **legacy**): `PENDIENTE EN_RUTA ENTREGADO NO_ENTREGADO CANCELADO ANULADO`
- `estadoEntrega` (`EstadoEntrega`): mismos valores, es el canónico
- `estadoPago` (`EstadoPago`): `PENDIENTE PARCIAL PAGADO ANTICIPADO VENCIDO ANULADO`
- `origen` (`OrigenPedido`): `PEDIDO VENTA_RAPIDA VENTA_LIBRE RECURRENTE`

Fechas: **no existe `fechaProgramada`.** Solo `fecha` (creación), `fechaEntrega`
(se setea al entregar), `horaPreferida` (string), `promesaPagoFecha`.

Reglas verificadas relevantes:
- `NO_ENTREGADO` **no vuelve solo a `PENDIENTE`** (no hay job ni trigger).
- `computePreview` (auto) usa hoy: `{ estado: 'PENDIENTE', embarqueId: null }` **sin filtro de fecha**.
- `whereAtrasadosSinAsignar()`: `estadoEntrega IN (PENDIENTE, NO_ENTREGADO)`, `embarqueId: null`, `fecha < startOfDayBogota()`.
- Al asignar a embarque: `estado='EN_RUTA', estadoEntrega='EN_RUTA'` (`PUT /api/embarques/[id]` y `auto`).

**ADR-002 debe fijar:** qué combinación de (`estado`/`estadoEntrega`, `embarqueId`,
`fecha`, `origen`) define "elegible para la fecha F", y qué pasa con el caso
`planificado → embarcado → no entregado → cliente dice mañana` (v4 §21). Rutas
**consume** el estado; no inventa la regla.

---

## 3. Geografía — modelo real (insumo ADR-004)

`Cliente` (`schema.prisma:314`): `direccion?`, `barrio?` (`@@index`), `referencia?`,
`linkUbicacion?`, `lat?`/`lng?` (`Decimal(10,6)`, `@@index([lat,lng])`),
`geocodeOrigen?` (`'PARSED_URL'|'GPS_HISTORIAL'|'NEGOCIO'|'MANUAL'`), `geocodeAt?`.

`Negocio` (`schema.prisma:443`): `direccion?`, `barrio?` (`@@index`), `linkUbicacion?`,
`lat?`/`lng?`, `horaApertura?`. **Sin `geocodeOrigen`/`geocodeAt`** (decisión previa).

`Pedido` (geo): `gpsLat`/`gpsLng`/`gpsAccuracy` (GPS confirmado en entrega),
`direccionEntrega?`/`barrioEntrega?` (snapshot puntual del pedido).

**No existe:** `placeId` / Google Place ID · tabla `Barrio` · polígonos / zonas ·
distancia vial / matriz OSRM · geocoder de direcciones (solo parser de links Maps).

**Calidad/origen:** solo `Cliente.geocodeOrigen` + `geocodeAt`. `Negocio` no tiene.
La jerarquía del v4 §11 es implementable con lo que hay: `pickCoords` (coords) →
`barrioEntrega/barrio` (barrio) → `pickRutaId` (ruta habitual) → afinidad histórica.

---

## 4. Backfill disponible

`backfillClienteCoords(clienteId)` (`src/lib/geo/backfill-cliente-coords.ts`):
prioridad `linkUbicacion` parseado → mediana de `Pedido.gpsLat/gpsLng` de los
últimos 50 confirmados → `negocioDefault` → `null`. Escribe `geocodeOrigen`+`geocodeAt`.
Idempotente. Hay endpoint de geocode de negocio (`POST /api/negocios/[id]/geocode`).

**Si §12 (prod) muestra baja cobertura de coords → sprint de backfill masivo con
esta función antes de F2.** Es trabajo acotado y ya existe el motor.

---

## 5. Cobertura Cliente↔Ruta — riesgo conocido (v4 §10)

`Cliente.rutaId` existe (`schema.prisma:361`, `@@index`) **pero no tiene flujo de
escritura en la UI** — solo `Negocio.rutaId` es editable (`negocio-form.tsx`).
`pickRutaId` (`src/lib/pedido-ruta.ts`) devuelve `null` para la mayoría de pedidos
de domicilio (el propio comentario del archivo lo dice).

**Consecuencia para el MVP:** `ruta habitual` es **señal que mejora la agrupación
cuando está**, no partición requerida. Las señales que SÍ están disponibles sin
`Cliente.rutaId`:
- coords (`pickCoords`) — sujeto a §12
- barrio (`barrio`/`barrioEntrega`) — string libre, alta cobertura esperada
- afinidad barrio→repartidor **derivada del historial** (`route-analysis.ts`, usa
  `Embarque.trabajadorId` + `Pedido` `ENTREGADO`) — no necesita `Cliente.rutaId`

Población de `Cliente.rutaId` → **Post-MVP Epic A**. No bloquea F2.

---

## 6. Congelado por Embarques — qué NO se toca

- **Todo `src/modules/embarques/domain/**` y los use-cases** (23 ADRs, GATE PASS).
  Cambios requieren ADR nuevo aprobado.
- **`Embarque.estado`** solo tiene 4 valores (`ABIERTO EN_RUTA CERRADO CANCELADO`).
  El proyecto **rechaza persistir estados nuevos** — se derivan en cliente
  (`src/lib/embarque-ui-estado.ts`). El plan tiene su **propio** ciclo de estados
  (v4 §29), separado.
- **`POST /api/embarques/auto`** (`computePreview`): no eliminar ni modificar hasta
  ADR-003 (v4 §23, §67.11).
- **`Pedido.embarqueId`**: la materialización física sigue usándolo (v4 §8).
- **Rework de *frontend* de Embarques en vuelo** (fases 5-10, ramas
  `feat/embarques-fase{5,6b,7}-*` sin mergear a `main`). Coordinar: ambos tocan el
  nav "Distribución" y el flujo de creación de embarques. Endpoints aditivos con
  "ADR ligero" están permitidos.

---

## 7. Concurrencia / idempotencia / offline — patrón a adoptar

- **Lock:** `withAdvisoryLock(namespace, key, fn)` — agregar `'PLAN'` a
  `LOCK_NAMESPACES` (`src/lib/locks.ts:30`). Lock por `planId` (o `fecha`) en
  confirmar/replanificar/override.
- **Transacción:** `executeSerializableWithRetry(fn)` (3 retries ante P2034).
- **Versión:** optimistic lock por `updatedAt` o `version` explícito (patrón
  `PUT /api/rutas`). El confirm exige `expectedVersion` (v4 §32) → 409 si difiere.
- **Idempotencia:** `idempotencyKey`/`offlineId` `@unique` dedicado por comando
  (`generar`, `confirmar`, `override`). Replay → devuelve el resultado aplicado con
  `deduped: true`, nunca 500 por constraint.
- **Offline:** `fetchResilient` + `requestQueue`. Corte: **generar/recalcular =
  online-only**; consultar último plan + encolar overrides compatibles = offline.
  Al reconectar: `syncWithServer` valida versión, aplica idempotencia, detecta
  conflicto. Resolución de conflicto de overrides offline (descartar / diff /
  reaplicar) → **decidir en ADR-005**.

---

## 8. Observabilidad / auditoría — qué usar

- **Eventos realtime:** `publishRealtimeEvent(type, id)` (`src/lib/realtime.ts`).
  Agregar entidad `route_plan` → eventos `route_plan.{generated|generation_failed|
  modified|replanned|confirmed|superseded|integration_requested|integration_failed}`
  (v4 §49). **Sin `tenantId`.**
- **Auditoría:** `logAudit({entidad:'RoutePlan', registroId, accion, datos, usuarioId})`
  → tabla `Historial`. Cubre versión/override/replanificación (v4 §30-31).
- **Logs:** pino estructurado + Sentry. Métrica de tiempo de generación vía
  `src/lib/metrics.ts` (`incrementMetric`).

---

## 9. Tests existentes (base de regresión)

Geo: `dbscan.test.ts`, `tsp.test.ts`, `haversine.test.ts`, `optimize-ruta.test.ts`,
`pedido-coords.test.ts`, `pedido-direccion.test.ts`, `backfill-{cliente,negocio}-coords.test.ts`,
`parse-google-maps-link.test.ts`, `expand-short-maps-url.test.ts`.
Demanda: `rfm.test.ts`, `scoring.test.ts`, `forecasting.test.ts`.
Otros: `pedido-ruta.test.ts`, `src/app/api/rutas/__tests__/route.test.ts`,
`e2e/rutas.spec.ts`, `src/lib/embarque-auto` (chunking).
**No hay** test de `route-analysis.ts` ni de `cluster-clientes.ts` → agregarlos al envolver.

---

## 10. Vista de navegación / permisos

Nav: `src/app/(app)/nav-data.tsx:85` — grupo **"Distribución"** ya existe:
`/rutas` ("Planificación") + `/repartidor` ("Ejecución"). Permiso `view:rutas`:
**ADMIN, ASISTENTE, CONTADOR** (no REPARTIDOR — `BLOQUEAR_PRECIOS_REPARTIDOR`).
La nav propuesta del v4 §38 (Hoy / Habituales / Análisis) reemplaza los subitems.

---

## 11. Qué falta realmente — CONSTRUIR

| Pieza | Por qué es nueva | ADR |
|---|---|---|
| **Agregado de planificación** (representación de "planificación de una fecha" + grupos + paradas) | No reusable de `Embarque` (plan ≠ físico, v4 §5). `PlanDia` es solo un nombre conceptual — **no crear tabla por anticipación** | ADR-001 |
| **Persistencia + versionado** | Snapshot + diff + actor + timestamp + causa (v4 §30). Append-only o event log | ADR-001, ADR-005 |
| **Trazabilidad plan↔pedido** | **No asumir FK dura.** Referencia por ID vs. join vs. snapshot; cardinalidad; comportamiento ante cambios del pedido | ADR-002 |
| **Orquestador del motor** (pipeline: elegibilidad → normalización → calidad geo → señales → agrupación → restricciones → secuenciación → evaluación → excepciones → explicación) | Las piezas existen sueltas; el pipeline que las compone no | ADR-001 |
| **Capa de scoring / función objetivo** | `distancia + tiempo + dispersión + incumplimiento de preferencias + cambios innecesarios`; pesos **calibrables (config), no inventados** (v4 §17) | ADR-001 |
| **Penalización por reasignación / estabilidad** | Evitar que un pedido chico reorganice todo (v4 §18) | ADR-005 |
| **Modelo de excepciones del planificador** | `OUTSIDE_USUAL_AREA / LOW_LOCATION_CONFIDENCE / ISOLATED_DEMAND / CAPACITY_CONFLICT / RESOURCE_CONFLICT / SCHEDULE_CONFLICT / NEW_DEMAND / REPLANNING_REQUIRED` (v4). Distinto del modelo de excepciones de Embarques | ADR-001 |
| **Explicabilidad** | "¿Por qué este grupo?" en lenguaje operacional (v4 §34) | ADR-001 |
| **Motor de replanificación** (decidir NO RECALCULAR / RECALCULAR / MARCAR PARA REVISIÓN) | v4 §19 | ADR-005 |
| **API HTTP** (`generar/obtener/modificar/confirmar/versiones/excepciones`) + envelope + `expectedVersion` + `idempotencyKey` + taxonomía de errores | v4 §48. **Sin ADR asignado — plegarlo en ADR-001 o entregable explícito de F1** | ADR-001 / F1 |
| **Contrato de materialización → Embarques** | qué produce el plan, quién crea el embarque, `CrearEmbarqueUseCase` sí/no, `/api/embarques/auto` consume el plan sí/no, fallo parcial, retry | ADR-003 |
| **UI completa** (Hoy / Propuesta / Excepciones / Confirmar / Habituales / Análisis) | El `/rutas` actual es CRUD manual — modelo equivocado. Reconstrucción (v4 §35). Recomendación: MVP = 4 pantallas del camino feliz; mapa/móvil/pulido a11y como fast-follow | — |
| **"Ruta habitual" con señales derivadas** | El modelo `Ruta` no tiene afinidades/cobertura; se calculan (`route-analysis`) y se muestran en el form asistido (v4 §42) | ADR-001 |

---

## 12. Métricas de calidad de datos geográficos — CORRER CONTRA PRODUCCIÓN

⚠️ **La DB local de dev tiene 2 clientes** — no es representativa. Estas queries
**deben correrse contra Supabase producción** (`DIRECT_URL`). SQL validado
sintácticamente contra el schema local.

```sql
-- 1) Cobertura general (clientes activos)
SELECT
  count(*) FILTER (WHERE activo)                                              AS clientes_activos,
  count(*) FILTER (WHERE activo AND lat IS NOT NULL AND lng IS NOT NULL)      AS con_coords,
  round(100.0 * count(*) FILTER (WHERE activo AND lat IS NOT NULL AND lng IS NOT NULL)
        / nullif(count(*) FILTER (WHERE activo),0), 1)                        AS pct_coords,
  count(*) FILTER (WHERE activo AND barrio IS NOT NULL AND btrim(barrio) <> '') AS con_barrio,
  round(100.0 * count(*) FILTER (WHERE activo AND barrio IS NOT NULL AND btrim(barrio) <> '')
        / nullif(count(*) FILTER (WHERE activo),0), 1)                        AS pct_barrio,
  count(*) FILTER (WHERE activo AND "rutaId" IS NOT NULL)                     AS con_ruta,
  round(100.0 * count(*) FILTER (WHERE activo AND "rutaId" IS NOT NULL)
        / nullif(count(*) FILTER (WHERE activo),0), 1)                        AS pct_ruta,
  count(*) FILTER (WHERE activo AND lat IS NULL AND (barrio IS NULL OR btrim(barrio) = '')) AS sin_geo_util,
  count(DISTINCT lower(btrim(barrio))) FILTER (WHERE activo AND barrio IS NOT NULL AND btrim(barrio) <> '') AS barrios_distintos
FROM "Cliente";

-- 2) Procedencia de las coords que sí existen
SELECT coalesce("geocodeOrigen",'(null)') AS origen, count(*)
FROM "Cliente" WHERE activo AND lat IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;

-- 3) Antigüedad del geocode (¿coords viejas?)
SELECT date_trunc('month', "geocodeAt") AS mes, count(*)
FROM "Cliente" WHERE activo AND "geocodeAt" IS NOT NULL
GROUP BY 1 ORDER BY 1;

-- 4) Negocios activos
SELECT count(*) AS negocios_activos,
       count(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL) AS con_coords,
       count(*) FILTER (WHERE "rutaId" IS NOT NULL)                AS con_ruta,
       count(*) FILTER (WHERE barrio IS NOT NULL AND btrim(barrio) <> '') AS con_barrio
FROM "Negocio" WHERE activo;

-- 5) Cobertura sobre la DEMANDA REAL (pedidos entregados últimos 60 días):
--    ¿qué % de pedidos reales tienen coords efectivas?
SELECT
  count(*)                                                                    AS pedidos,
  count(*) FILTER (WHERE coalesce(n.lat, c.lat) IS NOT NULL)                   AS con_coords_efectivas,
  round(100.0 * count(*) FILTER (WHERE coalesce(n.lat, c.lat) IS NOT NULL)
        / nullif(count(*),0), 1)                                              AS pct,
  count(*) FILTER (WHERE coalesce(p."barrioEntrega", n.barrio, c.barrio) IS NOT NULL) AS con_barrio_efectivo
FROM "Pedido" p
JOIN "Cliente" c ON c.id = p."clienteId"
LEFT JOIN "Negocio" n ON n.id = p."negocioId"
WHERE p."estadoEntrega" = 'ENTREGADO' AND p.fecha > now() - interval '60 days';

-- 6) Barrios con más demanda vs. su cobertura de coords (dónde backfillear primero)
SELECT lower(btrim(coalesce(p."barrioEntrega", n.barrio, c.barrio))) AS barrio,
       count(*) AS pedidos_60d,
       round(100.0 * count(*) FILTER (WHERE coalesce(n.lat, c.lat) IS NOT NULL) / nullif(count(*),0), 0) AS pct_con_coords
FROM "Pedido" p
JOIN "Cliente" c ON c.id = p."clienteId"
LEFT JOIN "Negocio" n ON n.id = p."negocioId"
WHERE p.fecha > now() - interval '60 days'
  AND coalesce(p."barrioEntrega", n.barrio, c.barrio) IS NOT NULL
GROUP BY 1 ORDER BY pedidos_60d DESC LIMIT 30;
```

**Piso operable propuesto (a validar con el PO):**
- Query 5 (`pct` coords efectivas sobre demanda real) **≥ 60%** → el motor puede
  arrancar; los pedidos sin coords caen a agrupación por barrio + excepción
  `LOW_LOCATION_CONFIDENCE`.
- Query 5 **< 60%** o Query 1 `pct_barrio` **< 85%** → **sprint de backfill primero**
  (query 6 prioriza qué barrios), usando `backfillClienteCoords` (§4).

---

## 16. RESULTADO REAL de §12 — Supabase producción (2026-08-30)

Corrido vía MCP Supabase (`execute_sql`, read-only) contra el proyecto
`wdttkrlbpcawulaaiapj`.

### Cobertura de datos

| Métrica | Valor |
|---|---|
| Clientes activos | **179** |
| — con coordenadas | **2 (1.1%)** |
| — con barrio | 73 (40.8%) |
| — con `rutaId` | **0 (0.0%)** |
| — sin geo útil (ni coords ni barrio) | 106 (59%) |
| Barrios distintos | 42 |
| Clientes con `linkUbicacion` (backfill posible) | **63 (35%)** |
| Negocios activos | 76 — con coords: 5 (6.6%), con barrio: 51 (67%), con ruta: 0 |
| Pedidos con GPS de entrega (`gpsLat`) | **0** (en toda la base) |
| Clientes con historial GPS | **0** → el backfill "mediana GPS" **no funciona** hoy |

### Volumen y naturaleza de la demanda

| Métrica | Valor |
|---|---|
| Pedidos totales (toda la historia) | 123 |
| Rango real de operación | 23/06/2026 → hoy (~2 meses) |
| Pedidos por estado | 97 ENTREGADO · 11 ANULADO · 11 CANCELADO · 3 EN_RUTA · 1 PENDIENTE |
| `VENTA_RAPIDA / PUNTO` (mostrador, no planificable) | **104** (89 a `CONSUMIDOR_FINAL`) |
| `PEDIDO / DOMICILIO` (planificable) | **13** (7 con negocio, 7 clientes reales) |
| `VENTA_RAPIDA / DOMICILIO` | 4 |
| `RECURRENTE / DOMICILIO` | 2 |
| **Demanda planificable / mes** | **Jun 8 · Jul 4 · Ago 3** (tendencia a la baja) |
| Embarques totales (toda la historia) | 7 |
| Rutas activas | 3 (con 0 clientes/negocios asignados) |

### Lectura (con el contexto del PO)

1. **El conteo bajo de reparto es artefacto de instrumentación, no de demanda:**
   Embarques no funcionaba (recién reescrito) y la app aún no se entregó a los
   repartidores. Por eso 7 embarques y 0 GPS en toda la historia.
2. **La base geográfica está esencialmente vacía** (1% coords, 0% GPS histórico,
   0% rutaId). Esto sí es un problema real e **independiente del volumen**: el
   motor necesita coordenadas para producir algo útil.
3. **`linkUbicacion` (63 clientes, 35%) es la palanca de backfill viable** hoy
   (`backfillClienteCoords` vía `PARSED_URL`). La palanca "mediana GPS" arrancará
   cuando los repartidores usen la app y se capture GPS en la entrega.
4. **El negocio hoy factura sobre todo por mostrador** (85% `VENTA_RAPIDA/PUNTO`),
   pero eso convive con el reparto a domicilio que está por entrar en régimen.

### Recomendación (revisada con contexto)

| Acción | Cuándo |
|---|---|
| **Construir F2–F7** (decisión PO) | procede — Planificador listo para cuando el reparto entre en régimen |
| Cerrar los 6 ADRs (F1) | ahora — F1 no depende del volumen de datos |
| **Backfill de coords desde `linkUbicacion`** (script con `backfillClienteCoords`) | antes/en paralelo con F2 — prerequisito duro |
| **Rollout de la app a repartidores + verificar captura de GPS** | en paralelo — habilita el historial de ubicación |
| Motor F2 con **degradación a bajo volumen** (2-3 paradas = orden simple, sin clustering pesado) | criterio de aceptación de F2 |
| **Creación manual de plan/ruta como camino de primera clase** en "Hoy" | F2/F5 — el humano puede armar el plan a mano; el sistema propone, no obliga |
| **Deprecar `/api/embarques/auto`** (`@deprecated` ahora → re-apuntar en F6 → cleanup) | decisión PO; desbloquea el rework diferido de Embarques |
| **UI = reconstrucción completa** (v4 §35), no 4 pantallas | decisión PO; F5 |
| Schema con `PlanActividad` (ENTREGA/COBRO/RECOGIDA) desde F2; código MVP = solo ENTREGA | decisión PO; cobros es el epic siguiente |
| F7 = **modo sombra / dogfood** durante las primeras semanas de reparto real | no hay baseline histórico para comparar |
| Re-correr §12 mensualmente; calibrar pesos del optimizador y subir agresividad del motor | cuando `DOMICILIO` pase de ~1/semana a decenas/día |

---

## 13. Insumos por ADR

| ADR | Insumos de este inventario |
|---|---|
| **001** representación + generación + estados + sync/async + API | §1 (piezas del motor), §11 (qué construir), §8 (observabilidad). Scale: ~50 pedidos / 6 usuarios / 4 grupos → **generación síncrona** punto de partida; medir con la evidencia de F2. `GENERATING`/`FAILED` probablemente **transitorios** (no filas) si es síncrono. Decidir: motor = **composición** DBSCAN+TSP+capacidad+scoring liviano, **no** solver VRP |
| **002** elegibilidad + trazabilidad pedido↔plan | §2 (estados desacoplados, sin `fechaProgramada`, `NO_ENTREGADO` no auto-vuelve). Base de elegibilidad: `pedidos-sin-asignar.ts`. **No FK dura**: evaluar referencia por ID; cardinalidad plan(v)↔pedido; cambio del pedido = trigger de replanificación (§7) |
| **003** planificador ↔ Embarques | §6 (congelado), tabla #4 y #25. Documentar `computePreview` completo. Decidir: `CrearEmbarqueUseCase` para materializar; `/api/embarques/auto` consume plan o queda legacy; fallo parcial → estado recuperable; retry idempotente |
| **004** modelo geográfico | §3 (sin placeId/Barrio/polígonos/vial), §12 (números reales). Jerarquía v4 §11. Calidad: `geocodeOrigen`/`geocodeAt` (solo Cliente). Barrio = señal débil, nunca centroide |
| **005** replanificación + estabilidad | §7 (conflictos offline), tabla #27/#28. Triggers (v4 §19), umbral de "cambio material", penalización por reasignación, resolución de conflicto de versión y de overrides offline |
| **006** actividades / obligaciones | tabla #24. `Actividad` cuelga de `ObligacionPendiente` (Fase 3 Embarques, **congelado**); `COBRO`/`RECOGIDA_BOTELLON` nunca producidos. Decidir si "visita de cobro" reusa `Actividad` (→ ADR de Embarques) o es concepto liviano propio. Cartera fuera del MVP |

---

## 14. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Baja cobertura de coords en prod (§12 desconocido hasta correrlo) | Correr §12 **antes** de F2; sprint de backfill si no pasa el piso |
| R2 | Sobre-ingeniería del motor (solver VRP para 4 grupos) | ADR-001 fija "composición, no solver". F2 mide con datos reales |
| R3 | Colisión con el rework de frontend de Embarques (ramas sin mergear) | Coordinar antes de F5; el nav y la creación de embarques son superficie compartida |
| R4 | Reusar `Actividad` toca dominio congelado sin querer | ADR-006 decide explícito; si toca dominio → ADR de Embarques primero |
| R5 | Una FK plan↔pedido prematura gobierna el modelo | ADR-002 decide cardinalidad antes de cualquier migración |
| R6 | `Cliente.rutaId` tratado como cobertura confiable | Ya mitigado en el diseño: señal, no partición (§5) |
| R7 | UI "reconstrucción total" infla el MVP | F5 separa "4 pantallas del camino feliz" de fast-follow |
| R8 | `route-analysis` y `cluster-clientes` sin tests | Agregar tests al envolverlos (§9) |

---

## 15. Recomendación de cierre de F0

1. **Correr §12 contra Supabase producción.** Es el único dato que falta para
   decidir si F2 arranca directo o necesita un sprint de backfill.
2. Con esos números + este inventario → **cerrar los 6 ADRs** (F1).
3. **Gate de decisión** (PO): F0 aprobado + 6 ADRs aprobados + números de calidad
   de datos sobre la mesa.
4. Recién entonces F2 (motor por composición) → F3 → F4 → F5 → F6 → F7.

**Este inventario no autoriza ninguna decisión de F1 en sí** (v4 §70). Es la
base de evidencia para tomarlas.
