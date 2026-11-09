# Contextos residuales de la revisión del AGENTS original

**Alcance:** las 64 posiciones de tipo `CONTEXTO_EVIDENCIA` que no figuraban como fuente en el inventario de 556 entradas. Se han clasificado individualmente en `clasificacion_contexto_residual_64.csv`, con significado, condición, excepción y referencia de línea. No equivalen a 64 obligaciones nuevas ni están certificadas.

**Comandos antiguos:** `npm install`, `prisma db push`, seeds o `vercel --prod` son ejemplos de despliegue y desarrollo. No autorizan ejecutar migraciones, tocar datos ni desplegar producción.

**Configuración:** los ejemplos de `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_SECRET` y `NEXTAUTH_URL` no aportan credenciales autorizadas. Verificar proveedor y versión actuales.

**Tablas de rutas:** los nombres de archivos del snapshot son pistas para investigar, no evidencia de existencia ni vigencia. En particular, `src/lib/geo/pedido-coords.ts` cambió prioridad y los documentos de deuda trabajador y comisión del repartidor tienen contratos propios.

**Realtime:** el inventario documentaba `cliente.created/updated/deleted`, `pedido.created/updated`, `embarque.created/updated/deleted`, `pago.created`, `gasto.created`, `compra.created`, `produccion.created`, `trabajador.created/updated/deleted`, `config.updated` y `route_plan.updated`. El `src/lib/realtime.ts` actual define esas entidades y acciones; esto **no demuestra que cada combinación sea emitida o recibida**. Al cambiar una mutación, recorrer publicador → Redis → SSE → consumidor → invalidación de caché, incluyendo alternativas offline.

**Estado:** clasificación de revisión por IA. Sin resultado de pruebas runtime, verificación de cada consumidor, autorización de implementación ni firma humana.
