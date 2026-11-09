# ADR-ESCASEZ-RUTA-001 — Pedido adicional con el embarque completamente comprometido

**Estado:** BORRADOR (pendiente de aprobación del PO). Issue: #452. Épica: #447.
**Depende de:** disponibilidad física en vivo (#311, `calcularDisponibilidadFisica`, PR #726).

## Contexto

Con 60 pacas cargadas y 60 comprometidas con pedidos, si un cliente pide 5 más no pueden asignarse 65. Hoy nada impide prometerlas. `calcularDisponibilidadFisica` da, por producto, `custodia` (a bordo), `comprometido` (prometido sin entregar) y `disponible = custodia − comprometido` (puede ser negativo).

## Decisión (ya delegada por el PO el 2026-11-02 en #452)

Se evalúa en este orden y se detiene en el primer paso que resuelve:

1. **Mercancía libre a bordo:** `disponible[producto] ≥ cantidad` → se asigna normal.
2. **Recarga autorizada** sobre el mismo embarque (sin crear otro).
3. **Reprogramar** lo que falta como operación vinculada al pedido original.
4. **Reasignación excepcional** afectando como máximo a **un solo** cliente.
5. Si nada es seguro: **no prometer la entrega**; se registra solo la solicitud.

Reglas:
- **Quién autoriza:** el ADMIN (pasos 2 y 4).
- **Cliente afectado (paso 4):** conserva su pedido y su total; la parte no entregada queda como pendiente recuperable. Tiene prioridad en el siguiente reabastecimiento. En pedidos sucesivos se reconsidera primero al cliente ya afectado si sigue elegible; si no, decide el ADMIN.
- **Sin ranking con pesos inventados.**

## A definir con el PO antes de implementar (no inventado aquí)

- **Elegibilidad:** qué hace «elegible» a un cliente para ser afectado (propuesta mínima, solo para discusión: pedido aún sin ninguna unidad entregada y no marcado como urgente por la oficina).
- **Notificación al cliente afectado:** canal y texto (hoy el sistema no avisa a clientes finales; ver ADR-COMUNICACIONES-001).
- **Umbral:** si el paso 1 usa solo `disponible` o también un margen de seguridad.

## Consecuencias técnicas

- Nueva comprobación al asignar un pedido a un embarque o aceptar un pedido adicional: llama a la lectura de disponibilidad dentro de la misma transacción, con el bloqueo del embarque (ADR-CONCURRENCIA-001): dos solicitudes sobre la misma revisión → una gana, la otra recibe 409.
- Límites heredados de #311 que este ADR no resuelve: RETORNO no suma a lo disponible; pedido entregado en parte y luego sacado del embarque deja de verse (puede sobreestimar lo libre, nunca subestimarlo); botellón depende del ledger (#353) y las ventas libres en vivo sin evento (#354).
- Criterio de prueba: concurrencia (una gana, otra 409) y **cero sobreventa** con Postgres real.

## No incluye

Reducción comercial aceptada (issue aparte) y cualquier UI: requiere maqueta aprobada.
