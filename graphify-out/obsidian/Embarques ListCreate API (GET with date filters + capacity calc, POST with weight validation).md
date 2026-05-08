---
source_file: "src/app/api/embarques/route.ts"
type: "code"
community: "Community 11"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Community_11
---

# Embarques List/Create API (GET with date filters + capacity calc, POST with weight validation)

## Connections
- [[CerrarEmbarquePage (client route closing with cuadre, payments, returns, free sales)]] - `calls` [EXTRACTED]
- [[Embarque Auto-Generate API (POST groups pending pedidos by ruta, creates embarques)]] - `conceptually_related_to` [INFERRED]
- [[EmbarquesPage (client CRUD embarques, pedido assignment, capacity calculation)]] - `calls` [EXTRACTED]
- [[Nomina API (GET list, POST auto-calculation from embarquespedidos or manual)]] - `shares_data_with` [INFERRED]
- [[PedidosPage (client CRUD pedidos, URL-based filters, auto-refresh, embarque assignment)]] - `calls` [EXTRACTED]
- [[Prisma Client (ORM embarque, pedido, trabajador, ruta, config, cierreDia, nomina, gasto, produccion, insumo, cliente, factura, abono, notaCredito models)]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Community_11