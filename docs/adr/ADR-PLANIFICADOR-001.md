# ADR-PLANIFICADOR-001 — Representación y generación del plan

- Estado: **Aceptado** (gate F0/F1) — decisión delegada al asistente por el PO el 2026-08-30; revisable en cualquier momento
- Fecha: 2026-08-30
- Fuente: Plan Técnico Rutas + Planificador v4 §3, §5, §22, §28, §29, §56 · F0 `docs/rutas/INVENTARIO_CAPACIDADES_DISTRIBUCION.md`
- Fase: F1 (contratos). Bloquea F2.

## Contexto

El planificador necesita persistir la **propuesta de distribución de una fecha**:
grupos, paradas, pedidos referenciados, secuencia, señales usadas, excepciones,
versión y estado (v4 §5). El F0 confirma que **no hay estructura reusable** —
`Embarque` es realidad física (plan ≠ físico, v4 §3), `Ruta` es conocimiento
estable sin paradas ni secuencia. Escala actual: ~1 reparto/semana (artefacto de
instrumentación, ver F0 §0.a); objetivo: decenas/día; 6 usuarios; ~4 grupos por
generación.

## Decisión

### 1. Agregado nuevo, aditivo

Cuatro entidades nuevas, ninguna toca dominios existentes:

```
PlanDia (1) ── (N) PlanGrupo (1) ── (N) PlanParada (1) ── (N) PlanActividad
```

- **PlanDia:** `id, fecha, version, estado, generadoEn, generadoPorId, confirmadoEn, confirmadoPorId, causa`
- **PlanGrupo:** `id, planDiaId, nombreLogico, secuencia, capacidadPlanificada, cargaPlanificada (json), trabajadorPropuestoId?, rutaId?, score, explicacion (json)`
- **PlanParada:** `id, planGrupoId, secuencia, clienteId, negocioId?, ubicacionUsada (json: lat/lng/fuente/calidad), motivo`
- **PlanActividad:** `id, planParadaId, tipo (PlanActividadTipo), pedidoIds (String[]), snapshotCantidades (json), estado`

**`PlanActividadTipo` = `ENTREGA | COBRO | RECOGIDA_BOTELLON`.** El MVP **solo
genera y materializa `ENTREGA`** (ADR-PLANIFICADOR-006). El enum y la tabla ya
acomodan `COBRO`/`RECOGIDA_BOTELLON` para no retrofitear el schema cuando llegue
ese epic (el PO confirmó que cobros se necesita pronto). Una parada = varias
actividades del mismo cliente en la misma visita (v4 §18).

`PlanActividad` es un concepto **de la capa de planificación** — NO es el modelo
`Actividad` congelado de Embarques (Fase 3, cuelga de `ObligacionPendiente`). La
relación con `Actividad` se decide en un ADR de Embarques cuando se implemente COBRO.

Nombres finales a confirmar. El resto del ADR usa `PlanDia`.

### 2. Persistencia: relacional + JSON acotado

- `PlanDia / PlanGrupo / PlanParada / PlanActividad` = tablas relacionales
  (consultables, indexables).
- Campos `explicacion`, `cargaPlanificada`, `ubicacionUsada`, `snapshotCantidades`
  = JSON (no se consultan, solo se muestran/auditan).
- `PlanActividad.pedidoIds` = `String[]` (referencia, **no FK** — ver ADR-PLANIFICADOR-002).

### 3. Generación: síncrona

Evidencia F0: horizonte previsible ≤ ~200 clientes / ~50 pedidos / ~4 grupos.
DBSCAN O(n²) sobre ≤200 puntos + TSP NN+2-opt sobre ≤25/grupo ≈ decenas de ms.
Entra en el timeout de request estándar.

- `POST /api/rutas/planes/generar { fecha }` → corre el pipeline y devuelve la
  propuesta en la misma respuesta.
- `GENERATING` / `FAILED` = **estados transitorios de la API, NO filas
  persistidas.** Una fila `PlanDia` en estado `PROPOSED` se escribe **solo cuando
  la generación tuvo éxito**. Si falla → `500` con detalle, sin fila.
- Reconsiderar async (job + polling) solo si el horizonte supera ~500 pedidos.

### 4. Estados

```
PROPOSED ──► REVIEW ──► CONFIRMED ──► SUPERSEDED
```

- Sin `GENERATING`/`READY`/`FINALIZADO` persistidos. El plan **no es dueño de la
  ejecución física** (v4 §29) — terminal en `CONFIRMED` (materializado a Embarques)
  o `SUPERSEDED` (reemplazado por versión nueva).
- `CANCELLED` si el usuario descarta la propuesta sin confirmar.
- Errores de integración → ver ADR-PLANIFICADOR-003 (`INTEGRATION_PARTIAL`).

### 5. Contrato HTTP (plegado en este ADR por decisión del F0)

| Operación | Endpoint | Notas |
|---|---|---|
| Generar | `POST /api/rutas/planes/generar` | `{ fecha }` → propuesta |
| Obtener | `GET /api/rutas/planes/:id` | incluye grupos/paradas/excepciones |
| Obtener vigente por fecha | `GET /api/rutas/planes?fecha=` | el `PROPOSED`/`REVIEW`/`CONFIRMED` vigente |
| Modificar (override) | `PATCH /api/rutas/planes/:id` | exige `expectedVersion` |
| Replanificar | `POST /api/rutas/planes/:id/replan` | ver ADR-PLANIFICADOR-005 |
| Confirmar | `POST /api/rutas/planes/:id/confirmar` | exige `expectedVersion` + `idempotencyKey` |
| Versiones | `GET /api/rutas/planes/:id/versiones` | histórico |

- Envelope: `apiSuccess`/`apiError` (convención del proyecto).
- Auth: `requireAuth` → `requireRole(['ADMIN','ASISTENTE'])` (permiso `view:rutas`;
  CONTADOR read-only). Sin RLS, sin multitenancy.
- Errores: `409` conflicto de versión · `422` propuesta inválida · `404` · `400` Zod.

### 6. Infra a extender

- `LOCK_NAMESPACES` (`src/lib/locks.ts:30`) += `'PLAN'`. Lock `PLAN:{fecha}` en
  confirmar/replanificar/override.
- `RealtimeEntity` (`src/lib/realtime.ts`) += `'route_plan'` (o eventos con prefijo
  `route_plan.*`, v4 §49).
- `logAudit({ entidad: 'PlanDia', ... })` → `Historial` para versión/override/confirm.
- Config keys nuevas: pesos del optimizador (ver ADR-PLANIFICADOR-005). Defaults
  documentados; calibración diferida a semanas de operación real (F0 §0.a punto 5).

## Decisiones tomadas por delegación (PO, 2026-08-30)

- **Nombres:** `PlanDia`, `PlanGrupo`, `PlanParada`, `PlanActividad`. Enum de estado
  `PlanEstado`. Enum `PlanActividadTipo`. Prefijo de tabla `Plan*` (no `Route*`,
  para no chocar con el inglés del resto del schema que es español).
- **Un `PlanDia` vigente por fecha** + histórico de versiones (`PlanDia.version`,
  la anterior pasa a `SUPERSEDED`). Sin borradores paralelos.
- **Módulo:** `src/modules/planificador/` (DDD por capas, como `src/modules/embarques/`).
- **API namespace:** `/api/rutas/planes/*` (consistente con la ruta de UI `/rutas`).

## Qué falta decidir / evidencia pendiente

- Índices: `PlanDia(fecha, estado)`, `PlanActividad` GIN sobre `pedidoIds`,
  `PlanParada(clienteId)`.
- Confirmar el presupuesto de tiempo real del pipeline con datos de F2.
- `PlanDiaVersion` como tabla separada vs. `PlanDia` inmutable por versión
  (ADR-PLANIFICADOR-005 §3) — decidir en F2 por simplicidad de implementación.

## Consecuencias

- Migración aditiva (3 tablas + enum de estado + grants `app_read`/`app_write`).
  Sin `db push` destructivo. Sin tocar dominios congelados.
- El plan es reproducible y auditable (snapshot + versión).
- Si el volumen crece 10x sobre lo previsto, revisar sync→async (ADR de refinamiento).

## Verificación (cuando se implemente)

Unit: pipeline determinista (mismos inputs → mismo plan). Integration: generar →
persistir `PROPOSED`; fallo de generación → sin fila. `npx tsc --noEmit`, vitest.
