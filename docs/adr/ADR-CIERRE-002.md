# ADR-CIERRE-002 — Integridad del cierre de embarque (addendum a ADR-CIERRE-001)

- Estado: **PROPUESTO — decisiones del PO del 2026-10-24 incorporadas; pendiente de aprobación final** (no implementado)
- Fecha: 2026-10-24
- Fuente: épica #447; hallazgos #438, #444, #445, #448, #449, #450; decisiones D1, D4, D5, D6, D9, D12 de `docs/embarques/2026-10-23-cierre-v2-resumen-para-revision.md`
- Fase de implementación: Fase B del cierre V2
- Complementa: ADR-CIERRE-001 (lock e idempotencia), ADR-RESPONSABILIDAD-001, ADR-PEDIDO-ORIGEN-CANAL-001
- Depende de: ADR-MONETARIO-002 (crédito/excepciones y precios) para lo que toca dinero

## Contexto

La Fase A (PR #456) dejó la pantalla de cierre clara, pero el servidor sigue aceptando cierres que no deberían pasar. Verificado con cierres reales en un entorno de pruebas:

| Hallazgo | Qué pasa hoy |
|---|---|
| #448 | Un pedido `CANCELADO` que sigue en el embarque se cierra como `ENTREGADO` con total $0 y cuenta como entregado. |
| #449 | Un pedido omitido del cierre queda `EN_RUTA` dentro de un embarque `CERRADO`. El cobro tecleado de un pedido que salió del embarque se pierde y aparece como «sobrante». |
| #444 | Valores extremos (gasto de $99.999.999.999, nota enorme, 200 ventas libres) devuelven 500 o se aceptan sin aviso. |
| #445 | Una venta libre puede dejar saldo a `CONSUMIDOR_FINAL` o a un cliente bloqueado; ignora precios especiales; no admite `negocioId` ni `pedidoOrigenId`. |
| #450 | Una venta libre fiada baja la diferencia de mercancía a 0 sin dejar señal. |
| #438 | El preview (dry-run con rollback) consume números de secuencia (`nextval()` no se revierte). |

## Decisión (propuesta)

### 1. Cobertura exacta de pedidos (#449, #444)
El cierre exige que `pedidos[]` contenga **exactamente** los pedidos vigentes del embarque: ni uno menos, ni uno de más, ni repetidos.
- Falta alguno → `409 PEDIDOS_SIN_RESOLVER` con la lista.
- Sobra uno que no es del embarque o se repite → `409 PEDIDO_FUERA_DEL_EMBARQUE` / `400`.
- Si un pedido salió del embarque durante la captura y tenía un cobro tecleado, el servidor **no** lo convierte en sobrante: responde `409` con el pedido y el monto para que la pantalla lo reconcilie.

### 2. Pedidos no entregables (#448)
Un pedido `CANCELADO`, `ANULADO` o ya `ENTREGADO` no puede registrarse como entrega nueva: `409 PEDIDO_NO_ENTREGABLE`. La pantalla lo muestra como «Cancelado — no se entrega».
- **Decidido por el PO (2026-10-24):** `cancelar`/`anular` un pedido lo suelta automáticamente del embarque, con aviso al embarque.

### 3. Preview sin efectos (#438)
El preview no debe consumir secuencias ni escribir. **Decidido por el PO (2026-10-24): opción A** — calcular el resultado sin crear documentos (los números se muestran como «se asignarán al confirmar»). Se descarta mantener el dry-run con rollback porque consume números y viola «repetir el preview no cambia nada».
Además: un `4xx` del preview es un rechazo real y bloquea «Confirmar» (D1); solo red o 5xx son «estimado local».

### 4. Venta libre completa (#445, #450, D4, D9)
- Acepta `negocioId` y `pedidoOrigenId` opcionales. Si viene `pedidoOrigenId`, el cliente debe ser el mismo del pedido, y se guarda `Pedido.pedidoOrigenId`.
- **Una sola operación** por lo que compró de más: `origen=VENTA_LIBRE` si nació en la ruta (aunque se entregue después); `origen=PEDIDO` si se pactó fuera de la ruta. No se crean dos pedidos por las mismas unidades. Idempotencia por `offlineId`.
- Aplica precios especiales de cliente/negocio (hoy ignora ambos).
- `CONSUMIDOR_FINAL` ⇒ pago completo obligatorio (`422 DEUDOR_REQUERIDO` si deja saldo), igual que ya hace la ruta del repartidor.
- Cliente bloqueado o sobre su límite ⇒ pasa por la misma autoridad de crédito que un pedido; solo se permite con **excepción autorizada** (ver ADR-MONETARIO-002).
- Pago sin productos ⇒ `400`.

### 5. Señales, no acusaciones (#450, D6)
El servidor devuelve en el preview/cierre una lista de **señales** que nunca bloquean ni crean deuda: venta libre fiada que compensa faltante, pedido corregido a la baja, sobrante de caja sobre el umbral, cambios sin pedido en la ruta. El sobrante de caja sobre un umbral exige nota. **Pendiente de decidir el umbral:** hoy solo el faltante tiene umbral (`UMBRAL_MINIMO_FALTANTE_CAJA = 5000`); el sobrante no tiene ninguno definido. Propuesta: el mismo valor.

### 6. Límites de entrada (#444)
Topes explícitos (monto por gasto, largo de notas, número de gastos y de ventas libres) y respuestas `400` con mensaje, nunca `500`.

### 7. Permisos (D12)
Ya estaba definido, no se inventa nada nuevo:
- Registrar el cierre sigue siendo ADMIN/ASISTENTE.
- Las excepciones de crédito usan lo que ya existe: la entidad `PedidoExcepcionCredito` y el permiso por usuario `User.puedeAutorizarExcepcionCredito` (diseño F2), sobre el principio de ADR-AUTORIZACION-REGALOS-001: el repartidor registra hechos y no autoriza; el administrador autoriza excepciones y precios.
- La venta libre fiada a un cliente bloqueado reutiliza ese mismo flujo.

## Qué NO se decide aquí
- Reducción comercial aceptada (issue #451) y escasez/reasignación (issue #452): ADR propios.
- Recalcular el precio de un pedido (ver ADR-MONETARIO-002).

## Compatibilidad y despliegue
- Sin migración obligatoria (los campos `pedidoOrigenId`, `negocioId` ya existen en `Pedido`); si se agregan columnas de señales, la migración debe ser aditiva e idempotente y aplicarse **antes** de mergear (Flujo de Entrega, paso 7).
- Los códigos de error nuevos deben convivir con clientes viejos (la cola offline puede reintentar un cierre con el formato anterior): un `4xx` no se reintenta, queda en la cola de fallidos con su motivo visible.

## Criterios de aceptación
Cada regla con una prueba en rojo antes del arreglo, contra Postgres real: pedido cancelado, omitido, repetido, de otro embarque; pago de un pedido retirado; venta libre a anónimo sin pago, a bloqueado, con precio especial, con `pedidoOrigenId`; preview repetido 10 veces sin consumir secuencias; valores extremos sin 500.

## Riesgos
- Endurecer rechaza cierres que hoy pasan: el equipo debe saberlo antes del despliegue (comunicar a asistentes).
- Un cierre en cola creado antes del cambio puede ser rechazado al reenviarse; el aviso persistente de la Fase A cubre ese caso.
