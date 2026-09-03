# AGUA BAMBÚ — ARCHITECTURE LEVEL SPECIFICATION
# PR-1 — Integridad de Entrega Parcial v3.0

**Estado:** APROBADO PARA IMPLEMENTACIÓN  
**Prioridad:** P1  
**Baseline:** `main` posterior a PR #174  
**Tipo:** Architecture Level Specification

## 1. Objetivo arquitectónico

Garantizar la separación entre:

```text
OBLIGACIÓN ECONÓMICA
total / totalPagado / saldo

CUMPLIMIENTO FÍSICO
cantPedido / cantEntrega / pendiente
```

El cierre parcial no puede destruir información económica.

## 2. Componentes

### Dominio
`src/modules/pedidos/domain/entities/Pedido.ts`

Debe encapsular las invariantes de cantidades y preservar la obligación económica.

### Camino productivo
`procesarPedidoService`, rama `PARCIAL`.

Debe procesar el resultado físico del cierre sin crear una nueva obligación económica.

### Persistencia

Las modificaciones deben permanecer dentro de la transacción existente y mantener coherencia entre cantidad, estado y asignación.

## 3. Invariantes

```text
saldo = total - totalPagado
```

```text
0 <= cantEntrega <= cantPedido
```

```text
pendiente = cantPedido - cantEntrega
```

`cantEntrega` es acumulativa.

La entrega física no es una operación de precio ni de pago.

## 4. Flujo interino

```text
Embarque
↓
cierre PARCIAL
↓
validación
↓
actualización transaccional
├─ cantEntrega acumulada
├─ total intacto
├─ totalPagado intacto
├─ estado = PENDIENTE
└─ embarqueId liberado cuando corresponda
↓
Pedido replanificable
```

No debe existir el flujo:

```text
PARCIAL
↓
recalcular total
↓
recortar totalPagado
↓
crear Pedido hijo
```

## 5. `Pedido.entregar()`

Debe ser correcto por construcción.

Prohibido:

```text
total = subtotal de entregado
totalPagado = min(totalPagado, total)
```

Requerido:
- validar cantidades;
- acumular cantidades;
- preservar `total`;
- preservar `totalPagado`;
- mantener saldo canónico.

## 6. `procesarPedidoService`

La rama `PARCIAL` es el camino productivo prioritario.

Debe dejar de producir una representación económica basada únicamente en las unidades entregadas.

Resultado parcial:

```text
estadoEntrega = PENDIENTE
```

y, bajo la solución interina:

```text
embarqueId = null
```

cuando el pedido queda disponible para futura planificación.

## 7. Estados

```text
0 entregadas       → NO_ENTREGADO
0 < entregadas < N → PENDIENTE
entregadas = N     → ENTREGADO
```

## 8. Pedido hijo

No crear Pedido hijo desde el nuevo camino parcial.

`crearPedidoHijo()` queda fuera del flujo nuevo.

## 9. Persistencia y atomicidad

La actualización debe ser atómica.

No debe quedar persistido:

```text
cantEntrega < cantPedido
AND
estadoEntrega = ENTREGADO
```

en el modelo interino.

`total` y `totalPagado` no deben ser recalculados desde cantidades entregadas.

## 10. Idempotencia

Un mismo identificador de entrega/evento no puede aplicarse dos veces.

Ejemplo:

```text
entrega 6
reintento mismo evento
```

resultado:

```text
cantEntrega = 6
```

no 12.

## 11. Concurrencia

Respetar los locks existentes.

Si el pedido tiene 10 y ya tiene 6 entregadas, un intento concurrente de entregar 6 adicionales debe ser rechazado o serializado de manera que nunca supere 10.

## 12. Replanificación

El resultado parcial debe ser compatible con futura replanificación.

PR-1 no define todavía el ownership definitivo de esa replanificación.

Eso corresponde a N2.

## 13. Pagos

PR-1 no modifica el modelo `Pago`.

Un prepago continúa asociado al Pedido original.

La semántica:

```text
Pago.embarqueId
```

queda para PR-2 y debe congelarse primero mediante ADR.

## 14. Offline

Preservar identificadores de entrega offline y mecanismos de idempotencia existentes.

La sincronización no puede duplicar `cantEntrega`.

## 15. Seguridad

Conservar:
- autorización existente;
- `negocioId`;
- pertenencia del Pedido al contexto;
- validación del Embarque;
- transacción;
- idempotencia.

No permitir manipulación cross-tenant mediante IDs.

## 16. Prohibiciones

PR-1 NO debe:
1. crear `Fulfillment`;
2. crear `PaymentAllocation`;
3. usar `saldoFavor` como reserva;
4. crear Pedido hijo para pendientes;
5. recalcular `total` desde lo entregado;
6. recortar `totalPagado`;
7. eliminar restricciones para hacer pasar tests;
8. activar el flag;
9. resolver PUNTO → DOMICILIO;
10. implementar N2.

## 17. Definition of Done

- [ ] `Pedido.entregar()` corregido.
- [ ] Rama productiva `PARCIAL` corregida.
- [ ] `cantEntrega` acumulativa.
- [ ] `total` intacto.
- [ ] `totalPagado` intacto.
- [ ] `saldo` correcto.
- [ ] `PENDIENTE` para parciales.
- [ ] sin Pedido hijo en flujo nuevo.
- [ ] pendientes recuperables.
- [ ] idempotencia verificada.
- [ ] concurrencia verificada.
- [ ] offline/reintento verificado.
- [ ] tests de dominio pasan.
- [ ] tests productivos pasan.
- [ ] golden test 10→10→6→4→10 pasa.
- [ ] auditoría de escrituras relevantes completada.
- [ ] no queda ruta productiva conocida con semántica antigua.

## 18. Gate PR-2

PR-2 no comienza hasta aceptar PR-1.

Antes de PR-2:
1. congelar ADR de `Pago.embarqueId`;
2. definirlo como contexto de captura del pago;
3. separar dinero histórico de cobro de misión;
4. revisar `PAGOS_EXCEDIDOS`;
5. probar cierre con prepago.

## 19. Gate N2

Antes de N2 debe resolverse el ownership entre:

```text
Actividad
PlanActividad
derivarActividad()
Pedido.embarqueId
```

PR-1 no debe anticipar esa decisión.

## 20. Gate N3

PUNTO → DOMICILIO requiere posteriormente:
- decisión explícita;
- precio histórico;
- diferencial;
- impacto monetario;
- impacto de facturación;
- validación fiscal.

## 21. Principio arquitectónico

> Corregir el camino productivo actual sin convertirlo en la arquitectura definitiva.

La solución interina preserva:

```text
OBLIGACIÓN
+
DINERO
+
CUMPLIMIENTO FÍSICO
```

sin mezclarlos ni destruir información.
