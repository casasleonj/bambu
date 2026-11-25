-- #1010 F2A: expansión aditiva. No backfill, no cambios a pagos previos.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "PagoComisionEvidencia" (
    "pagoId" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    CONSTRAINT "PagoComisionEvidencia_pkey" PRIMARY KEY ("pagoId"),
    CONSTRAINT "PagoComisionEvidencia_pagoId_fkey" FOREIGN KEY ("pagoId")
      REFERENCES "PagoComisionRepartidor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- El registro de evidencia no se edita al corregir fecha ni por actualización ordinaria.
CREATE OR REPLACE FUNCTION public.impedir_mutacion_evidencia_comision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La evidencia registrada de comisión no se modifica ni elimina';
END;
$$;
DROP TRIGGER IF EXISTS trg_evidencia_comision_inmutable ON "PagoComisionEvidencia";
CREATE TRIGGER trg_evidencia_comision_inmutable
BEFORE UPDATE OR DELETE ON "PagoComisionEvidencia"
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacion_evidencia_comision();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    GRANT SELECT, INSERT ON TABLE "PagoComisionEvidencia" TO app_write;
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "PagoComisionEvidencia" FROM app_write;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    GRANT SELECT ON TABLE "PagoComisionEvidencia" TO app_read;
  END IF;
END $$;
COMMIT;
