-- AddUniqueConstraint on [clienteId, telefono] for upsert dedup
CREATE UNIQUE INDEX "ContactoCliente_clienteId_telefono_key" ON "ContactoCliente"("clienteId", "telefono");
