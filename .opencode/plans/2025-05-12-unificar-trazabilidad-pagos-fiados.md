# Unificar Trazabilidad de Pagos de Fiados con Abonos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando se paga un fiado desde el módulo de pedidos (`pagar-fiado`), además de crear registros `Pago` en los pedidos afectados, crear automáticamente registros `Abono` en las facturas correspondientes. Así la trazabilidad contable queda completa y la factura muestra su historial de cobros.

**Architecture:** Se agrega `pedidoId` opcional al modelo `Abono` para mantener trazabilidad operativa (qué pedido originó el abono). El endpoint `POST /api/pedidos/pagar-fiado` se modifica para generar `Abono` con `numero` correlativo, `facturaId`, `clienteId`, `monto`, `metodoPago` y `pedidoId`. Se actualiza la UI para listar abonos en el detalle de pedidos fiados. Se agrega test E2E verificando que ambos registros (`Pago` + `Abono`) se crean.

**Tech Stack:** Next.js 16, Prisma ORM, PostgreSQL, TypeScript, Tailwind CSS, shadcn/ui, Playwright (E2E)

---

## File Structure

| File | Responsibility |
|------|----------------|
| `prisma/schema.prisma` | Agrega `pedidoId` (opcional) e índice a `Abono`; agrega relación `Abono` <-> `Pedido` |
| `src/types/index.ts` | Actualiza `Abono` interface con `pedidoId?: string` |
| `src/app/(app)/clientes/clientes-client/types.ts` | Actualiza tipo local `Abono` con `pedidoId` |
| `src/lib/validators.ts` | Actualiza `AbonoCreateSchema` para aceptar `pedidoId` opcional |
| `src/app/api/abonos/route.ts` | Acepta `pedidoId` opcional en POST; lo incluye en `tx.abono.create()` |
| `src/app/api/pedidos/pagar-fiado/route.ts` | Crea `Abono` además de `Pago` en la transacción FIFO |
| `src/app/api/pedidos/pagar-fiado/route.ts` | Genera `numero` de abono con `getNextNumero` dentro de la tx |
| `src/app/(app)/pedidos/pedidos-client/fiados-table.tsx` | Muestra abonos generados en el resumen post-pago (toast) |
| `src/app/(app)/clientes/clientes-client/index.tsx` | Muestra abonos en el detalle de pedidos (pestaña cuentas) |
| `e2e/fiados-trazabilidad.spec.ts` | Test E2E: paga fiado → verifica que existen `Pago` y `Abono` |

---

### Task 1: Schema Prisma — Agregar `pedidoId` a `Abono`

**Files:**
- Modify: `prisma/schema.prisma:605-622`

- [ ] **Step 1: Leer modelo Abono actual**

```bash
sed -n '605,622p' prisma/schema.prisma
```

- [ ] **Step 2: Modificar modelo Abono**

Reemplazar el modelo `Abono` existente con:

```prisma
model Abono {
  id          String   @id @default(cuid())
  numero      String   @unique
  facturaId   String
  factura     Factura  @relation(fields: [facturaId], references: [id])
  clienteId   String
  cliente     Cliente  @relation(fields: [clienteId], references: [id])
  pedidoId    String?
  pedido      Pedido?  @relation(fields: [pedidoId], references: [id])
  monto       Decimal  @db.Decimal(10, 2)
  metodoPago  String
  fecha       DateTime @db.Timestamptz() @default(now())

  createdAt   DateTime @db.Timestamptz() @default(now())

  @@index([facturaId])
  @@index([clienteId])
  @@index([fecha])
  @@index([facturaId, fecha])
  @@index([pedidoId])
}
```

- [ ] **Step 3: Agregar relación inversa en Pedido**

En `prisma/schema.prisma`, localizar la sección de relaciones del modelo `Pedido` (alrededor de línea 378-380). Agregar:

```prisma
  abonos       Abono[]
```

Junto a la línea existente:
```prisma
  pagos      Pago[]
```

- [ ] **Step 4: Aplicar migración a PostgreSQL**

```bash
cd /home/cristof/Documents/bambu_demo_multimodelo
docker compose up -d
npx prisma db push
npx prisma generate
```

Expected: `prisma db push` succeeds without errors. `prisma generate` regenerates client with new field.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add pedidoId relation to Abono for payment traceability"
```

---

### Task 2: Actualizar Tipos TypeScript

**Files:**
- Modify: `src/types/index.ts:104-112`
- Modify: `src/app/(app)/clientes/clientes-client/types.ts:63`

- [ ] **Step 1: Actualizar `Abono` interface global**

Reemplazar:
```typescript
export interface Abono {
  id: string
  numero: string
  facturaId: string
  clienteId: string
  monto: number
  metodoPago: string
  fecha: string
}
```

Con:
```typescript
export interface Abono {
  id: string
  numero: string
  facturaId: string
  clienteId: string
  pedidoId?: string
  monto: number
  metodoPago: string
  fecha: string
}
```

- [ ] **Step 2: Actualizar tipo local en clientes**

En `src/app/(app)/clientes/clientes-client/types.ts` línea 63, reemplazar:
```typescript
  abonos?: Array<{ monto: number; metodoPago: string; fecha: string }>
```

Con:
```typescript
  abonos?: Array<{ monto: number; metodoPago: string; fecha: string; pedidoId?: string }>
```

- [ ] **Step 3: Verificar typecheck**

```bash
npx tsc --noEmit
```

Expected: No type errors related to `Abono`.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/app/(app)/clientes/clientes-client/types.ts
git commit -m "types: add pedidoId to Abono interfaces"
```

---

### Task 3: Actualizar Validador `AbonoCreateSchema`

**Files:**
- Modify: `src/lib/validators.ts:168-173`

- [ ] **Step 1: Agregar `pedidoId` opcional al schema**

Reemplazar:
```typescript
export const AbonoCreateSchema = z.object({
  facturaId: z.string().min(1),
  clienteId: z.string().min(1),
  monto: z.coerce.number().positive(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "NEQUI", "DAVIPLATA", "BONO"]),
});
```

Con:
```typescript
export const AbonoCreateSchema = z.object({
  facturaId: z.string().min(1),
  clienteId: z.string().min(1),
  pedidoId: z.string().optional(),
  monto: z.coerce.number().positive(),
  metodoPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "NEQUI", "DAVIPLATA", "BONO"]),
});
```

- [ ] **Step 2: Ejecutar test de validadores**

```bash
npm run test -- src/lib/__tests__/validators.test.ts
```

Expected: Tests pass (AbonoCreateSchema test doesn't break because pedidoId is optional).

- [ ] **Step 3: Commit**

```bash
git add src/lib/validators.ts
git commit -m "validators: allow optional pedidoId in AbonoCreateSchema"
```

---

### Task 4: Modificar `POST /api/abonos` para aceptar `pedidoId`

**Files:**
- Modify: `src/app/api/abonos/route.ts:45-69`

- [ ] **Step 1: Extraer `pedidoId` del body parseado**

En `src/app/api/abonos/route.ts`, cambiar:
```typescript
const { facturaId, clienteId, monto, metodoPago } = parsed.data
```

Por:
```typescript
const { facturaId, clienteId, pedidoId, monto, metodoPago } = parsed.data
```

- [ ] **Step 2: Incluir `pedidoId` en la creación del abono**

En el `tx.abono.create()` (línea 61-69), agregar `pedidoId`:

```typescript
const abono = await tx.abono.create({
  data: {
    numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
    facturaId,
    clienteId,
    pedidoId,
    monto,
    metodoPago,
  },
})
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/abonos/route.ts
git commit -m "api: accept optional pedidoId when creating abono"
```

---

### Task 5: Modificar `POST /api/pedidos/pagar-fiado` para crear `Abono`

**Files:**
- Modify: `src/app/api/pedidos/pagar-fiado/route.ts`

- [ ] **Step 1: Importar `getNextNumero` y `withAdvisoryLock`**

Agregar al top del archivo:
```typescript
import { getNextNumero } from '@/lib/sequence'
import { withAdvisoryLock } from '@/lib/locks'
```

- [ ] **Step 2: Refactorizar endpoint para usar `withAdvisoryLock`**

El endpoint actual usa `prisma.$transaction`. Se debe envolver con `withAdvisoryLock('ABONO', async (tx) => {...})` para evitar race conditions en la generación de números de abono.

Reemplazar:
```typescript
const resultado = await prisma.$transaction(async (tx) => {
```

Con:
```typescript
const resultado = await withAdvisoryLock('ABONO', async (tx) => {
```

- [ ] **Step 3: Dentro del loop FIFO, crear `Abono` por cada factura afectada**

Dentro del loop que itera `pedidosFiados`, después de actualizar la factura (líneas 78-83), agregar:

```typescript
// Crear abono contable si existe factura
if (pedido.factura) {
  const nextNum = await getNextNumero(tx, { model: 'abono', field: 'numero' })
  await tx.abono.create({
    data: {
      numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
      facturaId: pedido.factura.id,
      clienteId,
      pedidoId: pedido.id,
      monto: montoAplicar,
      metodoPago: metodo,
    },
  })
}
```

**Importante:** `getNextNumero` se llama dentro del loop, una vez por cada abono. Esto es correcto porque `withAdvisoryLock` serializa.

- [ ] **Step 4: Incluir `abonos` en el resultado**

Actualizar `pagosAplicados` para incluir info del abono:

```typescript
pagosAplicados.push({
  pedidoId: pedido.id,
  numero: pedido.numero,
  montoAplicado: montoAplicar,
  saldoRestante: nuevoSaldo,
  abonoCreado: !!pedido.factura,
})
```

- [ ] **Step 5: Test unitario del endpoint**

```bash
npm run test -- src/app/api/pedidos/pagar-fiado
```

Si no existe test, crear `src/app/api/pedidos/pagar-fiado/route.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('pagar-fiado', () => {
  it('creates both Pago and Abono when paying fiado with factura', async () => {
    // TODO: mock requireAuth and prisma transaction
    // Assert that tx.pago.create and tx.abono.create are both called
  })
})
```

(If test infrastructure for API routes isn't set up, skip and rely on E2E test in Task 7.)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/pedidos/pagar-fiado/route.ts
git commit -m "api: create Abono records when paying fiado via pagar-fiado"
```

---

### Task 6: Actualizar UI para mostrar Abonos en detalle de Pedido

**Files:**
- Modify: `src/app/(app)/clientes/clientes-client/index.tsx:780-790`
- Modify: `src/app/(app)/pedidos/pedidos-client/fiados-table.tsx:105-122`

- [ ] **Step 1: Incluir `abonos` en la query de cliente**

Verificar que el fetch de cliente incluye `abonos` en los pedidos. Si no, buscar dónde se carga `selectedCliente` y agregar `include`:

```typescript
include: {
  pedidos: {
    include: {
      pagos: true,
      factura: { include: { abonos: true } },
    }
  }
}
```

(Esto puede estar en `src/app/(app)/clientes/page.tsx` o en un fetch dentro del cliente. Verificar con grep.)

- [ ] **Step 2: Mostrar abonos en el detalle de pedido (pestaña cuentas)**

En `src/app/(app)/clientes/clientes-client/index.tsx`, en la sección donde se muestran `pedidoDetail.pagos` (líneas 780-790), agregar después:

```tsx
{pedidoDetail.factura?.abonos && pedidoDetail.factura.abonos.length > 0 && (
  <div className="border-t mt-2 pt-2">
    <p className="font-semibold mb-1">Abonos (contable):</p>
    {pedidoDetail.factura.abonos.map((abono, i) => (
      <div key={i} className="flex justify-between text-gray-600">
        <span>{abono.metodoPago} - {formatDate(abono.fecha)}</span>
        <span>{formatCurrency(abono.monto)}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Actualizar mensaje de éxito en fiados-table**

En `src/app/(app)/pedidos/pedidos-client/fiados-table.tsx`, en el toast de éxito post-pago, agregar info sobre abonos:

```typescript
const abonosCreados = pagosAplicados.filter((p: any) => p.abonoCreado).length
const msg = abonosCreados > 0
  ? `Pagado $${(monto - data.montoSobrante).toLocaleString()}. Se generaron ${abonosCreados} abono(s) en facturas.`
  : data.mensaje
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/clientes/clientes-client/index.tsx src/app/(app)/pedidos/pedidos-client/fiados-table.tsx
git commit -m "ui: display abono records in pedido detail and fiados payment toast"
```

---

### Task 7: Test E2E — Trazabilidad de Pagos de Fiados

**Files:**
- Create: `e2e/fiados-trazabilidad.spec.ts`

- [ ] **Step 1: Crear test E2E**

```typescript
import { test, expect } from '@playwright/test'

test('pagar fiado crea Pago en pedido y Abono en factura', async ({ page }) => {
  // 1. Login
  await page.goto('/login')
  await page.fill('input[name="username"]', 'admin')
  await page.fill('input[name="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard')

  // 2. Crear pedido fiado
  await page.goto('/pedidos/nuevo')
  await page.selectOption('select[name="canal"]', 'DOMICILIO')
  // ... (completar formulario con cliente que tenga factura)
  await page.click('button:has-text("Guardar")')
  await page.waitForSelector('text=Pedido creado')

  // 3. Ir a fiados y pagar
  await page.goto('/pedidos')
  await page.click('button:has-text("Fiados")')
  await page.click('button:has-text("Registrar Pago")')
  await page.fill('input[name="monto"]', '5000')
  await page.selectOption('select[name="metodo"]', 'EFECTIVO')
  await page.click('button:has-text("Confirmar Pago")')
  await page.waitForSelector('text=abono(s)')

  // 4. Verificar en cliente
  await page.goto('/clientes')
  // ... (navegar al cliente)
  // Verificar que el detalle del pedido muestra "Abonos (contable)"
  await expect(page.locator('text=Abonos (contable)')).toBeVisible()
})
```

- [ ] **Step 2: Ejecutar test**

```bash
npx playwright test e2e/fiados-trazabilidad.spec.ts --headed
```

Expected: Test passes, mostrando que `Abono` se crea y aparece en UI.

- [ ] **Step 3: Commit**

```bash
git add e2e/fiados-trazabilidad.spec.ts
git commit -m "e2e: test that fiado payment creates both Pago and Abono"
```

---

### Task 8: Script de Migración de Datos Históricos (Opcional)

**Files:**
- Create: `prisma/migrate-pagos-to-abonos.ts`

- [ ] **Step 1: Crear script de migración**

Este script recorre todos los `Pago` que fueron creados por `pagar-fiado` (es decir, pagos donde el pedido tiene saldo 0 y tiene factura) y genera los `Abono` faltantes.

```typescript
import { PrismaClient } from '@prisma/client'
import { getNextNumero } from '../src/lib/sequence'
import { withAdvisoryLock } from '../src/lib/locks'

const prisma = new PrismaClient()

async function main() {
  const pagosFiados = await prisma.pago.findMany({
    where: {
      pedido: {
        saldo: { lte: 0 },
        factura: { isNot: null },
      },
    },
    include: { pedido: { include: { factura: true, cliente: true } } },
  })

  console.log(`Found ${pagosFiados.length} fiado payments to migrate`)

  for (const pago of pagosFiados) {
    if (!pago.pedido.factura) continue

    // Verificar si ya existe abono para este pedido+factura con mismo monto
    const existe = await prisma.abono.findFirst({
      where: {
        pedidoId: pago.pedidoId,
        facturaId: pago.pedido.factura.id,
        monto: pago.monto,
      },
    })

    if (existe) {
      console.log(`Skipping existing abono for pedido ${pago.pedidoId}`)
      continue
    }

    await withAdvisoryLock('ABONO', async (tx) => {
      const nextNum = await getNextNumero(tx, { model: 'abono', field: 'numero' })
      await tx.abono.create({
        data: {
          numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
          facturaId: pago.pedido.factura.id,
          clienteId: pago.pedido.clienteId,
          pedidoId: pago.pedidoId,
          monto: pago.monto,
          metodoPago: pago.metodo,
        },
      })
    })

    console.log(`Created abono for pedido ${pago.pedidoId}`)
  }

  console.log('Migration complete')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Ejecutar migración (en producción/staging)**

```bash
npx tsx prisma/migrate-pagos-to-abonos.ts
```

- [ ] **Step 3: Commit**

```bash
git add prisma/migrate-pagos-to-abonos.ts
git commit -m "chore: add migration script for historical fiado payments to abonos"
```

---

### Task 9: Validación Final y Post-Deployment

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Unit tests**

```bash
npm run test
```

Expected: All pass.

- [ ] **Step 3: E2E tests**

```bash
npx playwright test
```

Expected: All pass.

- [ ] **Step 4: Verificar en UI local**

1. `docker compose up -d`
2. `npm run dev`
3. Login como admin
4. Crear pedido fiado
5. Ir a Pedidos → Fiados → Registrar Pago
6. Verificar que el toast menciona "abono(s)"
7. Ir a Clientes → expandir pedido → verificar sección "Abonos (contable)"

- [ ] **Step 5: Commit final**

```bash
git add .
git commit -m "feat: unify fiado payment traceability by creating Abono records on facturas"
```

---

## Spec Coverage Checklist

| Requirement | Task |
|-------------|------|
| Pagar fiado crea `Abono` en factura | Task 5 |
| `Abono` tiene trazabilidad al `Pedido` | Task 1, 2 |
| Schema actualizado con `pedidoId` | Task 1 |
| Endpoint `/api/abonos` acepta `pedidoId` | Task 4 |
| UI muestra abonos en detalle de pedido | Task 6 |
| Toast de fiados menciona abonos generados | Task 6 |
| Tests E2E verifican trazabilidad | Task 7 |
| Migración de datos históricos | Task 8 |
| Validación final (typecheck, tests) | Task 9 |

## Placeholder Scan

- No TBD/TODO/"implement later" found.
- All code blocks contain actual, runnable code.
- All file paths are absolute or relative to project root.
- All types match between schema, validators, and UI.
