-- #1010 F2B.1. Diario de observación prospectivo, todavía sin consumidores de dinero.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Impedir que se pierda una edición durante la toma del baseline y alta de triggers.
LOCK TABLE public."Trabajador", public."Config" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public."ComisionTarifaVersion" (
  "id" BIGSERIAL PRIMARY KEY,
  "ambito" TEXT NOT NULL,
  "trabajadorId" TEXT REFERENCES public."Trabajador"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "fechaVigencia" DATE NOT NULL,
  "registradoAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "origen" TEXT NOT NULL,
  "rolDb" TEXT NOT NULL,
  "datos" JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS "ComisionTarifaVersion_consulta_idx" ON public."ComisionTarifaVersion" ("ambito","trabajadorId","fechaVigencia","id");
DO $sql$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."ComisionTarifaVersion"'::regclass AND conname='ComisionTarifaVersion_ambito_check') THEN
    ALTER TABLE public."ComisionTarifaVersion" ADD CONSTRAINT "ComisionTarifaVersion_ambito_check"
      CHECK (("ambito"='TRABAJADOR' AND "trabajadorId" IS NOT NULL) OR ("ambito"='COM_REPARTIDOR' AND "trabajadorId" IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public."ComisionTarifaVersion"'::regclass AND conname='ComisionTarifaVersion_origen_check') THEN
    ALTER TABLE public."ComisionTarifaVersion" ADD CONSTRAINT "ComisionTarifaVersion_origen_check" CHECK ("origen" IN ('BASELINE','ALTA','CAMBIO'));
  END IF;
END $sql$;

CREATE OR REPLACE FUNCTION public.datos_tarifa_trabajador_1010(t public."Trabajador") RETURNS JSONB
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $sql$
SELECT jsonb_build_object('version',1,'rol',t.rol,'tipoPago',t."tipoPago"::text,'usaMoto',t."usaMoto",
  'comPacaAgua',t."comPacaAgua"::text,'comPacaHielo',t."comPacaHielo"::text,'comBotellon',t."comBotellon"::text,
  'comRepartAgua',t."comRepartAgua"::text,'comRepartHielo',t."comRepartHielo"::text,'comRepartBotellon',t."comRepartBotellon"::text)
$sql$;

-- Un baseline de configuración observada NO certifica jornadas anteriores.
-- El día de instalación tampoco se afirma como jornada completa conocida.
-- Una sola referencia temporal para TODAS las filas del baseline; no puede
-- partir la instalación en dos fechas si atraviesa medianoche.
CREATE TEMP TABLE tarifa_1010_corte ON COMMIT DROP AS SELECT clock_timestamp() AS instante;
INSERT INTO public."ComisionTarifaVersion" ("ambito","trabajadorId","fechaVigencia","registradoAt","origen","rolDb","datos")
SELECT 'TRABAJADOR',t.id,(c.instante AT TIME ZONE 'America/Bogota')::date+1,c.instante,'BASELINE',current_user,public.datos_tarifa_trabajador_1010(t)
FROM public."Trabajador" t CROSS JOIN pg_temp.tarifa_1010_corte c WHERE NOT EXISTS (
  SELECT 1 FROM public."ComisionTarifaVersion" v WHERE v."ambito"='TRABAJADOR' AND v."trabajadorId"=t.id
);
INSERT INTO public."ComisionTarifaVersion" ("ambito","fechaVigencia","registradoAt","origen","rolDb","datos")
SELECT 'COM_REPARTIDOR',(c.instante AT TIME ZONE 'America/Bogota')::date+1,c.instante,'BASELINE',current_user,
  jsonb_build_object('version',1,'valor',(SELECT valor FROM public."Config" WHERE clave='COM_REPARTIDOR'))
FROM pg_temp.tarifa_1010_corte c WHERE NOT EXISTS (SELECT 1 FROM public."ComisionTarifaVersion" WHERE "ambito"='COM_REPARTIDOR');

CREATE OR REPLACE FUNCTION public.capturar_tarifa_trabajador_1010() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $sql$
DECLARE instante timestamptz; fecha date; datos jsonb; origen text;
BEGIN
  datos := public.datos_tarifa_trabajador_1010(NEW);
  IF TG_OP='UPDATE' THEN
    IF datos=public.datos_tarifa_trabajador_1010(OLD) THEN RETURN NEW; END IF;
    origen:='CAMBIO';
  ELSE origen:='ALTA'; END IF;
  instante:=clock_timestamp();
  fecha:=(instante AT TIME ZONE 'America/Bogota')::date;
  IF origen='CAMBIO' THEN fecha:=fecha+1; END IF;
  INSERT INTO public."ComisionTarifaVersion" ("ambito","trabajadorId","fechaVigencia","registradoAt","origen","rolDb","datos")
  VALUES ('TRABAJADOR',NEW.id,fecha,instante,origen,current_user,datos);
  RETURN NEW;
END $sql$;
DROP TRIGGER IF EXISTS trg_capturar_tarifa_trabajador_1010 ON public."Trabajador";
CREATE TRIGGER trg_capturar_tarifa_trabajador_1010 AFTER INSERT OR UPDATE ON public."Trabajador"
FOR EACH ROW EXECUTE FUNCTION public.capturar_tarifa_trabajador_1010();

CREATE OR REPLACE FUNCTION public.capturar_tarifa_config_1010() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $sql$
DECLARE anterior text; nuevo text; instante timestamptz;
BEGIN
  IF TG_OP <> 'INSERT' THEN IF OLD.clave='COM_REPARTIDOR' THEN anterior:=OLD.valor; END IF; END IF;
  IF TG_OP <> 'DELETE' THEN IF NEW.clave='COM_REPARTIDOR' THEN nuevo:=NEW.valor; END IF; END IF;
  IF anterior IS DISTINCT FROM nuevo THEN
    -- El índice único de Config serializa los cambios sobre la clave.
    instante:=clock_timestamp();
    INSERT INTO public."ComisionTarifaVersion" ("ambito","fechaVigencia","registradoAt","origen","rolDb","datos")
    VALUES ('COM_REPARTIDOR',(instante AT TIME ZONE 'America/Bogota')::date+1,instante,'CAMBIO',current_user,jsonb_build_object('version',1,'valor',nuevo));
  END IF;
  RETURN NULL;
END $sql$;
DROP TRIGGER IF EXISTS trg_capturar_tarifa_config_1010 ON public."Config";
CREATE TRIGGER trg_capturar_tarifa_config_1010 AFTER INSERT OR UPDATE OR DELETE ON public."Config"
FOR EACH ROW EXECUTE FUNCTION public.capturar_tarifa_config_1010();

CREATE OR REPLACE FUNCTION public.impedir_mutacion_tarifa_1010() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $sql$
BEGIN RAISE EXCEPTION 'Las versiones de tarifa se conservan; registrar una nueva versión'; END $sql$;
DROP TRIGGER IF EXISTS trg_tarifa_version_inmutable_1010 ON public."ComisionTarifaVersion";
CREATE TRIGGER trg_tarifa_version_inmutable_1010 BEFORE UPDATE OR DELETE ON public."ComisionTarifaVersion"
FOR EACH ROW EXECUTE FUNCTION public.impedir_mutacion_tarifa_1010();

ALTER TABLE public."ComisionTarifaVersion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ComisionTarifaVersion" FROM PUBLIC;
REVOKE ALL ON SEQUENCE public."ComisionTarifaVersion_id_seq" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.datos_tarifa_trabajador_1010(public."Trabajador"), public.capturar_tarifa_trabajador_1010(), public.capturar_tarifa_config_1010(), public.impedir_mutacion_tarifa_1010() FROM PUBLIC;
DO $sql$
DECLARE rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role','app_write','app_read'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=rol) THEN
      EXECUTE format('REVOKE ALL ON TABLE public."ComisionTarifaVersion" FROM %I',rol);
      EXECUTE format('REVOKE ALL ON SEQUENCE public."ComisionTarifaVersion_id_seq" FROM %I',rol);
      EXECUTE format('REVOKE ALL ON FUNCTION public.datos_tarifa_trabajador_1010(public."Trabajador"), public.capturar_tarifa_trabajador_1010(), public.capturar_tarifa_config_1010(), public.impedir_mutacion_tarifa_1010() FROM %I',rol);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_write') THEN
    GRANT SELECT,INSERT ON public."ComisionTarifaVersion" TO app_write;
    GRANT USAGE ON SEQUENCE public."ComisionTarifaVersion_id_seq" TO app_write;
    GRANT EXECUTE ON FUNCTION public.datos_tarifa_trabajador_1010(public."Trabajador") TO app_write;
    DROP POLICY IF EXISTS tarifa_lectura_backend ON public."ComisionTarifaVersion";
    CREATE POLICY tarifa_lectura_backend ON public."ComisionTarifaVersion" FOR SELECT TO app_write USING (true);
    DROP POLICY IF EXISTS tarifa_insercion_trigger ON public."ComisionTarifaVersion";
    CREATE POLICY tarifa_insercion_trigger ON public."ComisionTarifaVersion" FOR INSERT TO app_write WITH CHECK (pg_trigger_depth()>0);
  END IF;
END $sql$;
COMMIT;
