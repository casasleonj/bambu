-- G5.5 (docs/adr/ADR-PEDIDO-ESTADO-CANONICO-001.md §2, "condicional a una
-- decisión de rollout explícita" — rollout decidido 2026-09-05):
-- `estadoPago` deja de ser "una columna que cada writer actualiza a mano" y
-- pasa a ser una PROYECCIÓN forzada por Postgres de
-- `(total, totalPagado, estadoEntrega)`, igual que `chk_pedido_saldo_calc`.
--
-- Corrección respecto al SQL borrador del ADR (verificado contra el código
-- real antes de escribir el CHECK, no copiado ciegamente): la rama
-- ANTICIPADO del ADR solo listaba `estadoEntrega IN ('PENDIENTE','EN_RUTA')`,
-- pero `EstadoPagoVO.proyectar()` (la implementación real de G5.1, PR #154)
-- también incluye `NO_ENTREGADO` — decisión correcta y ya en producción: un
-- intento de entrega fallido significa que la entrega EN LOS HECHOS no
-- ocurrió, así que un pago total previo la sigue antecediendo. El CHECK debe
-- reflejar el código, no el borrador del ADR.
--
-- Bugs reales encontrados al auditar TODOS los writers de `estadoPago` antes
-- de congelar la regla (ninguno pasaba por `calcularEstadoPago`/
-- `EstadoPagoVO.proyectar`, así que ambos podían dejar filas que este CHECK
-- habría rechazado en producción):
--   1. `procesar-pedido.service.ts` (cierre de embarque, rama PARCIAL con
--      cobro de misión): llamaba `calcularEstadoPago(total, totalPagado)`
--      SIN el 3er argumento `estadoEntrega` → el default `'ENTREGADO'` del
--      helper hacía que un pedido pagado completo pero con entrega aún
--      PENDIENTE proyectara 'PAGADO' en vez de 'ANTICIPADO'. Corregido en el
--      mismo PR que esta migración.
--   2. `src/lib/import/commit.ts` (importación histórica CSV): ternario
--      manual sin rama PARCIAL — un pedido importado con pago parcial
--      quedaba 'PENDIENTE' en vez de 'PARCIAL'. Corregido en el mismo PR.
--   3. `prisma/seed-large.ts` (script de dev, sin uso en CI/prod): mismo bug
--      que (1) para datos sintéticos. Corregido en el mismo PR.
--
-- Backfill: en vez de limitarse a la sub-regla ANTICIPADO que proponía el
-- ADR, se recalculan TODAS las filas cuyo `estadoPago` divergiera de la
-- proyección — cubre tanto el caso ANTICIPADO original como las filas que
-- los bugs (1)/(2) puedan haber dejado mal etiquetadas antes de este PR. No
-- inventa historia: no toca `total`/`totalPagado`/`estadoEntrega`, solo
-- re-etiqueta la proyección derivada. `estadoPago = 'VENCIDO'` (override del
-- cron `vencimiento-promesas`) se excluye explícitamente, igual que en el
-- CHECK.
UPDATE "Pedido"
SET "estadoPago" = (CASE
    WHEN "estadoEntrega" IN ('CANCELADO', 'ANULADO') THEN 'ANULADO'
    WHEN "totalPagado" >= total AND "estadoEntrega" IN ('PENDIENTE', 'EN_RUTA', 'NO_ENTREGADO') THEN 'ANTICIPADO'
    WHEN "totalPagado" >= total THEN 'PAGADO'
    WHEN "totalPagado" > 0 THEN 'PARCIAL'
    ELSE 'PENDIENTE'
  END)::"EstadoPago"
WHERE "estadoPago" <> 'VENCIDO'
  AND "estadoPago" <> (CASE
    WHEN "estadoEntrega" IN ('CANCELADO', 'ANULADO') THEN 'ANULADO'
    WHEN "totalPagado" >= total AND "estadoEntrega" IN ('PENDIENTE', 'EN_RUTA', 'NO_ENTREGADO') THEN 'ANTICIPADO'
    WHEN "totalPagado" >= total THEN 'PAGADO'
    WHEN "totalPagado" > 0 THEN 'PARCIAL'
    ELSE 'PENDIENTE'
  END)::"EstadoPago";

-- NOT VALID primero (instantáneo, no escanea la tabla) — mismo patrón que
-- `20260610_add_check_constraints`. Idempotente: `IF NOT EXISTS` por si el
-- script se reaplica (dev usa `db push`, no `migrate deploy`; ver AGENTS.md
-- Known Issue #12).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pedido_estadopago_proyectado') THEN
    ALTER TABLE "Pedido" ADD CONSTRAINT chk_pedido_estadopago_proyectado CHECK (
      "estadoPago" = 'VENCIDO'
      OR "estadoPago" = (CASE
        WHEN "estadoEntrega" IN ('CANCELADO', 'ANULADO') THEN 'ANULADO'
        WHEN "totalPagado" >= total AND "estadoEntrega" IN ('PENDIENTE', 'EN_RUTA', 'NO_ENTREGADO') THEN 'ANTICIPADO'
        WHEN "totalPagado" >= total THEN 'PAGADO'
        WHEN "totalPagado" > 0 THEN 'PARCIAL'
        ELSE 'PENDIENTE'
      END)::"EstadoPago"
    ) NOT VALID;
  END IF;
END $$;

-- El backfill de arriba ya deja 0 filas divergentes, así que VALIDATE es
-- inmediato (solo escanea, no reescribe). Sin este paso el constraint queda
-- "NOT VALID" para siempre y Postgres no lo usa para el planner ni lo marca
-- como garantizado — ver `20260610_add_check_constraints` para el mismo
-- patrón de 2 pasos.
ALTER TABLE "Pedido" VALIDATE CONSTRAINT chk_pedido_estadopago_proyectado;
