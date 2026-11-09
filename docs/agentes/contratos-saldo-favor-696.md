# Contratos adicionales de main: #691 y #696 · Agua Bambú

**Origen técnico documentado:** [AGENTS.md de main en `ef0bc0dd`](https://github.com/casasleonj/bambu/blob/ef0bc0dd0736e3acfd9d9d0bf64ffc5ff62fb44f/AGENTS.md#L617-L632), y `docs/agentes/auditoria-2026-11/delta_main_ef0bc0dd.json`. Se añadieron después del snapshot de 798 posiciones del AGENTS antiguo, por lo que **NO** estaban representados en aquel inventario. Este módulo los incorpora sin tocar la conservación exacta de la fuente anterior.

**Clasificación:** estado técnico documentado + condiciones de producto/UX aprobadas que requieren confirmación de vigencia frente a decisiones posteriores. Este documento no autoriza nuevos cambios de UI, código, migraciones ni merge. Al modificar saldo a favor, abrir JL/XMOD y contrastar código **actual** y Plan Maestro vigente.

## #691 · Un único escritor de cierre

- **Regla vigente observada:** `POST /api/cierre-dia` fue eliminado; `GET /api/cierre-dia` conserva consulta histórica. La operación de cierre usa `POST /api/cierre`, con validación de la base vigente dentro del bloqueo/transacción.
- **Condición:** al crear, modificar o auditar cierres y permisos.
- **Excepciones/límites:** la ausencia de este `POST` no prueba que otras rutas carezcan de bypass. Revisar antes de inferir seguridad global. Pruebas registradas: `src/app/api/cierre-dia/__tests__/route.test.ts` y `e2e/roles-permisos.spec.ts` (405).
- **Fuente:** [AGENTS L621](https://github.com/casasleonj/bambu/blob/ef0bc0dd0736e3acfd9d9d0bf64ffc5ff62fb44f/AGENTS.md#L621). No reabrir la incidencia histórica como si continuara activa.

## #696 · Saldo a favor de cliente, rebanada 1 ya incorporada en main

**Origen y autorización documentada:** [AGENTS L625-L632](https://github.com/casasleonj/bambu/blob/ef0bc0dd0736e3acfd9d9d0bf64ffc5ff62fb44f/AGENTS.md#L625-L632); el texto atribuye aprobación de maqueta del PO al 2026-11-08 para esta **rebanada y su alcance**, no para futuros módulos. Diseño: nombre escrito «Saldo a favor», color verde azulado; rojo reservado a fiado con etiqueta visible. Interfaz de consulta, sin alterar cifras de dinero ni migrar datos.

### Lectura y permisos
- **Contrato:** `GET /api/clientes/[id]/saldo-favor` para `ADMIN`, `ASISTENTE` y `CONTADOR`; `leerSaldoFavorCliente` devuelve `saldo` (de `Cliente.saldoFavor`), `movimientos` (últimos 50) y `hayMas`. Unifica `IngresoSaldoFavor` (#524) y `PedidoSaldoFavorMovimiento` (#533/#577).
- **Condición:** lectura de movimientos de un cliente específico con autorización. Validar pertenencia del pedido al cliente y no exponer datos de un cliente distinto.
- **Excepción:** cliente canónico `CONSUMIDOR_FINAL` no recibe saldo a favor. Un `Historial.datos` de cobro `COBRO_FIADO_V2` no verificable se trata como `cobro = null` y se muestra «Sin dato», sin inventar persona que recibió, factura ni pedido. La factura debe relacionarse con el pedido confirmado.

### Contabilidad e historia
- **Contrato:** saldo fungible (una bolsa): NO atribuir consumo de un crédito a una entrada individual. El cobro real y su auditoría respaldan un movimiento, no garantizan por sí solos un uso del saldo a posteriori.
- **Condición:** mostrar origen de movimientos; conciliar caja y cliente con fuentes reales.
- **Excepción / pendiente:** a fecha de este registro, consumir saldo a favor al crear nuevo pedido solo reduce `Cliente.saldoFavor` sin movimiento de uso histórico; la migración aditiva de rebanada 3 no está aprobada/implementada por el hecho de figurar aquí. No reconstruir usos pasados sin evidencia.

### UX aprobada solo para rebanada 1
- **Lista:** etiqueta «A favor $X» (`chip-saldo-favor`), también en tarjeta móvil.
- **Detalle Info:** `ClienteSaldoFavor` enseña saldo, movimientos y tres niveles: línea, pedido, «Ver detalle».
- **Carga/error:** skeleton en carga; si lectura falla, **no mostrar cero**, explicar que no se puede consultar y ofrecer **Reintentar** (`role="status"`).
- **Cache/realtime:** `loadClienteSaldoFavor` en `panel-prefetch.ts`, TTL 60 segundos e invalidación con eventos reales del panel. No dar por vigente una caché al cambiar clientes.
- **AyudaTermino:** `disparador` permite «Pedido #N» en vez de «?»; click fija/alternar; adaptar al viewport; Escape cierra solo ayuda, no el panel detrás.
- **Excepciones:** autorización de UI limitada al diseño mencionado; backend y UI tienen aprobaciones distintas; una modificación visual posterior requiere su propia maqueta/validación.

### Pendientes que no se deben convertir en entregados
- **Rebanada 2:** cierre, Dashboard y diálogo de cobro de fiados.
- **Rebanada 3:** movimiento de uso de saldo en nuevos pedidos, aviso en Nuevo Pedido y detalle de pedido.
- **Sin decidir:** tarjeta general «Saldo a favor de clientes» en Dashboard y filtro «Con saldo a favor». **No presentar como una decisión aprobada**.

### Pruebas registradas como antecedentes, NO ejecutadas por este documento
`saldo-favor-cliente.test.ts`, `cliente-saldo-favor.test.tsx`, `cliente-table.test.tsx`, `panel-prefetch.test.ts`, `ayuda-termino.test.tsx`, `integration/saldo-favor-cliente-696.test.ts`, `e2e/clientes-saldo-favor-696.spec.ts`. Verificar alcance y estado en CI del SHA analizado antes de afirmar resultados.

## Regla anti-pérdida para una futura reorganización

Al sustituir `AGENTS.md` nunca basta comparar contra la fuente histórica de 798 posiciones: también deben reconciliarse todos los cambios de `main` posteriores al baseline. Este documento y el JSON se crearon al detectar que #696 se habría perdido. Si `main` avanza otra vez, revisar su diff antes de integrar; **no eliminar fuente ni saltarse el gate**.
