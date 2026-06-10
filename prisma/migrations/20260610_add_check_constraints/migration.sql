-- FIX Fase 3 §1.1: CHECK constraints para integridad financiera.
--
-- Antes: los CHECKs estaban como comentarios en schema.prisma y NO
-- existían en la BD. Filas con saldo < 0, monto <= 0, etc. eran
-- aceptadas por Postgres.
--
-- Auditoría previa (2026-06-10): 0 violaciones en las 8 reglas.
-- Datos limpios → se pueden aplicar VALIDATE directamente.
--
-- Estrategia: NOT VALID primero (instantáneo, no escanea tabla)
-- + VALIDATE CONSTRAINT separado (escanea, toma SharedUpdateLock
-- pero no bloquea reads/writes nuevas). Si la tabla crece, NOT VALID
-- permite aplicar el constraint sin downtime.

-- ========== Pedido ==========
ALTER TABLE "Pedido"
  ADD CONSTRAINT chk_pedido_saldo_nonneg CHECK (saldo >= 0) NOT VALID,
  ADD CONSTRAINT chk_pedido_montopagado_le_total CHECK ("totalPagado" <= total) NOT VALID,
  ADD CONSTRAINT chk_pedido_saldo_calc CHECK (saldo = total - "totalPagado") NOT VALID,
  ADD CONSTRAINT chk_pedido_total_nonneg CHECK (total >= 0) NOT VALID;

-- VALIDATE en transacciones separadas. Cada una toma un lock短暂, no
-- bloquea reads/writes nuevas (las nuevas filas son validadas al COMMIT
-- de su propia tx contra la regla activa).
ALTER TABLE "Pedido" VALIDATE CONSTRAINT chk_pedido_saldo_nonneg;
ALTER TABLE "Pedido" VALIDATE CONSTRAINT chk_pedido_montopagado_le_total;
ALTER TABLE "Pedido" VALIDATE CONSTRAINT chk_pedido_saldo_calc;
ALTER TABLE "Pedido" VALIDATE CONSTRAINT chk_pedido_total_nonneg;

-- ========== Pago ==========
ALTER TABLE "Pago"
  ADD CONSTRAINT chk_pago_monto_pos CHECK (monto > 0) NOT VALID;

ALTER TABLE "Pago" VALIDATE CONSTRAINT chk_pago_monto_pos;

-- ========== Factura ==========
ALTER TABLE "Factura"
  ADD CONSTRAINT chk_factura_saldo_nonneg CHECK (saldo >= 0) NOT VALID,
  ADD CONSTRAINT chk_factura_montopagado_le_total CHECK ("montoPagado" <= total) NOT VALID,
  ADD CONSTRAINT chk_factura_total_nonneg CHECK (total >= 0) NOT VALID;

ALTER TABLE "Factura" VALIDATE CONSTRAINT chk_factura_saldo_nonneg;
ALTER TABLE "Factura" VALIDATE CONSTRAINT chk_factura_montopagado_le_total;
ALTER TABLE "Factura" VALIDATE CONSTRAINT chk_factura_total_nonneg;

-- ========== Abono ==========
ALTER TABLE "Abono"
  ADD CONSTRAINT chk_abono_monto_pos CHECK (monto > 0) NOT VALID;

ALTER TABLE "Abono" VALIDATE CONSTRAINT chk_abono_monto_pos;
