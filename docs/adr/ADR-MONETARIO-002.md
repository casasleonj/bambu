# ADR-MONETARIO-002 — Corrección de precio, reducción comercial y excepciones de crédito en el cierre (addendum a ADR-MONETARIO-001)

- Estado: **PROPUESTO — borrador para revisión del equipo** (no aprobado, no implementado)
- Fecha: 2026-10-24
- Fuente: #326, #445, #451; decisiones del PO del 2026-10-23 (precio con recálculo; crédito con excepción autorizada; venta al paso con pago completo)
- Complementa: ADR-MONETARIO-001 (el ledger y la fuente de verdad **no cambian**), ADR-PAGO-REPORTADO-CONFIRMADO-001, ADR-CARTERA-001
- Fase de implementación: Fase B (precio y crédito) y Fase C (reducción comercial)

## Contexto

ADR-MONETARIO-001 fija que `Pedido.saldo` y `Pedido.totalPagado` son la fuente canónica y que `Pago`/`Abono`/`Gasto` son los hechos. No dice cómo cambia **la obligación** (el total del pedido) cuando en el cierre cambia el precio, el cliente acepta menos o se fía a alguien sin cupo. Hoy:

- Un precio editado en el cierre (incluso $0 o $1) se guarda en el ítem, pero la deuda no cambia (#326).
- No existe una operación para «el cliente ya no quiere el resto» (#451). La corrección G11 es solo para errores de captura y no debe usarse.
- Un fiado a cliente bloqueado se acepta sin la autoridad de crédito que sí aplica a un pedido (#445).

## Decisión (propuesta)

### 1. Corrección de precio con recálculo (decisión del PO)
Corregir el precio de una línea es un comando propio, solo ADMIN con permiso específico:
- Recalcula en **una transacción**: `PedidoItem.precio/subtotal`, `Pedido.total`, `Pedido.saldo`, y el documento financiero (`Factura`).
- Motivo obligatorio, autor y antes/después guardados en auditoría.
- Si el nuevo total queda **por debajo de lo ya pagado**: no se ajusta solo. Se registra una devolución o saldo a favor mediante el flujo existente de pagos (decisión humana), nunca un `saldo` negativo.
- Rango de seguridad: rechaza precio ≤ 0 y avisa si se aparta más de un porcentaje configurable del precio vigente.
- Hasta que esto exista, el precio en el cierre se muestra **solo lectura** (así lo hace la Fase A con el flag).

### 2. Reducción comercial aceptada (issue #451)
Comando `AcceptCommercialReduction`, distinto de la corrección G11:
- Entrada: pedido, producto, cantidad que deja de pedirse, quién lo dijo, quién lo registra y quién lo autoriza, motivo y evidencia.
- No toca lo ya entregado ni `cantidadOriginal`; crea una **revisión** de la obligación.
- Efecto económico: nuevo total = lo entregado + lo que sigue vigente. Aplica las mismas reglas de pagos del punto 1 (devolución o saldo a favor si ya pagó de más; nota de ajuste de la factura según la política fiscal).
- Mientras no esté aprobada, la pantalla solo registra el hecho como «pendiente de autorización en oficina» y el total no cambia (así funciona la Fase A).

### 3. Excepciones de crédito (decisión del PO)
- Una venta libre fiada a un cliente bloqueado o sobre su límite se permite **solo con excepción autorizada**, usando la misma autoridad que un pedido (diseño F1/F2 de autoridad de crédito).
- La excepción: permiso específico, motivo, monto máximo, vencimiento, y queda ligada a la venta. Sin excepción ⇒ `403 CREDIT_EXCEPTION_REQUIRED`.
- `CONSUMIDOR_FINAL` nunca recibe crédito: pago completo.

### 4. Lo que no cambia
Un saldo sin cobrar no es «fiado aprobado» por sí mismo; un pago `REPORTADO` no es efectivo ni `CONFIRMADO`; no hay dos libros competidores; la divergencia sigue sin autocorregirse (`DUAL_WRITE_DIVERGENCE`).

## Preguntas para el PO
1. ¿Quién puede corregir precios y quién autoriza una reducción? (propuesta: permisos específicos; ADMIN genérico no basta).
2. ¿Qué se hace con un exceso pagado: devolución en efectivo, saldo a favor, o ambas opciones según el cliente?
3. ¿La reducción acepta nota de crédito fiscal o solo ajuste interno? (requiere confirmar con contabilidad).
4. ¿Porcentaje de alerta por precio atípico?

## Criterios de aceptación
Pruebas con Postgres real: precio corregido actualiza ítem, total, saldo y factura juntos; corrección a un total menor que lo pagado no deja saldo negativo; reducción con y sin prepago; venta libre fiada a bloqueado con y sin excepción; y la base nunca queda con `totalPagado > total`.

## Riesgos
- Toca dinero y documentos fiscales: se despliega con flag, migración aditiva aplicada antes del merge y verificación en producción de solo lectura.
- Un error de recálculo cambia deuda real: por eso exige motivo, autor y antes/después, y no se aplica en lote.
