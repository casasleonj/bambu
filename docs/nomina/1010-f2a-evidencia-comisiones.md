# #1010 F2A — Evidencia al registrar un pago diario de comisión

## Alcance autorizado

Preservar el cálculo que utilizó el servidor al registrar un pago nuevo, no cambiar la regla de cálculo ni la fecha de vigencia de tarifas. F2B, UI, reconstrucción de legado y liquidaciones de nómina del período quedan fuera.

## Contrato

- `PagoComisionRepartidor` continúa siendo el único movimiento de pago. `PagoComisionEvidencia` contiene evidencia 1:1 con PK/FK pagoId; no constituye otro gasto ni otro pago.
- La tabla separada evita que las lecturas calientes de Caja/Nómina descarguen JSON de todas las jornadas. La lista F1 no cambia. El detalle devuelve `evidenciasAlRegistrar` por id de pago.
- Versión 1: fecha de trabajo, fecha de desembolso declarada originalmente (no hora física), instante del registro, trabajador, concepto en el detalle, cantidades, fuentes identificadas, tarifas del motor de reparto en centavos, importes de producción y cociente implícito solo si es exacto, total causado según la fórmula actual, pagado antes y desembolso. No duplicar nombres ni datos privados de clientes.
- Dos pagos de una jornada pueden contener dos cortes acumulados distintos. Nunca sumar las cantidades de los cortes ni imputar un importe a unidades específicas sin evidencia.
- Guardar dentro de la misma transacción Serializable; si falla, revierte el pago. Reintento reconocido devuelve el pago anterior sin reconstruir evidencia. Corrección del día efectivo no altera el documento original.
- Datos anteriores sin evidencia: NO_VERIFICADA. Versiones inválidas/desconocidas: NO_INTERPRETABLE. Desglose no conciliado: REGISTRADA_CON_DIFERENCIAS. REGISTRADA significa cálculo capturado y consistente, no tarifa contractual al trabajar ni certificación de cuándo se entregó dinero. No se cambia el importe por diferencias de evidencia.
- F2B resolverá la vigencia temporal de tarifas antes de modificar cálculos. La tarifa implícita de producción no sustituye una tarifa contractual explícita.

## Despliegue (bloqueante antes de merge)

La migración es aditiva: crea tabla nueva y FK, sin reescritura ni backfill. Trigger rechaza UPDATE/DELETE ordinarios; permisos explícitos condicionales para app_write/app_read. El propietario/DDL y TRUNCATE autorizado de pruebas siguen fuera de la inmutabilidad ordinaria. El script general db-grant tiene permisos amplios para desarrollo; no debe ejecutarse en producción como sustituto de la revisión de GRANT. Verificar roles efectivos y ausencia de permisos heredados de modificación/truncado.

1. Ejecutar CI completo con base sintética y verificar migración SQL real en copia aislada (db push no ejecuta el trigger ni los GRANT). Probar creación, FK, unicidad, UPDATE/DELETE rechazados y compatibilidad de aplicación previa.
2. Verificar estado y permisos de base objetivo de solo lectura, plan de recuperación y compatibilidad con versión anterior. No ejecutar DDL de producción sin aprobación explícita.
3. Aplicar expansión aprobada y verificar tabla, FK, trigger y permisos **antes de desplegar código escritor**. El workflow migrate-deploy se dispara por push a main y Vercel puede desplegar en paralelo; no depender de ese orden implícito. Coordinar expansión y promoción para que no haya ventana en que falte la tabla. No silenciar errores de captura para permitir pagos sin evidencia.
4. Validar CI/QA financiero del SHA y autorización de merge. Si debe revertirse el código, dejar la tabla y evidencia ya escrita intactas; no hacer DROP ni reconstruir el pasado.

## Preflight productivo de solo lectura (25 nov 2026)

- Proyecto Supabase activo: existe PagoComisionRepartidor, no existe PagoComisionEvidencia; historial Prisma disponible. No se ejecutó DDL.
- PagoComisionRepartidor y PagoComisionFechaCorreccion: propietario postgres, RLS activado, sin políticas. postgres tiene BYPASSRLS; app_write existe sin login ni BYPASSRLS; app_read no existe. La única membresía observada de app_write es postgres.
- Los ACL por defecto de postgres/supabase_admin conceden privilegios a anon, authenticated y service_role. Por eso la migración incorpora ENABLE ROW LEVEL SECURITY sin políticas de acceso público y REVOKE ALL explícito sobre tabla y función de trigger para PUBLIC y los roles Data API existentes. app_write conserva solo SELECT/INSERT a nivel GRANT, sujeto a RLS; app_read (si existe) solo SELECT, también sujeto a RLS. No habilitar una política permisiva para resolver un error de acceso.
- La lectura mediante el conector se realizó como postgres; aún no acredita por sí sola la identidad de la conexión de Vercel. Verificar la identidad efectiva del backend antes de expandir y confirmar acceso servidor y denegación efectiva de roles públicos después de expansión, sin escribir datos de negocio.
- Mantener el orden: CI del nuevo SHA verde → aprobación explícita de DDL → expansión SQL exacta en producción → verificar catálogos, privilegios, trigger y compatibilidad → merge autorizado → comprobar migrate deploy/Prisma y Vercel. La expansión debe poder reaplicarse por Prisma sin duplicar objetos. El rollback de código conserva la evidencia.

## Validación

Pruebas nuevas: evidencia versionada, diferencias, tarifa implícita, reparto con tarifa posterior diferente, reintento, producción con pagos sucesivos, lectura de legado. Deben pasar pruebas existentes de pago, concurrencia, cierre, nómina, fechas efectivas y UI. Pendientes específicos: rollback ante fallo de persistencia, corrección por endpoint real con evidencia, migración SQL/GRANT reales, QA navegador independiente. CI y despliegue aún no certificados. No autoriza migración real, modificación de fórmula ni merge.
