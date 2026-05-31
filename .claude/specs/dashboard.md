# Spec: Módulo Dashboard — Agua Bambú v2

## Architecture

**Pattern**: Async Server Component. All queries run in parallel via `Promise.all`.

## Data Sources

| Query | Purpose |
|---|---|
| `pedidos` (hoy) | Pedidos del día actual |
| `pedidosAyer` | Pedidos de ayer para comparación |
| `baseDiaConfig` | Base de caja del día |
| `lastCierre` | Último cierre para stock inicial |
| `gastosAgg` | Gastos del día |
| `embarquesAbiertos` | Count de embarques activos hoy |
| `clientesCount` | Total clientes activos |
| `stockAlertas` | Insumos con stock <= mínimo |
| `cuentasPorCobrarAgg` | Total fiados acumulados |

## UI Sections

| Sección | Contenido |
|---|---|
| Stats Cards | Pedidos, Ventas, Cuentas por Cobrar, Embarques Activos |
| Alertas | Pendientes >5, Fiados >500k, Stock bajo, Embarques activos |
| Ventas por Precio | Tabla desglosada por producto y precio unitario |
| Resumen por Producto | Cards con total cantidad y subtotal por producto |
| Ventas por Hora | CSS bar chart (6am-5pm) |
| Acciones Rápidas | Links a Nuevo Pedido, Cliente, Embarque, Producción |
| Stock Disponible | Agua, Hielo, Botellón (stock ini + prod - ventas) |
| Resumen de Caja | Base + ventas cobradas - gastos = efectivo esperado |

## Calculations

### Stock
```
stockAgua = max(0, stockIniAgua - aguaVendida)
stockHielo = max(0, stockIniHielo - hieloVendido)
stockBotellon = max(0, stockIniBotellon - botellonVendido)
```
Where:
- `stockIni` comes from `lastCierre.stockFin` or config fallback
- `vendido` = sum of `cXEnt` for `ENTREGADO` orders

### Caja
```
efectivoEsperado = baseDia + (ventas - fiadosHoy) - totalGastos
```

### Trends
```
ventasTrend = ((ventas - ventasAyer) / ventasAyer) * 100
pedidosTrend = ((pedidos.length - pedidosAyer.length) / pedidosAyer.length) * 100
```

## Known Issues

1. ~~**Uses `any` type**~~ — FIXED: `buildVentasPorPrecio` now uses `PedidoRaw` interface.
2. ~~**Stock doesn't include today's production**~~ — FIXED: Stock now adds `produccionHoy` aggregates.
3. ~~**No error boundary**~~ — Still no error boundary, but all queries use indexed fields. Low risk with 6 concurrent users.
4. ~~**`clientesConFiado` is `_count` not unique clients**~~ — FIXED: Now uses `prisma.cliente.count()` with `some` relation filter on `ENTREGADO` orders only.
5. ~~**Hourly chart assumes 6am-5pm**~~ — FIXED: Now uses 4 time bands (Madrugada/Mañana/Tarde/Noche).

## Fixed Bugs (2026-05-31)

1. **`ventas` included ANULADO/CANCELADO orders** — Now filters `pedidosValidos` before calculating `ventas` and `ventasAyer`.
2. **`fiadosHoy` included EN_RUTA orders** — Now only counts `ENTREGADO` orders (product not yet received in EN_RUTA).
3. **`cuentasPorCobrarAgg` included EN_RUTA** — Query now filters `estadoEntrega: 'ENTREGADO'`.
4. **`clientesConFiado` included EN_RUTA** — Query now filters `estadoEntrega: 'ENTREGADO'`.
5. **`buildVentasPorPrecio` used pedido quantities** — Now uses `cXEnt` (delivered) and filters ANULADO/CANCELADO.
6. **Hourly chart included ANULADO/CANCELADO** — Now iterates over `pedidosValidos`.
7. **Stock didn't account for losses** — Now subtracts `rotas`, `filtradas`, `consumoInterno` from production aggregates.
8. **`RefreshBadge` remounted on every render** — Moved outside `DashboardClient` component.
9. **`baseDia` NaN propagation** — Added `isNaN()` check after `parseFloat`.

## Implementation TODO

- [ ] Add error boundary / graceful degradation (low priority — indexed queries, 6 users max)
