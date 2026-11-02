-- #577 / ADR-SALDO-FAVOR-EXCEDENTE-001 (decisión 6 revisada) — anular o cancelar un pedido revierte
-- el saldo a favor que salió de él.
--
-- Solo agrega un valor al enum de movimientos: el código anterior sigue funcionando con la base
-- migrada (nunca escribe ni lee ese valor). Idempotente. Producción la recibe aparte ANTES del
-- merge (AGENTS.md, paso 7).

ALTER TYPE "PedidoSaldoFavorMovimientoTipo" ADD VALUE IF NOT EXISTS 'REVERSION_ANULACION';
