# ADR-STOCK-001 — Stock real, stock estimado y availabilityBasis

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §9.1, §10
- Fase de implementación: FASE 2

## Contexto

Se distinguen tres conceptos que no deben confundirse:

- **PRODUCCIÓN**: unidades declaradas por el área de producción.
- **STOCK FÍSICO**: unidades cuya existencia/custodia está respaldada por hechos físicos (ledger físico).
- **DISPONIBILIDAD ESTIMADA**: proyección para no bloquear innecesariamente la planificación.

La disponibilidad estimada **no es inventario físico**. La operación diaria puede producir directamente hacia embarque sin pasar por almacenamiento.

## Decisión

`availabilityBasis` es únicamente **metadata de validación** al crear una carga:

```
CONFIRMED_STOCK | PRODUCTION_CONFIRMED | ESTIMATED | MIXED
```

- No representa el hecho físico.
- Nunca debe usarse para inferir cuánto se cargó.
- El hecho físico es `EmbarqueCargaProducto.cantidad` (y posteriormente el ledger físico).

La conciliación `stock inicial + producción - ventas = stock final esperado` es una **conciliación de control**, no una sustitución del ledger físico.

## Verificación

`availabilityBasis` nunca se usa como dato físico en ninguna lectura de stock.
