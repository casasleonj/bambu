---
source_file: "src/app/api/pedidos/route.ts"
type: "code"
community: "Community 8"
location: "65"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/Community_8
---

# POST /api/pedidos - Create pedido with pricing, factura, pagos

## Connections
- [[Advisory lock transaction pattern for pedido creation]] - `implements` [EXTRACTED]
- [[Automatic factura creation on pedido POST]] - `calls` [EXTRACTED]
- [[GET apipedidos - List pedidos with pagination]] - `conceptually_related_to` [EXTRACTED]
- [[POST apiclientes - Create cliente]] - `shares_data_with` [INFERRED]
- [[POST apifacturas - Create factura with advisory lock]] - `shares_data_with` [INFERRED]
- [[POST apirecurrentes - Create recurring pedido]] - `shares_data_with` [INFERRED]
- [[resolverPreciosPedido pricing engine call]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/Community_8