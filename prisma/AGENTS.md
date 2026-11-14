# Instrucciones locales · esquema, datos y migraciones

**Ámbito:** `prisma/`.

- PostgreSQL únicamente. Revisar esquema y migraciones actuales antes de tocar modelos: NO introducir SQLite ni mezclar providers. Mantener precisión/semántica de valores monetarios y constraints (incluidas claves offline y relaciones).
- **Cambios de esquema:** especificar `expand → migrar/backfill idempotente → compatibilidad de escritura/lectura → contract` cuando aplique. Nunca borrar/renombrar datos productivos como atajo de una fase aditiva.
- **Cronología de despliegue:** confirmar si fusionar a `main` despliega producción. Para migraciones exigidas por el código desplegado, preparar pasos aditivos y compatibles con versión antigua, autorización explícita antes de aplicar en producción, verificación de solo lectura y plan de recuperación de datos antes del merge.
- **No confundir dev con prod:** `prisma db push` de desarrollo no prueba que `migrate deploy` sea seguro ni que la base de Supabase tenga columnas nuevas. Comparar estado real y permisos GRANT si hay tablas/roles nuevos.
- **Concurrencia y datos:** usar índices/constraints/transacciones y deduplicación para evitar dobles pagos, numeración repetida o inventario divergente. Guardar trazas auditables y tests de compatibilidad del estado anterior/posterior.
- Si el requerimiento del producto difiere del esquema: documentar BRECHA PLAN ↔ CÓDIGO, no modificar producto por conveniencia del modelo.

Fuente histórica: [contratos originales](../docs/agentes/fuente-original/01-arquitectura-tecnica.md) y [flujo de entrega](../docs/agentes/flujo-entrega.md). Verificar en `main` real.
