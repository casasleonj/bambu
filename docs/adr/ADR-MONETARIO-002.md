# ADR-MONETARIO-002 — Corrección de precio, reducción comercial y saldo a favor en el cierre (addendum a ADR-MONETARIO-001)

- Estado: **PARCIALMENTE IMPLEMENTADO** — §1 (corrección de precio) implementado en la Fase D, ver `ADR-CIERRE-004` (con dos ajustes: «pagó de más» se rechaza y no se emite `NotaCredito`); §2 (reducción comercial, #451) sigue PROPUESTO y sin implementar
- Fecha: 2026-10-24
- Fuente: #326, #445, #451; decisiones del PO del 2026-10-23 (precio con recálculo; crédito con excepción autorizada; venta al paso con pago completo) y del 2026-10-24 (ver «Decisiones del PO»)
- Complementa, sin reemplazar: ADR-MONETARIO-001 (el ledger y la fuente de verdad **no cambian**), ADR-CORRECCION-MONETARIA-001 (corrección de abonos y `REVERSION`), `POLITICA_SALDO_FAVOR_Y_DIFERENCIAL_NEGATIVO_v1.0` (2026-09-08), ADR-AUTORIZACION-REGALOS-001, diseño F2 de excepciones de crédito (ya implementado)
- Fase de implementación: Fase B (precio) y Fase C (reducción comercial)

## Contexto

ADR-MONETARIO-001 fija que `Pedido.saldo` y `Pedido.totalPagado` son la fuente canónica y que `Pago`/`Abono`/`Gasto` son los hechos. ADR-CORRECCION-MONETARIA-001 ya resuelve cómo se revierte un **abono** mal aplicado. Lo que **no** está definido es cómo cambia **la obligación** (el total del pedido) cuando en el cierre cambia un precio o el cliente acepta menos. Hoy:

- Un precio editado en el cierre (incluso $0 o $1) se guarda en el ítem, pero la deuda no cambia (#326). Además el servidor solo aplica precios editados si el usuario es ADMIN.
- No existe una operación para «el cliente ya no quiere el resto» (#451). La corrección G11 es solo para errores de captura.

## Decisiones del PO (2026-10-24)

| Tema | Decisión |
|---|---|
| Quién corrige un precio | **ADMIN y ASISTENTE** |
| Quién autoriza | **ADMIN** |
| Pagó de más | **Saldo a favor** (`Cliente.saldoFavor`) |
| Nota de crédito para una reducción | **Sí** (ya existe `NotaCredito`; ver abajo) |
| «Precio raro» | Alerta si el precio por unidad es **menor de $2.000** en pacas de agua o de hielo, o **menor de $7.500** en botellones |

## Decisión (propuesta)

### 1. Corrección de precio con recálculo
Comando propio de «corregir precio» de una línea:
- **ADMIN y ASISTENTE** pueden registrarla. **Si la registra ADMIN, se aplica; si la registra ASISTENTE, queda como solicitud que un ADMIN autoriza** (interpretación de «corrige admin y asistente, autoriza admin»; ver ADR-AUTORIZACION-REGALOS-001: el administrador autoriza precios).
- Al aplicarse recalcula en **una transacción**: `PedidoItem.precio/subtotal`, `Pedido.total`, `Pedido.saldo` y el documento financiero (`Factura`). Motivo obligatorio y antes/después en auditoría.
- **Precio raro:** si queda por debajo de $2.000 (paca de agua o de hielo) o de $7.500 (botellón), se marca como señal y **solo un ADMIN puede aplicarlo**.
- Si el nuevo total queda **por debajo de lo ya pagado**: la diferencia va a **`Cliente.saldoFavor`**, siguiendo `POLITICA_SALDO_FAVOR…` (no se borra historia; compensación trazable). Nunca un `saldo` negativo.
- Hasta que esto exista, el precio en el cierre se muestra **solo lectura** (así lo hace la Fase A con el flag).

### 2. Reducción comercial aceptada (issue #451)
Comando `AcceptCommercialReduction`, distinto de la corrección G11:
- Entrada: pedido, producto, cantidad que deja de pedirse, quién lo dijo, quién lo registra, quién lo autoriza (**ADMIN**), motivo.
- No toca lo ya entregado ni la cantidad original: crea una revisión de la obligación.
- Nuevo total = lo entregado + lo que sigue vigente. Se genera una **`NotaCredito`** (la misma entidad que ya crean anular/cancelar, con numeración y vínculo a la factura) por la diferencia.
- Si el cliente ya había pagado de más: **saldo a favor**.
- Mientras no esté aprobada, la pantalla solo registra el hecho como «pendiente de autorización en oficina» y el total no cambia (así funciona la Fase A).

### 3. Excepciones de crédito
Ya definido e implementado (F2): `PedidoExcepcionCredito` + `User.puedeAutorizarExcepcionCredito`. Este ADR solo decide que **la venta libre fiada a un cliente bloqueado o sobre su límite usa ese mismo flujo**. `CONSUMIDOR_FINAL` nunca recibe crédito: pago completo.

### 4. Lo que no cambia
Un saldo sin cobrar no es «fiado aprobado» por sí mismo; un pago `REPORTADO` no es efectivo ni `CONFIRMADO`; no hay dos libros competidores; la divergencia sigue sin autocorregirse (`DUAL_WRITE_DIVERGENCE`).

## Criterios de aceptación
Pruebas con Postgres real: precio corregido actualiza ítem, total, saldo y factura juntos; corrección a un total menor que lo pagado deja la diferencia en `saldoFavor` y nunca `totalPagado > total`; ASISTENTE no puede aplicar (queda solicitud); precio < $2.000 (paca) o < $7.500 (botellón) solo lo aplica ADMIN; reducción con y sin prepago genera `NotaCredito`; venta libre fiada a bloqueado con y sin excepción.

## Pendiente de confirmar
- Que la interpretación del punto 1 es la correcta (ASISTENTE solicita, ADMIN autoriza). Si el PO quiere que ASISTENTE aplique directo salvo precio raro, se cambia una línea.

## Riesgos
- Toca dinero y documentos fiscales: se despliega con flag, migración aditiva aplicada antes del merge y verificación en producción de solo lectura.
- Un error de recálculo cambia deuda real: por eso exige motivo, autor y antes/después, y no se aplica en lote.
