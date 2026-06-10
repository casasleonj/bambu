-- Fase 1 EXPAND: Crear tablas ContactoCliente y PlantillaProducto
-- Migración additive, no toca columnas legacy.

-- CreateTable
CREATE TABLE "ContactoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "relacion" TEXT,

    CONSTRAINT "ContactoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantillaProducto" (
    "id" TEXT NOT NULL,
    "plantillaId" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlantillaProducto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactoCliente_clienteId_idx" ON "ContactoCliente"("clienteId");

-- CreateIndex
CREATE INDEX "ContactoCliente_telefono_idx" ON "ContactoCliente"("telefono");

-- CreateIndex
CREATE UNIQUE INDEX "PlantillaProducto_plantillaId_producto_key" ON "PlantillaProducto"("plantillaId", "producto");

-- CreateIndex
CREATE INDEX "PlantillaProducto_plantillaId_idx" ON "PlantillaProducto"("plantillaId");

-- AddForeignKey
ALTER TABLE "ContactoCliente" ADD CONSTRAINT "ContactoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantillaProducto" ADD CONSTRAINT "PlantillaProducto_plantillaId_fkey" FOREIGN KEY ("plantillaId") REFERENCES "PlantillaRecurrente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
