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

-- La evidencia es interna del backend Prisma, no un recurso de la Data API.
-- Supabase puede otorgar permisos por defecto a anon/authenticated/service_role.
-- RLS sin políticas reproduce el patrón actual de PagoComisionRepartidor:
-- el dueño autorizado del servidor puede operar; no hay acceso directo de clientes.
ALTER TABLE "PagoComisionEvidencia" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "PagoComisionEvidencia" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.impedir_mutacion_evidencia_comision() FROM PUBLIC;

DO $$
DECLARE rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE "PagoComisionEvidencia" FROM %I', rol);
      EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.impedir_mutacion_evidencia_comision() FROM %I', rol);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_write') THEN
    REVOKE ALL PRIVILEGES ON TABLE "PagoComisionEvidencia" FROM app_write;
    GRANT SELECT, INSERT ON TABLE "PagoComisionEvidencia" TO app_write;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_read') THEN
    REVOKE ALL PRIVILEGES ON TABLE "PagoComisionEvidencia" FROM app_read;
    GRANT SELECT ON TABLE "PagoComisionEvidencia" TO app_read;
  END IF;
END $$;
COMMIT;
