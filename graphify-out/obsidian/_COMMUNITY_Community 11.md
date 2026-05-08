---
type: community
cohesion: 0.13
members: 24
---

# Community 11

**Cohesion:** 0.13 - loosely connected
**Members:** 24 nodes

## Members
- [[AGENTS.md - Project Architecture & Guidelines]] - document - AGENTS.md
- [[CerrarEmbarquePage (client route closing with cuadre, payments, returns, free sales)]] - code - src/app/(app)/embarques/[id]/cerrar/page.tsx
- [[CierreDia API (GET daily summary, POST day-closing with advisory lock)]] - code - src/app/api/cierre/route.ts
- [[CierreDia Last API (GET most recent day-closing record)]] - code - src/app/api/cierre/last/route.ts
- [[Config API (GET by clavekeys, POST upsert, ADMIN-only)]] - code - src/app/api/config/route.ts
- [[DashboardPage (server component direct Prisma queries, daily stats, stock, cash summary)]] - code - src/app/(app)/dashboard/page.tsx
- [[Date Range Filter Component]] - code - src/components/date-range-filter.tsx
- [[Embarque Auto-Generate API (POST groups pending pedidos by ruta, creates embarques)]] - code - src/app/api/embarques/auto/route.ts
- [[Embarque Capacity Calculator_1]] - code - src/lib/embarque-capacidad.ts
- [[Embarque Detail API (GETPUTDELETE single embarque with pedido management)]] - code - src/app/api/embarques/[id]/route.ts
- [[Embarques ListCreate API (GET with date filters + capacity calc, POST with weight validation)]] - code - src/app/api/embarques/route.ts
- [[EmbarquesPage (client CRUD embarques, pedido assignment, capacity calculation)]] - code - src/app/(app)/embarques/page.tsx
- [[FacturasPage (client invoice listing, abono registration)]] - code - src/app/(app)/facturas/page.tsx
- [[GastosPage (client expense CRUD with categories)]] - code - src/app/(app)/gastos/page.tsx
- [[Nomina API (GET list, POST auto-calculation from embarquespedidos or manual)]] - code - src/app/api/nomina/route.ts
- [[PedidosPage (client CRUD pedidos, URL-based filters, auto-refresh, embarque assignment)]] - code - src/app/(app)/pedidos/page.tsx
- [[PostgreSQL Advisory Locks]] - code - src/lib/locks.ts
- [[Prisma Client (ORM embarque, pedido, trabajador, ruta, config, cierreDia, nomina, gasto, produccion, insumo, cliente, factura, abono, notaCredito models)]] - code - src/lib/prisma.ts
- [[Rate Limiter Service]] - code - src/lib/rate-limit.ts
- [[Realistic Seed Script (Colombian Data)]] - code - prisma/seed-realista.ts
- [[Service Worker Register (PWA)]] - code - src/components/sw-register.tsx
- [[Trabajadores id API Route]] - code - src/app/api/trabajadores/[id]/route.ts
- [[TrabajadoresClient (client worker CRUD, moto capacity, pay config)]] - code - src/app/(app)/trabajadores/trabajadores-client.tsx
- [[Validators Library (Zod Schemas)]] - code - src/lib/validators.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Community_11
SORT file.name ASC
```
