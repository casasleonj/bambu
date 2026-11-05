-- #645 — Turno «Jornada completa» para el sellador que cubre todo el día.
--
-- Solo agrega un valor al enum Turno: el código anterior sigue funcionando con la base migrada (nunca lo usa).
-- Idempotente: producción la recibe aparte ANTES del merge (incidente #350).

ALTER TYPE "Turno" ADD VALUE IF NOT EXISTS 'JORNADA';
