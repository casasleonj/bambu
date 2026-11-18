-- #836 F2 — Horario de atención semanal por negocio (tramos por día, con turnos partidos).
-- ADITIVA e IDEMPOTENTE: solo crea una tabla nueva; el código anterior no la conoce ni la necesita, así que se puede
-- aplicar en producción ANTES del despliegue. No toca ningún dato existente (`Negocio.horaApertura` queda intacto).

CREATE TABLE IF NOT EXISTS "NegocioHorario" (
  "id"        TEXT NOT NULL,
  "negocioId" TEXT NOT NULL,
  "diaSemana" INTEGER NOT NULL,
  "desde"     TEXT NOT NULL,
  "hasta"     TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NegocioHorario_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NegocioHorario_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "NegocioHorario_negocioId_idx" ON "NegocioHorario"("negocioId");
CREATE INDEX IF NOT EXISTS "NegocioHorario_negocioId_diaSemana_idx" ON "NegocioHorario"("negocioId", "diaSemana");

-- Integridad del dato (HH:MM válidas, día 0–6, tramo con inicio antes del final). Idempotente.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_negocio_horario_valido') THEN
    ALTER TABLE "NegocioHorario" ADD CONSTRAINT chk_negocio_horario_valido CHECK (
      "diaSemana" BETWEEN 0 AND 6
      AND "desde" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "hasta" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND "desde" < "hasta"
    );
  END IF;
END $$;

-- Accesos de los roles de la aplicación, solo si existen (en Supabase el dueño es `postgres` y no se requieren). Idempotente.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "NegocioHorario" TO app_write;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    GRANT SELECT ON "NegocioHorario" TO app_read;
  END IF;
END $$;
