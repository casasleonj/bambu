# F10b — Retiro de la UI legacy del formulario de pedidos (plan para aprobación del PO)

Issue: #312. Decisiones vigentes: soak cerrado y `/repartidor` no se toca (comentarios del 2026-11-02 en #312 y #315).
Estado: **PLAN, sin implementar.** Una fase = una rama = un PR, con el flag fijo en `true`.

## Qué es y qué no es

- **Se retira:** el monolito `PedidoFormUnified` (`src/components/pedido-form-unified/index.tsx`) y las ramas `hubMode ? … : …` de `pedidos-client/index.tsx` que lo montan (crear: línea ~2326; editar: ~2687).
- **NO se retira:** los archivos de `pedido-form-unified/` que el Hub ya reutiliza: `pedido-item-editor`, `pedido-context-panel`, `pedido-pricing-summary`, `cliente-resultado`, `resolve-actualizar-cliente`, `types`. También los usan el cierre V2 (`venta-libre-row-v2`) y la sustitución (`sustitucion-form-modal`). Moverlos a `pedido-workspace/compartido/` es un paso aparte y opcional.
- **No cambia** ninguna regla de dinero, precio, fiado ni pantalla que el usuario ve hoy: en producción el flag ya está en `true` desde 2026-09-23 (activación del 2026-10-26 documentada en #312), así que el usuario ya usa el Hub.

## Ejemplo cotidiano

Antes: si alguien apagara `NEXT_PUBLIC_PEDIDOS_V2`, la pantalla volvería al formulario viejo (que ya no recibe correcciones). Después: no existe esa vuelta atrás; hay un solo formulario y las correcciones se hacen en un solo lugar. Lo que hace hoy Lilia al registrar una venta no cambia.

## Pasos (todos en un solo PR salvo que el PO prefiera dividirlo)

1. **Flag fijo:** `pedidosV2Enabled()` en `src/lib/flags.ts` devuelve `true` siempre (o se elimina y se sustituye `hubMode` por la constante). Se conserva el nombre de la variable en `ci.yml` hasta el paso 5.
2. **Pedidos-client:** quitar las dos ramas legacy, el `dynamic(() => import('@/components/pedido-form-unified'))` y los tipos `PedidoInicial`/`PedidoUnifiedData` que solo existían para el formulario viejo (verificar con `tsc` quién los usa: `pedido-workspace/index.tsx` importa `PedidoUnifiedData` y `use-cliente-context` importa `PatronConsumo`; esos tipos se mueven a un archivo de tipos compartido antes de borrar `index.tsx`).
3. **Borrar** `pedido-form-unified/index.tsx` y sus pruebas que solo cubren el monolito (`entrega-suficiencia-legacy-form`, `fiado-status-no-regression`, `fiado-limite-no-bloquea-pago-completo`, `entrega-despues-toggle`, `precio-race-condition`, `solo-para-este-pedido-checkbox`, `patron-consumo-opt-in`, `negocio-direccion-sin-ruido`, `edit-negocio-prefill`, `canal-inmutable-edicion` si prueban el monolito). **Regla:** antes de borrar cada prueba, comprobar que la regla que protege tiene una prueba equivalente sobre el Hub o sobre el servidor; si no la tiene, se porta en vez de borrarse.
4. **E2E:** las specs con rama `test.skip` cuando el flag está apagado (`pedidos-hub.spec`, `pedidos.spec`, etc.) pierden el `skip`. Las que prueban el formulario legacy (`pedidos-entrega-suficiencia`, `pedidos-edicion-contrato`, `pedidos-crear-por-rol` en su ruta legacy) se migran a los selectores del Hub o se eliminan con justificación.
5. **CI:** el job `E2E` principal pasa a construir con el flag en `true` (hoy corre con flag vacío y existe el job aparte «E2E Hub (V2 ON)»). Se unifican: un solo build y la matriz de 8 shards completa sobre el Hub. Quitar el input `pedidos_v2` del workflow.
6. **Docs:** actualizar `AGENTS.md` (referencias a `pedido-form-unified` y al flag) y `docs/pedidos/ACTIVACION_HUB_RUNBOOK.md` (el flag deja de ser una palanca).

## Riesgos y cómo se cubren

| Riesgo | Cobertura |
|---|---|
| Se pierde una regla que solo protegía el monolito | Paso 3: portar o justificar cada prueba antes de borrarla |
| Un tipo compartido queda colgando de `index.tsx` | `tsc --noEmit` + mover tipos antes de borrar |
| CI E2E cambia de base (flag ON) y aparecen rojos nuevos | Comparar con el baseline de `main` (regla del paso 5 del Flujo de Entrega) |
| Edición de pedidos antiguos en el Hub | La edición ya corre en el Hub con el flag ON en producción; E2E `pedidos-edicion-contrato` lo confirma |

## Criterios de aceptación

- `grep -r "pedido-form-unified/index\|PedidoFormUnified" src` sin resultados.
- `tsc`, `eslint`, Vitest, integración y E2E (8 shards con flag ON) sin fallos nuevos frente al baseline de `main`.
- Sin migración. Sin cambios en `/repartidor`.

## Qué necesita del PO

Aprobar este plan (no hay cambio visual, por lo que no requiere maqueta) y decir si prefiere **un PR** (recomendado, ~una fase) o dos (primero código, luego CI/E2E).
