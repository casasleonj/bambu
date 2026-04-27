-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'ASISTENTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Cliente" (
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
    "zona" TEXT,
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

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "precioMin" REAL NOT NULL,
    "precioMax" REAL NOT NULL,
    "comXUnidad" REAL NOT NULL DEFAULT 0,
    "tipo" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "clienteId" TEXT,
    "embarqueId" TEXT,
    "nombreCli" TEXT NOT NULL,
    "telefonoCli" TEXT,
    "zonaCli" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'ENVIO',
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "cAguaPed" INTEGER NOT NULL DEFAULT 0,
    "cAguaEnt" INTEGER NOT NULL DEFAULT 0,
    "precioAgua" REAL NOT NULL DEFAULT 0,
    "cHieloPed" INTEGER NOT NULL DEFAULT 0,
    "cHieloEnt" INTEGER NOT NULL DEFAULT 0,
    "precioHielo" REAL NOT NULL DEFAULT 0,
    "cBotellonPed" INTEGER NOT NULL DEFAULT 0,
    "cBotellonEnt" INTEGER NOT NULL DEFAULT 0,
    "precioBotellon" REAL NOT NULL DEFAULT 0,
    "cBolsaAguaPed" INTEGER NOT NULL DEFAULT 0,
    "cBolsaAguaEnt" INTEGER NOT NULL DEFAULT 0,
    "precioBolsaAgua" REAL NOT NULL DEFAULT 0,
    "cBolsaHieloPed" INTEGER NOT NULL DEFAULT 0,
    "cBolsaHieloEnt" INTEGER NOT NULL DEFAULT 0,
    "precioBolsaHielo" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "metodo1" TEXT,
    "monto1" REAL NOT NULL DEFAULT 0,
    "metodo2" TEXT,
    "monto2" REAL NOT NULL DEFAULT 0,
    "metodo3" TEXT,
    "monto3" REAL NOT NULL DEFAULT 0,
    "totalPagado" REAL NOT NULL DEFAULT 0,
    "saldo" REAL NOT NULL DEFAULT 0,
    "repartidor" TEXT,
    "obs" TEXT,
    "fechaEntrega" DATETIME,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idOrigen" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pedido_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Pedido_idOrigen_fkey" FOREIGN KEY ("idOrigen") REFERENCES "Pedido" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Embarque" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" INTEGER NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trabajadorId" TEXT NOT NULL,
    "horaSalida" DATETIME,
    "horaLlegada" DATETIME,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "pacasAgua" INTEGER NOT NULL DEFAULT 0,
    "pacasHielo" INTEGER NOT NULL DEFAULT 0,
    "devueltasAgua" INTEGER NOT NULL DEFAULT 0,
    "devueltasHielo" INTEGER NOT NULL DEFAULT 0,
    "rotasAgua" INTEGER NOT NULL DEFAULT 0,
    "rotasHielo" INTEGER NOT NULL DEFAULT 0,
    "obs" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Embarque_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT,
    "pedidoId" TEXT NOT NULL,
    "nombreCli" TEXT NOT NULL,
    "telefonoCli" TEXT,
    "zonaCli" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" REAL NOT NULL,
    "total" REAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'EMITIDA',
    "notaCredito" TEXT,
    "montoPagado" REAL NOT NULL DEFAULT 0,
    "saldo" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Factura_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Abono" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "monto" REAL NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Abono_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Abono_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Produccion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turno" TEXT NOT NULL,
    "trabajadorId" TEXT NOT NULL,
    "stockIniAgua" INTEGER NOT NULL DEFAULT 0,
    "stockIniHielo" INTEGER NOT NULL DEFAULT 0,
    "conteoAAgua" INTEGER NOT NULL DEFAULT 0,
    "conteoBAgua" INTEGER NOT NULL DEFAULT 0,
    "conteoAHielo" INTEGER NOT NULL DEFAULT 0,
    "conteoBHielo" INTEGER NOT NULL DEFAULT 0,
    "prodAgua" INTEGER NOT NULL DEFAULT 0,
    "prodHielo" INTEGER NOT NULL DEFAULT 0,
    "ventasAgua" INTEGER NOT NULL DEFAULT 0,
    "ventasHielo" INTEGER NOT NULL DEFAULT 0,
    "stockFinAgua" INTEGER NOT NULL DEFAULT 0,
    "stockFinHielo" INTEGER NOT NULL DEFAULT 0,
    "comSelladorAgua" REAL NOT NULL DEFAULT 0,
    "comSelladorHielo" REAL NOT NULL DEFAULT 0,
    "comSellTotal" REAL NOT NULL DEFAULT 0,
    "obs" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Produccion_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" REAL NOT NULL,
    "responsable" TEXT,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Trabajador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trabajadorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "tipoPago" TEXT NOT NULL DEFAULT 'COMISION',
    "usaMoto" BOOLEAN NOT NULL DEFAULT false,
    "comPacaAgua" REAL NOT NULL DEFAULT 200,
    "comPacaHielo" REAL NOT NULL DEFAULT 200,
    "salarioFijo" REAL NOT NULL DEFAULT 0,
    "deudaReposAgua" REAL NOT NULL DEFAULT 0,
    "deudaReposHielo" REAL NOT NULL DEFAULT 0,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Nomina" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trabajadorId" TEXT NOT NULL,
    "fechaInicio" DATETIME NOT NULL,
    "fechaFin" DATETIME NOT NULL,
    "comEntregasAgua" REAL NOT NULL DEFAULT 0,
    "comEntregasHielo" REAL NOT NULL DEFAULT 0,
    "totalComisiones" REAL NOT NULL DEFAULT 0,
    "salario" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "fechaPago" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Nomina_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Insumo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "stock" REAL NOT NULL DEFAULT 0,
    "stockMin" REAL NOT NULL DEFAULT 0,
    "precioUnit" REAL NOT NULL DEFAULT 0,
    "proveedorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Insumo_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompraInsumo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" REAL NOT NULL,
    "montoTotal" REAL NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompraInsumo_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompraInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CierreDia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fecha" DATETIME NOT NULL,
    "numPedidos" INTEGER NOT NULL DEFAULT 0,
    "totalVentas" REAL NOT NULL DEFAULT 0,
    "aguaVendida" INTEGER NOT NULL DEFAULT 0,
    "hieloVendido" INTEGER NOT NULL DEFAULT 0,
    "botellonVendido" INTEGER NOT NULL DEFAULT 0,
    "bolsaAguaVendida" INTEGER NOT NULL DEFAULT 0,
    "bolsaHieloVendida" INTEGER NOT NULL DEFAULT 0,
    "cobrado" REAL NOT NULL DEFAULT 0,
    "fiado" REAL NOT NULL DEFAULT 0,
    "efectivo" REAL NOT NULL DEFAULT 0,
    "nequi" REAL NOT NULL DEFAULT 0,
    "daviplata" REAL NOT NULL DEFAULT 0,
    "transferencia" REAL NOT NULL DEFAULT 0,
    "baseDia" REAL NOT NULL DEFAULT 0,
    "comisiones" REAL NOT NULL DEFAULT 0,
    "salarios" REAL NOT NULL DEFAULT 0,
    "gastos" REAL NOT NULL DEFAULT 0,
    "stockIniAgua" INTEGER NOT NULL DEFAULT 0,
    "prodAgua" INTEGER NOT NULL DEFAULT 0,
    "stockFinAgua" INTEGER NOT NULL DEFAULT 0,
    "stockIniHielo" INTEGER NOT NULL DEFAULT 0,
    "prodHielo" INTEGER NOT NULL DEFAULT 0,
    "stockFinHielo" INTEGER NOT NULL DEFAULT 0,
    "netoCaja" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Historial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidad" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "datos" TEXT NOT NULL,
    "usuarioId" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_clienteId_key" ON "Cliente"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_productoId_key" ON "Producto"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_pedidoId_key" ON "Factura"("pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "Abono_numero_key" ON "Abono"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Trabajador_trabajadorId_key" ON "Trabajador"("trabajadorId");

-- CreateIndex
CREATE UNIQUE INDEX "CompraInsumo_numero_key" ON "CompraInsumo"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Config_clave_key" ON "Config"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "CierreDia_fecha_key" ON "CierreDia"("fecha");
