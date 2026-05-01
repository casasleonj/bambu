# Spec: Módulo Embarques — Agua Bambú v2

## Architecture

**Pattern**: Server Component page + Client Component for closing (`page.tsx` → `cerrar/page.tsx`).

## Data Model

```prisma
model Embarque {
  id            String   @id @default(cuid())
  numero        Int      @default(autoincrement())
  trabajadorId  String
  trabajador    Trabajador @relation(...)
  rutaId        String?
  ruta          Ruta?    @relation(...)
  estado        EstadoEmbarque @default(ABIERTO)  // ABIERTO, CERRADO, CANCELADO
  horaSalida    DateTime?
  horaLlegada   DateTime?
  pacasAgua     Int      @default(0)
  pacasHielo    Int      @default(0)
  devueltasAgua Int      @default(0)
  devueltasHielo Int     @default(0)
  rotasAgua     Int      @default(0)
  rotasHielo    Int      @default(0)
  obs           String?
  pedidos       Pedido[]
}
```

## State Machine

```
ABIERTO --[cerrar]--> CERRADO
   |
   |--[cancelar]
   v
CANCELADO (terminal)
```

## API Endpoints

### `GET /api/embarques`
Returns all embarques. Role: ADMIN, REPARTIDOR.

### `POST /api/embarques`
Creates new embarque. Role: ADMIN.

### `GET /api/embarques/[id]`
Returns single embarque with pedidos.

### `PUT /api/embarques/[id]`
Updates embarque. Role: ADMIN.

### `POST /api/embarques/[id]/cerrar` ⭐

Cierra embarque, procesa entregas, registra pagos.

**Request body:**
```typescript
{
  pedidos: [{
    pedidoId: string,
    entregado: 'COMPLETO' | 'PARCIAL' | 'NO_ENTREGADO',
    productosEntregados: { cPacaAguaEnt: number, ... },
    preciosReales: { pacaAgua: number, pacaHielo: number, ... },  // precios reales de venta
    pagado: 'COMPLETO' | 'PARCIAL' | 'NO_PAGADO',
    pagos: [{ metodo: string, monto: number }],
    nuevoEmbarqueId?: string,  // reasignar si NO_ENTREGADO
  }],
  ventasLibres: [{ ... }],  // ventas ad-hoc en ruta
  devueltasAgua: number,
  devueltasHielo: number,
  rotasAgua: number,
  rotasHielo: number,
  obs: string,
}
```

**Procesamiento por pedido:**

| entregado | Acción |
|-----------|--------|
| COMPLETO | estado → ENTREGADO, cXEnt = cXPed, total = suma(cantidad × precioReal) |
| PARCIAL | estado → ENTREGADO, cXEnt = lo entregado, total recalculado, **crea pedido hijo PENDIENTE** con faltante |
| NO_ENTREGADO | estado → PENDIENTE, embarqueId = null. Si hay `nuevoEmbarqueId` → EN_RUTA + reasignado |

**Precios reales:**
- El repartidor puede editar el precio unitario de cada producto al cerrar
- Se guardan en campos existentes: `precioPacaAgua`, `precioPacaHielo`, etc.
- Default = precio cotizado original del pedido
- `totalReal = suma(cantidadEntregada × precioReal)` para cada producto
- `saldo = totalReal - totalPagado`

**Ventas libres:**
- Pedidos creados en ruta sin pedido previo
- Estado: ENTREGADO directamente
- Precios resueltos por el pricing engine (canal DOMICILIO)

## UI Components

### Lista Embarques (`/embarques`)
| Elemento | Acción |
|---|---|
| Tabla desktop / Cards mobile | Lista de embarques con estado |
| Botón "+ Nuevo" | Crear embarque |
| Botón "Cerrar" | Navega a `/embarques/[id]/cerrar` |

### Cierre de Embarque (`/embarques/[id]/cerrar`)
| Sección | Contenido |
|---|---|
| Header | #número, repartidor, ruta, capacidad |
| Pedidos | Uno por uno con: entrega (COMPLETO/PARCIAL/NO_ENTREGADO), tabla de productos, pagos |
| Tabla productos | Producto \| Pedido \| Entregó \| Precio \| Subtotal |
| Ventas Libres | Agregar ventas ad-hoc en ruta |
| Retornos | Devueltas y rotas (agua/hielo) |
| Resumen | Total cobrado, entregado, no entregados, parciales |
| Confirmación | Modal si hay NO_ENTREGADO o PARCIALES |

### Tabla de Productos (por pedido)

```
Producto     | Pedido | Entregó | Precio | Subtotal
-------------|--------|---------|--------|----------
🍶 Paca Agua | 4      | [ 4  ]  | $2600  | $10,400
🧊 Paca Hielo| 0      | [ 5  ]  | $2500  | $12,500  ← ad-hoc
...
```

- **Entregó**: editable, sin máximo (permite ad-hoc)
- **Precio**: editable, default = precio cotizado original
- **Subtotal**: auto-calculado = entregó × precio
- **Total**: suma de todos los subtotales

## Known Issues

1. **console.error en error handlers** — Línea 370 en `cerrar/route.ts`. Debería sanitizarse.
2. **No hay confirmación visual antes de cerrar** — Solo modal si hay parciales/no entregados. Pedidos 100% completos se cierran sin confirmación.

## Implementation TODO

- [ ] Sanitize console.error in production
- [ ] Add confirmation modal for all closes (not just partials)
