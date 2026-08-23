# Contrato UX — Embarques (Fase 1)

- Estado: BORRADOR para aprobación (no se construyen pantallas hasta aprobar)
- Fecha: 2026-08-20
- Base: `plan-maestro-embarques-autocontenido-equipo-desarrollo.md` (contrato backend congelado) + `ADR-ARQUITECTURA-001`
- Alcance: define el contrato de experiencia y composición; **no** modifica el contrato de backend.

---

## 1. Principio rector

Toda la granularidad de UX que no existe en el backend se **deriva en cliente** a partir de datos reales (pedidos, carga, excepciones, movimientos), **nunca se persiste** como estado nuevo en `Embarque.estado`. El backend tiene 4 estados reales y es la única fuente de verdad (ver §2).

## 2. Estados reales y mapeo de UI

**Autoridad:** `src/modules/embarques/domain/value-objects/EstadoEmbarque.ts`.

```
ABIERTO ──► EN_RUTA ──► CERRADO
   │
   └──────► CANCELADO
```

| Concepto de producto | Estado real subyacente | Derivación en UI (no persiste) |
|---|---|---|
| Borrador / Propuesto | `ABIERTO` sin pedidos | `pedidos.length === 0` |
| Confirmado | `ABIERTO` con pedidos, sin excepción bloqueante | `pedidos.length > 0 && !hayExcepcionBloqueante` |
| Preparando / Listo | `ABIERTO` | checklist de UI: ¿carga registrada? ¿stock validado? |
| En ruta | `EN_RUTA` | 1:1 |
| Retornado / Conciliando | `EN_RUTA`, con el flujo de cierre abierto | *estar* dentro de `/embarques/[id]/cerrar`, no un valor persistido |
| Cerrado | `CERRADO` | 1:1 |

**Regla inviolable:** ningún PR de UX introduce un estado, un lock ni una fuente de verdad nueva sin pasar por el flujo de ADR del contrato maestro (§26).

## 3. Decisión A.3.1 — resuelta

**Opción B, ya ejecutada** (commit `8b7cd1d0`). La actualización, el envío y el listado de embarques viven en el controller por diseño. Se eliminaron `ActualizarEmbarqueUseCase`, `EnviarEmbarqueUseCase` y `ListarEmbarquesUseCase`. Detalle y racional en `docs/adr/ADR-ARQUITECTURA-001.md`.

Implicación para este contrato: las pantallas que crean/editan/en vían/listan embarques deben tratar a los `route.ts` correspondientes como su contrato de API, no a un use case.

## 4. Alcance de sustitución (A.3.3) — decidido

**Fuera de alcance en esta ronda.** Registrar una sustitución de producto defectuoso requiere un endpoint de backend nuevo (`POST /api/embarques/[id]/sustituciones` sobre `construirMovimientosSustitucion`), lo que es un cambio del contrato congelado. Se excluye explícitamente de Fases 3–7; el tab "Físico" del detalle ya muestra movimientos (`GET /movimientos`) y no se construirá UI de sustitución hasta que el backend la exponga. Re-evaluar en Fase 6 si el Mission Detail la necesita.

## 5. Pantallas objetivo y su contrato

Arquitectura: Command Center → Preparation Flow → Mission Detail → Reconciliation (reafirma el plan original). Cada pantalla nueva se especifica con desktop + mobile + los 4 estados de red.

**Contrato de red (común a todas):** las mutaciones usan `fetchResilient` (`src/lib/fetch-resilient.ts`), que devuelve la unión `{ status: 'ok' | 'offline' | 'error' }`. Toasts: `success` (online), `info` (encolado offline), `error` (error de lógica, no reintentar). Los 4 estados de UI por pantalla son:

- **loading** — skeleton (`loading.tsx` en la ruta) o spinner del componente.
- **success** — datos renderizados.
- **offline** — datos locales + badge "sin conexión, se sincronizará" + `pendingOffline` del hook.
- **error** — mensaje de error + acción de reintentar (solo si el error no es de lógica).

### 5.1 Command Center (Fase 3) — reemplaza `/embarques`

- **Propósito:** vista de conjunto de todos los embarques con el estado derivado (§2), en vez de la lista plana actual de 2 tabs.
- **Reutiliza:** `GET /api/embarques` (ya devuelve `capacidadInfo`, `pedidos`, `estado`), `GET /api/embarques/stats` (`src/lib/embarque-stats.ts`), `EmbarqueAdapter`/`EmbarqueDTOMapper`.
- **Estados de red:** loading (skeleton), success (tarjetas), offline (última lista cacheada en Dexie + badge), error (reintentar).
- **Desktop/mobile:** grid de tarjetas en desktop; lista apilada en mobile. Los textos duplicados responsive requieren `data-testid` por vista (patrón AGENTS.md #24).

### 5.2 Preparation Flow (Fase 4) — guía crear/asignar/preparar

- **Propósito:** convertir la secuencia actual (modal crear → navegar → asignar pedidos → editar carga) en un flujo guiado con "siguiente paso".
- **Depende de A.3.2 resuelto:** `POST /api/embarques`, `PUT /api/embarques/[id]`, `POST /api/embarques/auto`, `DELETE .../pedidos/[pedidoId]` deben unificarse a `fetchResilient`+`offlineId` (hoy usan `fetch` crudo, sin encolar).
- **Reutiliza:** `EmbarqueFormModal`, `AutoGenerarPreviewModal` (lógica), `CrearEmbarqueUseCase` vía `POST /api/embarques`, `validarStock`/`validarCapacidadPeso` (reglas ya en backend, no reimplementar).
- **Estados de red:** cada paso muestra loading/success/offline/error; el paso "asignar" es la acción más expuesta a corte 2G.
- **Desktop/mobile:** wizard horizontal en desktop; stepper vertical en mobile.

### 5.3 Mission Detail (Fase 5) — reemplaza `/embarques/[id]`

- **Propósito:** vista "viva" de la misión en curso; hoy el detalle no se entera de cambios de otros usuarios (sin realtime).
- **Depende de A.3.2 resuelto** para el botón "Enviar en Ruta" (`POST /api/embarques/[id]/enviar`, hoy `fetch` crudo sin encolar).
- **Reutiliza:** tabs actuales (Pedidos/Clientes/Físico), `LedgerTab` + `RecoveryFormModal` + `BotellonesPanel` (movimientos/recovery/botellones), `optimizar-orden` (TSP).
- **Gaps a cerrar en esta pantalla (documentados, no silenciosos):** realtime en detalle (hoy solo en lista), deep link `?openEmbarque={id}` roto (la notificación push cae a la lista), `70` hardcodeado en "asignar pedidos" (debe leer `/api/config`).
- **Estados de red:** ídem; el botón "Enviar" debe encolarse offline.
- **Desktop/mobile:** tabs en desktop; accordion/segmented en mobile.

### 5.4 Reconciliation (Fase 7) — reemplaza `/embarques/[id]/cerrar`

- **Propósito:** cierre guiado con preview autoritativo; hoy el wizard tiene 5 secciones no forzadas y el cliente recalcula el cuadre en un `useMemo` (puede divergir del backend).
- **A.3.4 resuelto:** `POST /api/embarques/[id]/cerrar/preview` corre `CerrarEmbarqueUseCase.execute({ ..., dryRun: true })` — mismo cálculo, misma transacción, rollback garantizado (ver `DryRunSignal` en el use case; cubierto por `src/lib/__tests__/integration/cierre-preview-dry-run.test.ts` contra Postgres real). El wizard actual (`cerrar-client`) ya lo consume en su sección de Preview como número autoritativo, con `calculos` local como fallback si el preview falla/está offline. Pendiente: extender este mismo patrón al Reconciliation screen dedicado (wizard forzado + 4 estados de red) que reemplace el wizard actual — la pieza de backend/datos ya no bloquea eso.
- **Reutiliza:** `CerrarEmbarqueUseCase` (controller thin real), dedup por `offlineId`, `POST .../cerrar/preview` (dry-run, A.3.4).
- **Estados de red:** el envío del cierre ya usa `fetchResilient` (BAMBU-LOG-006); el preview nuevo hereda el mismo contrato.
- **Desktop/mobile:** ídem §5.3.

## 6. Qué no se toca

- Los 4 estados, los 4 ledgers, los locks y la idempotencia del contrato backend (20 ADRs + GATE `PASS`).
- La regla "no 2 EN_RUTA" (vive en `enviar/route.ts`, documentado en ADR-ARQUITECTURA-001).

## 7. Gate de aprobación

Este contrato se presenta al product owner para aprobación explícita antes de construir pantallas (Fases 3–7). Las decisiones de §3 y §4 son vinculantes para las fases siguientes salvo que el PO las revierta por escrito.
