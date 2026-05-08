---
type: community
cohesion: 0.09
members: 27
---

# Community 8

**Cohesion:** 0.09 - loosely connected
**Members:** 27 nodes

## Members
- [[Abono updates factura.saldo and pedido.saldo]] - code - src/app/api/abonos/route.ts
- [[Advisory lock transaction pattern for pedido creation]] - code - src/app/api/pedidos/route.ts
- [[Agent Guide - Project architecture and conventions]] - document - AGENTS.md
- [[Automatic factura creation on pedido POST]] - code - src/app/api/pedidos/route.ts
- [[CRITICAL APIs unprotected by middleware]] - document - DEBUG_REPORT.md
- [[CRITICAL Over-payment silently accepted in abonos]] - document - DEBUG_REPORT.md
- [[CRITICAL Password comparison in plaintext]] - document - DEBUG_REPORT.md
- [[Deep Debug Report - 29 confirmed bugs]] - document - DEBUG_REPORT.md
- [[GET apifacturas - List facturas]] - code - src/app/api/facturas/route.ts
- [[GET apipedidos - List pedidos with pagination]] - code - src/app/api/pedidos/route.ts
- [[HIGH Production page calls non-existent apicierre-dia]] - document - DEBUG_REPORT.md
- [[HIGH Race conditions in sequential number generation (5 instances)]] - document - DEBUG_REPORT.md
- [[MVP Testing Strategy - 1-week plan]] - document - TESTING_STRATEGY_MVP.md
- [[POST apiabonos - Create abono, update factura saldo]] - code - src/app/api/abonos/route.ts
- [[POST apiclientes - Create cliente]] - code - src/app/api/clientes/route.ts
- [[POST apifacturas - Create factura with advisory lock]] - code - src/app/api/facturas/route.ts
- [[POST apipedidos - Create pedido with pricing, factura, pagos]] - code - src/app/api/pedidos/route.ts
- [[POST apirecurrentes - Create recurring pedido]] - code - src/app/api/recurrentes/route.ts
- [[PostgreSQL advisory locks for sequence generation]] - document - AGENTS.md
- [[PostgreSQL-only architecture decision]] - document - AGENTS.md
- [[QA Final Report - MVP FAIL verdict]] - document - QA_FINAL_REPORT.md
- [[Rate limiting architecture (Redis + in-memory fallback)]] - document - AGENTS.md
- [[Rationale API integration tests over E2E for MVP]] - document - TESTING_STRATEGY_MVP.md
- [[Rationale Migrate to SupabasePostgreSQL before features]] - document - QA_FINAL_REPORT.md
- [[Rationale Reduce MVP scope to 4 days critical work]] - document - QA_FINAL_REPORT.md
- [[Server Components pattern with serialized data]] - document - AGENTS.md
- [[resolverPreciosPedido pricing engine call]] - code - src/app/api/pedidos/route.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Community_8
SORT file.name ASC
```
