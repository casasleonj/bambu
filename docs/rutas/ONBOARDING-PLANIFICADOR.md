# Planificador de Distribución — Onboarding

_Para el dev/PO que revisa o continúa la rama `docs/rutas-planificador-f0`._
_Actualizado: 2026-08-30._

## 1. Qué es

Reemplaza "armar rutas a mano" por: el sistema analiza la demanda del día, la
agrupa por geografía/afinidad/capacidad, propone grupos con repartidor y
secuencia, y el humano **revisa y confirma**. Al confirmar, crea los embarques.

Leer en orden: `docs/rutas/INVENTARIO_CAPACIDADES_DISTRIBUCION.md` (F0) →
`docs/adr/ADR-PLANIFICADOR-00{1..6}.md` (contratos) → este doc.

## 2. Modelo mental

```
Ruta habitual        conocimiento estable (nombre, días, repartidor, clientes asociados)
      │
      ▼
PlanDia (versionado) propuesta para UNA fecha — PROPOSED → REVIEW → CONFIRMED → SUPERSEDED
      │  confirmar
      ▼
Embarque             realidad física (dominio congelado — se crea vía CrearEmbarqueUseCase)
```

- **El planificador referencia** Pedido/Cliente/Negocio/Trabajador/Ruta **por id, sin FK**
  (ADR-002). No es dueño de esos datos.
- **`PlanActividad`** tiene `tipo ENTREGA|COBRO|RECOGIDA_BOTELLON` en el schema, pero
  el MVP **solo genera/materializa `ENTREGA`** (ADR-006). Cobros = epic siguiente.
- **El motor no auto-recalcula** — marca `REVIEW` y el humano confirma (ADR-005).

## 3. Estados de `PlanDia`

`PROPOSED` (generado) → `REVIEW` (tras replan) → `CONFIRMED` (embarques creados) →
`SUPERSEDED` (reemplazado). `INTEGRATION_PARTIAL` si al materializar falló algún
grupo (reintentable). `CANCELLED` si se descarta.

## 4. Mapa de archivos

| Área | Path |
|---|---|
| Schema | `prisma/schema.prisma` (`PlanDia/PlanGrupo/PlanParada/PlanActividad/PlanDiaVersion/PlanExcepcion`), migración `prisma/migrations/20260830_add_planificador` |
| Dominio (puro) | `src/modules/planificador/domain/services/` — `elegibilidad`, `geo-normalizacion`, `agrupacion`, `secuenciacion`, `scoring`, `excepciones`, `diff` · `domain/value-objects/LocationQuality` |
| Pipeline | `src/modules/planificador/application/construir-propuesta.ts` (determinista, sin I/O) |
| Use-cases | `application/use-cases/` — `GenerarPlan`, `ConfirmarPlan`, `MaterializarPlan`, `Replan`, `OverridePlan` |
| Infra | `infrastructure/PrismaPlanificadorRepository.ts` · `presentation/serialize-plan.ts` |
| API | `src/app/api/rutas/planes/**` — `generar`, `[id]`, `[id]/confirmar`, `[id]/replan`, `[id]/versiones`, `route.ts` (GET ?fecha, PATCH override, DELETE) |
| UI | `src/app/(app)/rutas/page.tsx` (Hoy, SSR) · `rutas-client/hoy/**` · `rutas-client/plan-types.ts` |
| Análisis | `src/lib/rutas/calidad-datos.ts` + `src/app/(app)/rutas/analisis/analisis-client/calidad-datos-panel.tsx` |
| Ruta habitual | `src/app/(app)/rutas/[id]/ruta-resumen.tsx` (info derivada) |
| Nav | `src/app/(app)/nav-data.tsx` — Distribución: Hoy / Rutas habituales / Análisis / Ejecución |

**NO tocar sin ADR:** `src/modules/embarques/**` (congelado). El planificador solo
usa `CrearEmbarqueUseCase` desde `MaterializarPlanUseCase`.

## 5. Cómo correr y probar

```bash
docker compose up -d
npx prisma generate && npx prisma db push
npx tsx prisma/seed.ts
npm run dev

npm run test                                    # unit — incluye src/modules/planificador (37 tests)
npm run test:integration -- planificador         # DB real (10 tests): generar/confirmar/replan/override
npx tsc --noEmit && npx eslint src/modules/planificador src/app/api/rutas

set -a; . ./.env; set +a
npx playwright test e2e/rutas-planificador.spec.ts   # flujo Hoy (necesita chromium instalado)
```

Smoke por API (dev server corriendo, sesión admin):
`POST /api/rutas/planes/generar` → `GET /api/rutas/planes` → `POST /api/rutas/planes/{id}/confirmar`.

## 6. Estado (2026-08-30)

| Fase | Estado |
|---|---|
| F0 inventario · F1 ADRs | ✅ |
| F2/F3/F4 dominio + persistencia + API | ✅ 8 endpoints, 47 tests, verificado en app corriendo |
| F5 UI | 🟡 Hoy + Análisis (panel calidad de datos) + Ruta habitual (info derivada) operativos. **Falta:** detalle de grupo, mapa (opcional v4 §42-44), pulido responsive/a11y, correr el E2E en CI |
| F6 botón "Auto-Generar" → "Planificar día" | ✅ (legacy detrás de `NEXT_PUBLIC_EMBARQUES_AUTO_LEGACY`) |
| F7 piloto | ⏳ |

## 7. Antes del piloto — acción del PO

1. **Correr el backfill de coordenadas** contra prod:
   `DATABASE_URL="$DIRECT_URL" npx tsx scripts/backfill-coords-clientes.ts --dry-run` y luego sin `--dry-run`.
   Con ~1% de clientes con coords el motor genera excepciones `MISSING_DATA` para casi todo.
   El panel de `/rutas/analisis` lo indica ("BACKFILL_NECESARIO").
2. Rollout de la app a repartidores → empieza a acumularse GPS de entrega (segunda
   palanca de backfill).
3. Re-correr las queries de calidad (`/rutas/analisis`) y decidir go/no-go.

## 8. Deuda / follow-ups

- Reescribir `e2e/embarques*.spec.ts` (parte de "auto-generar") al flujo del plan y
  quitar `NEXT_PUBLIC_EMBARQUES_AUTO_LEGACY` + `src/app/api/embarques/auto/route.ts`.
- Eventos realtime `route_plan.*` (hoy solo `logAudit`).
- Detector de triggers en background para replan (hoy replan es manual desde la UI).
- Tests con fakes de `ConfirmarPlanUseCase`/`MaterializarPlanUseCase` (además de la integración).
- `PlanDiaVersion` tabla separada vs. inmutable (ADR-005 §3, decidir con el patrón real).
