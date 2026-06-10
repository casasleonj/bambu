-- Grant permissions to app_write (runtime user) for new tables.
-- Las tablas fueron creadas por el usuario `bambu` (migration user).
-- En Supabase prod los GRANTs los hace el dashboard, pero local hay que hacerlos manual.

GRANT ALL PRIVILEGES ON TABLE "ContactoCliente" TO app_write;
GRANT ALL PRIVILEGES ON TABLE "PlantillaProducto" TO app_write;
