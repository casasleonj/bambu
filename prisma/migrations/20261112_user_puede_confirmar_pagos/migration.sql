-- #406 — Permiso por usuario para confirmar pagos digitales ("Puede confirmar pagos" en Usuarios).
-- ADITIVA e IDEMPOTENTE: solo agrega una columna con DEFAULT false; el código anterior no la conoce, así que
-- se puede aplicar en producción ANTES del despliegue. No cambia quién confirma hoy (nadie la tiene marcada).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "puedeConfirmarPagos" BOOLEAN NOT NULL DEFAULT false;
