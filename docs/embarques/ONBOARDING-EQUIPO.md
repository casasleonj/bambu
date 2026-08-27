# Embarques V2 — Onboarding del equipo

_Para: dev que toma el rework del frontend de embarques. Actualizado: 2026-08-27._

Antes de tocar código leé, en este orden:
1. Este documento.
2. `docs/embarques/00-plan-frontend-completo.md` (plan maestro, decisiones D1-D7).
3. `docs/embarques/02-api-contract.md` (contrato de endpoints).
4. `docs/embarques/PENDIENTE.md` (backlog por fase).
5. `AGENTS.md` (raíz del repo) — reglas del proyecto, issues conocidos.

---

## 1. Qué estamos haciendo y por qué

El backend de embarques fue reescrito (plan maestro + 23 ADRs, **congelado**) para modelar el negocio con **4 libros contables (ledgers)** separados. El frontend viejo solo se parchó por encima y no refleja esa arquitectura. Este rework construye la UI nueva **detrás de un feature flag**, en 10 fases, sin romper la UI vieja hasta que el PO valide la nueva.

## 2. Las 4 ledgers (mental model)

Un embarque toca 4 registros independientes. La UI los muestra como tabs/secciones separadas:

| Ledger | Qué registra | ADR |
|---|---|---|
| **Físico** | Movimientos de producto (VEHICULO ↔ CLIENTE ↔ INSPECCION ↔ ALMACEN). `cantidad` siempre positiva; el efecto lo da el `tipo`. | ADR-FISICO-001 |
| **Monetario** | `ReceivableEntry` — lo que el cliente debe / pagó. Divergencias contra lo esperado. | ADR-MONETARIO-001 |
| **Cartera** | Deuda del cliente a nivel cuenta (FIFO, lock `CARTERA:clienteId`). | ADR-CARTERA-001 |
| **Actividad** | Bitácora de qué pasó en el embarque (para auditoría). | ADR-ACTIVIDAD-001 |

**Regla de oro:** una sustitución = **2 movimientos físicos separados** (RETORNO + ENTREGA) + 1 registro `Sustitucion` que los vincula. Nunca un movimiento con doble efecto. Ver `construirMovimientosSustitucion` en `src/modules/embarques/domain/services/ledger-fisico.service.ts`.

## 3. Estados: 4 reales, el resto es UI

`Embarque.estado` en la DB solo tiene 4 valores:

```
ABIERTO → EN_RUTA → CERRADO | CANCELADO
```

Todo lo demás (BORRADOR / PREPARANDO / CONFIRMADO) es **fase derivada en el cliente**, calculada por `derivarEstadoUI()` en `src/lib/embarque-ui-estado.ts`. **Nunca persistas un estado nuevo.** Si necesitás más granularidad, se deriva.

Helpers en ese archivo: `derivarEstadoUI`, `derivarSiguientePaso`, `stepParaAccion`, `contarPorFase`, `FASES_ORDEN`, `LABELS`, `BADGES`.

## 4. El feature flag

```ts
const EMBARQUES_V2 = process.env.NEXT_PUBLIC_EMBARQUES_V2 !== 'false'  // default ON en dev
```

- Definido en `src/app/(app)/embarques/embarques-client/index.tsx`.
- Con `NEXT_PUBLIC_EMBARQUES_V2=false` en `.env` volvés a la UI vieja (`ResumenEstados` + `embarques-grid` + 8 botones de filtro).
- **Toda fase nueva va detrás de este flag** hasta las Fases 9-10.
- Rollback de cualquier problema en prod = poner el flag en `false`. Por eso no hace falta branch por fase (trunk-based).

## 5. Workflow

- **Trunk-based.** Commits directos a `main`, detrás del flag.
- Commit messages terminan con `Co-Authored-By:` si aplica; PRs con el footer de siempre.
- **No toques el backend congelado.** Cualquier cambio en `src/modules/embarques/domain/**` o en los use-cases necesita un ADR nuevo aprobado. Los endpoints additivos (como `POST /sustituciones`) sí se permiten con ADR ligero.
- Definición de "hecho" por fase:
  - `npx tsc --noEmit` limpio
  - `npm run test` sin regresión
  - E2E relevante en verde (ver §7)
  - Con el flag OFF, la UI vieja no cambia

## 6. Mapa de archivos

### UI nueva (V2) — ya construida
| Archivo | Qué es |
|---|---|
| `src/app/(app)/embarques/embarques-client/command-center/` | Command Center (Fase 3): lista agrupada por fase derivada |
| `src/app/(app)/embarques/embarques-client/index.tsx` | Contenedor con el flag `EMBARQUES_V2` |
| `src/lib/embarque-ui-estado.ts` | Toda la lógica de fases derivadas |
| `src/app/api/embarques/[id]/sustituciones/route.ts` | Endpoint de sustituciones (Fase 6a) |

### UI a reescribir (Fases 5 y 7)
| Archivo | Líneas | Fase |
|---|---|---|
| `src/app/(app)/embarques/[id]/embarque-client.tsx` | 1105 | 5 — Mission Detail |
| `src/app/(app)/embarques/[id]/ledger-client/*` | — | 5 — tabs físico/recovery |
| `src/app/(app)/embarques/[id]/cerrar/cerrar-client/index.tsx` | 1063 | 7 — Reconciliation wizard |

### UI vieja — se elimina en Fases 9-10
`resumen-estados.tsx`, `embarque-card.tsx` (el viejo), las ramas `{!EMBARQUES_V2 && ...}`.

### Backend (NO tocar sin ADR)
`src/modules/embarques/**`, `src/app/api/embarques/**` (salvo endpoints additivos).

## 7. Cómo correr y probar

```bash
docker compose up -d                 # Postgres 5433 + Redis 6379
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
npm run dev                          # dev server

npm run test                         # Vitest (unit)
npx tsc --noEmit                     # type check

# E2E: playwright.config.ts NO carga dotenv, hay que exportar el .env a mano
set -a; . ./.env; set +a
npx playwright test e2e/embarques.spec.ts
```

Credenciales dev: `admin`/`admin123`, `asistente`/`asist123`, `contador`/`cont123`, `repartidor`/`rep123`.

Specs E2E de embarques: `e2e/embarques.spec.ts`, `e2e/embarques-all-contexts.spec.ts`, `e2e/embarques-fixes.spec.ts`, `e2e/embarques-fisico.spec.ts`, `e2e/embarques-hydration.spec.ts`.

## 8. Gotchas del proyecto (de AGENTS.md)

- **#9** — errores TS fantasma en `.next/dev/types/`: `rm -rf .next` + `npx prisma generate`.
- **#20** — el reset de DB en E2E invalida las sesiones de TODO el cluster; `full-user-day.spec.ts` cascadea. `workers: 1` en CI a propósito.
- **#24** — vistas responsive desktop/mobile duplican texto en el DOM. Usar `data-testid` por vista o un solo árbol. **No** dupliques `data-testid="embarque-card"` en dos árboles (rompe tests que cuentan).
- **React Compiler** — regla `set-state-in-effect` activa. Para abrir modales desde query params usá el patrón *state-in-render guard*, no `useEffect` (ver `embarque-client.tsx`, manejo de `?step=`).
- Monetario: Prisma devuelve `Decimal`, castear con `Number(value)`.
- Offline-first: mutaciones vía `fetchResilient` + `offlineId` (`crypto.randomUUID()`). Toasts: `success` (online), `info` (encolado offline), `error` (error de lógica).

## 9. Bugs preexistentes conocidos (no los causó este rework)

Ver `docs/embarques/PENDIENTE.md` §"Bugs preexistentes". Bloquean un E2E 100% verde pero son ajenos a las Fases 5-10; se atacan en Fase 8.

## 10. Diferido

Rediseño del formulario de crear embarque + auto-generar hacia un flujo "pedidos-first". **Bloqueado** porque depende del módulo de **rutas** (no implementado). Hasta entonces, crear y auto-generar quedan como están.
