# ADR-PLANIFICADOR-005 — Replanificación, estabilidad y concurrencia

- Estado: **Aceptado** (gate F0/F1) — decisión delegada al asistente por el PO el 2026-08-30; revisable en cualquier momento
- Fecha: 2026-08-30
- Fuente: Plan Técnico v4 §17, §18, §19, §24, §26, §30, §32, §33, §60 · F0 §7
- Fase: F1. Bloquea F2/F3.

## Contexto

Un plan confirmado **no se sobrescribe silenciosamente** (v4 §24). Los eventos que
pueden cambiar una propuesta (nuevo pedido, cancelación, cambio de cantidad,
recurso no disponible, cambio de capacidad, reprogramación) **no** deben todos
disparar un recálculo (v4 §19). Y una optimización matemática no debe reorganizar
todo por un cambio chico (v4 §18, §26).

Infra existente (F0 §7): `withAdvisoryLock`, `executeSerializableWithRetry` (3
retries P2034), optimistic lock por `updatedAt` (patrón `PUT /api/rutas`),
`fetchResilient` + `requestQueue` Dexie v5.

## Decisión

### 1. Triggers → decisión del motor

Ante un evento sobre un pedido/recurso del plan vigente, el motor clasifica:

| Evento | Decisión por defecto |
|---|---|
| Pedido nuevo elegible para la fecha | `MARCAR_PARA_REVISION` |
| Pedido del plan cancelado/anulado | `MARCAR_PARA_REVISION` |
| Cambio de cantidad que **rompe** el chunk de capacidad del grupo | `MARCAR_PARA_REVISION` |
| Cambio de cantidad que **no** rompe capacidad | `NO_RECALCULAR` (solo actualizar snapshot) |
| Recurso (repartidor) no disponible | `MARCAR_PARA_REVISION` |
| Cambio de `MAX_UNIDADES_EMBARQUE` / capacidad | `MARCAR_PARA_REVISION` |
| Cambio de dirección/coords de un cliente del plan | `MARCAR_PARA_REVISION` |

**MVP: el motor nunca auto-aplica un recálculo.** Marca el `PlanDia` como
`REVIEW` con un badge y un resumen del/los trigger(s). El humano confirma. El
auto-recálculo silencioso es epic posterior (cuando haya confianza operativa).

### 2. Estabilidad: penalización por reasignación en la función objetivo

Al recalcular (v4 §17):

```
costo = w_dist · distancia_total
      + w_disp · dispersión_intragrupo
      + w_pref · preferencias_incumplidas         (barrio/ruta habitual roto)
      + w_estab · nº_pedidos_que_cambian_de_grupo  (vs. la versión vigente)
      + w_cap  · exceso_de_capacidad_penalizado
```

- Todos los `w_*` son **config** (`Config` keys), con defaults documentados aquí.
  Default: `w_estab` **alto** (favorece estabilidad — un pedido no se mueve de
  grupo salvo que el beneficio supere el umbral).
- **Los defaults no son la calibración final.** Calibrar con semanas de operación
  real (F0 §0.a punto 5). ADR-PLANIFICADOR-001 documenta los defaults; este ADR
  fija que existen y son config.
- `w_estab = 0` cuando no hay versión vigente (primera generación del día).

### 3. Versionado

- Cada replanificación **aplicada y confirmada** crea `PlanDia` versión N+1; la N
  pasa a `SUPERSEDED`. Append-only.
- Se conserva por versión: snapshot lógico (grupos + paradas + señales), **diff**
  contra N-1, `actorId`, `timestamp`, `causa` (el/los trigger).
- Representación: `PlanDia.version Int` + tabla `PlanDiaVersion` con el snapshot
  JSON y el diff. (O `PlanDia` inmutable por versión — decidir en ADR-001/F2.)
- `GET /api/rutas/planes/:id/versiones` devuelve el histórico.

### 4. Concurrencia

- `PATCH` (override) y `POST /confirmar` y `POST /replan` exigen **`expectedVersion`**.
  Mismatch → **`409 CONFLICT`** con la versión vigente en el body; la UI ofrece
  "el plan cambió, cargar la versión vigente" (v4 §30, §32).
- Lock `PLAN:{fecha}` (advisory, `withAdvisoryLock`) alrededor de confirmar /
  replanificar / aplicar override. Transacción `executeSerializableWithRetry`.
- Idempotencia del confirm: `idempotencyKey` dedicado (`@unique`), replay →
  devuelve el resultado aplicado con `deduped: true`.

### 5. Conflicto de overrides offline

Usuario hizo overrides offline sobre la v4; reconecta; la vigente es v6:

- Al sincronizar, si `baseVersion (v4) != vigente (v6)` → los overrides offline
  **NO se aplican automáticamente**. Se presentan como "cambios pendientes" que el
  usuario **reaplica sobre v6 o descarta**. Sin merge automático (v4 §33).
- Los overrides offline se guardan en `requestQueue` con su `baseVersion`;
  `syncWithServer` los rutea a un estado "pendiente de reaplicar" en vez de
  ejecutarlos a ciegas.

### 6. Offline (corte del v4 §33)

- **Online:** generar, recalcular, obtener datos completos.
- **Offline:** consultar el último plan cacheado + encolar overrides compatibles.
- **Generación/recálculo NUNCA offline** (necesita todos los pedidos + geo del
  servidor).

## Qué falta decidir / evidencia pendiente

- Valores default de `w_*` (propuesta inicial en ADR-001; se ajustan en F2 con
  datos sintéticos y en el piloto con datos reales).
- Umbral exacto de "cambio material" de cantidad (propuesta: cualquier cambio que
  altere `splitPedidosByCapacity`).
- ¿`PlanDiaVersion` como tabla separada o `PlanDia` inmutable por versión?
  (decidir en F2 según el patrón que resulte más simple).

## Consecuencias

- El plan es predecible: el humano siempre confirma los cambios.
- Estabilidad configurable — se puede endurecer/relajar sin deploy.
- Riesgo: si `w_estab` queda muy alto, el motor "se pega" a planes subóptimos.
  Mitigación: métrica de "distancia extra por estabilidad" en el dashboard (v4 §54).

## Verificación (cuando se implemente)

Unit: clasificador de triggers (cada fila de la tabla), función de costo con
`w_estab` alto vs. bajo, detección de conflicto de versión. Integration: dos
usuarios confirman la misma versión → uno gana, el otro `409`; override offline
sobre versión vieja → queda pendiente de reaplicar, no se pisa.
