# Instrucciones locales · servicios y valores compartidos

**Ámbito:** `src/lib/`. Complementa el núcleo; ninguna nota técnica histórica revoca una decisión vigente del PO.

- **Dinero y saldos:** conservar semántica de cada métrica (fuente, periodo/corte, grano, filtros, estado y rol), precisión monetaria y trazabilidad. Los entregados, pendientes y exigibles **no son intercambiables**. La vista del cierre conserva los snapshots históricos aprobados; no reescribir hechos pasados desde el estado presente.
- **Parciales/fiados:** antes de modificar lógica compartida, recuperar `leerExigibles`, `valorEntregadoPedidoCentavos`, FIFO y los contratos de [entregas parciales](../../docs/fiados/656-658-entrega.md). No marcar «deuda cero» si falta evidencia: registrar «Por conciliar» según el contrato aprobado.
- **Offline:** idempotencia por entidad/operación, reconciliación tras reintentos y deduplicación del borrador; no asumir que el cliente recibió una respuesta cuando el servidor ya guardó.
- **Geografía:** al trabajar coordenadas del pedido, comprobar `pickCoords()` y consumidores: las coords de `Negocio` válidas tienen precedencia sobre las de `Cliente`; valores nulos no son (0,0); vigilar SSRF en URLs y múltiples consumidores. Verificar estos detalles con el código actual.
- **Realtime:** emisión de eventos, Redis/SSE, autorización de suscripción, reconexión y costes; evitar refetch/bucles infinitos. No publicar payloads sensibles.
- **XMOD obligatorio por consecuencia:** para estados/moneda compartidos, identificar productores, transformaciones, consumidores directos e indirectos y pruebas de conciliación, incluidas anulaciones e históricos.

Referencia histórica íntegra: [arquitectura original](../../docs/agentes/fuente-original/01-arquitectura-tecnica.md); fuente técnica actual: `main`, no el snapshot.
