# ADR-PLANIFICADOR-003 — Contrato Planificador → Embarques

- Estado: **Aceptado** (gate F0/F1) — decisión delegada al asistente por el PO el 2026-08-30; revisable en cualquier momento
- Fecha: 2026-08-30
- Fuente: Plan Técnico v4 §22, §23, §24, §58 · F0 §1 (#4, #25), §6
- Fase: F1. Es el contrato P0.

## Contexto

El backend de Embarques está **congelado** (23 ADRs, GATE PASS). Cambios de dominio
requieren ADR nuevo aprobado; endpoints aditivos con "ADR ligero". Hay un rework de
**frontend** de Embarques en vuelo (fases 5-10, ramas `feat/embarques-fase*` sin
mergear).

Piezas existentes relevantes (F0):
- `POST /api/embarques/auto` (`computePreview`, `src/app/api/embarques/auto/route.ts`):
  agrupa `negocio.rutaId ?? cliente.rutaId ?? barrio ?? 'SIN_RUTA'`, split por
  `MAX_UNIDADES_EMBARQUE` (default 70), elige repartidor disponible.
- `CrearEmbarqueUseCase` (`src/modules/embarques/application/use-cases/`): input
  `{ trabajadorId, rutaId?, carga, tipoMoto?, baseDinero?, horaSalida, obs?,
  offlineId?, maxUnidades?, verificarStock? }`; lock `EMBARQUE_CARGA:{trabajadorId}:{fecha}`;
  dedup por `offlineId`; valida moto/unidades/peso/stock.
- Asignación de pedidos: `PUT /api/embarques/[id]` con `pedidoIds[]` (setea
  `estado='EN_RUTA'`).

## Decisión

### 1. Frontera: el plan produce, Embarques ejecuta

```
PlanDia CONFIRMED
   │  MaterializarPlanUseCase (nuevo, dominio del planificador)
   ▼
por cada PlanGrupo:  CrearEmbarqueUseCase (EXISTENTE, sin tocar)  → Embarque ABIERTO
   │
   ▼
asignar PlanParada.pedidoIds al embarque (mecanismo existente)
```

- **Un `PlanGrupo` → un `Embarque`.**
- El planificador **nunca** prepara carga física, marca despacho ni toca el ledger
  de Embarques (v4 §22).

### 2. `MaterializarPlanUseCase` (nuevo, en el dominio del planificador)

Entrada: `PlanDia` en estado `CONFIRMED` + `idempotencyKey`.
Por cada `PlanGrupo` sin `embarqueId`:
1. `pedidoIds` del grupo = unión de `PlanActividad.pedidoIds` donde `tipo=ENTREGA`
   (en el MVP son todas). `carga` = suma de `snapshotCantidades` de esas actividades.
2. `offlineId = hash(planId, version, grupoId)` — determinista.
3. Invoca `CrearEmbarqueUseCase.execute({ trabajadorId: grupo.trabajadorFinalId,
   rutaId: grupo.rutaId ?? null, carga, horaSalida: grupo.horaSalidaPropuesta,
   obs: 'Plan ' + planId, offlineId, maxUnidades, verificarStock: true })`.
   - Replay (mismo `offlineId`) → devuelve el embarque ya creado. Idempotente.
4. Persiste `PlanGrupo.embarqueId = result.id`.
5. Asigna los `pedidoIds` al embarque (vía repo/use-case de asignación existente),
   que los pone `EN_RUTA`.

Actividades `tipo=COBRO`/`RECOGIDA_BOTELLON` (post-MVP): su materialización se
define en un ADR de Embarques + uno de Cartera (ADR-PLANIFICADOR-006). En el MVP no
existen, así que este paso solo ve `ENTREGA`.

### 3. `/api/embarques/auto` → DEPRECADO (decisión del PO, 2026-08-30)

El Planificador **reemplaza** a `/api/embarques/auto`. No coexisten como
alternativas permanentes.

- **F6 (hecho):** el botón de `/embarques` dice **"Planificar día"** y navega a
  `/rutas` (el plan se genera/revisa/confirma ahí; al confirmar
  `MaterializarPlanUseCase` crea los embarques). ✅
- **Cleanup (hecho):** eliminados `src/app/api/embarques/auto/route.ts`,
  `auto-generar-preview-modal.tsx` y el flag `NEXT_PUBLIC_EMBARQUES_AUTO_LEGACY`.
  Las specs `e2e/embarques*.spec.ts` de "auto-generar" reescritas al flujo del plan
  o removidas (cubiertas por `e2e/rutas-planificador.spec.ts`). Los helpers puros de
  `src/lib/embarque-auto.ts` (`splitPedidosByCapacity`, `pesoPedido`, `unidadesPedido`)
  **sobreviven** — el motor del planificador los reutiliza (`capacidad.service.ts`). ✅
- **El flujo manual "Nuevo Embarque"** (crear un embarque sin plan) **se
  conserva** — es válido para casos fuera del plan del día.

Esto **desbloquea** el rework diferido de "crear embarque / auto-generar" que
esperaba al módulo de rutas (`memory/embarques-auto-generar-es-el-objetivo`,
`docs/embarques/PENDIENTE.md` §"Diferido").

### 4. Fallo parcial → saga simple, sin rollback destructivo

Dado ~4 grupos y 6 usuarios: materializar grupo por grupo, registrando
`PlanGrupo.embarqueId` a medida. Si el grupo 3 falla (stock, peso, sin repartidor):
- `PlanDia.estado = 'INTEGRATION_PARTIAL'`.
- Los grupos ya materializados **quedan** (un `Embarque` ABIERTO sin todos sus
  pedidos es un estado válido y recuperable — se cancela a mano o se reintenta).
- `POST /api/rutas/planes/:id/confirmar` es **reintentable**: retoma solo los
  grupos sin `embarqueId` (idempotencia por el `offlineId` determinista).
- La respuesta lista `{ creados: [...], fallidos: [{ grupoId, error }] }`.

### 5. Qué produce el plan hacia Embarques

Por grupo: `{ trabajadorPropuestoId, rutaId?, pedidoIds[], cargaAgregada,
horaSalidaPropuesta, secuencia }`. Embarques aplica **sus** reglas (stock, peso,
moto, `MAX_UNIDADES_EMBARQUE`) — el planificador no las reimplementa; si Embarques
rechaza, es un fallo parcial (punto 4).

### 6. `trabajadorId`: sugerencia, no vinculante

El plan propone (`PlanGrupo.trabajadorPropuestoId`, v4 §20). El asistente puede
cambiarlo en `REVIEW`. Al materializar se usa `trabajadorFinalId` (= propuesto si
no se tocó).

### 7. Contrato de datos

El planificador **lee**: `Pedido`, `Cliente`, `Negocio`, `Trabajador`, `Ruta`.
**Escribe**: solo su agregado (`PlanDia/Grupo/Parada`). **Entrega** a Embarques vía
`CrearEmbarqueUseCase`. **No lee cartera** en el MVP (ADR-PLANIFICADOR-006).

## Qué falta decidir / evidencia pendiente

- ¿La asignación de pedidos al embarque usa el repo interno o el endpoint
  `PUT /api/embarques/[id]`? (preferir capa de dominio; confirmar en F2).
- ¿`baseDinero` del embarque lo setea el plan o queda en 0 para que el asistente lo
  ajuste? (propuesta: 0, no es decisión de distribución).
- Coordinar con el equipo de frontend de Embarques: ambos tocan el nav
  "Distribución" y la creación de embarques. Acordar antes de F5.

## Consecuencias

- Cero cambios en el dominio congelado de Embarques.
- `MaterializarPlanUseCase` es la única superficie de acoplamiento — testeable en
  aislamiento con un fake de `CrearEmbarqueUseCase`.
- `/api/embarques/auto` deprecado: sin coexistencia permanente. El rework diferido
  de crear-embarque/auto-generar se re-apunta al Planificador en F6.
- Los helpers puros de `src/lib/embarque-auto.ts` (`splitPedidosByCapacity`, etc.)
  sobreviven — el motor del planificador los reutiliza.

## Verificación (cuando se implemente)

Integration (Postgres real): confirmar plan de 2 grupos → 2 embarques + pedidos
`EN_RUTA`; reintento del confirm → no duplica (dedup por `offlineId`); grupo con
stock insuficiente → `INTEGRATION_PARTIAL`, el otro grupo sí se crea.
