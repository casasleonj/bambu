# #795 · Precio unitario preciso e importe monetario

Estado: **PRECISIÓN IMPLEMENTADA Y VALIDADA LOCALMENTE; CI, MIGRACIÓN PRODUCTIVA Y LIBERACIÓN PENDIENTES**.

Base investigada: `main` `163c4445b5ba9d8ad87a7c0b27a163a28b2f30bd`.
Fuente: [issue #795](https://github.com/casasleonj/bambu/issues/795) y aclaración/aprobación directa del PO el 13/11/2026: poder escribir un precio decimal para obtener un importe monetario de 138000 en 63 unidades; «Ok, impleméntalo».

La maqueta concreta de escritorio/móvil, factura y estados de confirmación, carga y error fue presentada y aprobada por el PO en esta conversación («Aprobado»). Se conserva el diseño de tarjetas; se amplía el campo existente y se muestra el precio completo.

Este alcance es la precisión del precio. No implementa ni cierra el registro explícito de regalos de #795, que conserva sus decisiones/autorizaciones propias. Un precio manual no identifica por sí mismo unidades de regalo.

## Contrato

- Precio unitario: hasta 6 decimales, ocho dígitos enteros, máximo 99999999.999999. Se amplía escala sin reducir el rango entero anterior de `Decimal(10,2)`.
- El precio es un `UnitPrice` en millonésimas enteras. Los importes siguen siendo `Money` en centavos enteros. No convertir el precio a centavos antes de multiplicar.
- Línea: multiplicación exacta precio×cantidad y redondeo a centavos, media unidad hacia arriba para valores no negativos. Pedido: suma de importes de línea en centavos.
- Ejemplo:2190.47619×63=137999.99997; importe monetario138000.00. El cociente racional infinito no se representa exactamente; sí se obtiene el importe monetario esperado mediante el redondeo definido.
- Parciales: valor de la entrega = valor redondeado del acumulado nuevo − valor redondeado del acumulado anterior. No sumar 63 precios unitarios redondeados independientemente.
- Precio/cantidad modificados: delta entre importes de línea redondeados, no delta de precios unitarios previamente redondeados. Correcciones y reducciones conservan autorización, auditoría y traslado de excedentes existentes.
- Sin cambio de reglas de tarifa, canal, cantidad física, stock, comisiones, identidad offline, FIFO ni tratamiento de cierres consolidados. No hay backfill de precios históricos promediados.

## Tres revisiones previas al código

1. **Descubrimiento/refutación:** el primer diagnóstico confundía la imposibilidad de representar un cociente infinito con obtener un importe monetario redondeado. La aclaración del PO, la prueba con Decimal y el precedente oficial corrigieron esa conclusión. Habilitar `step` por sí solo continúa siendo insuficiente.
2. **Persistencia/consumidores:** `Money.fromDecimal(precio)` y columnas `Decimal(10,2)` truncaban la precisión antes de multiplicar. Se separa el precio de los importes, se amplían columnas actuales y snapshots y se reutilizan lectores monetarios compartidos. No cambiar dinero global a seis decimales.
3. **Adversariales:** parciales sucesivos, devoluciones/reducciones, correcciones inferiores al centavo por unidad, JSON/BigInt, cantidades fuera de rango y recargo decimal0.1 + 0.2. Se preservan cantidades, trazas, reglas de pago e históricos; se rechaza precisión de entrada no conservable en vez de truncarla silenciosamente.

Fuentes: [MDN number](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number), [PostgreSQL17 numeric](https://www.postgresql.org/docs/17/datatype-numeric.html), [Prisma documentación v6](https://github.com/prisma/web/blob/v6/content/200-orm/200-prisma-client/200-special-fields-and-types/index.mdx), [Alegra precisión decimal](https://ayuda.alegra.com/int/configurar-precision-decimal-alegra). Context7 consultado y contrastado con Prisma 6.19.3 instalado. El precedente externo no sustituye las reglas de Agua Bambú.

## Implementado en esta rama

- Valor de precio preciso, cálculo monetario compartido y validación de entrada de hasta 6 decimales.
- Pricing, creación, preview, relectura, edición, canal y proyección/ajuste de cantidad conservan precisión y redondean importes.
- Columnas del pedido, ítem y snapshots de corrección/reducción ampliadas en la migración propuesta.
- Lectores de valor entregado, exigibles, ventas por precio y cierre usan importes calculados después de multiplicar.
- Capturas de entrega exigible conservan precio preciso y acumulado previo, compatibles con hechos históricos que solo tienen precio en centavos.
- Correcciones y reducciones mantienen precios precisos en su evidencia y calculan diferencias de importes de línea. Comparación de obsolescencia de precio a la precisión real.

## Interfaz y recorridos implementados

- Crear pedido, venta rápida y venta en ruta admiten seis decimales en el campo actual. Los precios unitarios se presentan completos; los importes monetarios, con dos decimales.
- Reabrir/editar conserva el precio. Los resúmenes, estimación offline y factura usan el mismo contrato de redondeo. Corrección y reducción muestran la precisión conservada.
- Una entrada que supera seis decimales se bloquea; no se convierte en un total cero ni se guarda recortada.
- Permisos, tarjetas, pasos de entrega/cobro, cantidades físicas e identidad offline se preservan.

## Pendiente antes de liberar

1. PR con `Refs #795`, revisión y CI; comparar cualquier fallo contra el mismo `main` por caso y firma. El alcance de regalos sigue pendiente: este cambio no cierra #795.
2. Autorizar y aplicar la migración productiva antes del merge, con verificación de columnas, bloqueo y compatibilidad. La aprobación de interfaz no autoriza producción.
3. Revisar resultados finales y cumplir los gates de merge y verificación postmerge. No se ha modificado producción.

## Pruebas locales ejecutadas

- 615 pruebas unitarias existentes/nuevas pasaron en 45 archivos. Incluyen dominio de pedidos, precios, corrección/reducción, validadores, exigibles, cierre y dashboard.
- 48 pruebas de integración pasaron en 6 archivos sobre PostgreSQL 17.10, DB aislada `bambu_795_tests`.
- Nuevas integraciones prueban preview→commit→DB→factura→relectura; 63 parciales unitarios y replay A/B/A; prepago exacto; corrección a 2190.476191 y reducción autorizada con sus snapshots.
- 314 pruebas de interfaz y consumidores pasaron en 40 archivos; este conteo se informa por separado porque puede solaparse con la batería de dominio.
- Otras 43 pruebas de integración pasaron en 4 archivos (fiados, cierre y comisiones), DB separada `bambu_795_regression`: 91 integraciones en total entre ambas baterías.
- Build nativo de producción (`npm run build`), TypeScript y ESLint de los archivos afectados sin errores. Sin cambios de dependencias, bundler ni configuración para obtener el build.
- E2E sobre el build de producción, V2 activo, sin reintentos automáticos: 10 combinaciones de escenario/dispositivo aprobadas (crear pedido, rápida, ruta, error/reintento, offline/sincronización doble × escritorio/móvil). Se verificaron precio, total, factura, persistencia, cantidades y pago cuando corresponde. Los tests compartidos también quedan incorporados a las suites existentes; el CI comprobará el modo legacy.
- QA autónomo adicional con Chromium real: editar/reabrir y factura en 1440×900 y 390×844; precio completo, total, rechazo de siete decimales, ausencia de desbordamiento estable y vínculo factura→pedido correcto. Datos sintéticos locales; no constituye una prueba humana. El parámetro `openPedido` se consume al abrir el detalle: se verifica el pedido mostrado, no su permanencia en la URL.
- Se descartó un error del navegador de QA causado por bloquear artificialmente el service worker de Serwist en producción. Con service worker habilitado, el recorrido no presenta errores JS. El cambio de viewport requiere esperar el ajuste responsive, como en la suite existente.
- Migración aplicada dos veces en la DB local aislada; no se realizaron consultas/cambios de producción.
- Maqueta aprobada: 12 vistas escritorio/móvil, campo 2190.47619 válido, fragmento de factura con tabla actual, rechazo de precisión excesiva, sin desbordamiento ni errores JS. No implica integración del formulario real.

Los logs locales contienen únicamente fixtures sintéticos y no se publican. La primera integración de preview falló porque `unstable_cache` necesita contexto de Next; el test omite solo la caché, manteniendo consultas y cálculos reales de PostgreSQL. Reejecución completa satisfactoria.

## Riesgos y límites verificados

- #783 continúa abierto: un aviso de Sonner puede tapar botones y mantener su cierre pausado mientras el puntero lo cubre. El E2E de error reproduce esa condición y recupera mediante una acción real (apartar el puntero y esperar el cierre), sin forzar clics ni borrar el aviso. No se presenta como corregido por #795.
- Baseline `main` `163c4445`, CI [43250994460](https://github.com/casasleonj/bambu/actions/runs/43250994460): lint, calidad, integración y ocho shards E2E correctos; job Hub V2 y resumen fallidos. Falta contrastar firmas con la candidata; este baseline no autoriza ignorar fallos nuevos.
- Los originales privados del Contexto Maestro no estuvieron disponibles; no se reconstruyen ni se publican. La precisión aprobada no implementa el modelo explícito de regalos.
- Consulta de solo lectura del esquema productivo el 14/11/2026 confirma las diez columnas de precio en (10,2). La migración es necesaria. No se aplicó DDL ni se consultaron registros de clientes/pagos para este preflight.

## Despliegue y recuperación

Migración `20261113_precio_unitario_precision_795`: transacción con `lock_timeout=5s`, ALTER de escala de columnas existentes, repetible. No recalcula filas ni importes históricos. Verificar bloqueo/coste de ALTER en un entorno representativo antes de autorizar producción.

La precisión de `PedidoItem.precio`, las seis columnas legacy de precio y snapshots debe ser (14,6); subtotales/totales/pagos mantienen (10,2). No reducir nuevamente la escala como rollback: perdería precios ya registrados. Tampoco asumir que volver a código antiguo es seguro cuando existen precios precisos nuevos, porque el lector antiguo los redondea antes de multiplicar. La recuperación debe conservar lectura/cálculo preciso y detener nuevas capturas afectadas, o aplicar una corrección hacia adelante; cualquier cambio de datos históricos requiere su autorización y trazabilidad propias.
