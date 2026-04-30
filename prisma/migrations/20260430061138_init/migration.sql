-- CreateEnum
CREATE TYPE "EstadoPedido" AS ENUM ('PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'ASISTENTE', 'CONTADOR');

-- CreateEnum
CREATE TYPE "TipoPagoTrabajador" AS ENUM ('COMISION', 'FIJO', 'MIXTO');

-- CreateEnum
CREATE TYPE "EstadoNomina" AS ENUM ('PENDIENTE', 'PAGADA');

-- CreateEnum
CREATE TYPE "EstadoEmbarque" AS ENUM ('ABIERTO', 'CERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('EMITIDA', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('MANANA', 'TARDE', 'NOCHE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'ASISTENTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ruta" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "nombre" TEXT NOT NULL,
    "dias" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "repartidorId" TEXT,
    "repartidorRespaldoId" TEXT,
    "horarioInicio" TEXT,
    "horarioFin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ruta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT,
    "telefono" TEXT NOT NULL,
    "direccion" TEXT,
    "barrio" TEXT,
    "referencia" TEXT,
    "linkUbicacion" TEXT,
    "nombreNegocio" TEXT,
    "tipoNegocio" TEXT,
    "horaApertura" TEXT,
    "preciosEspeciales" TEXT,
    "rutaId" TEXT,
    "frecuencia" TEXT NOT NULL DEFAULT 'NINGUNA',
    "cadaNDias" INTEGER,
    "ultEntrega" TIMESTAMP(3),
    "proxEntrega" TIMESTAMP(3),
    "habAgua" BOOLEAN NOT NULL DEFAULT true,
    "habHielo" BOOLEAN NOT NULL DEFAULT true,
    "habBotellon" BOOLEAN NOT NULL DEFAULT true,
    "habBolsaAgua" BOOLEAN NOT NULL DEFAULT true,
    "habBolsaHielo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trabajador" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "tipoPago" "TipoPagoTrabajador" NOT NULL DEFAULT 'COMISION',
    "usaMoto" BOOLEAN NOT NULL DEFAULT false,
    "comPacaAgua" DECIMAL(10,2) NOT NULL DEFAULT 200,
    "comPacaHielo" DECIMAL(10,2) NOT NULL DEFAULT 200,
    "salarioFijo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deudaReposAgua" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deudaReposHielo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trabajador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nomina" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "trabajadorId" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "comEntregasAgua" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "comEntregasHielo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalComisiones" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "salario" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoNomina" NOT NULL DEFAULT 'PENDIENTE',
    "fechaPago" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "createdById" TEXT,
    "clienteId" TEXT NOT NULL,
    "embarqueId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'ENVIO',
    "estado" "EstadoPedido" NOT NULL DEFAULT 'PENDIENTE',
    "fechaEntrega" TIMESTAMP(3),
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" TEXT NOT NULL DEFAULT 'DOMICILIO',
    "cPacaAguaPed" INTEGER NOT NULL DEFAULT 0,
    "cPacaAguaEnt" INTEGER NOT NULL DEFAULT 0,
    "precioPacaAgua" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cPacaHieloPed" INTEGER NOT NULL DEFAULT 0,
    "cPacaHieloEnt" INTEGER NOT NULL DEFAULT 0,
    "precioPacaHielo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cBotellonFabPed" INTEGER NOT NULL DEFAULT 0,
    "cBotellonFabEnt" INTEGER NOT NULL DEFAULT 0,
    "precioBotellonFab" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cBotellonDomPed" INTEGER NOT NULL DEFAULT 0,
    "cBotellonDomEnt" INTEGER NOT NULL DEFAULT 0,
    "precioBotellonDom" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cBolsaAguaPed" INTEGER NOT NULL DEFAULT 0,
    "cBolsaAguaEnt" INTEGER NOT NULL DEFAULT 0,
    "precioBolsaAgua" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cBolsaHieloPed" INTEGER NOT NULL DEFAULT 0,
    "cBolsaHieloEnt" INTEGER NOT NULL DEFAULT 0,
    "precioBolsaHielo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalPagado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "repartidor" TEXT,
    "obs" TEXT,
    "idOrigen" TEXT,
    "esRecurrente" BOOLEAN NOT NULL DEFAULT false,
    "frecuencia" TEXT,
    "ultimaGeneracion" TIMESTAMP(3),
    "saltarFechas" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "metodo" "MetodoPago" NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Embarque" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "numero" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trabajadorId" TEXT NOT NULL,
    "rutaId" TEXT,
    "horaSalida" TIMESTAMP(3),
    "horaLlegada" TIMESTAMP(3),
    "estado" "EstadoEmbarque" NOT NULL DEFAULT 'ABIERTO',
    "pacasAgua" INTEGER NOT NULL DEFAULT 0,
    "pacasHielo" INTEGER NOT NULL DEFAULT 0,
    "devueltasAgua" INTEGER NOT NULL DEFAULT 0,
    "devueltasHielo" INTEGER NOT NULL DEFAULT 0,
    "rotasAgua" INTEGER NOT NULL DEFAULT 0,
    "rotasHielo" INTEGER NOT NULL DEFAULT 0,
    "obs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Embarque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'EMITIDA',
    "notaCredito" TEXT,
    "montoPagado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abono" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Abono_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produccion" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turno" "Turno" NOT NULL,
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
    "comSelladorAgua" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "comSelladorHielo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "comSellTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "obs" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoria" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "responsable" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insumo" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "stock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stockMin" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "precioUnit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "proveedorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraInsumo" (
    "id" TEXT NOT NULL,
    "createdById" TEXT,
    "numero" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "insumoId" TEXT NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "montoTotal" DECIMAL(10,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompraInsumo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "unidad" TEXT NOT NULL,
    "contenido" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioVolumen" (
    "id" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "cantMin" INTEGER NOT NULL DEFAULT 1,
    "cantMax" INTEGER,
    "precio" DECIMAL(10,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrecioVolumen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierreDia" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "numPedidos" INTEGER NOT NULL DEFAULT 0,
    "totalVentas" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "aguaVendida" INTEGER NOT NULL DEFAULT 0,
    "hieloVendido" INTEGER NOT NULL DEFAULT 0,
    "botellonVendido" INTEGER NOT NULL DEFAULT 0,
    "bolsaAguaVendida" INTEGER NOT NULL DEFAULT 0,
    "bolsaHieloVendida" INTEGER NOT NULL DEFAULT 0,
    "cobrado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fiado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "efectivo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "nequi" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "daviplata" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "transferencia" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bono" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "baseDia" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "comisiones" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "salarios" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "gastos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "stockIniAgua" INTEGER NOT NULL DEFAULT 0,
    "prodAgua" INTEGER NOT NULL DEFAULT 0,
    "stockFinAgua" INTEGER NOT NULL DEFAULT 0,
    "stockIniHielo" INTEGER NOT NULL DEFAULT 0,
    "prodHielo" INTEGER NOT NULL DEFAULT 0,
    "stockFinHielo" INTEGER NOT NULL DEFAULT 0,
    "netoCaja" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CierreDia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Historial" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "datos" TEXT NOT NULL,
    "usuarioId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioHistorial" (
    "id" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "precio" DECIMAL(10,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Ruta_createdById_idx" ON "Ruta"("createdById");

-- CreateIndex
CREATE INDEX "Ruta_repartidorId_idx" ON "Ruta"("repartidorId");

-- CreateIndex
CREATE INDEX "Ruta_repartidorRespaldoId_idx" ON "Ruta"("repartidorRespaldoId");

-- CreateIndex
CREATE INDEX "Cliente_rutaId_idx" ON "Cliente"("rutaId");

-- CreateIndex
CREATE INDEX "Cliente_createdById_idx" ON "Cliente"("createdById");

-- CreateIndex
CREATE INDEX "Trabajador_createdById_idx" ON "Trabajador"("createdById");

-- CreateIndex
CREATE INDEX "Nomina_createdById_idx" ON "Nomina"("createdById");

-- CreateIndex
CREATE INDEX "Pedido_clienteId_idx" ON "Pedido"("clienteId");

-- CreateIndex
CREATE INDEX "Pedido_fecha_idx" ON "Pedido"("fecha");

-- CreateIndex
CREATE INDEX "Pedido_estado_idx" ON "Pedido"("estado");

-- CreateIndex
CREATE INDEX "Pedido_createdById_idx" ON "Pedido"("createdById");

-- CreateIndex
CREATE INDEX "Pago_pedidoId_idx" ON "Pago"("pedidoId");

-- CreateIndex
CREATE INDEX "Embarque_createdById_idx" ON "Embarque"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_pedidoId_key" ON "Factura"("pedidoId");

-- CreateIndex
CREATE INDEX "Factura_pedidoId_idx" ON "Factura"("pedidoId");

-- CreateIndex
CREATE INDEX "Factura_clienteId_idx" ON "Factura"("clienteId");

-- CreateIndex
CREATE INDEX "Factura_estado_idx" ON "Factura"("estado");

-- CreateIndex
CREATE INDEX "Factura_createdById_idx" ON "Factura"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Abono_numero_key" ON "Abono"("numero");

-- CreateIndex
CREATE INDEX "Produccion_createdById_idx" ON "Produccion"("createdById");

-- CreateIndex
CREATE INDEX "Gasto_createdById_idx" ON "Gasto"("createdById");

-- CreateIndex
CREATE INDEX "Proveedor_createdById_idx" ON "Proveedor"("createdById");

-- CreateIndex
CREATE INDEX "Insumo_createdById_idx" ON "Insumo"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CompraInsumo_numero_key" ON "CompraInsumo"("numero");

-- CreateIndex
CREATE INDEX "CompraInsumo_createdById_idx" ON "CompraInsumo"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigo_key" ON "Producto"("codigo");

-- CreateIndex
CREATE INDEX "PrecioVolumen_productoId_idx" ON "PrecioVolumen"("productoId");

-- CreateIndex
CREATE INDEX "PrecioVolumen_canal_idx" ON "PrecioVolumen"("canal");

-- CreateIndex
CREATE UNIQUE INDEX "PrecioVolumen_productoId_canal_cantMin_key" ON "PrecioVolumen"("productoId", "canal", "cantMin");

-- CreateIndex
CREATE UNIQUE INDEX "Config_clave_key" ON "Config"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "CierreDia_fecha_key" ON "CierreDia"("fecha");

-- AddForeignKey
ALTER TABLE "Ruta" ADD CONSTRAINT "Ruta_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ruta" ADD CONSTRAINT "Ruta_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES "Trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ruta" ADD CONSTRAINT "Ruta_repartidorRespaldoId_fkey" FOREIGN KEY ("repartidorRespaldoId") REFERENCES "Trabajador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_rutaId_fkey" FOREIGN KEY ("rutaId") REFERENCES "Ruta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trabajador" ADD CONSTRAINT "Trabajador_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomina" ADD CONSTRAINT "Nomina_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_embarqueId_fkey" FOREIGN KEY ("embarqueId") REFERENCES "Embarque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_idOrigen_fkey" FOREIGN KEY ("idOrigen") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Embarque" ADD CONSTRAINT "Embarque_rutaId_fkey" FOREIGN KEY ("rutaId") REFERENCES "Ruta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abono" ADD CONSTRAINT "Abono_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produccion" ADD CONSTRAINT "Produccion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produccion" ADD CONSTRAINT "Produccion_trabajadorId_fkey" FOREIGN KEY ("trabajadorId") REFERENCES "Trabajador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insumo" ADD CONSTRAINT "Insumo_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraInsumo" ADD CONSTRAINT "CompraInsumo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraInsumo" ADD CONSTRAINT "CompraInsumo_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraInsumo" ADD CONSTRAINT "CompraInsumo_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "Insumo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioVolumen" ADD CONSTRAINT "PrecioVolumen_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
