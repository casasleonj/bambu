# Integridad de anulaciones y cobro de fiados — #512 / #514

## Autoridad y alcance

- DECISIÓN: #512 exige total, saldo y pagado en cero al anular, conservando el pago histórico y la nota de crédito por lo efectivamente recibido.
- DECISIÓN: #514 exige que el cobro de cartera solo seleccione deuda entregada; un pedido sin entregar no se elige implícitamente como anticipo.
- El PO autoriza ambas correcciones en esta sesión. Las propuestas originales son PR #518 (`69559cfb`) y #520 (`6cf676c8`); se reconcilian en #518 sobre `main@866265e7`.
- Se mantienen ADR-CARTERA-001 (lock por cliente, FIFO y hechos en la misma transacción), ADR-CORRECCION-MONETARIA-001 D.4/D.6 y la proyección de ADR-PEDIDO-ESTADO-CANONICO-001. Los anticipos explícitos del registro de una venta continúan permitidos.
- No se reconstruyen originales externos ni se publican manifiestos, identificadores o importes históricos privados.

## Reconciliación y verificación

1. Contraste de Issue, PR y dominio: el PR #518 conserva el pago antes de poner el total en cero. El PR #520 priorizaba entregados, pero todavía anticipaba automáticamente el sobrante; eso no satisface #514.
2. Contraejemplos sobre la propuesta original de #514: seis fallos entre once casos de PostgreSQL real, incluidos pedidos sin entregar, sobrante y empate de fechas. La corrección filtra `ENTREGADO` y ordena por fecha y número. El sobrante conserva D.6: saldo a favor, sin aplicarlo a otro pedido ni duplicarlo al reintentar.
3. Verificación de atomicidad, cascada, idempotencia, notas, pagos y pantalla existente contra PostgreSQL. La reparación del legado tiene pruebas propias de respaldo, repetición y rechazo por datos cambiados. Los resultados finales y commits se registran en el PR para mantener este documento independiente de una ejecución concreta de CI.

Fuentes técnicas verificadas: Prisma 6.19.3 [transacciones](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions), PostgreSQL 17 [UPDATE](https://www.postgresql.org/docs/17/sql-update.html) y [bloqueos](https://www.postgresql.org/docs/17/explicit-locking.html). Next.js 16.2.4: guía `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`. No se añaden dependencias ni migraciones de esquema.

## Reparación de registros antiguos

1. Leer el respaldo aprobado citado en #512 y reconciliarlo con una consulta reciente. Un manifiesto privado contiene identidad, número y montos exactos esperados por pedido, fuente y commit. Si no coincide, detenerse.
2. Generar SQL con `scripts/normalizar-anulados-512.ts`, manteniendo entrada y salida fuera del repositorio público. El comando genera un archivo privado y no ejecuta SQL ni descubre credenciales.
3. El SQL consiste en un único bloque atómico: bloquea únicamente las filas del manifiesto, comprueba identidad/estado/montos, guarda `antes`/`despues` en el Historial existente y después pone en cero los montos del pedido. Si algo difiere, revierte todo.
4. Repetir es inocuo: filas ya en cero no generan otro respaldo. No modifica pagos, abonos, notas de crédito, facturas ni pedidos fuera del manifiesto.
5. Aplicar solo a producción verificada después de integrar el código; comparar las filas afectadas y ejecutar el verificador de solo lectura. Los resultados operativos y respaldos permanecen privados. No dar por cerrado #512 mientras falte este paso.

## Límites

- La interfaz existente ya muestra en Fiados únicamente deuda entregada; el servidor se alinea con ella. No se rediseñan pantallas. Un cambio visual posterior requiere maqueta aprobada.
- La selección explícita de un pedido para anticiparlo desde otra pantalla no se incorpora aquí.
- D.6 actualmente no genera Pago/Abono por el crédito excedente: esta entrega conserva esa limitación de trazabilidad de caja y no afirma resolverla. Seguimiento P0: #524.
- #523 (franja horaria de nómina) y #522 (credencial del automatismo de migraciones) siguen separados. No atribuir sus fallos preexistentes a estos cambios ni ocultarlos mediante fechas artificiales.
- Los demás pendientes permanecen en GitHub Issues; este documento no es otro backlog.
