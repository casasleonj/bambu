-- #499 — Comisión del repartidor pagada de la caja día a día.
--
--   - Tabla PagoComisionRepartidor: un registro por pago (trabajador, día de la
--     comisión, monto, quién pagó, offlineId único contra el doble toque).
--   - Nomina.comisionPagadaCaja: cuánto de la comisión del período ya salió de
--     la caja; el `total` de la nómina viene sin ella.
--
-- Solo agrega (tabla nueva + columna con DEFAULT 0): el código anterior sigue
-- funcionando con la base migrada. Idempotente: CI la aplica tras `prisma db push`
-- y producción la recibe aparte ANTES del merge (incidente #350). Nombres de
-- índices y FKs iguales a los de Prisma.

CREATE TABLE IF NOT EXISTS "PagoComisionRepartidor" (
  "id"           TEXT NOT NULL,
  "trabajadorId" TEXT NOT NULL,
  "fecha"        TIMESTAMPTZ NOT NULL,
  "monto"        DECIMAL(10,2) NOT NULL,
  "pagadoPorId"  TEXT,
  "offlineId"    TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagoComisionRepartidor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PagoComisionRepartidor_offlineId_key" ON "PagoComisionRepartidor"("offlineId");
CREATE INDEX IF NOT EXISTS "PagoComisionRepartidor_trabajadorId_fecha_idx" ON "PagoComisionRepartidor"("trabajadorId", "fecha");
CREATE INDEX IF NOT EXISTS "PagoComisionRepartidor_createdAt_idx" ON "PagoComisionRepartidor"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoComisionRepartidor_trabajadorId_fkey') THEN
    ALTER TABLE "PagoComisionRepartidor"
      ADD CONSTRAINT "PagoComisionRepartidor_trabajadorId_fkey"
      FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoComisionRepartidor_pagadoPorId_fkey') THEN
    ALTER TABLE "PagoComisionRepartidor"
      ADD CONSTRAINT "PagoComisionRepartidor_pagadoPorId_fkey"
      FOREIGN KEY ("pagadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Nomina" ADD COLUMN IF NOT EXISTS "comisionPagadaCaja" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Permisos para los roles de la app (en Supabase el rol de ejecución es postgres y no los necesita).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PagoComisionRepartidor" TO app_write';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    EXECUTE 'GRANT SELECT ON TABLE "PagoComisionRepartidor" TO app_read';
  END IF;
END $$;
