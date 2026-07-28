# Performance Fixes — Diseño Técnico

**Fecha**: 2026-07-27
**Contexto**: Quejas de usuarios sobre lentitud sistémica en portal.aguabambu.com
**Protocolo**: au.md — 3 iteraciones completadas, convergencia alcanzada.

## Resumen

7 fixes en orden de impacto, causa raíz confirmada vía au.md + fuentes externas (bug vercel/next.js#93210).

## Fix 1: Sidebar Links prefetch={false}

**Causa**: Next.js 16 bug #93210 (abierto). `router.refresh()` eager-refetch de todos los `<Link>` visibles. 3 lugares llaman `router.refresh()` (repartidor polling 30s, cierre post-acción, producción post-acción).

**Solución**: `prefetch={false}` en todos los `<Link>` del sidebar. Previene la cascada de ISR Writes en cualquier `router.refresh()`.

**Archivo**: `src/app/(app)/sidebar.tsx` — líneas 227-240 (subItems Link) y 248-262 (items Link). 2 sitios ~6 cambios de 1 atributo cada uno.

**Riesgo**: Navegación pierde prefetch instantáneo. Aceptable para 2G rural (prefetch innecesario consume ancho de banda).

## Fix 2: SmartDateFilter Empty State

**Causa**: `pedido-table.tsx:432` muestra "No hay resultados" cuando `hasActiveFilters=true` y `pedidos.length === 0`. El default 'turno' (ayer+hoy) produce 0 resultados si el último pedido es anterior a ayer. El usuario no sabe que las fechas son el problema.

**Solución**: Agregar detección de "fecha activa sin datos" y mostrar mensaje específico indicando que el rango de fecha no tiene pedidos y sugiriendo usar "Limpiar".

**Archivo**: `src/app/(app)/pedidos/pedidos-client/pedido-table.tsx` — sección EmptyState.

## Fix 3: hasActiveFilters excluir allFromUrl

**Causa**: `hasActiveFilters` incluye `allFromUrl`. Cuando `?all=true` (usuario clickeó "Limpiar"), `hasActiveFilters` es `true` y el CTA "+ Crear Pedido" nunca aparece aunque no haya pedidos.

**Solución**: Excluir `allFromUrl` de la lógica de "filtro activo".

**Archivo**: `src/app/(app)/pedidos/pedidos-client/index.tsx` — lógica de `hasActiveFilters`.

## Fix 4: Cliente Detail Payload

**Causa**: `GET /api/clientes/[id]` incluye `pedidos: { take: 20, include: { items: true } }`. Cada apertura de modal de cliente fetchea 20 pedidos con todos sus items (datos pesados en 2G rural).

**Solución**: Reemplazar `include: { items: true }` con `select` de campos específicos para items: `{ producto: true, cantPedido: true, precio: true, subtotal: true }`.

**Archivo**: `src/app/api/clientes/[id]/route.ts`.

## Fix 5: Pedido Detail Stale Guard

**Causa**: El handler `viewPedido` en pedidos-client no tiene stale guard (a diferencia de cliente que usa `viewSeqRef`). Clicks rápidos en 2G pueden mostrar respuesta de pedido anterior.

**Solución**: Implementar `useRef(0)` seq counter + check antes de `setSelectedPedido`.

**Archivo**: `src/app/(app)/pedidos/pedidos-client/index.tsx` — handler de `viewPedido`.

## Fix 6: N+1 en Embarques

**Causa**: `enrichPedidosWithNegocio()` ejecuta `prisma.negocio.findUnique` por cada pedido en un `.map()`.

**Solución**: Usar `prisma.negocio.findMany({ where: { id: { in: negocioIds } } })` + `Map` lookup. Una query vs N queries.

**Archivo**: `src/lib/embarque-pedido-enrich.ts`.

## Fix 7 (P0): Repartidor — Eliminar router.refresh()

**Causa**: `repartidor-client.tsx:119` usa `usePollingRefetch(() => router.refresh(), 30_000)`. En Next.js 16, cada `router.refresh()` eager-refetcha todos los `<Link>` del sidebar.

**Solución**: Migrar a client-side fetch + useState:
1. Modificar `GET /api/embarques/[id]` para incluir items con select cuando `full=true`
2. Crear `useState(embarque)` en RepartidorClient
3. Reemplazar polling con fetch a `/api/embarques/[id]?full=true` cada 30s + setState
4. Reemplazar ~37 referencias de `embarque` → `embarqueData`

**Archivos**: `src/app/(app)/repartidor/repartidor-client.tsx`, `src/app/api/embarques/[id]/route.ts`.

## Notas post-implementación

- **Fix 3 cancelado**: `allFromUrl` ya estaba excluido de `hasActiveFilters` (línea 555).
- **Fix 6 cancelado**: `enrichPedidosWithNegocio` ya usa `findMany` batch query + `Map` lookup (no hay N+1).
- **Fix 7 (P0)**: Al eliminar `router.refresh()`, `useRouter` ya no se necesita y fue removido.

## Implementación Real

| # | Fix | Archivo(s) | Líneas |
|---|-----|-----------|--------|
| 1 | Sidebar `prefetch={false}` | `sidebar.tsx` | +2 atributos |
| 2 | SmartDateFilter empty state | `pedido-table.tsx`, `index.tsx` | +2 props, +3 mensajes |
| 3 | ~~hasActiveFilters~~ | ya resuelto | — |
| 4 | Cliente detail payload | `api/clientes/[id]/route.ts` | `include: { items: { select: {...} } }` |
| 5 | Pedido detail stale guard | `index.tsx` | `detailSeqRef` + check |
| 6 | ~~N+1 embarques~~ | ya optimizado | — |
| 7 | Repartidor poll replace | `repartidor-client.tsx`, `api/embarques/[id]/route.ts` | `router.refresh()` → API fetch + `useState` |

## Verificación

- `npx tsc --noEmit` — sin errores ✅ (solo pre-existing en e2e/)
- `npx vitest run` — tests pasan
- `npx next build` — build exitoso
