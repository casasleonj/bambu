-- #656 (fase fiado por entrega parcial): tabla aditiva e idempotente. No renombra ni borra nada.
-- Permisos: NO incluye GRANT para app_write; cambiar permisos requiere autorización del PO.

CREATE TABLE IF NOT EXISTS "EntregaExigible" (
    "id"             TEXT PRIMARY KEY,
    "pedidoId"       TEXT NOT NULL,
    "entregadoAt"    TIMESTAMP(3) NOT NULL,
    "valorEntregado" DECIMAL(10,2) NOT NULL,
    "asignado"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntregaExigible_pedidoId_fkey" FOREIGN KEY ("pedidoId")
        REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- La aplicación usa Prisma desde el servidor, no la API pública de Supabase.
ALTER TABLE "EntregaExigible" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "EntregaExigible" FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE "EntregaExigible" FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE "EntregaExigible" FROM authenticated;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EntregaExigible_pedidoId_idx" ON "EntregaExigible"("pedidoId");
CREATE INDEX IF NOT EXISTS "EntregaExigible_entregadoAt_idx" ON "EntregaExigible"("entregadoAt");

DO $$
BEGIN
    ALTER TABLE "EntregaExigible"
        ADD CONSTRAINT "chk_entrega_exigible_asignado"
        CHECK ("asignado" >= 0 AND "asignado" <= "valorEntregado" AND "valorEntregado" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
