# Fase 4 — Preparation Flow · plan de pantalla

- **Estado:** ✅ IMPLEMENTADO (Ronda 3)
- **PR:** `feat/embarques-fase4-preparation-flow` (stack sobre #135)

## Ejecutado

- `stepParaAccion()` en `embarque-ui-estado.ts` — mapea `AccionPreparacion` → `?step=` (`editar|asignar|enviar|cerrar`).
- `EmbarqueFormModal` — prop `guided`; tras crear online navega a `/embarques/{id}?step=asignar`. Offline/edit intactos. El Command Center pasa `guided={EMBARQUES_V2 && create}`.
- `command-card.tsx` — el `href` incluye `?step=<accion>` cuando hay siguiente paso; sin acción → link plano.
- `embarque-client.tsx` — `useSearchParams().get('step')`: `asignar`/`editar` abren el modal (ajuste de estado en render con guardia `stepHandled`, sin `set-state-in-effect`); `enviar` hace scroll+focus al botón sin auto-disparar; `cerrar` redirige a `/cerrar`; el resto limpia el `?step` con `router.replace`.
- Tests: `preparation-flow.test.ts` (6), `stepParaAccion` en `embarque-ui-estado.test.ts` (3), href en `command-center.test.tsx` (2). E2E: nuevo test de deep-link en `embarques.spec.ts`; `full-user-day.spec.ts` test 9 ajustado a la navegación guiada.
- Verificación: `tsc` limpio; 277 tests de embarques verdes; `eslint` limpio. **E2E con browser: pendiente de CI.**
- **Base:** `00-plan-frontend-completo.md` §FASE 4 + `01-ux-contract.md` §5.2

## RONDA 1 — hallazgos

- `EmbarqueFormModal` (481 líneas) ya resuelve **Datos + Carga en una sola pantalla**, con feedback de capacidad/peso en vivo, panel de stock disponible, y la lógica sutil de override de "stock insuficiente" (checkbox + motivo si déficit > 10). Ya usa `fetchResilient` + `offlineId`. **Funciona y está cubierto por E2E** (`embarque-create-form.spec.ts`).
- La asignación de pedidos ya existe en `embarque-client.tsx` (modal `showAssignModal`, `handleAsignar` → `PUT /api/embarques/[id]` con proyección de capacidad).
- El detalle ya tiene el "Siguiente paso" accionable (`derivarSiguientePaso` + `ejecutarSiguientePaso`, commits `dd6f7f90`/`83c93d29`).
- **El único dead-end real:** al **crear** un embarque, el usuario vuelve a la lista sin ninguna guía de "ahora asigná pedidos". Y el CTA de la tarjeta del Command Center es hoy un rótulo, no navega al paso.

## RONDA 2 — decisión de alcance

**Se reconsidera el "wizard de 4 pasos" literal del `01-ux-contract.md` §5.2** a favor de un **flujo guiado por deep-link** que conecta crear → asignar → enviar sin desarmar el form que ya funciona. Rationale:

- Desarmar `EmbarqueFormModal` en 4 pasos implica reescribir la lógica de override de stock (la parte más delicada del form) con riesgo de regresión, sin agregar valor real: el form de una pantalla ya es rápido para 6 usuarios expertos.
- El valor que pide el plan es **"nunca un dead-end, siempre un siguiente paso"** — eso se logra conectando los pasos, no fragmentando el form.
- El wizard forzado sí se aplica donde importa: el **cierre** (Fase 7), decisión ya tomada por el PO.

### Implementación

1. **`EmbarqueFormModal`** — prop nueva `guided?: boolean` (default `false`). En `mode="create"` + `guided` + éxito online: navega a `/embarques/{nuevoId}?step=asignar` en vez de solo cerrar. Requiere capturar `embarque.id` de la respuesta (`fetchResilient` ya devuelve `data`). Offline / edit: comportamiento actual intacto.
2. **`command-card.tsx`** — el `href` de la tarjeta incluye `?step={accion}` cuando `derivarSiguientePaso` devuelve una acción (`REGISTRAR_CARGA|ASIGNAR_PEDIDOS|ENVIAR|CERRAR`). Click en la tarjeta = ir a ejecutar el siguiente paso. Sin acción → link plano.
3. **`embarque-client.tsx`** — `useSearchParams()` lee `step` al montar y lo ejecuta una vez:
   - `asignar` → abre el modal de asignación
   - `editar` / `carga` → abre el modal de edición
   - `enviar` → hace scroll + focus al botón "Enviar en Ruta" (no auto-dispara la mutación)
   - `cerrar` → `router.push('/embarques/{id}/cerrar')`
   - luego `router.replace` limpia el param (mismo patrón que `?openEmbarque`).
4. **Command Center empty state** y `embarques-client` empty state ya enlazan a "Crear embarque" (abre el modal `guided`).

### Estados de red
- Crear offline → sin `id` de servidor → no se puede navegar al detalle → se mantiene el comportamiento actual (toast "guardado, se aplicará al reconectar" + cierra). El `?step` solo aplica al camino online.

### Criterios de éxito
- [ ] `tsc` + vitest (embarques) + eslint verdes.
- [ ] Crear un embarque (flag ON) → aterriza en su detalle con el modal de asignar abierto.
- [ ] Tarjeta CONFIRMADO en Command Center → click lleva al detalle con foco en "Enviar en Ruta".
- [ ] Tarjeta EN_RUTA → click lleva a `/embarques/{id}/cerrar`.
- [ ] `?step` se limpia de la URL tras ejecutarse (un refresh no re-dispara).
- [ ] Crear offline sigue funcionando igual (sin navegación).
- [ ] `EmbarqueFormModal` en `mode="edit"` sin cambios de comportamiento.
- [ ] Tests unit del mapeo `accion → step` y del efecto de `step` en el detalle.

### Rollback
Todo detrás de `guided` (default OFF salvo donde el Command Center lo pasa) + `NEXT_PUBLIC_EMBARQUES_V2`. El `?step` es inerte si nadie lo emite.

### Fuera de alcance
- Fragmentar el form en pasos (se descarta, ver rationale).
- Auto-generar offline (deuda #8 del contrato) → queda para Fase 8.
