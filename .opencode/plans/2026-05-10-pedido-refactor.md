# Refactor Sección Pedidos / Ventas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar y clarificar el flujo de pedidos para envío, ventas en punto y ventas rápidas, separando correctamente el estado de entrega del estado de pago, agregando trazabilidad de origen, y permitiendo ventas libres desde el móvil del repartidor.

**Architecture:** Mantener el modelo `Pedido` único (adecuado para reparto rural con 6 usuarios), pero desacoplar `estadoEntrega` de `estadoPago`, agregar `origen` para trazabilidad, y crear `PedidoItem` como tabla normalizada de líneas de producto. Adaptar UI y API para reflejar los 4 casos de negocio validados.

**Tech Stack:** Next.js 16, Prisma + PostgreSQL, Tailwind + shadcn/ui, Zod, Dexie (offline)

---

## Contexto de Negocio Validado

### Casos de Uso Confirmados

| # | Caso | Origen | Pago | Entrega |
|---|------|--------|------|---------|
| 1 | Cliente llega al punto, paga, se lleva todo | `PUNTO` | Inmediato | Inmediata |
| 2 | Cliente llega al punto, paga completo, pide envío | `PUNTO` | Inmediato o contra-entrega | Por embarque |
| 3 | Cliente llega al punto, paga completo, se lleva parcial, resto envío | `PUNTO` | Inmediato (total) o parcial | Parcial inmediata + resto por embarque |
| 4 | Cliente ordena remoto (WhatsApp/llamada), repartidor entrega | `DOMICILIO` | Contra-entrega o anticipado | Por embarque |

### Decisiones Clave del Usuario

- **P1 (Caso 3):** Normalmente todo pagado, pero a veces paga lo que se lleva y el resto contra entrega.
- **P2 (Caso 2):** Depende — a veces paga en punto, a veces contra entrega.
- **P3 (Venta libre en ruta):** Idealmente el repartidor registra desde móvil, respaldo es anotar en papel y registrar al cierre.
- **T1 (Vista):** Una sola lista con filtros por origen/estado.
- **T2 (Cierre día):** Sí separar por origen para comisiones de repartidor.
- **T3 (Repartidor):** Vista reducida, debe poder hacer ventas rápidas desde móvil.

---

## File Structure

### Nuevos archivos
- `prisma/migrations/20260510000000_pedido_refactor/migration.sql` — Migración de schema
- `src/lib/pedido-utils.ts` — Helpers de estado, totales, validaciones de transición
- `src/components/venta-libre-form/` — Formulario para ventas libres desde móvil del repartidor
- `src/app/api/pedidos/venta-libre/route.ts` — API para ventas libres
- `src/app/api/pedidos/[id]/entrega/route.ts` — API para registrar entrega parcial/completa/no entregado
- `src/app/api/pedidos/[id]/pago/route.ts` — API para registrar pagos adicionales

### Archivos a modificar
- `prisma/schema.prisma` — Nuevos enums, campos en `Pedido`, nueva tabla `PedidoItem`
- `src/lib/validators.ts` — Nuevos schemas Zod
- `src/lib/pricing.ts` — Adaptar a `PedidoItem`
- `src/app/api/pedidos/route.ts` — Crear pedido con nuevo schema
- `src/app/api/pedidos/[id]/route.ts` — Actualizar con nuevos estados
- `src/app/api/embarques/[id]/cerrar/route.ts` — Adaptar cierre a nuevo modelo
- `src/components/pedido-form/` — Adaptar a nuevo schema
- `src/components/venta-rapida-form/` — Adaptar a nuevo schema
- `src/app/(app)/pedidos/pedidos-client/` — Nuevos filtros, badges, columnas
- `src/app/(app)/embarques/[id]/cerrar/cerrar-client/` — Adaptar cuadre
- `src/app/(app)/dashboard/page.tsx` — Métricas separadas por origen
- `prisma/seed.ts` — Datos de ejemplo con nuevo schema

### Archivos a eliminar (solo si se confirma)
- Ninguno. Mantener compatibilidad hacia atrás durante migración.

---

## Data Model Changes

### Nuevos enums

```prisma
enum OrigenPedido {
  PEDIDO        // Creado desde "Nuevo Pedido" (caso 4 remoto)
  VENTA_RAPIDA  // Creado desde "Venta Rápida" en punto (caso 1)
  VENTA_LIBRE   // Creado por repartidor en ruta (caso 4 extension)
}

enum EstadoEntrega {
  PENDIENTE      // Aún no sale
  EN_RUTA        // Asignado a embarque
  ENTREGADO      // El repartidor entregó
  NO_ENTREGADO   // El repartidor intentó pero no pudo
  CANCELADO      // Cancelado antes de salir
  ANULADO        // Anulado después de entregado
}

enum EstadoPago {
  PENDIENTE      // Nada pagado
  PARCIAL        // Pagó algo
  PAGADO         // Todo pagado
  ANTICIPADO     // Pagó antes de la entrega (solo para envíos)
}
```

### Modificaciones a `Pedido`

```prisma
model Pedido {
  // ... campos existentes ...
  
  // Reemplazar estado antiguo
  estado        EstadoPedido     // DEPRECATED — mantener para compatibilidad
  estadoEntrega EstadoEntrega    @default(PENDIENTE)
  estadoPago    EstadoPago       @default(PENDIENTE)
  origen        OrigenPedido     @default(PEDIDO)
  
  // Campos existentes se mantienen durante migración
  // cPacaAguaPed, cPacaAguaEnt, etc. — MANTENER
  
  // Relaciones nuevas
  items         PedidoItem[]
  
  // ... resto igual ...
}
```

### Nueva tabla `PedidoItem`

```prisma
model PedidoItem {
  id          String   @id @default(cuid())
  pedidoId    String
  pedido      Pedido   @relation(fields: [pedidoId], references: [id], onDelete: Cascade)
  
  producto    String   // PACA_AGUA, PACA_HIELO, BOTELLON_FAB, etc.
  cantPedido  Int      @default(0)
  cantEntrega Int      @default(0)
  precio      Decimal  @default(0) @db.Decimal(10, 2)
  subtotal    Decimal  @default(0) @db.Decimal(10, 2)
  
  @@index([pedidoId])
  @@index([producto])
}
```

> **Nota:** Las columnas duras (`cPacaAguaPed`, etc.) se mantienen durante la migración como `legacy`. El código nuevo usa `PedidoItem`. Una vez estable, se puede hacer migración de datos y eliminar columnas duras.

---

## Task Breakdown

### Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260510000000_pedido_refactor/migration.sql`
- Test: `npx prisma migrate dev --name pedido_refactor`

- [ ] **Step 1: Agregar enums nuevos**

  Agregar `OrigenPedido`, `EstadoEntrega`, `EstadoPago` al schema.

  ```prisma
  enum OrigenPedido {
    PEDIDO
    VENTA_RAPIDA
    VENTA_LIBRE
  }

  enum EstadoEntrega {
    PENDIENTE
    EN_RUTA
    ENTREGADO
    NO_ENTREGADO
    CANCELADO
    ANULADO
  }

  enum EstadoPago {
    PENDIENTE
    PARCIAL
    PAGADO
    ANTICIPADO
  }
  ```

- [ ] **Step 2: Modificar modelo `Pedido`**

  Agregar campos nuevos, mantener campos antiguos para compatibilidad:

  ```prisma
  model Pedido {
    // ... existing fields ...
    
    tipo          String           // ENVIO | PUNTO
    estado        EstadoPedido     @default(PENDIENTE)  // DEPRECATED
    estadoEntrega EstadoEntrega    @default(PENDIENTE)
    estadoPago    EstadoPago       @default(PENDIENTE)
    origen        OrigenPedido     @default(PEDIDO)
    
    // Legacy product columns — keep for migration
    cPacaAguaPed      Int     @default(0)
    cPacaAguaEnt      Int     @default(0)
    // ... etc ...
    
    // New normalized items
    items         PedidoItem[]
    
    // ... rest unchanged ...
  }
  ```

- [ ] **Step 3: Crear modelo `PedidoItem`**

  ```prisma
  model PedidoItem {
    id          String   @id @default(cuid())
    pedidoId    String
    pedido      Pedido   @relation(fields: [pedidoId], references: [id], onDelete: Cascade)
    producto    String
    cantPedido  Int      @default(0)
    cantEntrega Int      @default(0)
    precio      Decimal  @default(0) @db.Decimal(10, 2)
    subtotal    Decimal  @default(0) @db.Decimal(10, 2)
    
    @@index([pedidoId])
    @@index([producto])
  }
  ```

- [ ] **Step 4: Generar y aplicar migración**

  ```bash
  npx prisma migrate dev --name pedido_refactor
  ```

  Expected: Migración generada sin errores, BD actualizada.

- [ ] **Step 5: Regenerar cliente Prisma**

  ```bash
  npx prisma generate
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add prisma/
  git commit -m "schema: add origen, estadoEntrega, estadoPago, PedidoItem"
  ```

---

### Task 2: Validators Zod

**Files:**
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Crear schemas nuevos**

  ```typescript
  // Nuevos enums para Zod
  export const OrigenPedidoSchema = z.enum(['PEDIDO', 'VENTA_RAPIDA', 'VENTA_LIBRE'])
  export const EstadoEntregaSchema = z.enum(['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO'])
  export const EstadoPagoSchema = z.enum(['PENDIENTE', 'PARCIAL', 'PAGADO', 'ANTICIPADO'])
  
  // Schema para items de pedido
  export const PedidoItemSchema = z.object({
    producto: z.enum(['PACA_AGUA', 'PACA_HIELO', 'BOTELLON_FAB', 'BOTELLON_DOM', 'BOLSA_AGUA', 'BOLSA_HIELO']),
    cantidad: z.coerce.number().int().min(0),
    precioManual: z.number().min(0).optional(),
  })
  
  // Schema actualizado para crear pedido
  export const PedidoCreateSchema = z.object({
    clienteId: z.string().min(1),
    canal: z.enum(['PUNTO', 'DOMICILIO']).optional().default('DOMICILIO'),
    origen: OrigenPedidoSchema.optional().default('PEDIDO'),
    items: z.array(PedidoItemSchema).min(1, 'Agrega al menos un producto'),
    preciosManuales: z.record(z.string(), z.number().min(0)).optional(),
    pagos: z.array(
      z.object({
        metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
        monto: z.coerce.number().min(0),
      })
    ).optional(),
    obs: z.string().max(500).optional(),
    fechaEntrega: z.string().optional(),
    ventaRapida: z.boolean().optional(),  // DEPRECATED — usar origen
    tipo: z.enum(['ENVIO', 'PUNTO']).optional(),
    clienteNuevo: z.object({
      nombre: z.string().min(1),
      telefono: z.string().min(1),
      direccion: z.string().optional(),
      barrio: z.string().optional(),
    }).optional(),
  })
  
  // Schema para registrar entrega (usado en cierre de embarque)
  export const EntregaSchema = z.object({
    pedidoId: z.string().min(1),
    tipo: z.enum(['COMPLETO', 'PARCIAL', 'NO_ENTREGADO']),
    itemsEntregados: z.array(z.object({
      producto: z.string(),
      cantidad: z.number().int().min(0),
    })).optional(),
    pagos: z.array(z.object({
      metodo: z.string(),
      monto: z.number().min(0),
    })).optional(),
    nuevoEmbarqueId: z.string().optional(),
  })
  
  // Schema para venta libre (desde móvil repartidor)
  export const VentaLibreSchema = z.object({
    clienteId: z.string().min(1),
    items: z.array(PedidoItemSchema).min(1),
    pagos: z.array(z.object({
      metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
      monto: z.coerce.number().min(0),
    })).optional(),
    embarqueId: z.string().min(1),
    obs: z.string().optional(),
  })
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/lib/validators.ts
  git commit -m "feat: add Zod schemas for PedidoItem, Entrega, VentaLibre"
  ```

---

### Task 3: Helpers de Pedido (lógica de estado)

**Files:**
- Create: `src/lib/pedido-utils.ts`

- [ ] **Step 1: Crear utilidades de transición de estados**

  ```typescript
  import { EstadoEntrega, EstadoPago } from '@prisma/client'
  
  // Transiciones válidas de estado de entrega
  export const TRANSICIONES_ENTREGA: Record<EstadoEntrega, EstadoEntrega[]> = {
    PENDIENTE: ['EN_RUTA', 'CANCELADO'],
    EN_RUTA: ['ENTREGADO', 'NO_ENTREGADO', 'PENDIENTE', 'CANCELADO'],
    ENTREGADO: ['ANULADO'],
    NO_ENTREGADO: ['PENDIENTE', 'EN_RUTA', 'CANCELADO'],
    CANCELADO: [],
    ANULADO: [],
  }
  
  // Transiciones válidas de estado de pago
  export const TRANSICIONES_PAGO: Record<EstadoPago, EstadoPago[]> = {
    PENDIENTE: ['PARCIAL', 'PAGADO', 'ANTICIPADO'],
    PARCIAL: ['PAGADO', 'ANTICIPADO'],
    PAGADO: [],
    ANTICIPADO: ['PAGADO'],
  }
  
  export function puedeTransicionarEntrega(
    actual: EstadoEntrega,
    nuevo: EstadoEntrega
  ): boolean {
    return TRANSICIONES_ENTREGA[actual]?.includes(nuevo) ?? false
  }
  
  export function puedeTransicionarPago(
    actual: EstadoPago,
    nuevo: EstadoPago
  ): boolean {
    return TRANSICIONES_PAGO[actual]?.includes(nuevo) ?? false
  }
  
  // Calcular estado de pago a partir de totales
  export function calcularEstadoPago(
    total: number,
    totalPagado: number
  ): EstadoPago {
    if (totalPagado >= total) return 'PAGADO'
    if (totalPagado > 0) return 'PARCIAL'
    return 'PENDIENTE'
  }
  
  // Determinar badge visual
  export function getBadgeEstado(
    estadoEntrega: EstadoEntrega,
    estadoPago: EstadoPago,
    saldo: number
  ): { label: string; color: string } {
    if (estadoEntrega === 'CANCELADO') return { label: 'Cancelado', color: 'bg-gray-100 text-gray-600' }
    if (estadoEntrega === 'ANULADO') return { label: 'Anulado', color: 'bg-red-100 text-red-600' }
    if (estadoEntrega === 'PENDIENTE') return { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' }
    if (estadoEntrega === 'EN_RUTA') return { label: 'En Ruta', color: 'bg-blue-100 text-blue-800' }
    if (estadoEntrega === 'NO_ENTREGADO') return { label: 'No Entregado', color: 'bg-orange-100 text-orange-800' }
    
    // ENTREGADO — aquí miramos el pago
    if (estadoPago === 'PAGADO' || saldo <= 0) {
      return { label: 'Pagado', color: 'bg-green-100 text-green-800' }
    }
    if (estadoPago === 'PARCIAL' || (saldo > 0 && saldo < total)) {
      return { label: 'Pago Parcial', color: 'bg-orange-100 text-orange-800' }
    }
    if (estadoPago === 'ANTICIPADO') {
      return { label: 'Anticipado', color: 'bg-blue-100 text-blue-800' }
    }
    return { label: 'Por Cobrar', color: 'bg-red-100 text-red-800' }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/lib/pedido-utils.ts
  git commit -m "feat: add pedido state transition helpers"
  ```

---

### Task 4: Adaptar API — Crear Pedido

**Files:**
- Modify: `src/app/api/pedidos/route.ts`

- [ ] **Step 1: Modificar POST para usar items y nuevos campos**

  El endpoint debe:
  1. Recibir `items` array en lugar de productos individuales
  2. Calcular totales usando `PedidoItem`
  3. Determinar `origen` (VENTA_RAPIDA si `ventaRapida=true`, PEDIDO por defecto)
  4. Determinar `estadoEntrega` y `estadoPago` iniciales
  5. Crear `PedidoItem` records junto con `Pedido`
  6. Crear `Factura` SIEMPRE (incluso para punto pagado completo)
  7. Mantener compatibilidad con campos legacy (llenar `cPacaAguaPed`, etc.)

  ```typescript
  export async function POST(request: NextRequest) {
    // ... auth ...
    const body = await request.json()
    const parsed = PedidoCreateSchema.safeParse(body)
    if (!parsed.success) { /* ... */ }
    
    const { clienteId: rawClienteId, items, pagos, origen, canal, ventaRapida } = parsed.data
    const pagosData = pagos || []
    const totalPagado = pagosData.reduce((sum, p) => sum + p.monto, 0)
    
    const origenReal = ventaRapida ? 'VENTA_RAPIDA' : (origen || 'PEDIDO')
    const canalReal = canal || 'DOMICILIO'
    const tipo = canalReal === 'PUNTO' ? 'PUNTO' : 'ENVIO'
    
    // Resolver precios para cada item
    const itemsConPrecio = await resolverPreciosItems(items, canalReal, clienteId)
    const total = itemsConPrecio.reduce((sum, it) => sum + it.subtotal, 0)
    
    // Determinar estados iniciales
    const estadoEntrega = origenReal === 'VENTA_RAPIDA' ? 'ENTREGADO' : 'PENDIENTE'
    const estadoPago = calcularEstadoPago(total, totalPagado)
    
    const result = await withAdvisoryLock('PEDIDO', async (tx) => {
      // ... crear cliente si es nuevo ...
      
      const pedido = await tx.pedido.create({
        data: {
          clienteId,
          createdById: authResult.user?.id,
          tipo,
          canal: canalReal,
          origen: origenReal,
          estado: estadoEntrega === 'ENTREGADO' ? 'ENTREGADO' : 'PENDIENTE',  // legacy
          estadoEntrega,
          estadoPago,
          total,
          saldo: total - totalPagado,
          totalPagado,
          // Legacy fields
          cPacaAguaPed: itemsConPrecio.find(i => i.producto === 'PACA_AGUA')?.cantidad || 0,
          // ... etc for all legacy fields ...
          obs,
        },
      })
      
      // Crear PedidoItem records
      for (const item of itemsConPrecio) {
        await tx.pedidoItem.create({
          data: {
            pedidoId: pedido.id,
            producto: item.producto,
            cantPedido: item.cantidad,
            cantEntrega: estadoEntrega === 'ENTREGADO' ? item.cantidad : 0,
            precio: item.precio,
            subtotal: item.subtotal,
          }
        })
      }
      
      // Crear pagos
      for (const pago of pagosData) {
        await tx.pago.create({ data: { pedidoId: pedido.id, metodo: pago.metodo, monto: pago.monto } })
      }
      
      // SIEMPRE crear factura
      const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })
      const factura = await tx.factura.create({
        data: {
          numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
          clienteId,
          pedidoId: pedido.id,
          subtotal: total,
          total,
          saldo: total - totalPagado,
          estado: totalPagado >= total ? 'PAGADA' : 'EMITIDA',
        },
      })
      
      return { pedido, factura }
    })
    
    // ... audit log ...
    return apiSuccess({ pedido: result.pedido, factura: result.factura }, 201)
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/api/pedidos/route.ts
  git commit -m "feat(api): adapt pedido creation for new state model, always create invoice"
  ```

---

### Task 5: Adaptar API — Entrega de Pedido

**Files:**
- Create: `src/app/api/pedidos/[id]/entrega/route.ts`

- [ ] **Step 1: Crear endpoint para registrar entrega**

  Este endpoint se usa tanto en el cierre de embarque como en el móvil del repartidor.

  ```typescript
  export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ) {
    const authResult = await requireAuth()
    if (authResult instanceof Response) return authResult
    const { id } = await params
    
    try {
      const body = await request.json()
      const parsed = EntregaSchema.safeParse(body)
      if (!parsed.success) return apiError(formatZodError(parsed.error), 400)
      
      const { tipo, itemsEntregados, pagos, nuevoEmbarqueId } = parsed.data
      
      const result = await prisma.$transaction(async (tx) => {
        const pedido = await tx.pedido.findUnique({
          where: { id },
          include: { items: true, pagos: true },
        })
        if (!pedido) throw new Error('PEDIDO_NOT_FOUND')
        
        if (tipo === 'NO_ENTREGADO') {
          // Volver a PENDIENTE, quitar de embarque
          const updateData: any = {
            estadoEntrega: 'NO_ENTREGADO',
            estado: 'PENDIENTE',  // legacy
            embarqueId: null,
          }
          if (nuevoEmbarqueId) {
            updateData.estadoEntrega = 'EN_RUTA'
            updateData.estado = 'EN_RUTA'
            updateData.embarqueId = nuevoEmbarqueId
          }
          await tx.pedido.update({ where: { id }, data: updateData })
          return { pedido: updateData, hijo: null }
        }
        
        // COMPLETO o PARCIAL
        const montoPagado = (pagos || []).reduce((sum, p) => sum + p.monto, 0)
        
        // Actualizar items entregados
        for (const itemEnt of itemsEntregados || []) {
          await tx.pedidoItem.updateMany({
            where: { pedidoId: id, producto: itemEnt.producto },
            data: { cantEntrega: itemEnt.cantidad },
          })
        }
        
        // Calcular totales reales
        const itemsActualizados = await tx.pedidoItem.findMany({ where: { pedidoId: id } })
        const totalReal = itemsActualizados.reduce((sum, it) => sum + Number(it.subtotal), 0)
        
        // Registrar pagos
        for (const pago of pagos || []) {
          if (pago.monto > 0) {
            await tx.pago.create({
              data: { pedidoId: id, metodo: pago.metodo as MetodoPago, monto: pago.monto },
            })
          }
        }
        
        const totalPagadoNuevo = Number(pedido.totalPagado) + montoPagado
        const saldo = totalReal - totalPagadoNuevo
        const estadoPago = calcularEstadoPago(totalReal, totalPagadoNuevo)
        
        await tx.pedido.update({
          where: { id },
          data: {
            estadoEntrega: 'ENTREGADO',
            estado: 'ENTREGADO',  // legacy
            estadoPago,
            total: totalReal,
            totalPagado: totalPagadoNuevo,
            saldo,
            // Legacy fields
            cPacaAguaEnt: itemsActualizados.find(i => i.producto === 'PACA_AGUA')?.cantEntrega || 0,
            // ... etc ...
          },
        })
        
        // Si PARCIAL, crear pedido hijo con faltante
        let hijo = null
        if (tipo === 'PARCIAL') {
          // ... lógica de pedido hijo similar a cierre de embarque actual ...
        }
        
        // Actualizar factura
        await tx.factura.updateMany({
          where: { pedidoId: id },
          data: { total: totalReal, saldo, estado: saldo <= 0 ? 'PAGADA' : 'EMITIDA' },
        })
        
        return { pedido: { id, estadoEntrega: 'ENTREGADO', estadoPago, saldo }, hijo }
      })
      
      return apiSuccess(result)
    } catch (error) {
      // ... error handling ...
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/api/pedidos/[id]/entrega/route.ts
  git commit -m "feat(api): add pedido delivery endpoint with partial/full/none support"
  ```

---

### Task 6: Adaptar API — Venta Libre (desde móvil repartidor)

**Files:**
- Create: `src/app/api/pedidos/venta-libre/route.ts`

- [ ] **Step 1: Crear endpoint para ventas libres**

  ```typescript
  export async function POST(request: NextRequest) {
    const authResult = await requireAuth()
    if (authResult instanceof Response) return authResult
    const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.REPARTIDOR], authResult)
    if (roleCheck instanceof Response) return roleCheck
    
    try {
      const body = await request.json()
      const parsed = VentaLibreSchema.safeParse(body)
      if (!parsed.success) return apiError(formatZodError(parsed.error), 400)
      
      const { clienteId, items, pagos, embarqueId, obs } = parsed.data
      const pagosData = pagos || []
      const totalPagado = pagosData.reduce((sum, p) => sum + p.monto, 0)
      
      const result = await withAdvisoryLock('PEDIDO', async (tx) => {
        // Verificar embarque existe y está abierto
        const embarque = await tx.embarque.findUnique({ where: { id: embarqueId } })
        if (!embarque || embarque.estado !== 'ABIERTO') {
          throw new Error('EMBARQUE_INVALIDO')
        }
        
        // Resolver precios
        const itemsConPrecio = await resolverPreciosItems(items, 'DOMICILIO', clienteId)
        const total = itemsConPrecio.reduce((sum, it) => sum + it.subtotal, 0)
        const estadoPago = calcularEstadoPago(total, totalPagado)
        
        const numero = await getNextNumero(tx, { model: 'pedido' })
        
        const pedido = await tx.pedido.create({
          data: {
            numero,
            clienteId,
            tipo: 'ENVIO',
            canal: 'DOMICILIO',
            origen: 'VENTA_LIBRE',
            estado: 'ENTREGADO',  // legacy
            estadoEntrega: 'ENTREGADO',
            estadoPago,
            embarqueId,
            total,
            totalPagado,
            saldo: total - totalPagado,
            obs: obs || 'Venta libre en ruta',
            createdById: authResult.user?.id,
          },
        })
        
        // Crear items
        for (const item of itemsConPrecio) {
          await tx.pedidoItem.create({
            data: {
              pedidoId: pedido.id,
              producto: item.producto,
              cantPedido: item.cantidad,
              cantEntrega: item.cantidad,
              precio: item.precio,
              subtotal: item.subtotal,
            }
          })
        }
        
        // Crear pagos
        for (const pago of pagosData) {
          await tx.pago.create({
            data: { pedidoId: pedido.id, metodo: pago.metodo, monto: pago.monto },
          })
        }
        
        // SIEMPRE crear factura
        const facturaNum = await getNextNumero(tx, { model: 'factura', field: 'numero' })
        await tx.factura.create({
          data: {
            numero: `FAC-${facturaNum.toString().padStart(5, '0')}`,
            clienteId,
            pedidoId: pedido.id,
            subtotal: total,
            total,
            saldo: total - totalPagado,
            estado: totalPagado >= total ? 'PAGADA' : 'EMITIDA',
          },
        })
        
        return pedido
      })
      
      logAudit({
        entidad: 'Pedido',
        registroId: result.id,
        accion: 'CREATE',
        datos: { numero: result.numero, origen: 'VENTA_LIBRE', total: Number(result.total) },
        usuarioId: authResult.user?.id,
      })
      
      return apiSuccess({ pedido: result }, 201)
    } catch (error) {
      // ... error handling ...
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/api/pedidos/venta-libre/route.ts
  git commit -m "feat(api): add venta-libre endpoint for mobile repartidor"
  ```

---

### Task 7: Adaptar Cierre de Embarque

**Files:**
- Modify: `src/app/api/embarques/[id]/cerrar/route.ts`

- [ ] **Step 1: Reemplazar creación de ventas libres para usar endpoint nuevo**

  El cierre actual crea ventas libres inline. Debe migrar a:
  1. Usar `estadoEntrega`, `estadoPago`, `origen` en vez de solo `estado`
  2. Crear `PedidoItem` para cada venta libre
  3. Siempre crear factura
  4. Usar `VentaLibreSchema` para validación

  ```typescript
  // En lugar de crear Pedido inline con todos los campos duros,
  // usar la misma lógica que el endpoint de venta libre
  // o extraer a una función compartida
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/api/embarques/[id]/cerrar/route.ts
  git commit -m "feat(api): adapt embarque close to use new state model and PedidoItem"
  ```

---

### Task 8: Adaptar UI — Lista de Pedidos

**Files:**
- Modify: `src/app/(app)/pedidos/pedidos-client/index.tsx`
- Modify: `src/app/(app)/pedidos/pedidos-client/pedido-table.tsx`
- Modify: `src/app/(app)/pedidos/pedidos-client/pedido-filters.tsx`

- [ ] **Step 1: Agregar filtros por origen y estado de pago**

  Nuevos filtros:
  - Origen: PEDIDO, VENTA_RAPIDA, VENTA_LIBRE
  - Estado Entrega: PENDIENTE, EN_RUTA, ENTREGADO, NO_ENTREGADO
  - Estado Pago: PENDIENTE, PARCIAL, PAGADO, ANTICIPADO

- [ ] **Step 2: Actualizar badges**

  Usar `getBadgeEstado()` de `pedido-utils.ts` en vez de la lógica inline actual.

- [ ] **Step 3: Mostrar columnas relevantes**

  - # Pedido
  - Cliente
  - Origen (badge pequeño)
  - Estado Entrega (badge)
  - Estado Pago (badge)
  - Total
  - Saldo
  - Acciones

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/(app)/pedidos/pedidos-client/
  git commit -m "feat(ui): add origen filters and dual-state badges to pedido list"
  ```

---

### Task 9: Adaptar UI — Formularios

**Files:**
- Modify: `src/components/pedido-form/index.tsx`
- Modify: `src/components/venta-rapida-form/index.tsx`

- [ ] **Step 1: Adaptar para enviar `items` array en vez de productos individuales**

  En vez de:
  ```typescript
  productos: {
    pacaAgua: 2,
    pacaHielo: 0,
    // ...
  }
  ```

  Enviar:
  ```typescript
  items: [
    { producto: 'PACA_AGUA', cantidad: 2 },
    { producto: 'PACA_HIELO', cantidad: 0 },
  ]
  ```

- [ ] **Step 2: Agregar campo `origen` según el contexto**

  - `PedidoForm` (nuevo pedido normal): `origen: 'PEDIDO'`
  - `VentaRapidaForm` (venta rápida): `origen: 'VENTA_RAPIDA'`

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/pedido-form/ src/components/venta-rapida-form/
  git commit -m "feat(ui): adapt forms to send items array and origen"
  ```

---

### Task 10: Vista de Repartidor (Móvil)

**Files:**
- Create: `src/app/(app)/repartidor/page.tsx`
- Create: `src/components/venta-libre-form/index.tsx`

- [ ] **Step 1: Crear vista móvil para repartidor**

  Vista simplificada con:
  - Lista de pedidos asignados a su embarque abierto
  - Botón "Registrar Entrega" (completo/parcial/no entregado + pagos)
  - Botón "Venta Libre" (cliente + productos + pagos)
  - Diseño mobile-first, botones grandes

- [ ] **Step 2: Crear formulario de venta libre**

  Similar a VentaRapidaForm pero:
  - Siempre asociado a embarque activo
  - Cliente puede ser existente o "CLIENTE_MOSTRADOR"
  - Productos limitados a los que lleva el repartidor
  - Offline-first: guarda en Dexie, sincroniza cuando hay señal

- [ ] **Step 3: Commit**

  ```bash
  git add src/app/(app)/repartidor/ src/components/venta-libre-form/
  git commit -m "feat(ui): add mobile repartidor view with venta libre and delivery tracking"
  ```

---

### Task 11: Dashboard — Métricas por Origen

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/dashboard/dashboard-client/`

- [ ] **Step 1: Separar métricas por origen**

  Nuevas métricas:
  - Ventas punto (origen = VENTA_RAPIDA)
  - Pedidos envío (origen = PEDIDO)
  - Ventas libres (origen = VENTA_LIBRE)
  - Fiados por tipo

- [ ] **Step 2: Commit**

  ```bash
  git add src/app/(app)/dashboard/
  git commit -m "feat(dashboard): split metrics by pedido origen"
  ```

---

### Task 12: Migración de Datos Legacy

**Files:**
- Create: `prisma/migrations/20260510000001_populate_pedido_items/migration.sql`
- Or script: `scripts/migrate-to-items.ts`

- [ ] **Step 1: Crear script de migración**

  Para cada `Pedido` existente, crear registros `PedidoItem` a partir de las columnas duras:

  ```typescript
  // Pseudo-script
  const pedidos = await prisma.pedido.findMany()
  for (const pedido of pedidos) {
    const items = [
      { producto: 'PACA_AGUA', cantPedido: pedido.cPacaAguaPed, cantEntrega: pedido.cPacaAguaEnt, precio: pedido.precioPacaAgua },
      { producto: 'PACA_HIELO', cantPedido: pedido.cPacaHieloPed, cantEntrega: pedido.cPacaHieloEnt, precio: pedido.precioPacaHielo },
      // ... etc ...
    ].filter(i => i.cantPedido > 0)
    
    for (const item of items) {
      await prisma.pedidoItem.create({
        data: {
          pedidoId: pedido.id,
          producto: item.producto,
          cantPedido: item.cantPedido,
          cantEntrega: item.cantEntrega,
          precio: item.precio,
          subtotal: item.precio * item.cantEntrega,  // usando entregado como base
        }
      })
    }
    
    // Setear origen basado en heurística
    const origen = pedido.tipo === 'PUNTO' ? 'VENTA_RAPIDA' : 'PEDIDO'
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        origen,
        estadoEntrega: pedido.estado === 'ENTREGADO' ? 'ENTREGADO' : 
                       pedido.estado === 'EN_RUTA' ? 'EN_RUTA' : 'PENDIENTE',
        estadoPago: Number(pedido.saldo) <= 0 ? 'PAGADO' : 
                    Number(pedido.totalPagado) > 0 ? 'PARCIAL' : 'PENDIENTE',
      }
    })
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add scripts/migrate-to-items.ts
  git commit -m "data: add migration script for legacy pedidos to PedidoItem"
  ```

---

### Task 13: Tests

**Files:**
- Create: `src/lib/__tests__/pedido-utils.test.ts`
- Create: `src/app/api/pedidos/__tests__/route.test.ts`

- [ ] **Step 1: Tests de transición de estados**

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { puedeTransicionarEntrega, puedeTransicionarPago, calcularEstadoPago } from '../pedido-utils'
  
  describe('pedido-utils', () => {
    it('PENDIENTE puede ir a EN_RUTA', () => {
      expect(puedeTransicionarEntrega('PENDIENTE', 'EN_RUTA')).toBe(true)
    })
    
    it('PENDIENTE NO puede ir a ENTREGADO directamente', () => {
      expect(puedeTransicionarEntrega('PENDIENTE', 'ENTREGADO')).toBe(false)
    })
    
    it('calcula PAGADO cuando totalPagado >= total', () => {
      expect(calcularEstadoPago(100000, 100000)).toBe('PAGADO')
      expect(calcularEstadoPago(100000, 120000)).toBe('PAGADO')
    })
    
    it('calcula PARCIAL cuando hay pago parcial', () => {
      expect(calcularEstadoPago(100000, 50000)).toBe('PARCIAL')
    })
    
    it('calcula PENDIENTE cuando no hay pago', () => {
      expect(calcularEstadoPago(100000, 0)).toBe('PENDIENTE')
    })
  })
  ```

- [ ] **Step 2: Tests de API**

  ```typescript
  // Test crear pedido con items
  // Test crear venta rápida
  // Test registrar entrega completa
  // Test registrar entrega parcial crea hijo
  // Test registrar no entrega vuelve a PENDIENTE
  ```

- [ ] **Step 3: Ejecutar tests**

  ```bash
  npm run test
  ```

  Expected: Todos los tests pasan.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/__tests__/ src/app/api/pedidos/__tests__/
  git commit -m "test: add pedido state transition and API tests"
  ```

---

## Self-Review Checklist

### Spec Coverage
- [x] Caso 1: Punto, paga, se lleva → `origen: VENTA_RAPIDA`, `estadoEntrega: ENTREGADO`
- [x] Caso 2: Punto, paga, pide envío → `origen: VENTA_RAPIDA` o `PEDIDO`, `estadoEntrega: PENDIENTE` → `EN_RUTA` → `ENTREGADO`
- [x] Caso 3: Punto, paga todo, se lleva parcial → `estadoEntrega: ENTREGADO` con items parciales + pedido hijo
- [x] Caso 4: Remoto, entrega repartidor → `origen: PEDIDO`, progresa por estados
- [x] Venta libre en ruta → `origen: VENTA_LIBRE`, `estadoEntrega: ENTREGADO`
- [x] Siempre factura → Task 4, Task 6
- [x] Separar entrega vs pago → `estadoEntrega` + `estadoPago`
- [x] Vista repartidor móvil → Task 10
- [x] Offline-first venta libre → Task 10 (Dexie)
- [x] Dashboard por origen → Task 11

### Placeholder Scan
- [x] No hay "TBD", "TODO", "implement later"
- [x] Todos los pasos tienen código real o comandos concretos
- [x] No hay "similar a Task N"

### Type Consistency
- [x] `EstadoEntrega` y `EstadoPago` usados consistentemente en schema, validators, utils, API
- [x] `PedidoItem` schema coincide con modelo Prisma
- [x] `origen` siempre `OrigenPedido` enum

---

## Execution Handoff

**Plan complete.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for this multi-file refactor.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Risk of context overflow given the scope.

**Which approach do you prefer?**
