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
| **5** | Mission Detail | ⏳ Pendiente |
| **6b** | UI de sustituciones | ⏳ Pendiente (depende de 5) |
| **7** | Reconciliation (cierre = wizard forzado) | ⏳ Pendiente |
| **8** | Test hardening + bugs preexistentes | ⏳ Pendiente |
| **9-10** | Flag a default ON + verificación + retiro de legacy | ⏳ Pendiente |

### Bloqueante inmediato
- [ ] PO revisa y mergea PRs **#134, #135, #136, #137** a `main`. Probar en `localhost:3001`.

---

## FASE 5 — Mission Detail

**Objetivo:** el asistente entra al detalle de un embarque y ve de un vistazo qué falta resolver, sin cazar información entre tabs ni usar menús que no funcionan en touch.

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

**Ojo:** el bug preexistente #2 (cierre devuelve 500 en vez de 400 con pagos > total) hay que arreglarlo o el paso Monetario mostrará un error genérico. Ver Fase 8.

---

## FASE 8 — Test hardening + bugs preexistentes

**Ítems:**

1. **Arreglar bug preexistente #1** — `POST /api/stock-estimado` no persiste/devuelve `botellon`.
   - Archivo: buscar el handler de `stock-estimado`. E2E que falla: `e2e/embarques-all-contexts.spec.ts:309` y `:316`.

2. **Arreglar bug preexistente #2** — `POST /api/embarques/[id]/cerrar` devuelve **500** en vez de **400** cuando pagos > total.
   - Viola el CHECK `chk_pedido_montopagado_le_total`. El error sale de `CerrarEmbarqueUseCase` / `ProcesarPedidoService` (`src/modules/embarques/domain/services/procesar-pedido.service.ts`).
   - **Esto sí toca dominio** → necesita ADR o, si es solo mapeo de excepción, alcanza con capturar el `PrismaClientKnownRequestError` en el route handler y devolver 400 (additivo, sin ADR).
    - E2E: `e2e/embarques-fixes.spec.ts:514` (test "pagos que exceden totalReal retorna 400") y assert en `:570`.

3. **Cascada de `full-user-day.spec.ts`** — es infra (AGENTS.md #20: reset de DB invalida sesiones del cluster). No es bug de embarques. Documentar; el fix real es aislamiento de DB por worker (trabajo aparte).

4. **Completar la matriz de tests** (4 ítems parciales del plan maestro §"test hardening").

5. **Cobertura E2E de los 4 roles** sobre el flujo V2 (ADMIN, ASISTENTE, CONTADOR, REPARTIDOR).

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

| # | Síntoma | Dónde | E2E que falla |
|---|---|---|---|
| 1 | `/api/stock-estimado` no devuelve `botellon` | handler stock-estimado | `embarques-all-contexts.spec.ts:309/:316` |
| 2 | cierre → 500 en vez de 400 con pagos > total | `procesar-pedido.service.ts` + route `cerrar` | `embarques-fixes.spec.ts:514/:570` |
| 3 | cascada por reset de DB (sesiones invalidadas) | infra E2E, AGENTS.md #20 | `full-user-day.spec.ts` |

---

## Diferido — rediseño de crear embarque / auto-generar

Contexto adicional en `docs/embarques/ONBOARDING-EQUIPO.md` §10 (el archivo `memory/embarques-auto-generar-es-el-objetivo.md` referenciado antes no existe).

- **Objetivo:** auto-generar como default; el humano hace lo mínimo.
- **Bloqueado:** embarques se alimenta del módulo de **rutas**, no implementado (el plan de rutas existe, falta construirlo).
- Hasta entonces: `embarque-form-modal.tsx` y `auto-generar-preview-modal.tsx` quedan **como están**. No rediseñar.
