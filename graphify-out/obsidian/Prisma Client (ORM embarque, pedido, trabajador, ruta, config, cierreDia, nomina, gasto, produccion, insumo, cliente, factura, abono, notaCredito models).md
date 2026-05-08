---
source_file: "src/lib/prisma.ts"
type: "code"
community: "Community 11"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Community_11
---

# Prisma Client (ORM: embarque, pedido, trabajador, ruta, config, cierreDia, nomina, gasto, produccion, insumo, cliente, factura, abono, notaCredito models)

## Connections
- [[CierreDia API (GET daily summary, POST day-closing with advisory lock)]] - `calls` [EXTRACTED]
- [[CierreDia Last API (GET most recent day-closing record)]] - `calls` [EXTRACTED]
- [[Config API (GET by clavekeys, POST upsert, ADMIN-only)]] - `calls` [EXTRACTED]
- [[DashboardPage (server component direct Prisma queries, daily stats, stock, cash summary)]] - `calls` [EXTRACTED]
- [[Embarque Auto-Generate API (POST groups pending pedidos by ruta, creates embarques)]] - `calls` [EXTRACTED]
- [[Embarque Detail API (GETPUTDELETE single embarque with pedido management)]] - `calls` [EXTRACTED]
- [[Embarques ListCreate API (GET with date filters + capacity calc, POST with weight validation)]] - `calls` [EXTRACTED]
- [[FacturasPage (client invoice listing, abono registration)]] - `calls` [INFERRED]
- [[GastosPage (client expense CRUD with categories)]] - `calls` [INFERRED]
- [[Nomina API (GET list, POST auto-calculation from embarquespedidos or manual)]] - `calls` [EXTRACTED]
- [[PostgreSQL Advisory Locks]] - `calls` [EXTRACTED]
- [[Realistic Seed Script (Colombian Data)]] - `calls` [EXTRACTED]
- [[TrabajadoresClient (client worker CRUD, moto capacity, pay config)]] - `calls` [INFERRED]

#graphify/code #graphify/EXTRACTED #community/Community_11