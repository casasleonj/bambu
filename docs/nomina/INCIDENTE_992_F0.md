# Issue #992 · F0: paridad del esquema de DeudaTrabajador

**Estado:** cambio preparado en rama, sin aplicación productiva ni merge.
**Contrato preservado:** pagos, fechas, deudas, comisiones, deducciones y gastos permanecen sin cambios.

## Diagnóstico y alcance

En producción la creación de nómina falla al leer DeudaTrabajador porque el modelo Prisma espera las columnas opcionales plazoNominas y porcentajePorNomina, ausentes en PostgreSQL. La corrección **solo agrega dos columnas INTEGER NULL**, sin DEFAULT, y deja NULL como ausencia de plan de descuento. No se alteran datos ni la API o UI.

El SQL de la migración incluye precondiciones, ADD COLUMN IF NOT EXISTS y postcondiciones en una misma sentencia DO transaccional; falla ante tipos, nulabilidad o DEFAULT incompatibles, con espera de bloqueo limitada a tres segundos.

## Compatibilidad y precedentes

La migración es compatible con la versión anterior de la aplicación. Consumidores directos: API de Nómina, botón Pagar desde Cierre y API de Deudas. Consumidores indirectos para verificar: Caja/Gastos, Nómina, reportes y deuda del trabajador. Las decisiones #641, #644 y #833 siguen intactas. El trabajo de descuentos diarios #569 y la atomicidad del flujo completo (F1) **no forman parte de F0**.

El repositorio contiene dos inicializaciones históricas de Prisma. Según docs/deploy-migraciones.md, no se debe usar migrate deploy a ciegas. Tampoco se debe aplicar un db push indiscriminado que pueda incluir otras diferencias de esquema. El PR #985 de control de migraciones está aún abierto y no es una protección efectiva verificable.

## Liberación segura (NO EJECUTADA)

1. Obtener aprobación explícita para intervenir la base de producción, verificar respaldos y elegir ventana controlada. Preparar entorno PostgreSQL aislado para las pruebas.
2. Hacer preflight de solo lectura en la **misma base del despliegue afectado** y comprobar el estado de _prisma_migrations:

~~~sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'DeudaTrabajador'
  AND column_name IN ('plazoNominas', 'porcentajePorNomina')
ORDER BY column_name;
~~~

3. Probar la migración en PostgreSQL aislado; repetir con ninguna columna, una, ambas, definición errónea y lock concurrente. Reproducir lecturas Prisma antes/después con datos sintéticos.
4. Tras autorización y prueba satisfactoria, ejecutar **el archivo versionado exacto** de SQL con error-stop; ejemplo orientativo, no ejecutado:

~~~bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261123_deuda_trabajador_plan_pago_992/migration.sql
~~~

5. Postflight de solo lectura: exactamente dos filas de tipo integer, nulabilidad YES, sin DEFAULT; lectura real de Prisma sin fallo, verificaciones funcionales con datos sintéticos. Comprobar históricos intactos.
6. **Después** de aplicar/verificar, registrar la migración con checksum SHA-256 real en _prisma_migrations, siguiendo docs/deploy-migraciones.md. Comprobar si ya fue registrada antes de insertar o resolver. Nunca registrar aplicación ficticia.
7. QA de navegador en staging/preview: trabajador sintético, «Pagar», «Lo pagué otro día», recarga, un solo registro de Nómina, tratamiento correcto de Gasto, rol y «fuera de caja».
8. Solo fusionar con aprobación específica de merge y checks CI/review/QA superados. Una fusión podría desplegar a Vercel: **la migración debe estar aplicada y verificada primero**.

## Casos adversariales y aceptación (por ejecutar)

| Escenario | Resultado requerido |
| --- | --- |
| Faltan ambas columnas | Se agregan INTEGER NULL sin alterar registros |
| Solo existe una columna compatible | Se agrega la otra |
| Ambas ya son compatibles | Repetir sin mutaciones |
| Una existe como TEXT, NOT NULL o con DEFAULT | Fallar, sin conversiones implícitas |
| Hay una transacción reteniendo bloqueo | Salir por timeout, sin espera indefinida |
| Crear nómina sin deudas | Prisma lee el modelo sin error de columnas |
| Crear nómina con plan de deuda | Se mantienen descuentos existentes, sin introducir regla diaria |
| Fecha normal y fecha real retroactiva | Se preservan semántica, motivos y no duplicación |
| Nómina fuera de caja / otros métodos | No crear doble egreso ni deducir efectivo indebido |
| Cierre histórico ya guardado | No sobrescribir el snapshot |

**Reversión:** antes de confirmar el DO, errores revierten sus DDL. Después de aplicado, **no borrar columnas**: el código en producción depende de ellas. Si surge un problema, preparar corrección hacia adelante compatible con los lectores, no reescribir datos financieros.

## Evidencia y límites

- CONFIRMADO en lectura: faltan las dos columnas, coherente con el error Prisma en logs del 23 de noviembre de 2026.
- PREPARADO: migración SQL aditiva y este procedimiento.
- NO EJECUTADO: PostgreSQL de prueba, smoke funcional, suite, QA de navegador, aplicación en producción, merge.
- F1 PENDIENTE: transacción integral de creación y pago, idempotencia y validación de cobertura de períodos. No está resuelto por F0.

Referencias: issues #992, #569, #621, #641, #644, #833, #679, #703 y PR #985.
