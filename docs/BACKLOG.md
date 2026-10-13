# Backlog del proyecto

**Fuente de verdad: [GitHub Issues](https://github.com/casasleonj/bambu/issues).** Este archivo es solo un índice; no copies el detalle aquí.

## Reglas

1. Toda tarea nueva se registra como issue **antes** de empezar a trabajarla (la idea que surge en el chat también).
2. El PR que la resuelve la cierra con `Closes #N` en la descripción (el PR debe apuntar a `main`, si no GitHub ignora la palabra clave).
3. Etiquetas: prioridad `P0` (dinero/integridad) · `P1` · `P2`; tipo `dinero`, `bug`, `tech-debt`; `decision-PO` = bloqueada hasta que el negocio decida.
4. Estado de cada issue (sin tablero, con etiquetas; una sola `estado:*` a la vez):
   `estado:pendiente` → `estado:en-curso` (al abrir la rama/PR) → se cierra con el merge del PR (`Closes #N`).
   `estado:bloqueado` = espera una decisión del PO u otra dependencia; al resolverla pasa a `estado:pendiente`.
5. Una fase = una rama = un PR (ver "Flujo de Entrega" en `AGENTS.md`).

## Vistas útiles

- Pendientes: <https://github.com/casasleonj/bambu/issues?q=is%3Aopen+label%3Aestado%3Apendiente>
- En curso: <https://github.com/casasleonj/bambu/issues?q=is%3Aopen+label%3Aestado%3Aen-curso>
- Bloqueadas: <https://github.com/casasleonj/bambu/issues?q=is%3Aopen+label%3Aestado%3Abloqueado>
- Abiertas P0: <https://github.com/casasleonj/bambu/issues?q=is%3Aopen+label%3AP0>
- Esperan decisión del PO: <https://github.com/casasleonj/bambu/issues?q=is%3Aopen+label%3Adecision-PO>
- Deuda técnica: <https://github.com/casasleonj/bambu/issues?q=is%3Aopen+label%3Atech-debt>
- Auditoría 2026-10-10 (28 hallazgos): <https://github.com/casasleonj/bambu/issues?q=label%3Aauditoria-2026-10-10>

## Auditoría 2026-10-10 (antes Known Issue #29 de `AGENTS.md`)

### P0 — dinero / antifraude
- #300 Venta libre sin gate de conciliación para ADMIN/ASISTENTE
- #301 Venta libre: comprador hardcodeado a `CONSUMIDOR_FINAL`
- #302 Detector de alertas ciego a ventas libres
- #303 No se puede anular una `VENTA_RAPIDA` pagada y no entregada
- #304 Venta rápida trunca el pago excedente en silencio
- #305 Cierre: comisiones/salarios restan de `netoCaja` (decisión PO)
- #306 Cierre: `CIERRE_HUECO` bloquea días sin operación (decisión PO)

### P1 — dinero / datos
- #307 `saldoFavor` se aplica automáticamente al crear pedido
- #308 Editar pedido no valida crédito
- #309 Roles inconsistentes pagar-fiado vs corregir abono (decisión PO)
- #310 `devolverStock` sin efecto en anular
- #311 F5 P1-B: disponibilidad no contempla `Sustitucion` (decisión PO)

### P2 — funcionalidad a medio camino
- #312 Pedidos V2: F10b nunca arrancó (decisión PO)
- #313 `impacto-ubicacion` sin UI
- #314 SLA "en ruta" y umbral de precio manual (decisión PO)
- #315 ¿`/repartidor` se fusiona con el Hub? (decisión PO)
- #316 Territorio F6: Zona con el planificador
- #317 4 epics de control operativo de Embarques (decisión PO)
- #318 `/repartidor` sin "marcar entregado" offline
- #319 `movimientos`: origen/destino sin validar

### P2 — deuda técnica y bugs
- #320 `playwright.test.config.ts` huérfano
- #321 4 tests de `prisma/__tests__` no corren en CI
- #322 Causa raíz de los 8 shards E2E rojos
- #323 `requestQueue` sin `userId`
- #324 Shim legacy de `syncQueue`
- #325 `DescuentoRepartidor.motivo` sin validar
- #327 Loop de redirección EMPACADOR/ENTUBADOR
- #328 Entidad `VentaLibre` inerte

### Otros issues abiertos previos
- #297 Rango de día Bogotá: ventana de 1 ms · #130 coordinación embarques · #39 CI E2E · #33 paginación de clientes
