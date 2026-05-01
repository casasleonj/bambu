# Spec: Módulo Clientes — Agua Bambú v2

## Architecture

**Pattern**: Server Component page + Client Component (`page.tsx` → `clientes-client.tsx`).
- SC page fetches `Cliente[]` with `_count.pedidos` and serializes via `JSON.parse(JSON.stringify(...))`.
- Client component handles search, CRUD modals, and detail view.

## Data Model

```prisma
Cliente {
  id              String   @id @default(uuid())
  clienteId       String   @unique @default(shortid())
  nombre          String
  apellido        String?
  telefono        String
  nombreNegocio   String?
  tipoNegocio     String?
  barrio          String?
  direccion       String?
  frecuencia      String   @default("NINGUNA")  // NINGUNA, DIARIO, SEMANAL, QUINCENAL, MENSUAL, CADA_N_DIAS
  cadaNDias       Int?
  preciosEspeciales String?  // JSON string: {"PACA_AGUA": 2600}
  notas           String?
  ultEntrega      DateTime?
  activo          Boolean  @default(true)
  pedidos         Pedido[]
  facturas        Factura[]
}
```

## UI Components

### Lista Clientes (cards grid)
| Elemento | Acción |
|---|---|
| Search bar | Filtrar por nombre, telefono, negocio, barrio, clienteId |
| Card click | Abrir modal detalle |
| "+ Nuevo Cliente" | Abrir modal crear |

### Modal Detalle (tabs)
| Tab | Contenido |
|---|---|
| Info | Datos del cliente, precios especiales, notas |
| Pedidos | Lista de pedidos del cliente |
| Facturas | Lista de facturas |
| Cuentas | Cuentas por cobrar (pedidos con saldo > 0) |

### Modal Crear/Editar
| Campo | Tipo | Requerido |
|---|---|---|
| Nombre | text | Sí |
| Apellido | text | No |
| Telefono | tel | Sí |
| Negocio | text | No |
| Tipo | text | No |
| Barrio | text | No |
| Direccion | text | No |
| Frecuencia | select | No (default: NINGUNA) |
| Cada N dias | number | Solo si frecuencia = CADA_N_DIAS |
| Precios Especiales | text (JSON) | No |
| Notas | textarea | No |

## API Endpoints

### `GET /api/clientes?all=true`
Returns all active clients.

### `POST /api/clientes`
Creates a new client. Zod validated with `ClienteCreateSchema`.

### `PUT /api/clientes/[id]`
Updates client. Zod validated with `ClienteUpdateSchema` (partial).

### `DELETE /api/clientes/[id]`
Soft deletes (sets `activo = false`). **Should require ADMIN role**.

### `GET /api/clientes/[id]`
Returns single client with related pedidos and facturas.

## Known Issues

1. ~~**console.error in error handlers**~~ — FIXED: Removed all console.error calls.
2. ~~**No loading state on detail fetch**~~ — FIXED: Added `detailLoading` state with spinner.
3. ~~**No role checks on delete**~~ — FIXED: DELETE now requires ADMIN or CONTADOR role.
4. **Search is local state only** — Unlike pedidos, search doesn't use URL params (no shareable filtered URLs).
5. **Delete uses `confirm()`** — Should use a proper confirmation modal for consistency.

## Implementation TODO

- [ ] Migrate search to URL params
- [ ] Replace confirm() with confirmation modal for delete
