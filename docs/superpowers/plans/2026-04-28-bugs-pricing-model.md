# Agua Bambu v2 — Bugs + Modelo de Precios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix data inconsistencies (gastos/embarques/insumos/reportes) and restructure the product catalog to match the real business model with volume pricing, punto vs domicilio channels, and client-specific overrides.

**Architecture:** Replace the current flat 6-product model with a proper product catalog table. Add a volume pricing table with quantity tiers and channel types. Pedido keeps embedded product quantities but references the pricing engine for calculation. Client model gets a `preciosEspeciales` JSON field for per-client overrides.

**Tech Stack:** Prisma PostgreSQL, Next.js 16 Server/Client Components, Zod validation, Sonner toasts.

---

## Part A: Bug Fixes (Quick)

### Task A1: Fix gastos page — filter by today

The gastos page fetches ALL gastos (no date filter) while dashboard correctly filters to today.

**Files:**
- Modify: `src/app/(app)/gastos/page.tsx`

- [ ] **Step 1: Add today's date as default filter**

In `gastos/page.tsx`, change the `fetchGastos` function to pass today's date:

```tsx
// Before:
const res = await fetch('/api/gastos')

// After:
const today = new Date().toISOString().split('T')[0]
const res = await fetch(`/api/gastos?fecha=${today}`)
```

- [ ] **Step 2: Add "Ver todos" toggle**

Add a state `showAll` and a button to toggle between today vs all gastos:

```tsx
const [showAll, setShowAll] = useState(false)

// In fetchGastos:
const url = showAll ? '/api/gastos?all=true' : `/api/gastos?fecha=${today}`

// In JSX, add toggle button next to "Nuevo Gasto":
<button onClick={() => { setShowAll(!showAll); fetchGastos() }}>
  {showAll ? 'Solo Hoy' : 'Ver Todos'}
</button>
```

- [ ] **Step 3: Verify** — Reload gastos page, should only show today's gastos by default.

---

### Task A2: Fix insumos Total Stock — show per-unit breakdown

**Files:**
- Modify: `src/app/(app)/insumos/insumos-client.tsx`

- [ ] **Step 1: Replace meaningless total with per-unit breakdown**

Replace the single "Total Stock" card with grouped stats:

```tsx
// Group insumos by unit
const stockByUnit = insumos.reduce((acc, i) => {
  const unit = i.unidad || 'UNIDAD'
  acc[unit] = (acc[unit] || 0) + Number(i.stock)
  return acc
}, {} as Record<string, number>)

// Render per-unit cards instead of single total
{Object.entries(stockByUnit).map(([unit, total]) => (
  <Card key={unit} className="bg-muted">
    <CardContent className="p-4 text-center">
      <div className="text-2xl font-bold">{total.toLocaleString()}</div>
      <div className="text-sm text-muted-foreground">{unit}</div>
    </CardContent>
  </Card>
))}
```

- [ ] **Step 2: Verify** — Insumos page should show separate totals per unit type.

---

### Task A3: Fix reportes — add date range picker

**Files:**
- Modify: `src/app/(app)/reportes/page.tsx` — convert to SC+CC pattern with date params

- [ ] **Step 1: Add searchParams for date range**

The reportes page is currently a Server Component with no date filter. Add `searchParams` to accept `start` and `end` dates, defaulting to today:

```tsx
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const params = await searchParams
  const start = params.start || new Date().toISOString().split('T')[0]
  const end = params.end || start
  
  const startDate = new Date(start + 'T00:00:00.000Z')
  const endDate = new Date(end + 'T23:59:59.999Z')
  
  // Use startDate/endDate in all queries
}
```

- [ ] **Step 2: Add client-side date picker component**

Create a small client component `reportes-filter.tsx` with two date inputs that update URL searchParams via router.push:

```tsx
'use client'
export function ReportesFilter({ start, end }: { start: string; end: string }) {
  // Two date inputs, onChange -> router.push(`/reportes?start=${s}&end=${e}`)
}
```

- [ ] **Step 3: Verify** — Reportes page should show data for selected date range.

---

### Task A4: Fix timezone — use Colombia local time

**Files:**
- Create: `src/lib/dates.ts` — centralized date helper
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/api/embarques/route.ts`
- Modify: `src/app/api/gastos/route.ts`
- Modify: `src/app/api/pedidos/route.ts`

- [ ] **Step 1: Create date helper**

```ts
// src/lib/dates.ts
const TIMEZONE = 'America/Bogota'

export function getTodayRange(): { startOfDay: Date; endOfDay: Date } {
  const now = new Date()
  // Get today in Colombia timezone
  const colombiaDate = now.toLocaleDateString('en-CA', { timeZone: TIMEZONE }) // YYYY-MM-DD
  const startOfDay = new Date(colombiaDate + 'T00:00:00-05:00')
  const endOfDay = new Date(colombiaDate + 'T23:59:59.999-05:00')
  return { startOfDay, endOfDay }
}

export function getDateRange(start: string, end: string): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(start + 'T00:00:00-05:00'),
    endDate: new Date(end + 'T23:59:59.999-05:00'),
  }
}
```

- [ ] **Step 2: Replace UTC date logic in dashboard and APIs**

Replace all `new Date(today + 'T00:00:00.000Z')` patterns with `getTodayRange()`.

- [ ] **Step 3: Verify** — Dashboard embarques count should match embarques page.

---

## Part B: Product Catalog & Volume Pricing

### Task B1: New Prisma schema for products and pricing

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Producto and PrecioVolumen models**

```prisma
model Producto {
  id          String   @id @default(cuid())
  codigo      String   @unique  // PACA_AGUA, PACA_HIELO, BOTELLON_FAB, BOTELLON_DOM, BOLSA_AGUA, BOLSA_HIELO
  nombre      String            // "Paca de Agua (40u 300ml)"
  descripcion String?
  unidad      String            // "paca", "unidad"
  contenido   String?           // "40 bolsas x 300ml"
  activo      Boolean  @default(true)
  
  precios     PrecioVolumen[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model PrecioVolumen {
  id          String   @id @default(cuid())
  productoId  String
  producto    Producto @relation(fields: [productoId], references: [id])
  
  canal       String   // PUNTO, DOMICILIO
  cantMin     Int      @default(1)    // Minimum quantity for this tier
  cantMax     Int?                     // null = unlimited (10+)
  precio      Decimal  @db.Decimal(10, 2)
  
  activo      Boolean  @default(true)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([productoId])
  @@index([canal])
  @@unique([productoId, canal, cantMin])
}
```

- [ ] **Step 2: Add preciosEspeciales to Cliente**

```prisma
// In model Cliente, add:
preciosEspeciales String? // JSON: { "PACA_AGUA": 2600, "BOTELLON_DOM": 9000 }
```

- [ ] **Step 3: Update Pedido model**

Replace the current product fields with the new catalog:

```prisma
// Replace cAguaPed/cAguaEnt/precioAgua etc with:
cPacaAguaPed      Int     @default(0)
cPacaAguaEnt      Int     @default(0)
precioPacaAgua    Decimal @default(0) @db.Decimal(10, 2)

cPacaHieloPed     Int     @default(0)
cPacaHieloEnt     Int     @default(0)
precioPacaHielo   Decimal @default(0) @db.Decimal(10, 2)

cBotellonFabPed   Int     @default(0)
cBotellonFabEnt   Int     @default(0)
precioBotellonFab Decimal @default(0) @db.Decimal(10, 2)

cBotellonDomPed   Int     @default(0)
cBotellonDomEnt   Int     @default(0)
precioBotellonDom Decimal @default(0) @db.Decimal(10, 2)

cBolsaAguaPed     Int     @default(0)
cBolsaAguaEnt     Int     @default(0)
precioBolsaAgua   Decimal @default(0) @db.Decimal(10, 2)

cBolsaHieloPed    Int     @default(0)
cBolsaHieloEnt    Int     @default(0)
precioBolsaHielo  Decimal @default(0) @db.Decimal(10, 2)
```

- [ ] **Step 4: Run prisma db push and regenerate**

```bash
npx prisma db push
npx prisma generate
```

- [ ] **Step 5: Seed default products and prices**

Add to `prisma/seed.ts`:

```ts
// Products
const productos = [
  { codigo: 'PACA_AGUA', nombre: 'Paca de Agua (40u 300ml)', unidad: 'paca', contenido: '40 bolsas x 300ml' },
  { codigo: 'PACA_HIELO', nombre: 'Paca de Hielo (20u 600ml)', unidad: 'paca', contenido: '20 bolsas x 600ml' },
  { codigo: 'BOTELLON_FAB', nombre: 'Botellón Fábrica 20LT', unidad: 'unidad' },
  { codigo: 'BOTELLON_DOM', nombre: 'Botellón Domicilio 20LT', unidad: 'unidad' },
  { codigo: 'BOLSA_AGUA', nombre: 'Bolsa de Agua 300ml', unidad: 'unidad' },
  { codigo: 'BOLSA_HIELO', nombre: 'Bolsa de Hielo 600ml', unidad: 'unidad' },
]

// Volume prices for Paca Agua
// PUNTO: 1-4 = 2800, 5-9 = 2500, 10+ = 2300
// DOMICILIO: 1-4 = 3000, 5-9 = 2500, 10+ = 2300
// Paca Hielo: always 2500
// Botellon Fab: 7500, Botellon Dom: 10000
// Bolsa Agua: 300, Bolsa Hielo: 500
```

---

### Task B2: Pricing engine

**Files:**
- Create: `src/lib/pricing.ts`

- [ ] **Step 1: Create pricing engine**

```ts
export interface PrecioResuelto {
  productoId: string
  codigo: string
  precio: number
  cantidad: number
  subtotal: number
  tier: string // "1-4", "5-9", "10+"
}

export async function resolverPrecio(
  productoCode: string,
  cantidad: number,
  canal: 'PUNTO' | 'DOMICILIO',
  clienteOverrides?: Record<string, number> | null,
  precioManual?: number | null,
): Promise<number> {
  // Priority: precioManual > clienteOverrides > PrecioVolumen tier > fallback
  if (precioManual) return precioManual
  if (clienteOverrides?.[productoCode]) return clienteOverrides[productoCode]
  
  // Look up volume pricing from DB
  const tier = await prisma.precioVolumen.findFirst({
    where: {
      producto: { codigo: productoCode },
      canal,
      cantMin: { lte: cantidad },
      OR: [
        { cantMax: { gte: cantidad } },
        { cantMax: null }, // unlimited tier
      ],
      activo: true,
    },
    orderBy: { cantMin: 'desc' }, // Most specific tier first
  })
  
  return tier ? Number(tier.precio) : 0
}
```

---

### Task B3: Update PedidoForm with new products

**Files:**
- Modify: `src/components/pedido-form.tsx`
- Modify: `src/app/api/pedidos/route.ts`

- [ ] **Step 1: Update product list in form**

Replace the 6-product `productoInfo` with the new catalog. Add a `canal` selector (Punto/Domicilio) that affects pricing dynamically.

- [ ] **Step 2: Show live price based on quantity + canal**

As user changes quantity or canal, call a pricing API to get the resolved price per product.

- [ ] **Step 3: Allow manual price override**

Add an "edit" icon next to each price that allows typing a custom price (for client-specific deals).

- [ ] **Step 4: Update backend calculateTotal**

Replace `getPrecios` and `calculateTotal` with calls to the pricing engine.

---

### Task B4: Update precios config page

**Files:**
- Modify: `src/app/(app)/precios/page.tsx`

- [ ] **Step 1: Show pricing table**

Display a table with columns: Producto | Canal | 1-4 | 5-9 | 10+ | Editar

Each cell shows the current price and is editable. Changes save to `PrecioVolumen` table.

- [ ] **Step 2: Add flat-price products**

For products without volume tiers (bolsas, botellones), show a simpler single-price input.

---

### Task B5: Update dashboard and other pages

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx` — update product aggregation to new field names
- Modify: `src/app/api/cierre/route.ts` — update product field references
- Modify: `src/app/(app)/cierre/page.tsx` — update product display

---

## Part C: Verification

### Task C1: TypeScript + E2E

- [ ] **Step 1:** Run `npx tsc --noEmit` — must pass with 0 errors
- [ ] **Step 2:** Run `npx playwright test` — all tests must pass
- [ ] **Step 3:** Commit all changes

---

## Execution Order

1. A1-A4 (bug fixes) — can run in parallel
2. B1 (schema) — must be first in Part B
3. B2 (pricing engine) — depends on B1
4. B3 (PedidoForm) — depends on B2
5. B4 (precios page) — depends on B1
6. B5 (dashboard updates) — depends on B1
7. C1 (verification) — last
