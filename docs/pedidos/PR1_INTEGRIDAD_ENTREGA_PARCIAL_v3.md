# AGUA BAMBÚ — PLAN DE PLANEAMIENTO
# PR-1 — Integridad de Entrega Parcial v3.0

**Estado:** APROBADO PARA IMPLEMENTACIÓN  
**Prioridad:** P1  
**Baseline:** `main` posterior a PR #174  
**Flag `NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR`:** OFF

## 1. Propósito

Corregir la integridad de una entrega parcial tanto en `Pedido` como en el camino productivo real de cierre de Embarque.

La auditoría técnica determinó que el bug activo ocurre en la rama `PARCIAL` de `procesarPedidoService`, que actualmente puede actualizar Prisma directamente, reducir `total`, descartar prepago y crear un Pedido hijo.

PR-1 debe corregir ese camino sin esperar N2.

## 2. Clasificación

### HECHO
- La rama productiva parcial está en `procesarPedidoService`.
- `Pedido.entregar()` también contiene semántica incorrecta, aunque hoy no sea el camino productivo principal.
- El flujo antiguo puede crear Pedido hijo.
- El flag de entrega posterior permanece apagado.

### DECISIÓN
PR-1 incluye:
1. `Pedido.entregar()`.
2. Rama `PARCIAL` de `procesarPedidoService`.
3. Tests de dominio y regresión productiva.
4. Solución interina sin introducir N2.

### FUERA DE PR-1
- `Fulfillment`.
- `ObligacionPendiente` / `Actividad` / `PlanActividad`.
- `Pago.embarqueId`.
- PUNTO → DOMICILIO.
- Diferencial de precio.
- Tratamiento fiscal.

## 3. Invariantes

```text
saldo = total - totalPagado
```

```text
pendiente = cantPedido - cantEntrega
```

```text
0 <= cantEntrega <= cantPedido
```

La entrega física no modifica destructivamente la obligación económica.

## 4. Caso canónico

### Inicial

```text
Pedido = 10
total = $10.000
totalPagado = $10.000
saldo = $0
```

### Primer Embarque

Entrega 6.

Resultado obligatorio:

```text
cantPedido = 10
cantEntrega = 6
pendiente = 4

total = $10.000
totalPagado = $10.000
saldo = $0

estadoEntrega = PENDIENTE
```

**No crear Pedido hijo.**

### Segundo cumplimiento

Entrega las 4 restantes:

```text
cantEntrega = 10
pendiente = 0
estadoEntrega = ENTREGADO
saldo = $0
```

## 5. Alcance técnico

### `Pedido.entregar()`

Debe dejar de:
- recalcular `total` usando solamente lo entregado;
- recortar `totalPagado` al nuevo total.

Debe:
- validar cantidades;
- acumular `cantEntrega`;
- preservar `total`;
- preservar `totalPagado`;
- mantener `saldo = total - totalPagado`.

### `procesarPedidoService` — `PARCIAL`

Debe:
- conservar `total`;
- conservar `totalPagado`;
- acumular `cantEntrega`;
- conservar pendientes;
- dejar `PENDIENTE` mientras existan pendientes;
- dejar `ENTREGADO` solamente al completar;
- no crear Pedido hijo;
- permitir futura replanificación;
- liberar `embarqueId` cuando corresponda a la semántica interina.

## 6. Estados

| Resultado | Estado |
|---|---|
| 0/10 | `NO_ENTREGADO` |
| 6/10 | `PENDIENTE` |
| 10/10 | `ENTREGADO` |

## 7. Pedido hijo

`crearPedidoHijo()` queda como legado/compatibilidad, pero **no debe ser utilizado por el nuevo flujo `PARCIAL`**.

No usar `idOrigen` para simular cumplimiento parcial.

## 8. Dinero

Un prepago permanece en el Pedido original.

Ejemplo:

```text
10 compradas
10 pagadas
6 entregadas
4 pendientes
saldo = $0
```

PR-1 no redistribuye pagos ni implementa `Pago.embarqueId`.

## 9. Idempotencia y concurrencia

Debe respetarse la infraestructura existente.

El mismo evento de entrega no puede incrementar dos veces `cantEntrega`.

La concurrencia no puede producir:

```text
cantEntrega > cantPedido
```

## 10. Tests obligatorios

1. Entrega parcial válida.
2. Parcial no reduce `total`.
3. Parcial no reduce `totalPagado`.
4. Prepago completo + parcial conserva `saldo = 0`.
5. Entrega acumulativa 6 + 4 = 10.
6. No superar `cantPedido`.
7. No cantidades negativas.
8. No Pedido hijo en el flujo nuevo.
9. Estado `PENDIENTE` mientras falten unidades.
10. Idempotencia/reintento.
11. Concurrencia.
12. Regresión del camino real de `procesarPedidoService`.

### Golden test

```text
10 compradas
10 pagadas
→ entregar 6
→ cierre PARCIAL

total = 10
totalPagado = 10
saldo = 0
entregadas = 6
pendientes = 4
estado = PENDIENTE
sin Pedido hijo

→ entregar 4

entregadas = 10
pendientes = 0
estado = ENTREGADO
saldo = 0
```

## 11. Auditoría obligatoria

Antes de cerrar PR-1 auditar todas las rutas que puedan modificar:

- `cantEntrega`;
- `total`;
- `totalPagado`;
- `estadoEntrega`;
- `embarqueId`;

durante entrega, cierre, reintento, offline, sincronización y replanificación.

No basta con corregir únicamente `Pedido.entregar()`.

## 12. Criterios de éxito

PR-1 solo se acepta si:
- el bug productivo queda corregido;
- no se convierte prepago en deuda artificial;
- `total` permanece intacto;
- `totalPagado` permanece intacto;
- `saldo = total - totalPagado`;
- `cantEntrega` es acumulativa;
- pendientes son recuperables;
- no hay Pedido hijo en el flujo nuevo;
- idempotencia/concurrencia están verificadas;
- tests de dominio y productivos pasan;
- no queda una ruta productiva conocida con la semántica antigua.

## 13. Gate

No considerar PR-1 terminado por:
- eliminar un `min()`;
- eliminar un `CHECK`;
- cambiar solamente estados;
- hacer pasar tests existentes;
- corregir únicamente el agregado de dominio.

Debe demostrarse el camino real:

```text
10 → pagar 10 → entregar 6 → cerrar PARCIAL
```

## 14. Secuencia posterior

```text
PR-1
↓
validación
↓
ADR Pago.embarqueId
↓
PR-2 — cierre monetario
↓
N2 — wiring de cumplimiento
↓
N3 — PUNTO → DOMICILIO
↓
diferencial + fiscal
```

## 15. Principio

> Corregir el camino productivo actual sin convertirlo en la arquitectura definitiva.

PR-1 preserva obligación, dinero y cumplimiento físico sin mezclarlos ni destruir información.
