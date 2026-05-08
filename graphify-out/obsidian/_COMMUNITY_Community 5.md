---
type: community
cohesion: 0.09
members: 36
---

# Community 5

**Cohesion:** 0.09 - loosely connected
**Members:** 36 nodes

## Members
- [[DecisionGeneracion interface - generation decision types]] - code - src/lib/recurrentes.ts
- [[LOCK_IDS - lock identifiers for PEDIDOFACTURAEMBARQUEABONOCOMPRAFACTURA_NUM]] - code - src/lib/locks.ts
- [[PrecioResuelto interface - resolved price with origin tracking]] - code - src/lib/pricing.ts
- [[addDays()]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/recurrentes.ts
- [[analizarPatronesEntrega - delivery pattern analysis by barrio]] - code - src/lib/route-analysis.ts
- [[checkCierreDiaConsistency - validates daily close totals]] - code - prisma/validate-data.ts
- [[checkFacturaSaldo - validates invoice balance consistency]] - code - prisma/validate-data.ts
- [[checkPagosMatchTotalPagado - validates payment sums]] - code - prisma/validate-data.ts
- [[checkPedidoTotals - validates order total calculations]] - code - prisma/validate-data.ts
- [[checkProduccionStock - validates stock balance equation]] - code - prisma/validate-data.ts
- [[checkRecurrentesDuplicates - validates no duplicate recurring orders per client]] - code - prisma/validate-data.ts
- [[checkSaldoConsistency - validates saldo = total - totalPagado]] - code - prisma/validate-data.ts
- [[estaEnSaltarFechas()]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/recurrentes.ts
- [[formatDateISO()]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/recurrentes.ts
- [[generarPedidosRecurrentes - execute recurring order generation]] - code - src/lib/recurrentes.ts
- [[generarPedidosRecurrentes()]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/recurrentes.ts
- [[getFrecuenciaDias()]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/recurrentes.ts
- [[getNextNumero()]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/sequence.ts
- [[getPriceTable()]] - code - src/lib/pricing.ts
- [[obtenerBarriosSinRuta - barrios without route assignment]] - code - src/lib/route-analysis.ts
- [[obtenerRepartidoresActivos - active delivery workers]] - code - src/lib/route-analysis.ts
- [[parsePreciosEspeciales - client-specific price overrides parser]] - code - src/lib/pricing.ts
- [[parsePreciosEspeciales()_1]] - code - src/lib/pricing.ts
- [[previewGeneracionRecurrentes - preview recurring order generation]] - code - src/lib/recurrentes.ts
- [[previewGeneracionRecurrentes()]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/recurrentes.ts
- [[pricing.ts]] - code - src/lib/pricing.ts
- [[prisma singleton - global PrismaClient instance]] - code - src/lib/prisma.ts
- [[recurrentes.ts]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/recurrentes.ts
- [[resolverPrecio()]] - code - src/lib/pricing.ts
- [[resolverPreciosPedido()]] - code - src/lib/pricing.ts
- [[seed-realista.ts - realistic data generation (80 clients, 1750 orders, 7 days)]] - code - prisma/seed-realista.ts
- [[seed.ts - price history and volume price seeding]] - code - prisma/seed.ts
- [[seed.ts - product catalog seeding]] - code - prisma/seed.ts
- [[seed.ts - user seeding with bcrypt passwords]] - code - prisma/seed.ts
- [[sequence.ts]] - code - /home/cristof/Documents/bambu_demo_multimodelo/src/lib/sequence.ts
- [[withAdvisoryLock - PostgreSQL advisory lock wrapper]] - code - src/lib/locks.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Community_5
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_Community 1]]
- 1 edge to [[_COMMUNITY_Community 6]]

## Top bridge nodes
- [[prisma singleton - global PrismaClient instance]] - degree 24, connects to 2 communities
- [[resolverPrecio()]] - degree 7, connects to 1 community
- [[previewGeneracionRecurrentes()]] - degree 6, connects to 1 community
- [[generarPedidosRecurrentes()]] - degree 4, connects to 1 community
- [[getPriceTable()]] - degree 3, connects to 1 community