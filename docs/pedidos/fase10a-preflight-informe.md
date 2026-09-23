# F10a-preflight — Informe de gates F10-1..F10-8 (Pedido Hub V2)

**Fecha:** 2026-09-23 · **Base:** `main` @ `46fa027` · **Rama:** `claude/soak-status-67xd9k`
**Gates:** `docs/pedidos/fase-composicion-c4-edit-plan.md` §"Gates verificables para Fase 10"
**Secuencia aprobada:** F10a-preflight → Preview con Hub ON → gates técnicos → rollback probado → Production Hub ON → soak real → gates finales → F10b.

> Regla de este informe: "según el doc" no cuenta como evidencia. Cada gate cita test/run/commit re-ejecutado en esta sesión contra código de `main`.

---

## 0. Resumen

| Gate | Estado | Bloqueo restante para activar Production |
|---|---|---|
| F10-1 flag ON en un deploy | 🟡 Preview sí · Production no (es el paso de activación) | Activación controlada (post-merge de F10a) |
| F10-2 cobertura funcional (workspace) | ✅ para los flujos activos en prod · N/A condicionado para 2 | Ninguno. Los 2 N/A se reabren si se enciende `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` |
| F10-3 integridad preview↔commit | ✅ | Ninguno |
| F10-4 permisos | ✅ (test comportamental nuevo) | Ninguno |
| F10-5 auditoría | ✅ paridad · ⚠️ BRECHA pre-existente (sin antes/después) | Ninguno para activar; brecha registrada |
| F10-6 sin regresión con flag ON | ✅ fuera de `/pedidos` · ver §F10-6 | Ninguno para activar (fallos nuevos = specs atados a UI legacy → F10b) |
| F10-7 VENTA_LIBRE / repartidor | ✅ no es decisión abierta para activar | Pendiente acotado para F10b (§F10-7) |
| F10-8 rollback probado | 🟡 mecánica Preview ✅ + funcional local ✅ · smoke autenticado en Preview pendiente | Smoke **read-only** en Preview por alguien con credencial real (Preview usa la BD de producción, §F10-8) |

---

## F10-1 — Flag ON por defecto en un deploy

- **Estado:** 🟡 Parcial por diseño.
- **Evidencia:**
  - Production (Vercel `bambu_demo_multimodelo`): `NEXT_PUBLIC_PEDIDOS_V2` **no existe** entre las variables del proyecto → prod corre con el Hub OFF. Los 6 usuarios nunca operaron el Hub.
  - Preview con Hub ON construido y servido: `dpl_6ehV8ENYw6rEMpBYbUAPaVDHYMdL` (rama `claude/soak-status-67xd9k`, variable Preview acotada a esa rama).
  - C4 (#229) mergeado: `74e9fe3`.
- **Bloqueo restante:** es la activación misma (merge de F10a → variable en Production → redeploy → smoke). No se hizo, según lo acordado.

## F10-2 — Cobertura funcional por el workspace

| Flujo | Activo en prod hoy | E2E con flag ON | Evidencia |
|---|---|---|---|
| Crear `PEDIDO` | sí | ✅ | `e2e/pedidos-hub.spec.ts` "workspace (Composición C1)" (existente, 37/37 del soak CI) |
| Crear `VENTA_RAPIDA` | sí | ✅ **nuevo** | `pedidos-hub.spec.ts` "workspace (F10-2): venta rápida…" — verifica `origen=VENTA_RAPIDA`, `clienteId=CONSUMIDOR_FINAL` en la respuesta real del POST |
| Editar `PEDIDO` | sí | ✅ **nuevo** | `pedidos-hub.spec.ts` "workspace (F10-2 / C4): editar un PEDIDO…" — `?openPedido` → Editar → workspace modo edición → PUT 200 → `cantPedido` 3→4 persistido |
| Editar `VENTA_RAPIDA` | **no alcanzable** | N/A | Sin `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR` una venta rápida nace `ENTREGADO` (`CrearPedidoUseCase.ts:247`) y el detalle solo ofrece "Editar" en `PENDIENTE`. La variable no existe en Vercel |
| Venta rápida entregar-después | **no alcanzable** | N/A | Mismo flag, OFF en prod |

- **Corrida:** local contra build de producción standalone con Hub ON: `10 passed` en frío, sin retries (`pedidos-hub.spec.ts`, chromium). CI del PR lo re-ejecuta en `e2e-hub`.
- **Soak CI (contexto, no sustituto):** 37 corridas programadas verdes consecutivas (2026-09-14 19:52Z → 2026-09-22 21:29Z). 0 flaky en las 3 muestreadas. Las 2 fallas del 14-sep eran del test (domingo), fix `dc3d649`.
- **Hallazgo:** con el Hub ON, `/pedidos` **todavía monta el form legacy** en 3 casos: (a) edición de pedidos `VENTA_LIBRE`/`RECURRENTE`, (b) creación con `pedidoInicial` precargado — el deep-link `?new=1&clienteId=` desde `/clientes`, (c) el fallback. Siguen funcionando igual que hoy. Son consumidores vivos a resolver en F10b.

## F10-3 — Integridad preview↔commit

- **Estado:** ✅
- **Evidencia re-ejecutada:** `src/lib/__tests__/integration/preview-pedido-integridad.test.ts` contra Postgres real → **4/4**: (a) preview read-only con snapshots; (b) preview == pedido creado, campo a campo; (c) modo edición: `deepSnapshot` idéntico antes/después del preview y preview == pedido tras el PUT, con los `Pago` conservados exactos; (d) F1 crédito: preview y commit bloquean igual.
- **Por qué prueba al Hub y no solo al use case:** el workspace llama `POST /api/pedidos/preview` (`use-preview.ts:68`) y entrega su commit al mismo `handlePedidoSubmit` (`pedidos-client/index.tsx:941`) → `POST /api/pedidos` / `PUT /api/pedidos/[id]`. Las rutas delegan en `crearPedidoUseCase` / `actualizarPedidoUseCase` / `previewPedidoUseCase` de `src/modules/pedidos/application/index.ts`, construidos con las mismas dependencias que usa el test.

## F10-4 — Permisos

- **Estado:** ✅
- **Cobertura previa:** solo guardrails **estáticos** (regex sobre el fuente) para `PUT /api/pedidos/[id]` y `POST /api/pedidos/preview`. `POST /api/pedidos` no tenía ninguno.
- **Test agregado:** `src/app/api/pedidos/__tests__/workspace-endpoints-roles.test.ts` — **15/15**, comportamental: ejecuta los 3 handlers con el `requireRole` real. REPARTIDOR/CONTADOR → 403 sin llegar al use case, ADMIN/ASISTENTE superan el gate, sin sesión → 401.
- **Mutation check:** ampliando los roles de `preview/route.ts` a los 4, el test falla (2 casos rojos). Archivo restaurado.
- **Página:** REPARTIDOR no tiene `view:pedidos` (`src/lib/permissions.ts:88`) → el proxy lo redirige. CONTADOR entra a `/pedidos` (`e2e/roles-permisos.spec.ts:298`).
- **Observación (paridad, sin cambio):** ni el FAB legacy ni el Hub ocultan "Nueva operación" a CONTADOR. El backend rechaza con 403 en ambos, así que no es regresión del Hub. El blueprint §CONTADOR pide "sin crear/corregir" en UI: queda como mejora de UX, no como gate.

## F10-5 — Auditoría

- **Estado:** ✅ paridad · ⚠️ BRECHA PLAN↔CÓDIGO pre-existente.
- **Test agregado:** `src/lib/__tests__/integration/pedido-edit-audit-paridad.test.ts` (Postgres real, handler real de `PUT`). La misma edición con el payload legacy y con el del workspace produce **1 fila de `Historial` por edición**, idénticas salvo `numero`, y el mismo efecto persistido (items 4→6, total, saldo, obs).
- **Por qué hay paridad por construcción:** ambas UIs pasan por `handlePedidoSubmit`, que en edición envía solo `{items, obs, actualizarCliente, direccionEntrega, barrioEntrega}`. La auditoría la escribe `ActualizarPedidoUseCase` dentro de la transacción (F3).
- **BRECHA registrada (no se corrige en F10a):** el `PedidoAuditDiff` "antes/después" que nombra el gate **no existe**. La fila del PUT es `datos: {numero, estado}`, sin diff. El único registro con antes/después es `PedidoCantidadAjuste` (G11, `ajustar-cantidad`). Afecta igual a legacy y Hub → no bloquea la activación, pero el gate estaba redactado sobre un artefacto inexistente.

## F10-6 — Sin regresión con el flag ON

- **Método:** nuevo input `pedidos_v2` en `workflow_dispatch` (`ci.yml`, sin efecto en push/PR/schedule) para correr la **matriz `e2e` completa (8 shards) con el Hub ON**. Corrida: run `35798488906` (commit `1de3d05` = `main` `46fa027` + solo `ci.yml`). Baseline: run `35797682006` de `main` @ `46fa027` (flag OFF). Comparación test por test (spec + título), no por conteo.
- **Resultado:** ver tabla (se completa con los 8 shards).

<!-- F10-6-TABLA -->

- **Otros jobs de la misma corrida:** Type check + Tests ✅ · Lint ✅ · E2E Hub (V2 ON) ✅ · Integration (non-blocking) ❌ 1/55: `pedido-dedup.test.ts` (P2028), que también falla en el baseline de `main` (documentado en #258).
- **Local:** `npx tsc --noEmit` limpio · `npm run test` 343 archivos / **3395 tests** verdes · eslint limpio en archivos tocados.

## F10-7 — VENTA_LIBRE / repartidor

Regla de recuperación aplicada: blueprint §2.5/§8.3/§8.4, `VENTA_LIBRE_EXPERIENCIA_HUB_v1.0.md` §0/§0bis/§3bis/§16, `VENTA_LIBRE_AUDITORIA_CONTRATO_CODIGO_v1.0.md` §4, código actual.

**DECIDIDO (no reabrir):**
- VENTA_LIBRE = venta no respaldada por Pedido, **dentro de un Embarque**. Se registra solo (A) por el repartidor asignado en ruta o (B) por Admin/Asistente dentro de la conciliación de ese Embarque. Mecanismo `Pedido.origen = VENTA_LIBRE`, integrado con pedido/entrega/pago/caja/auditoría (no es una categoría aislada).
- **El Pedido Hub NO crea VENTA_LIBRE** (`mostrar ≠ crear`). "Venta durante la ruta →" solo navega a Embarques (`hub-accion-frontera.test.ts`).
- PEDIDO / VENTA_RAPIDA / VENTA_LIBRE **no se colapsan en un formulario**. El workspace cubre solo PEDIDO/VENTA_RAPIDA.
- **Superficie UX del repartidor:** se queda en `/repartidor` (dominio Embarques). La consolidación de `/repartidor` en el Hub está **PENDIENTE de validación, no aprobada** (§8.3) → no hay decisión abierta que tomar para activar el Hub.

**ESTADO TÉCNICO ACTUAL:**
- El repartidor **nunca usó `pedido-form-unified`**. Tiene su propio modal en `src/app/(app)/repartidor/repartidor-client.tsx` (`POST /api/pedidos/venta-libre`, offline vía `requestQueue`). **La premisa de F10-7 ("el modal de repartidor usa pedido-form-unified") es incorrecta.**
- `pedido-form-unified` sigue vivo en `/pedidos` para: editar VENTA_LIBRE/RECURRENTE, crear con `pedidoInicial` (deep-link `/clientes`), fallback, y todo con el flag OFF.
- **Acoplamiento/deuda técnica (no se toca en F10a):** `pedido-workspace` depende de `pedido-form-unified` **en runtime, no solo en tipos**: `PedidoPricingSummary`, `PedidoItemEditor`, `PedidoContextPanel`, `resolveActualizarCliente` y los tipos `PedidoUnifiedData`, `Cliente`, `Tier`, `PatronConsumo`. Borrar el directorio rompería el Hub. Extraerlos sin cambiar semántica es preparación de F10b.

**BRECHA PLAN↔CÓDIGO (para F10b, no bloquea activación):**
- Qué superficie **edita un VENTA_LIBRE o RECURRENTE existente** cuando se retire el form legacy. Las fuentes lo marcan como EVIDENCIA HISTÓRICA A RECUPERAR (EH-5: corregir una VL ya entregada preservando número/factura). Con el Hub ON el comportamiento es idéntico al actual.
- Brechas VL ya documentadas y sin cambios: BRECHA-4 (RD-1), BRECHA-6 (RD-2), BRECHA-8. Independientes de la activación.

→ **F10-7 no vuelve como PENDIENTE de negocio.** El único punto abierto es de F10b y ya está clasificado en las fuentes (EH-5).

## F10-8 — Rollback probado

**Hallazgo previo:** existe **un solo proyecto Supabase** (`wdttkrlbpcawulaaiapj`, sin branches de datos) → los deploys de **Preview usan la base de producción**. Cualquier "gate técnico en Preview" que cree o edite datos escribe en producción, así que la verificación en Preview debe ser **read-only**.

| Paso | Dónde | Resultado | Tiempo |
|---|---|---|---|
| Variable `NEXT_PUBLIC_PEDIDOS_V2=true` (Preview, solo rama `claude/soak-status-67xd9k`) | Vercel | creada `lvEjriBusynzbpE7` | segundos |
| Redeploy Hub ON | Vercel | `dpl_6ehV8ENYw6rEMpBYbUAPaVDHYMdL` READY | **~118 s** |
| Verificación | Vercel | sirve (`/pedidos` → `/login`, 200). Sin sesión real no se ve `/pedidos` | — |
| Flag → `false` | Vercel | editada | segundos |
| Redeploy Hub OFF | Vercel | `dpl_4rg1es9VXZrKiMvm363ses37qccj` READY | **~124 s** |
| Build Hub ON + arranque | local (standalone, Postgres real) | `/pedidos` = Hub (`pedido-hub` visible, sin `tab-hoy`); pedido marcador creado (201) | build 87 s |
| Build Hub OFF + arranque | local | `/pedidos` = legacy (`tab-hoy` visible, sin `pedido-hub`); **el pedido creado con Hub ON sigue visible** → sin pérdida de datos | build 90 s |

- **Procedimiento de rollback en Production:** Vercel → `NEXT_PUBLIC_PEDIDOS_V2` = `false` (o borrar) en Production → Redeploy del último deploy de producción (sin caché) → smoke. **Tiempo esperado ≈ 2–3 min** (build medido ~2 min). Cambiar solo la variable **no** alcanza: `NEXT_PUBLIC_*` se inlinea en el build.
- **Datos:** Hub y legacy escriben por los mismos endpoints y use cases (F10-3/F10-5) → el rollback no requiere migración. La cola offline (`requestQueue`) reproduce contra las mismas URLs, así que es compatible en ambos sentidos.
- **Pendiente:** smoke **autenticado y read-only** en Preview (login → `/pedidos` muestra Hub → rollback → `/pedidos` muestra tabs), hecho por alguien con credencial real, **sin crear ni editar**. No usé credenciales de producción.
- **Limpieza pendiente:** la variable Preview acotada a la rama quedó en `false` (inerte = OFF). No había herramienta para borrarla, así que hay que eliminarla desde el dashboard.

---

## Ventana de soak de producción (propuesta basada en ciclos operativos)

**Datos reales** (producción, solo lectura, agregados, últimos 28 días):

| Métrica | 28 días |
|---|---|
| Pedidos creados | 168 (18 días con operación ≈ 9/día; sin domingos) |
| VENTA_RAPIDA / PEDIDO | 148 / 20 |
| VENTA_LIBRE / RECURRENTE | 0 / 0 |
| Nueva demanda G11 (`pedidoOrigenId`) | 0 |
| Obligaciones N2 creadas | 0 |
| Ediciones de pedido (`Historial` UPDATE) | 30 |
| Pagos | 105 |
| `CierreDia` registrados | 0 |
| Plantillas recurrentes activas | 1 (cadencia por defecto `cadaNDias=7`) |

**Implicación:** una ventana por calendario no ejercita los flujos del Hub. PEDIDO (~5/semana) y las ediciones (~7/semana) son poco frecuentes. G11, N2 y recurrentes tienen **volumen orgánico cero**, así que ningún número de días los cubriría.

**Propuesta: el soak cierra cuando se cumplen A y B, lo que ocurra último:**

- **A. Ciclo operativo mínimo:** 2 semanas operativas completas (lun–sáb = 12 días con operación), que incluyan ≥2 lunes (el auto-reprogramado de domingo de recurrentes ya rompió un test una vez) y ≥1 ciclo completo de la plantilla recurrente activa (7 días).
- **B. Cobertura verificada con datos** (consultas read-only sobre `Pedido`, `Historial`, `Pago`, `ObligacionPendiente` dentro de la ventana):
  - volumen orgánico: ≥10 PEDIDO creados, ≥60 VENTA_RAPIDA, ≥10 ediciones, pagos registrados → alineado con ~2 semanas de la media observada;
  - **sesión guiada** con los usuarios (ADMIN/ASISTENTE) para los flujos de volumen cero: 1× nueva demanda G11, 1× gestión de pendiente N2 (PUNTO/DOMICILIO), 1× generación de habituales, 1× corrección de cantidad G11 — con datos reales de operación y registro de quién y cuándo;
  - 0 issues nuevos de Sentry atribuibles a `/pedidos` o a `/api/pedidos/*` sin resolver;
  - feedback de los 6 usuarios al cierre de cada semana (qué no encontraron, qué tardó más).
- **Rollback inmediato** si aparece una regresión crítica: pérdida o duplicación de pedido/pago, precio o saldo incorrecto, o bloqueo de creación. Se aplica el procedimiento F10-8.
- **Observabilidad:** las métricas del plan §2.3 (`pedidos_v2_render_count`, `n2_*`, `g11_*`) **no están implementadas** (grep sin resultados). El soak se mide con las consultas de datos de arriba + Sentry. Implementarlas no es requisito para activar.

---

## Cambios de esta fase (PR F10a-preflight)

- `.github/workflows/ci.yml`: input `pedidos_v2` en `workflow_dispatch` (default `false`; push/PR/schedule sin cambios).
- `src/app/api/pedidos/__tests__/workspace-endpoints-roles.test.ts` (F10-4, nuevo).
- `src/lib/__tests__/integration/pedido-edit-audit-paridad.test.ts` (F10-5, nuevo).
- `e2e/pedidos-hub.spec.ts`: 2 E2E nuevos gated por el flag (F10-2).
- `docs/AGUA_BAMBU_INTEGRIDAD_COMERCIAL_CONVERGENCIA_v1.0.md` §6: estado real del soak.
- Este informe.

Sin cambios de comportamiento, sin borrar legacy, sin tocar el flag en Production, sin mover tipos.

## Antes de F10b

Segunda revisión de `main` orientada a demostrar **"el legacy ya no tiene consumidores necesarios"**. Consumidores vivos conocidos hoy: edición VL/RECURRENTE, deep-link `?new=1&clienteId=`, `cliente-detail-cache.ts:154` (prefetch del form), acoplamiento runtime del workspace (§F10-7), specs E2E atados a UI legacy (§F10-6).
