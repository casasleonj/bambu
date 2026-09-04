# N2 — verificación técnica de los "HECHOS" del ALS/Plan de Producto

**Fecha:** 2026-09-04 · **Base:** `main` `0b32015b` (post auditoría #181: F-A #184, F3p2 #185, E2E #186, F-B #187).

Verificación puntual de las afirmaciones "estado actual observado" de
`AGUA_BAMBU_N2_ALS_v1.0.als.md` §5/§6 y `AGUA_BAMBU_N2_PLAN_PRODUCTO_v1.0.md` §3,
contra `prisma/schema.prisma`. **Coinciden exactamente** — sin brecha entre el
documento del equipo y el código real:

| Afirmación del doc | Verificado en |
|---|---|
| `ObligacionPendiente`: `pedidoId, clienteId, producto, cantidadOriginal, cantidadCumplida, cantidadAsignada, estado, actividades, ajustes` | `schema.prisma:1171-1191` — campo a campo idéntico |
| `Actividad`: `obligacionId, embarqueId` (opcional), `tipo, cantidad, cantidadCumplida, estado`, **sin** `modo` | `schema.prisma:1195-1213` — idéntico; confirma que `modo` NO existe todavía (§7 ALS lo trata como "cambio pendiente", no hecho) |
| `Embarque.actividades` (relación) | `schema.prisma:985` |
| `PedidoCantidadAjuste` con `obligacionId?` | `schema.prisma:1215-1230` |
| Invariante `cantidadCumplida + cantidadAsignada <= cantidadOriginal` | `chk_obligacion_no_sobreconsumo` (constraint DB, ver `[[cumplimiento-parcial-obligacion-actividad]]`) |
| `PlanActividad` ≠ `Actividad` (dos entidades sin reconciliar) | `schema.prisma:2459` (`PlanActividad[]` en otra jerarquía — planificador, ADR-PLANIFICADOR-002) vs `schema.prisma:1195` (`Actividad`, ADR-OBLIGACION/ACTIVIDAD-001). Cero referencias cruzadas entre ambas. |
| Nada de producción crea una `ObligacionPendiente` | Confirmado — `AsignarActividadUseCase` + `/api/obligaciones/[id]/asignar` existen y tienen tests de concurrencia, pero ningún flujo de creación de pedido/planificación las instancia. Scaffolding congelado sin wirear (igual que documentó `[[cumplimiento-parcial-obligacion-actividad]]` antes de este envío del equipo). |
| §14 ALS "la caja se concilia por fecha de captura de Pago, conforme a F-B vigente" | Correcto — PR #187, mergeado antes de este documento. |

**Ningún hallazgo contradice el ALS/Plan.** Ambos documentos son consistentes con
el estado real del repo y con el propio análisis previo (`[[cumplimiento-parcial-obligacion-actividad]]`,
sección N2).

## Estado de este PR

Solo adopta los documentos del equipo + esta verificación. **No se tocó schema,
endpoints, UI ni lógica de dominio** — cumple explícitamente ALS §18/§21 y Plan
§15 ("no implementar N2 directamente sin cerrar primero la arquitectura").

## Próximo paso (no incluido acá)

Los 9 gates del Plan §14 (ownership PlanActividad↔Actividad, semántica de `modo`,
contrato de materialización, contrato Actividad→Embarque, flujo "Gestionar
pendiente", cambio PUNTO→DOMICILIO, replanificación, diferencial, fiscalidad) son
**decisiones de producto/arquitectura pendientes del equipo**, no implementación.
El gate 9 (fiscalidad) depende de un bloqueante externo (contador + proveedor FE +
DIAN) ya señalado en `[[cumplimiento-parcial-obligacion-actividad]]`.
