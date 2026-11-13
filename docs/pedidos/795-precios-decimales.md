# #795 · Precio unitario preciso e importe monetario

Estado: **IMPLEMENTACIÓN PARCIAL EN RAMA; UI Y QA DE APLICACIÓN PENDIENTES**.

Base investigada: `main` `163c4445b5ba9d8ad87a7c0b27a163a28b2f30bd`.
Fuente: [issue #795](https://github.com/casasleonj/bambu/issues/795) y aclaración/aprobación directa del PO el 13/11/2026: poder escribir un precio decimal para obtener un importe monetario de 138000 en 63 unidades; «Ok, impleméntalo».

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

## Pendiente antes de considerar resuelto o liberar

1. Aprobar la maqueta concreta del campo decimal en escritorio/móvil y estados aplicables, según `AGENTS.md` §4. La aprobación de implementar la precisión no reemplaza una maqueta no presentada.
2. Conectar el campo actual, resúmenes, estimación offline y presentación de precio preciso en los consumidores pertinentes; conservar diseño y pasos actuales.
3. QA autenticado real y E2E de crear/ruta/rápida, reabrir, editar, facturar, cobrar y reintentar offline, PC/móvil. Las pruebas aisladas de maqueta no son QA de la app.
4. Revisar CI y baseline actual por firma, preparar PR con `Refs #795` mientras el alcance de regalos siga pendiente; no usar `Closes #795` por este avance parcial.
5. Autorización/verificación de la migración productiva antes de desplegar código que dependa de la precisión; revisión y aprobación de merge aplicables. No se ha tocado producción.

## Pruebas locales ejecutadas

- 615 pruebas unitarias existentes/nuevas pasaron en 45 archivos. Incluyen dominio de pedidos, precios, corrección/reducción, validadores, exigibles, cierre y dashboard.
- 48 pruebas de integración pasaron en 6 archivos sobre PostgreSQL 17.10, DB aislada `bambu_795_tests`.
- Nuevas integraciones prueban preview→commit→DB→factura→relectura; 63 parciales unitarios y replay A/B/A; prepago exacto; corrección a 2190.476191 y reducción autorizada con sus snapshots.
- Typecheck sin errores. ESLint de los archivos afectados sin errores.
- Migración aplicada dos veces en la DB local aislada; no se realizaron consultas/cambios de producción.
- Maqueta: 12 vistas escritorio/móvil, campo 2190.47619 válido, fragmento de factura con tabla actual, rechazo de precisión excesiva, sin desbordamiento ni errores JS. No implica integración del formulario real.

Los logs locales contienen únicamente fixtures sintéticos y no se publican. La primera integración de preview falló porque `unstable_cache` necesita contexto de Next; el test omite solo la caché, manteniendo consultas y cálculos reales de PostgreSQL. Reejecución completa satisfactoria.

## Despliegue y recuperación

Migración `20261113_precio_unitario_precision_795`: transacción con `lock_timeout=5s`, ALTER de escala de columnas existentes, repetible. No recalcula filas ni importes históricos. Verificar bloqueo/coste de ALTER en un entorno representativo antes de autorizar producción.

La precisión de `PedidoItem.precio`, las seis columnas legacy de precio y snapshots debe ser (14,6); subtotales/totales/pagos mantienen (10,2). No reducir nuevamente la escala como rollback: perdería precios ya registrados. Tampoco asumir que volver a código antiguo es seguro cuando existen precios precisos nuevos, porque el lector antiguo los redondea antes de multiplicar. La recuperación debe conservar lectura/cálculo preciso y detener nuevas capturas afectadas, o aplicar una corrección hacia adelante; cualquier cambio de datos históricos requiere su autorización y trazabilidad propias.
