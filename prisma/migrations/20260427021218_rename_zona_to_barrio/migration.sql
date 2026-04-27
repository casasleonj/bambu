/*
  Warnings:

  - You are about to drop the column `zona` on the `Cliente` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT,
    "telefono" TEXT NOT NULL,
    "nombreNegocio" TEXT,
    "tipoNegocio" TEXT,
    "horaApertura" TEXT,
    "direccion" TEXT,
    "linkUbicacion" TEXT,
    "barrio" TEXT,
    "referencia" TEXT,
    "precioAguaPref" REAL,
    "frecuencia" TEXT NOT NULL DEFAULT 'NINGUNA',
    "cadaNDias" INTEGER,
    "ultEntrega" DATETIME,
    "proxEntrega" DATETIME,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "habAgua" BOOLEAN NOT NULL DEFAULT true,
    "habHielo" BOOLEAN NOT NULL DEFAULT true,
    "habBotellon" BOOLEAN NOT NULL DEFAULT true,
    "habBolsaAgua" BOOLEAN NOT NULL DEFAULT true,
    "habBolsaHielo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Cliente" ("activo", "apellido", "cadaNDias", "clienteId", "createdAt", "direccion", "frecuencia", "habAgua", "habBolsaAgua", "habBolsaHielo", "habBotellon", "habHielo", "horaApertura", "id", "linkUbicacion", "nombre", "nombreNegocio", "notas", "precioAguaPref", "proxEntrega", "referencia", "telefono", "tipoNegocio", "ultEntrega", "updatedAt") SELECT "activo", "apellido", "cadaNDias", "clienteId", "createdAt", "direccion", "frecuencia", "habAgua", "habBolsaAgua", "habBolsaHielo", "habBotellon", "habHielo", "horaApertura", "id", "linkUbicacion", "nombre", "nombreNegocio", "notas", "precioAguaPref", "proxEntrega", "referencia", "telefono", "tipoNegocio", "ultEntrega", "updatedAt" FROM "Cliente";
DROP TABLE "Cliente";
ALTER TABLE "new_Cliente" RENAME TO "Cliente";
CREATE UNIQUE INDEX "Cliente_clienteId_key" ON "Cliente"("clienteId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
