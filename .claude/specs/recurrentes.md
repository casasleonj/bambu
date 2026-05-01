# Spec: Módulo Recurrentes — Agua Bambú v2

## Purpose

Manage recurring order patterns that auto-generate pedidos based on frequency schedules.

## Architecture

**Pattern**: Client-only page (`'use client'`). Fetches data on mount via `useEffect`.

## Data Model

```prisma
PedidoRecurrente {
  id               String   @id @default(uuid())
  numero           Int      @unique
  clienteId        String
  cliente          Cliente  @relation(fields: [clienteId], references: [id])
  frecuencia       String   // DIARIO, SEMANAL, QUINCENAL, MENSUAL, CADA_N_DIAS
  cadaNDias        Int?
  cPacaAguaPed     Int      @default(0)
  cPacaHieloPed    Int      @default(0)
  cBotellonFabPed  Int      @default(0)
  cBotellonDomPed  Int      @default(0)
  cBolsaAguaPed    Int      @default(0)
  cBolsaHieloPed   Int      @default(0)
  ultimaGeneracion DateTime?
  saltarFechas     String[]  // Dates to skip generation
  obs              String?
  pedidoHijo       Pedido[]  // Generated orders
}
```

## UI Components

### Preview Section (yellow banner)
| Elemento | Acción |
|---|---|
| Lista de recurrentes due | Muestra clientes con generación pendiente hoy |
| Pendientes indicator | Muestra pedidos pendientes previos del cliente |
| Sugerencias buttons | NORMAL, CON_PENDIENTES, SOLO_PENDIENTES, SALTAR |
| "Generar Seleccionados" | Ejecuta generación con decisiones |

### Lista Recurrentes (cards grid)
| Elemento | Acción |
|---|---|
| Card | Muestra productos, frecuencia, última generación |
| Editar | Navega a `/recurrentes/[id]` |
| Eliminar | DELETE con confirm() |

## API Endpoints

### `GET /api/recurrentes`
Returns all recurring patterns.

### `GET /api/pedidos/recurrentes`
Returns preview of today's generation with suggestions.

### `POST /api/pedidos/recurrentes`
Generates orders based on decisions array.

### `PUT /api/recurrentes?id=[id]`
Updates recurrente (e.g., add skip dates).

### `DELETE /api/recurrentes?id=[id]`
Deletes a recurring pattern. **Should require ADMIN role**.

## Decision Types

| Tipo | Descripción |
|---|---|
| NORMAL | Generar pedido nuevo normalmente |
| CON_PENDIENTES | Generar nuevo aunque haya pendientes |
| SOLO_PENDIENTES | No generar nuevo, solo marcar pendientes |
| SALTAR | No generar nada hoy |

## Known Issues

1. ~~**console.error in error handlers**~~ — FIXED: Removed all console.error calls.
2. **No EmptyState when preview is empty** — Only shows when `recurrentes.length === 0`, not when preview has no items for today.
3. ~~**No role checks on delete**~~ — FIXED: DELETE now requires ADMIN or CONTADOR role.
4. **No loading state on generation** — `generating` state exists but no visual feedback on individual items.
5. **Delete uses `confirm()`** — Should use a proper confirmation modal.

## Implementation TODO

- [ ] Add EmptyState for empty preview
- [ ] Add loading state per item during generation
- [ ] Replace confirm() with confirmation modal
