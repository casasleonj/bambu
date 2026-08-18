# ADR-OFFLINE-001 — Venta libre y operación offline

- Estado: Aceptado (congelado)
- Fecha: 2026-08-16
- Fuente: contrato técnico §11
- Fase de implementación: FASE 7

## Contexto

Las ventas libres pueden ocurrir en ruta sin conectividad y capturarse tardíamente. Deben ser auditables y detectables sin destruir la operación offline.

## Decisión

Cada venta espontánea individual distingue tres timestamps:

- `occurredAt`: cuándo ocurrió la venta según el operador.
- `capturedAt`: cuándo el dispositivo generó el registro local.
- `serverReceivedAt`: cuándo llegó al servidor.

El servidor puede clasificar `NORMAL`, `TARDIA`, `SOSPECHOSA` según la diferencia temporal.

- Una venta tardía legítima **no se bloquea automáticamente**.
- Retry con el mismo `offlineId` no crea otra venta.

## Estado actual (gap a cerrar en FASE 7)

Hoy `VentaLibre` es un `Pedido` con `origen=VENTA_LIBRE` y un único timestamp server-side (`Pedido.fecha`/`createdAt`). Faltan los tres timestamps y la clasificación.

## Estado de implementación (FASE 7 completada)

- ✅ `Pedido` gana `occurredAt`, `capturedAt`, `serverReceivedAt` y `clasificacionTemporal` (nullable; solo relevantes para `origen=VENTA_LIBRE`).
- ✅ `VentaLibreSchema` acepta `occurredAt`/`capturedAt` (ISO datetime opcionales).
- ✅ `clasificarVentaLibre` (`src/lib/venta-libre-clasificacion.ts`): NORMAL | TARDIA (>30min captura→recepción) | SOSPECHOSA (>24h o occurredAt inconsistente). Umbrales configurables.
- ✅ El endpoint `POST /api/pedidos/venta-libre` calcula `serverReceivedAt`, clasifica, persiste los 4 campos y NO bloquea ventas tardías (solo las señala).
- ✅ Métricas `venta_libre_tardia_count` / `venta_libre_sospechosa_count` (§24).
- ✅ Retry con el mismo `offlineId` no duplica (dedup por `Pedido.offlineId @unique` dentro del lock — ya existente).

## Verificación

Tests §20 "Antifraude": dos ventas distintas, retry de la misma, venta tardía, venta sospechosa. `venta-libre-clasificacion.test.ts` (unit) + `timestamps.test.ts` (inspección estática).
