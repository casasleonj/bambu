-- Hardening de 2 hallazgos WARN del Supabase Security Advisor (get_advisors).
-- Ninguno de los dos requiere cambio de codigo de la app.
--
-- 1) rls_auto_enable(): event trigger handler (ddl_command_end) que
--    auto-habilita RLS en tablas nuevas. Es SECURITY DEFINER pero su tipo
--    de retorno es `event_trigger`, asi que NO se puede invocar como RPC
--    normal (Postgres lo rechaza fuera del contexto real del trigger) --
--    el riesgo practico es bajo, pero tenia EXECUTE otorgado a PUBLIC/
--    anon/authenticated via la API REST autogenerada de Supabase
--    (superficie de ataque innecesaria, la app no usa esa API: conecta
--    directo a Postgres via Prisma). Revocar el EXECUTE no afecta al
--    event trigger en si (se invoca por el mecanismo interno de DDL, no
--    via permiso de EXECUTE de un rol).
--
-- 2) search_clientes(): SECURITY INVOKER (no DEFINER, riesgo menor que un
--    DEFINER con search_path mutable), pero el linter igual recomienda
--    fijar search_path explicito para evitar shadowing de funciones/
--    catalogos si algun rol tiene un search_path no estandar.
--
-- Idempotente: revoke sin conceder es no-op si ya estaba revocado; SET
-- search_path sobreescribe el valor anterior sin error.

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

ALTER FUNCTION public.search_clientes(text, integer) SET search_path = public, pg_catalog;
