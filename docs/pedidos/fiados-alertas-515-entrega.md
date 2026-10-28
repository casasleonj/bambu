# Fiados y Alertas: reconciliación de acceso y cobro (#515)

Estado: implementación aprobada por el PO. La validación final, integración y SHA de merge se consultan en el [PR #525](https://github.com/casasleonj/bambu/pull/525). Base técnica: `main@be4b65522259df38a48f5ff50fe3eb10fb57b1b9`. Este documento describe esta entrega; los originales privados del proyecto no se copian ni se reconstruyen.

## Autoridad, evidencia y alcance

- **DECISIÓN:** el PO pidió recuperar Fiados/Alertas del antiguo Hub y aprobó expresamente la maqueta V2 de escritorio/móvil, revisión del cobro, documentos, resultado y errores. Luego reportó el caso «Pedidos/Ayer → Fiados vacío». Trazabilidad pública: [#515](https://github.com/casasleonj/bambu/issues/515), comentarios [revisión](https://github.com/casasleonj/bambu/issues/515#issuecomment-6462322533) y [aprobación/reporte](https://github.com/casasleonj/bambu/issues/515#issuecomment-6462474519).
- **EVIDENCIA HISTÓRICA:** blueprint §2.3/G2 eliminaba estas pestañas por diseño. Esa parte queda sustituida por esta decisión posterior, conservando el texto original. No se reconstruyen otras decisiones del producto.
- **ESTADO TÉCNICO ACTUAL de la base:** con Hub ON las pestañas no aparecían. El foco Esperando pago compartía el alcance temporal de Pedidos; la API aceptaba fechas al pedir un scope sin `all`. El hook antiguo propio con `all=true` ya consultaba sin fechas: no atribuirle un defecto que las pruebas no demostraron.
- **DECISIÓN conservada:** cobrar por cliente aplica primero a pedidos **ENTREGADOS** con saldo, por fecha/número globales. Los filtros visuales no seleccionan el destino del dinero; no anticipan pagos a pedidos pendientes. D.6 mantiene el excedente como saldo a favor.
- **PENDIENTE:** [#524](https://github.com/casasleonj/bambu/issues/524), ingreso propio del excedente en cierre. Esta entrega no resuelve esa brecha contable ni repara históricos.
- **PENDIENTE:** `permissions.ts` y su contrato probado conceden `view:facturas` a ASISTENTE, mientras la API autoriza ADMIN/CONTADOR. No se amplían ni eliminan esos permisos de negocio por inferencia. Los nuevos enlaces usan la capacidad efectiva de la API, sin ofrecer una factura que será rechazada. Reconciliación global en [#517](https://github.com/casasleonj/bambu/issues/517).

## Investigación y alternativas

1. Recuperación de pestañas: la primera maqueta permitía revisar acceso, pero no demostraba pagos ni navegación completa. Se amplió la revisión antes de implementar la V2. Alternativas: focos actuales, tablas antiguas intactas, consultas propias con flujo compartido. Se eligió la última por pérdida de acceso y ambigüedad de cobro comprobadas.
2. Revisión de documentos/pagos: sobre la base se reprodujeron (escritorio/móvil) deuda antigua oculta que recibe el abono, factura por ID fuera de primera página que no se abre y ASISTENTE rechazado por API. La V2 se presentó y aprobó antes de implementarla. Se conservan contratos de rol, FIFO, medios por confirmar y responsabilidad/fechas de #472.
3. Reporte Ayer: diagnóstico Hub ON reprodujo el foco temporal y contraste API con/sin `all`. Se añadió la aceptación Ayer → Todos y aislamiento en servidor. Se rechazó una solución que solo cambiara el título de la pestaña o eliminara los filtros de Pedidos.

Referencias técnicas: documentación instalada Next.js **16.2.4** (navegación, parámetros de búsqueda e historial nativo; pruebas Playwright sobre producción), React **19.2.4** (estado y efectos), PostgreSQL **17.10**, Prisma **6.19.3**, Dexie **4.4.2**. No se cambia el esquema, dependencias, permisos de infraestructura ni flags de producción. La cola y el Historial existentes resuelven recuperación e idempotencia; no se agrega otro ledger o almacenamiento.

## Comportamiento de la entrega

- Pestañas accesibles con Hub ON/OFF. Cada consulta conserva búsqueda, período/severidad y expansión en su URL. Pedidos conserva sus fechas. Fiados comienza en **Todos** y consulta páginas completas, sin presentar los primeros 200 como toda la deuda.
- Error de consulta distingue información no disponible de ausencia de deuda/alertas. Al actualizar se conservan datos anteriores. Las alertas siguen siendo señales para revisar; sus reglas, casos e ignorados no se sustituyen por una conclusión de fraude.
- Enlaces a IDs reales de pedido/factura, detalles por ID fuera de primera página y regreso al contexto. Una alerta sin pedido no inventa una asociación; ofrece la consulta del cliente.
- Un mismo cobro para escritorio/móvil: medios e importes → revisión de toda la deuda entregada/FIFO → registro → resultado original recuperable. Los medios digitales conservan el estado REPORTADO/CONFIRMADO al registrar; el detalle refleja su estado posterior.
- Identidad estable por borrador. Nuevo cuerpo mixto exige revisión/versionado y `offlineId`; cuerpo legacy continúa compatible. El servidor revalida bajo CARTERA y registra Pago, Abono espejo, movimiento de cartera y resultado en una transacción. Repetir la misma referencia/cuerpo devuelve el resultado original; reutilizarla con otros datos se rechaza.
- Sin señal se conserva el borrador y la cola existente; no se anuncia pago registrado sin acuse. Una revisión anterior verificable permite preparar el envío offline; sin ella se pide conexión para consultar el reparto. Si cambió la deuda, el worker conserva el rechazo para revisión, en vez de tratar cualquier 409 como deduplicación exitosa.
- El resultado y los recientes viven en Historial existente, no en un toast efímero. La recuperación local separa usuarios y conserva solicitudes inciertas; no se borra una solicitud sin acuse real.

## Pruebas de aceptación y límites

- `fiados-alertas-scope-515.test.ts`: API/PG con fechas, canal, estado y focos ajenos al scope.
- `cobro-revisado-mixto-515.test.ts`: FIFO, pendiente intacto, medios/espejos, versión obsoleta, simultaneidad, referencia distinta, replay original y rollback de auditoría.
- `use-pedidos-scope-completo.test.ts`: paginación y rechazo de consulta inconsistente sin perder datos anteriores.
- `sync-offline.test.ts`: rechazo 409 de este cobro se conserva para revisión.
- `fiados-table-cobro-oficina.test.tsx`: controles #472 en el nuevo diálogo compartido.
- `fiados-alertas-continuidad-515.spec.ts`: Ayer → Todos, documentos/regreso, cobro mixto, concurrencia, offline, rol y factura fuera de página; escritorio y móvil.
- `fiados-alertas-adversarial-515.spec.ts`: deuda cambiada offline, ausencia de revisión, respuesta perdida tras commit, >200 pedidos, error/reintento y Alertas.
- Regresión: suites completas unitarias/integración, tipos/lint/build y recorridos Hub/legacy. No se considera éxito un retry que oculta un fallo; registrar primer resultado y causa. Los resultados ejecutados y el SHA final se completan al cerrar el PR.

Fuera de esta fase: cobro mixto en RegistrarEntrega (#498), filtros adicionales del Hub (#516), anulación/cancelación y reconciliación global de permisos (#517), nómina/horarios (#523), automatización de migraciones (#522) y procedencia histórica (#521). #515/#498/#517 no se cierran automáticamente por esta entrega parcial. No se crean pagos sintéticos en producción ni se aplican reparaciones históricas.

### Evidencia de verificación durante la entrega

- PostgreSQL local: **696/696** en la suite completa; después, **22/22** de cobro repetidas al añadir el caso de centavos. Este último detectó `0.30 - 0.10` representado como `0.19999999999999998` en el resultado; el cálculo guardado ahora usa centavos. No se alteraron pagos de producción.
- CI de código `fbc8e8fc`: **4.281/4.281** unitarias y tipos/lint aprobados; Hub **56 aprobadas, 1 omitida por su condición existente, 0 flaky**. Los cambios posteriores de esta revisión son pruebas y documentación; el PR conserva los resultados del commit final.
- Se sustituyeron las comprobaciones antiguas basadas en nombres internos de variables de `pagar-fiado` por contratos de entrada y pruebas PG del handler: deduplicación concurrente, replay original, crédito único, espejo 1:1 y rollback real de auditoría. No se considera un regex una prueba de integridad monetaria.
- Se registraron y corrigieron problemas de las propias pruebas: etiqueta anidada con opciones de select, selección de copia desktop oculta en móvil, fixture que desactiva auto-sync, lectura de la base antes de terminar el commit y espera de 5 s frente a una consulta completa con presupuesto de 30 s. Las aserciones de dinero y de cantidad de registros se conservan.
- Baseline anterior de `main@be4b6552`: [CI 40639070963](https://github.com/casasleonj/bambu/actions/runs/40639070963), 65 fallos E2E ya presentes. El PR debe comparar por proyecto, spec y caso, investigar cada fallo adicional y conservar la distinción entre fallo, flaky y aprobado. Ese baseline no exime fallos nuevos.

- El CI de `53d1880d` terminó con 69 fallos E2E: los 65 del baseline y cuatro adicionales. Dos detectaron una regresión del contrato legacy: faltaba `pagosAplicados[].abonoCreado`. Se conserva ese campo, emitido únicamente tras crear los espejos en la transacción. Los otros dos buscaban el texto anterior de «Hoy»: se adapta la prueba a la maqueta aprobada y se refuerza comprobando que **Todos** recupera la deuda de ayer. No se elimina ninguna comprobación de Pago, Abono, factura o saldo.
