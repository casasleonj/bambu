# Embarques Frontend — Backlog pendiente

_Actualizado: 2026-08-27_

- Contexto y mental model: `docs/embarques/ONBOARDING-EQUIPO.md`
- Plan maestro y decisiones D1-D7: `docs/embarques/00-plan-frontend-completo.md`
- Contrato de endpoints: `docs/embarques/02-api-contract.md`
- Autoridad de producto: `planembarquesuxequipodesarrollo(1).md`

**Workflow:** trunk-based. Commits directos a `main` detrás del flag `NEXT_PUBLIC_EMBARQUES_V2` (default ON en dev; OFF revierte a la UI vieja). Rollback = apagar el flag. Backend congelado: no tocar `src/modules/embarques/domain/**` ni use-cases sin ADR.

**Definición de "hecho" (aplica a toda fase):**
- `npx tsc --noEmit` limpio
- `npm run test` sin regresión
- E2E de la fase en verde (`set -a; . ./.env; set +a` antes de `npx playwright test`)
- Con el flag OFF, la UI vieja no cambia
- El PO valida la app corriendo con el flag ON

---

## Estado

| Fase | Descripción | Estado |
|---|---|---|
| 2 | Contrato de API + fixes de plomería | ✅ PR #134 |
| 3 | Command Center | ✅ PR #135 |
| 4 | Preparation Flow (deep-links `?step=`) | ✅ PR #136 |
| 6a | Endpoint `POST/GET /api/embarques/[id]/sustituciones` | ✅ PR #137 |
| **5** | Mission Detail | ✅ branch `feat/embarques-fase5-mission-detail` |
| **6b** | UI de sustituciones | ✅ branch `feat/embarques-fase6b-sustituciones-ui` |
| **7** | Reconciliation (cierre = wizard forzado) | ✅ branch `feat/embarques-fase7-reconciliation` (+ endurecido tras auditoría: preview best-effort, E2E del wizard) |
| **8** | Test hardening + bugs preexistentes | 🟡 bugs #1 y #2 resueltos; ítems 4-5 (matriz de tests, 4 roles) pendientes |
| **9-10** | Flag a default ON + verificación + retiro de legacy | ⏳ Pendiente |

### Bloqueante inmediato
- [ ] PO revisa y mergea PRs **#134, #135, #136, #137** a `main`. Probar en `localhost:3001`.
- [ ] PO revisa la branch **`feat/embarques-fase5-mission-detail`** (Mission Detail, Fase 5) antes de abrir su PR.
- [ ] PO revisa la branch **`feat/embarques-fase6b-sustituciones-ui`** (UI de sustituciones, Fase 6b) antes de abrir su PR.
- [ ] PO revisa la branch **`feat/embarques-fase7-reconciliation`** (wizard de cierre forzado, Fase 7) antes de abrir su PR.

---

## FASE 5 — Mission Detail

**Objetivo:** el asistente entra al detalle de un embarque y ve de un vistazo qué falta resolver, sin cazar información entre tabs ni usar menús que no funcionan en touch.

> **Estado (2026-08-29):** implementado en `feat/embarques-fase5-mission-detail`,
> endurecido en `feat/embarques-fase7-reconciliation` tras auditoría:
> - Panel `EstadoOperativo` ahora lee **`ResponsibilityCase` ABIERTOS** vía SSR
>   (`page.tsx` los carga en el `Promise.all`, sin fetch client-side extra) —
>   alineado con `03-exception-model.md` (`MONEY_MISMATCH ← ResponsibilityCase`).
>   `DISCREPANCIA_INVENTARIO` → CTA a Físico; `FALTANTE_CAJA`/`FIADO_NO_COBRADO`
>   → CTA a trabajador. `DeudaTrabajador` queda como fuente **legacy** (embarques
>   pre-migración / deuda ya materializada).
> - `RecoveryDecision` sigue vía fetch client-side en el panel (payload chico;
>   `LedgerTab` necesita su propia copia fresca tras mutaciones). Doble fetch
>   de `/recovery` = deuda menor conocida, no bloqueante.
> - Menú hover→click, tabs apiladas en mobile, deep-links `?step=`: OK.
> - E2E: `e2e/embarques-mission-detail.spec.ts` (4 tests) incl. ResponsibilityCase.
> - **Pendiente**: `ObligacionPendiente` (contrato §7) aún no se surface — no hay
>   endpoint ni se carga en SSR. Sumar al `Promise.all` de `page.tsx` cuando se
>   defina la UX de resolución.

**Archivos a tocar:**
- `src/app/(app)/embarques/[id]/embarque-client.tsx` (1105 líneas — reescritura detrás del flag)
- `src/app/(app)/embarques/[id]/ledger-client/ledger-tab.tsx`, `recovery-panel.tsx`, `recovery-form-modal.tsx`, `movimiento-timeline.tsx` (integrar a la estructura nueva)
- `src/app/(app)/embarques/[id]/page.tsx` (SSR — hoy carga embarque/deudas/trabajadores/rutas; **no incluye `_count` ni excepciones**: hay que ampliar el include para recoveries, `responsibilityCases` y `ObligacionPendiente`)
- `src/app/(app)/embarques/[id]/types.ts` (tipos del payload)
- Nuevo: `src/app/(app)/embarques/[id]/mission-detail/` (componentes V2)

**Ítems (en orden):**

1. **Panel de excepciones abiertas** arriba del detalle.
   - Fuentes: recoveries pendientes, `responsibilityCases` sin resolver, `ObligacionPendiente`, divergencias monetarias.
   - Cada fila: descripción + CTA que abre el modal/flujo correspondiente.
   - Aceptación: dado un embarque con 1 recovery pendiente y 1 caso de responsabilidad, el panel muestra 2 filas con CTA; si no hay excepciones, el panel no se renderiza.

2. **Quitar el menú de acciones `hover:block`.**
   - Reemplazar por botones visibles (o menú con `onClick`, nunca `hover`).
   - Aceptación: en viewport 375px, todas las acciones del embarque son alcanzables con tap; test E2E lo verifica (`e2e/embarques-all-contexts.spec.ts`, proyecto mobile).

3. **Tabs → acordeón en mobile.**
   - Desktop: tabs (Pedidos / Físico / Monetario / Gastos / Actividad). Mobile (<768px): acordeón, una sección abierta a la vez.
   - Aceptación: no hay duplicación de `data-testid` entre las dos vistas (AGENTS.md #24); usar `data-testid` por vista o render condicional por `useMediaQuery`.

4. **Respetar los deep-links `?step=`** que ya conecta la Fase 4 (`asignar`, `editar`, `enviar`, `cerrar`).
   - Mantener el patrón *state-in-render guard* actual (no `useEffect` para abrir modales).
   - Aceptación: `/embarques/[id]?step=asignar` abre el modal de asignar al montar; el resto del comportamiento de la Fase 4 no regresiona (`src/app/(app)/embarques/[id]/__tests__/preparation-flow.test.ts`).

5. **Estado y datos.**
   - Fase mostrada = `derivarEstadoUI({ estado, tienePedidos, totalUnidadesCarga })` (el input es `EmbarqueUIEstadoInput`, no el objeto `embarque` completo). Nunca leer/escribir un estado extra.
   - Mutaciones vía `fetchResilient` + `offlineId`. Toasts `success`/`info`/`error`.
   - Aceptación: cortar la red y registrar un movimiento → toast `info`, se encola, no rompe la vista.

**Tests:**
- Unit: `src/app/(app)/embarques/[id]/mission-detail/__tests__/exception-panel.test.tsx` (deriva filas del payload de excepciones ampliado en `page.tsx`).
- E2E: nuevo `e2e/embarques-mission-detail.spec.ts` — panel de excepciones visible, acordeón mobile, deep-links.

**Dependencias:** ninguna nueva (el payload de excepciones puede necesitar ampliar `page.tsx` — additivo, no toca dominio).

---

## FASE 6b — UI de sustituciones

**Objetivo:** el asistente registra "el cliente devolvió una unidad defectuosa y le di una nueva" en 2 taps, y el sistema genera los 2 movimientos físicos correctos.

**Depende de:** Fase 5 (vive en la tab/sección "Físico" del Mission Detail).

**Archivos a tocar:**
- Nuevo: `src/app/(app)/embarques/[id]/mission-detail/sustitucion-form-modal.tsx`
- Nuevo: `src/app/(app)/embarques/[id]/mission-detail/sustituciones-list.tsx`
- `ledger-tab.tsx` (botón "Registrar sustitución" + render de la lista)
- Endpoint ya existe: `src/app/api/embarques/[id]/sustituciones/route.ts`

**Ítems:**

1. **Modal de alta.** Campos: producto (select, mismo producto — defectuoso → nuevo), cantidad (entero > 0), pedido asociado (opcional), motivo (opcional, ≤500).
   - Cross-producto está **fuera de alcance** (necesita ADR). El select ofrece un solo producto por fila.
   - `offlineId = crypto.randomUUID()` al abrir el modal.
   - Aceptación: enviar el form → `POST /sustituciones` → 201 → toast `success` → la lista se actualiza con la sustitución nueva mostrando sus 2 movimientos.

2. **Lista de sustituciones** del embarque: cada una con su movimiento RETORNO (VEHICULO→INSPECCION) y ENTREGA (VEHICULO→CLIENTE), autor y fecha.
   - Fuente: `GET /api/embarques/[id]/sustituciones`.

3. **Gating.** Botón visible solo para ADMIN/ASISTENTE. Oculto/deshabilitado si el embarque está CERRADO o CANCELADO.

4. **Offline.** `fetchResilient`; en offline → toast `info`, encolado; replay con el mismo `offlineId` → `deduped: true`, no duplica.

**Tests:**
- Unit: `sustitucion-form-modal.test.tsx` (validación Zod cliente, `offlineId`, gating por rol/estado).
- E2E: extender `e2e/embarques-fisico.spec.ts` — crear sustitución desde la UI y verificar los 2 movimientos en el timeline.

---

## FASE 7 — Reconciliation (cierre)

**Objetivo:** cerrar un embarque es un **wizard forzado** (decisión D7) que no deja avanzar con cosas sin resolver, y muestra un preview del resultado antes de confirmar.

> **Estado (2026-08-29):** implementado en `feat/embarques-fase7-reconciliation`.
> Hecho: estructura de wizard secuencial (1), cargo por responsabilidad nunca
> automático (4 — el cliente ahora lee `responsibilityCases` de la respuesta;
> antes leía `deudaCreada`, que el backend ya devuelve `null` desde FASE 6 §13
> → era código muerto), offline (5, ya estaba).
>
> **Endurecido tras auditoría (2026-08-29):**
> - El **preview NO es gate duro**. Es best-effort: si `POST /cerrar/preview`
>   falla (offline, timeout, 2G), el wizard muestra una advertencia ámbar
>   (`data-testid="wizard-advertencia"`) pero **deja confirmar** — el
>   `POST /cerrar` real valida server-side y es la fuente de verdad. Bloquear
>   ahí dejaba al asistente sin poder cerrar con mala red (contra el
>   offline-first del proyecto). Ver `pasoConfirmarValido()` en `wizard-gating.ts`.
> - E2E real del wizard: `e2e/embarques-cierre-wizard.spec.ts` (5 tests):
>   no-saltar-pasos, "Siguiente" bloqueado en Conciliación sin justificar,
>   happy path → CERRADO, preview-falla-no-bloquea.
> - `data-testid` corregido: `responsability-cases-preview` → `responsibility-cases-preview`.
>
> **Nota de flujo (intencional, D7):** el paso Conciliación bloquea el avance
> ante cualquier discrepancia física sin justificación de texto (antes era un
> warning + textarea opcional; el backend acepta vacío). Es el intent de D7
> ("no avanzar con cosas sin resolver"). Confirmado como comportamiento deseado.
>
> **DECISIÓN DEL PO (2026-08-29): NO bloquear el cierre por casos abiertos.**
> El cierre deja cerrar con advertencia visible (el detalle ya muestra los
> `ResponsibilityCase` abiertos en el panel de estado operativo). Ítem 3 del
> backlog de Fase 7 se cierra como "resuelto por decisión de producto — no se
> implementa el bloqueo". `ObligacionPendiente` (§7) puede sumarse al panel más
> adelante como aviso, nunca como bloqueo.
>
> **DECISIÓN DEL PO (2026-08-29) sobre D1 — opción 2:** los cambios de Fase 5
> (`embarque-client.tsx`) y Fase 7 (`cerrar-client/`) van **in-place, sin flag**.
> Solo el Command Center de la **lista** conserva el flag `NEXT_PUBLIC_EMBARQUES_V2`
> como botón de pánico. Para detalle y cierre, el rollback ante un problema es
> `git revert` del commit (minutos, no instantáneo). Aceptado explícitamente.

**Archivos a tocar:**
- `src/app/(app)/embarques/[id]/cerrar/cerrar-client/index.tsx` (1063 líneas — reescritura)
- `src/app/(app)/embarques/[id]/cerrar/cerrar-client/pedido-cuadre.tsx`, `venta-libre-row.tsx`, `confirm-modal.tsx` (adaptar a los pasos)
- `src/app/(app)/embarques/[id]/cerrar/page.tsx` (SSR)
- Endpoint preview ya existe: `src/app/api/embarques/[id]/cerrar/preview/route.ts` (dry-run con rollback)

**Ítems (en orden):**

1. **Estructura de wizard.** Pasos secuenciales, sin saltar hacia adelante:
   `Pedidos → Físico (retornos/inspección) → Monetario (cobros/divergencias) → Gastos → Confirmar`.
   - Se puede volver atrás. No se puede saltar un paso incompleto.
   - Aceptación: con un pedido sin cuadrar, el botón "Siguiente" del paso Pedidos está deshabilitado con el motivo visible.

2. **Preview antes de confirmar.** El último paso llama `POST /api/embarques/[id]/cerrar/preview` y muestra el resultado (deudas a generar, movimientos, caja) sin efectos.
   - Aceptación: el preview refleja exactamente lo que hará el cierre real; si el preview da error, no se habilita "Confirmar cierre".

3. **Bloqueo por excepciones.** Recoveries, casos de responsabilidad y obligaciones sin resolver bloquean el cierre con un mensaje accionable.

4. **Cargo por responsabilidad nunca automático** (ADR-RESPONSABILIDAD-001). Si hay faltante, el asistente elige explícitamente quién responde; el wizard nunca lo asigna solo.

5. **Offline.** El cierre es una operación fuerte: si no hay red, no encolar a ciegas — mostrar `error`/`info` claro y no bloquear el botón (AGENTS.md #16 patrón `setSaving(false)`).

**Tests:**
- Unit: `cerrar-client/__tests__/wizard-gating.test.tsx` (no avanza con pasos incompletos), `preview.test.tsx`.
- E2E: reescribir `e2e/embarques-fixes.spec.ts` parte de cierre — wizard completo happy path + caso de bloqueo.

**Ojo:** ~~el bug preexistente #2 (cierre devuelve 500 en vez de 400 con pagos > total)~~
→ resuelto en Fase 8 (mapeo de la CHECK de Postgres a 400 en el route).

---

## FASE 8 — Test hardening + bugs preexistentes

**Ítems:**

1. ✅ **Bug #1 (stock estimado `botellon`)** — resuelto (2026-08-29). Eran **dos** cosas:
   - Test mal escrito: leía `data.data.estimado` cuando `apiSuccess({estimado})` esparce
     al top level (`data.estimado`). Corregido en `embarques-all-contexts.spec.ts`.
   - Bug latente real: `setStockEstimadoHoy` guardaba `fecha` con `new Date().toISOString()`
     (UTC) mientras `getStockEstimadoHoy` compara contra `getTodayString()` (Bogotá) →
     el estimado "desaparecía" entre 19:00 y 23:59 Bogotá (AGENTS.md #17). Fix en
     `src/lib/stock.ts` + test de regresión en `stock.test.ts`.

2. ✅ **Bug #2 (cierre 500 vs 400 con pagos > total)** — resuelto (2026-08-29) **sin tocar
   dominio**. Causa: el guard `PAGOS_EXCEDIDOS` de `procesar-pedido.service.ts:218` corre
   DESPUÉS del `pedido.update` que persiste `totalPagado`, así que la CHECK de Postgres
   (`chk_pedido_montopagado_le_total`, SQLSTATE 23514) lo ataja primero. Verificado que
   el `PrismaClientUnknownRequestError` incluye el nombre de la constraint en el mensaje.
   Fix: `src/app/api/embarques/[id]/cerrar/route.ts` mapea ese mensaje → 400 con texto
   claro ("Los pagos registrados exceden el total…"). El wizard de Fase 7 además ya
   bloquea este caso antes de llegar al POST (`pasoPedidosValido`).
   - **Deuda técnica opcional (necesita ADR):** mover el guard de dominio ANTES del
     `pedido.update` para que el 400 salga de la capa correcta. No urgente — el mapeo
     de route cubre el síntoma.

3. **Cascada de `full-user-day.spec.ts`** — infra (AGENTS.md #20). No es bug de embarques.

4. **Completar la matriz de tests** (4 ítems parciales del plan maestro §"test hardening").

5. **Cobertura E2E de los 4 roles** sobre el flujo V2 (ADMIN, ASISTENTE, CONTADOR, REPARTIDOR).

**Pendiente menor:** `embarques-all-contexts.spec.ts:279` ("crear stock estimado via modal")
sigue flaky — es un test de UI con `sharedPageLogin` y selectores laxos (`if count>=2`),
no relacionado al backend. Reescribir con testids o quitar.

---

## FASES 9-10 — Migración y retiro de legacy

1. [ ] Cambiar el default del flag a ON en el código (`NEXT_PUBLIC_EMBARQUES_V2` ya es ON por default; formalizar / quitar la doble rama).
2. [ ] Verificación del PO en producción con el flag ON durante N días.
3. [ ] Eliminar UI legacy:
   - `src/app/(app)/embarques/embarques-client/resumen-estados.tsx`
   - `src/app/(app)/embarques/embarques-client/embarque-card.tsx` (el viejo)
   - Los 8 botones de filtro por fase y las ramas `{!EMBARQUES_V2 && ...}` en `index.tsx`
4. [ ] Actualizar `AGENTS.md` (sección Embarques) y quitar los BORRADOR de `docs/embarques/`.

---

## Bugs preexistentes (referencia rápida)

| # | Síntoma | Estado |
|---|---|---|
| 1 | `/api/stock-estimado` `botellon` no aparece en GET | ✅ resuelto (test path + tz en `stock.ts`) |
| 2 | cierre → 500 en vez de 400 con pagos > total | ✅ resuelto (mapeo CHECK→400 en route `cerrar`) |
| 3 | cascada por reset de DB (sesiones invalidadas) | infra E2E, AGENTS.md #20 — trabajo aparte |

---

## Rediseño de crear embarque / auto-generar — DESBLOQUEADO (2026-08-30)

- **Auto-Generar → ✅ hecho.** El módulo de Rutas / Planificador (PR #144, branch
  `docs/rutas-planificador-f0`) reemplaza "Auto-Generar": el botón ahora es
  "Planificar día" y navega a `/rutas`. `/api/embarques/auto` + `auto-generar-preview-modal.tsx`
  eliminados. No rediseñar — su reemplazo UX es el Planificador.
- **Formulario "Nuevo Embarque" manual → en diseño.** Sigue siendo el camino para
  crear UN embarque suelto de último momento, fuera del plan (ADR-PLANIFICADOR-003 §3).
  Diseño en `docs/embarques/2026-08-30-nuevo-embarque-form-diseno.md` (flujo
  "pedidos-primero", wizard de 2 pasos). Prerequisito: PR #144 en `main`.
