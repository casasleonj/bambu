# ADR-MIGRACION-001 — Migración progresiva e histórico

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §15, §23, §25
- Fase de implementación: FASE 8 / FASE FINAL

## Contexto

La migración desde el modelo legacy debe ser progresiva, con dual-write, rollback por fase y sin inventar datos históricos.

## Decisión

- Nunca inventar: vehículo, cliente, precio, cobro, autorización, ruta, actividad, custodia.
- Cuando un histórico no tiene información suficiente: `NULL` / `UNKNOWN` / contexto faltante según la semántica del modelo.
- No rellenar datos históricos con valores plausibles.
- Patrón expand-contract: tablas aditivas → backfill idempotente paginado → dual-write → cambiar lecturas → drop columnas legacy. Precedente interno: migración 1FN de contactos/productos.
- Los legacy mirrors (`EmbarqueProducto`, `Trabajador.capacidadKg`) se retiran progresivamente en FASE FINAL.

## Fuera de alcance (§25)

No incorporar en esta convergencia: `CarteraAsignacion`, `sourceType/sourceId` como columnas estructuradas, lifecycle enum adicional para `EmbarqueCarga`, taxonomía nueva de cola de rutas. Solo entran por ADR propio en fases futuras.

## Verificación

Tests §20 "Histórico": operación sin vehículo disponible, responsabilidad sin embarque activo, venta offline tardía, recuperación posterior.

## Estado de implementación (FASE 8)

- ✅ Dual-write del ledger físico al crear embarque: `CrearEmbarqueUseCase` escribe `EmbarqueCarga` + `EmbarqueCargaProducto` (hecho físico de la carga) además del mirror legacy `EmbarqueProducto`. `availabilityBasis` es metadata (§10); `vehiculo` queda null (no se inventa histórico, §15).
- ✅ `Pedido.numero` y `NotaCredito.numero` migrados a secuencia atómica.
- ✅ `PromotionRule` (§17) y movimientos de botellones (§16) como ledger físico.

## Retiro progresivo de legacy mirrors (FASE FINAL)

- `EmbarqueCarga` + `EmbarqueCargaProducto` ya son la fuente del HECHO FÍSICO de la carga (dual-write en `CrearEmbarqueUseCase`).
- `EmbarqueMovimiento` recibe el dual-write del CIERRE (`ENTREGA`/`VENTA_RUTA`/`RETORNO`) vía `RegistrarMovimientosCierre`.
- `EmbarqueProducto` (mirror legacy): **sigue siendo la fuente de conciliación del cierre** (`cargadas/devueltas/cambios/rotas`). Su retiro completo se difiere hasta validar el dual-write del cierre en producción (expand-contract: no se retira hasta validar). No se retira por completo para no romper la conciliación.
- `Trabajador.capacidadKg` (mirror): se consolida en el snapshot `EmbarqueCarga.capacidadKg`; sigue siendo la fuente de validación de capacidad actual.

## Estado de implementación (FASE FINAL — cierre de gaps)

- ✅ `AjustarPedidoCantidadUseCase` (lock `PEDIDO:pedidoId`, §6) + test de dos ajustes concurrentes y retry por offlineId.
- ✅ Dual-write del cierre → `EmbarqueMovimiento`.
- ✅ `ReceivableEntry` en venta-libre/entrega/cierre.
- ✅ `gps-track` offlineId.
