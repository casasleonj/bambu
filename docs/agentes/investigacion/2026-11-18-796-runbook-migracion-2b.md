# #796 fase 2b · Runbook de la migración `20261118_correccion_pago_sin_abono`

**Estado:** preparado y ensayado en bases desechables. **NO aplicado en producción.** Requiere autorización explícita del PO para ese paso (`prisma/AGENTS.md`).
**Por qué va ANTES del merge:** el código nuevo lee `CorreccionAbono.pagoId` (Cierre en SQL, historial del cliente, integridad, factura). Sin la columna esas lecturas fallan. La migración es compatible con el código antiguo.

## Qué cambia en el esquema (aditivo)
1. `ADD COLUMN "pagoId" TEXT` (nullable) en `CorreccionAbono`, con índice y FK a `Pago` (`ON DELETE RESTRICT`).
2. `abonoId` pasa a nullable.
3. `CHECK chk_correccion_una_ancla`: exactamente una de las dos anclas.
No hay backfill ni se modifica ninguna fila. Las filas existentes cumplen el CHECK (`abonoId` lleno, `pagoId` nulo). No hay tabla nueva, así que no hay `GRANT` nuevo.

## Ensayo realizado (base desechable, esquema de `main` + migraciones previas + 1 corrección antigua)
- Migración aplicada **dos veces** sin error (idempotente); la fila antigua queda intacta.
- Acepta: ancla solo pago, ancla solo abono. Rechaza: ambas anclas, ninguna ancla, pago inexistente, monto 0, borrar un pago con corrección.
- Reversa: **rechazada** con correcciones ancladas a un pago (por diseño); **posible** sin ellas.

## Pasos de producción (cada uno requiere tu confirmación)
1. **Autorización explícita** de aplicar la migración.
2. Verificación previa, **solo lectura** (debe dar `abonoId` NOT NULL, sin `pagoId`):
   ```sql
   SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_name = 'CorreccionAbono' AND column_name IN ('abonoId','pagoId');
   SELECT count(*) FROM "CorreccionAbono";   -- hoy: 0 (verificado el 17-nov)
   ```
3. Aplicar `prisma/migrations/20261118_correccion_pago_sin_abono/migration.sql` (un solo archivo, transaccional por sentencia, idempotente).
4. Verificación posterior, **solo lectura**:
   ```sql
   SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_name = 'CorreccionAbono' AND column_name IN ('abonoId','pagoId');   -- ambas YES
   SELECT conname FROM pg_constraint WHERE conname IN ('chk_correccion_una_ancla','CorreccionAbono_pagoId_fkey');   -- 2 filas
   SELECT count(*) FROM "CorreccionAbono" WHERE "abonoId" IS NULL;   -- 0
   ```
5. **Recién entonces** el merge (aprobación de merge aparte). El código se despliega con `CORRECCION_PAGO_SIN_ABONO` apagada.
6. Tras el despliegue: verificar Cierre, Cartera, factura (pantalla e impresa) y Dashboard con el rol real.
7. Activar `CORRECCION_PAGO_SIN_ABONO` solo cuando el PO lo decida.

## Recuperación
- **Antes del merge:** reversa del esquema (SQL al final de la migración), segura mientras no existan filas con `abonoId` nulo.
- **Después del despliegue:** apagar la bandera detiene nuevas correcciones por pago; las ya creadas quedan legibles. **No** volver a un código anterior a este cambio si ya existen correcciones ancladas a un pago.
- No se pierde ni se modifica ningún dato existente: la migración no toca filas.

## Riesgos conocidos
- `getNextNumero` para `CorreccionAbono` usa el **máximo textual** de `numero`: números con formato distinto a `COR-NNNNN` (por ejemplo, datos manuales) producen duplicados. En producción hay 0 correcciones y todas las futuras usan el formato correcto.
- Una corrección por pago resta de la caja del **día del pago** (igual que la de un espejo), no del día de la corrección; los cierres guardados no se reescriben (señal #712).
