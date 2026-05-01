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

1. **Uses `any` type** — `buildVentasPorPrecio(pedidos: any[])` should be typed properly.
2. **Stock doesn't include today's production** — Only subtracts sold, doesn't add `Produccion` records from today.
3. **No error boundary** — If one query fails, entire dashboard fails (500 error).
4. **`clientesConFiado` is `_count` not unique clients** — Should be `_count` of distinct clients with saldo > 0.
5. **Hourly chart assumes 6am-5pm** — Hardcoded range, may not fit all business hours.

## Implementation TODO

- [ ] Type `pedidos` parameter in `buildVentasPorPrecio`
- [ ] Add today's production to stock calculation
- [ ] Add error boundary / graceful degradation
- [ ] Fix `clientesConFiado` to count distinct clients
- [ ] Make hourly chart range configurable
