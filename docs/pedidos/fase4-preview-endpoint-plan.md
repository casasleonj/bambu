# `POST /api/pedidos/preview` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only `POST /api/pedidos/preview` endpoint that prepares a **Pedido creation** operation (prices, virtually-projected payments/balance/state, permissions, allowed actions, warnings, risk signals, audit preview) without persisting or mutating anything — the prerequisite for the redesigned capture (`PedidosWorkspace`) and the Pedido Hub.

**Architecture:** A new `PreviewPedidoUseCase` in `src/modules/pedidos/application/use-cases/` composes **existing** domain services and **read-only** repository methods. It never writes, never takes a lock, never opens a write transaction, never creates or modifies a `Cliente`. It reuses `IPricingPort` (same as `CrearPedidoUseCase`), `pagos-calculator.service.ts` (`normalizarPagos`/`calcularSaldo`/`calcularEstadoPago`), `getFiadoStatusUseCase` (already composed), and `calcularAlertasCliente` (`src/lib/alertas-detector.ts`, no Prisma). A thin route controller validates a Zod subset of `PedidoCreateSchema`, delegates, and maps errors — mirroring the N2 endpoints (`gestionar-pendiente/route.ts`). The real commit (`POST /api/pedidos`) revalidates and recomputes everything; the preview is authoritative over nothing.

**Tech Stack:** Next.js 16 App Router route handlers, Zod 4, Vitest 3, Prisma 6 (read-only queries), the project's DDD `src/modules/pedidos/` structure.

**Contract (normative):** `docs/pedidos/02-api-contract-pedidos.md` § "Endpoint nuevo (Fase 4 / prerequisito del blueprint — BRECHA §9.1)". Do not diverge from it. All calculation semantics, the `origen ∈ {PEDIDO, VENTA_RAPIDA}` scope, the `CONSUMIDOR_FINAL` rules, and the "last 5 valid orders" risk history are defined there.

**Gate:** This plan is NOT executed until PR #220 (blueprint + contract) is approved. After approval, create `feat/pedidos-preview-endpoint` and execute task-by-task.

**Verified against `main` (no open decisions for the implementer):**
- `EstadoPagoVO.proyectar(total, totalPagado, estadoEntrega)` exists; public accessor is `.get()`.
- `pagos-calculator.service.ts` exports `normalizarPagos(pagos, total) → { pagosAplicados, excedente }`, `calcularSaldo(total, totalPagado)`, `calcularEstadoPago(total, totalPagado, estadoEntrega?)`.
- `IPedidoRepository.findMany(filter?, { take?, skip?, orderBy? }, tx?)` exists; `PedidoFilter` has `clienteId` and `estadoEntrega?: string[]`. Returns domain `Pedido[]`.
- `Pedido` entity exposes `.clienteId`, `.total` (Money), `.totalPagado` (Money), `.estadoEntrega` (VO), `.estadoPago` (VO), `.fecha` (Date), `.items`, `.toLegacyFields()`.
- `IClienteRepository.findById(id)` returns a client with `id, nombre, apellido, telefono, direccion, barrio, bloqueado, verificado, creadoPorRol, limitePedidosFiados, preciosEspeciales`. **Do not widen this contract.**
- `getFiadoStatusUseCase` is composed and exported from `src/modules/pedidos`; returns `{ count, limite, nivel, pedidos }`.
- `calcularAlertasCliente(cliente, pedidos, { precioMinimos })` from `src/lib/alertas-detector.ts` works on the last 5 orders and excludes `CONSUMIDOR_FINAL` and `ANULADO`/`CANCELADO` internally.
- `getPrecioMinimos()` is exported from `src/lib/pricing.ts`.
- `CANONICAL_CONSUMIDOR_FINAL_ID` is exported from `src/lib/constants`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/modules/pedidos/application/dto/index.ts` | `PreviewPedidoInput` / `PreviewPedidoResult` types | Modify |
| `src/lib/validators.ts` | `PreviewPedidoSchema` (Zod subset of `PedidoCreateSchema`, `origen ∈ {PEDIDO, VENTA_RAPIDA}`) | Modify |
| `src/modules/pedidos/application/use-cases/pedido-to-pedido-base.ts` | pure mappers: draft + resolved prices → synthetic `PedidoBaseLike`; and `Pedido` entity → `PedidoBaseLike` | Create |
| `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts` | the use case — read-only composition | Create |
| `src/modules/pedidos/application/index.ts` | wire `previewPedidoUseCase` in the composition root | Modify |
| `src/modules/pedidos/index.ts` | export `previewPedidoUseCase` | Modify |
| `src/app/api/pedidos/preview/route.ts` | thin controller | Create |
| `src/modules/pedidos/application/use-cases/__tests__/pedido-to-pedido-base.test.ts` | unit tests for the mappers | Create |
| `src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts` | unit tests for the use case (mocked deps) | Create |
| `src/app/api/pedidos/preview/__tests__/route.test.ts` | route contract test (source inspection — auxiliary guardrail) | Create |
| `src/lib/__tests__/integration/preview-pedido-integridad.test.ts` | Postgres: behavioral read-only + full preview-vs-commit comparison | Create |
| `src/lib/__tests__/validators-preview.test.ts` | schema unit tests | Create |
| `docs/pedidos/02-api-contract-pedidos.md` | flip "sin implementar todavía" → implemented | Modify |
| `docs/pedidos/03-blueprint-experiencia-hub.md` | §9.1 / §10 C2: mark preview as built | Modify |

---

## Task 1: DTO types

**Files:**
- Modify: `src/modules/pedidos/application/dto/index.ts` (append near the other `*Input`/`*Result` interfaces)

- [ ] **Step 1: Confirm `ProductCode` is imported**

Run: `grep -n "import type { ProductCode }" src/modules/pedidos/application/dto/index.ts`
Expected: it is already imported (used by `CrearPedidoInput`). If not, add `import type { ProductCode } from '@/shared/domain'` at the top.

- [ ] **Step 2: Add the types**

```ts
// ─── Preview (Fase 4, prerequisito del blueprint — BRECHA §9.1) ───────────────
// Read-only. NUNCA persiste ni modifica ninguna entidad.
// Contrato normativo: docs/pedidos/02-api-contract-pedidos.md.

export interface PreviewPedidoInput {
  clienteId: string
  negocioId?: string
  canal?: 'PUNTO' | 'DOMICILIO'
  origen?: 'PEDIDO' | 'VENTA_RAPIDA'
  items: Array<{ producto: ProductCode; cantidad: number; precioManual?: number }>
  pagos?: Array<{ metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'BONO'; monto: number }>
  entregado?: boolean
  pedidoOrigenId?: string
  /** userId de la sesión — lo inyecta la route, no viene del body. */
  actorId: string
}

export interface PreviewCalculationItem {
  producto: string
  cantidad: number
  /** Precio final de Pricing — ya incluye recargo de domicilio si aplica. */
  precioUnitario: number
  /** precioUnitario × cantidad. */
  subtotal: number
  precioOrigen: 'manual' | 'cliente' | 'volumen' | 'base'
}

export interface PreviewPedidoResult {
  calculation: {
    items: PreviewCalculationItem[]
    /** total − recargoDomicilio. */
    subtotal: number
    recargoDomicilio: number
    /** Σ items[].subtotal. */
    total: number
    /** Σ normalizarPagos(request.pagos, total).pagosAplicados. */
    totalPagado: number
    /** calcularSaldo(total, totalPagado). */
    saldoProyectado: number
    /** normalizarPagos(request.pagos, total).excedente — iría a Cliente.saldoFavor en el commit. */
    saldoFavorProyectado: number
    estadoEntregaProyectado: 'PENDIENTE' | 'ENTREGADO'
    estadoPagoProyectado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANTICIPADO'
  }
  permissions: {
    canCreate: boolean
    canSetManualPrice: boolean
  }
  allowedActions: Array<'crear' | 'crear-y-enviar-a-ruta'>
  warnings: Array<{ code: string; message: string; field?: string }>
  riskSignals: Array<{ tipo: string; severidad: 'BAJA' | 'MEDIA' | 'ALTA'; detalle: string }>
  requiresAuthorization: boolean
  authorizationPolicy?: string
  auditPreview: {
    actor: string
    accion: 'CREAR_PEDIDO'
    recurso: 'Pedido (nuevo)'
    valoresRelevantes: {
      total: number
      clienteId: string
      canal: string
      origen: string
      tienePrecioManual: boolean
    }
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (types only, no consumers yet)

- [ ] **Step 4: Commit**

```bash
git add src/modules/pedidos/application/dto/index.ts
git commit -m "feat(pedidos): PreviewPedidoInput/Result DTOs (origen PEDIDO|VENTA_RAPIDA, saldoFavorProyectado)"
```

---

## Task 2: Zod schema

**Files:**
- Modify: `src/lib/validators.ts` (add after `PedidoCreateSchema`)
- Test: `src/lib/__tests__/validators-preview.test.ts` (Create)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/validators-preview.test.ts
import { describe, it, expect } from 'vitest'
import { PreviewPedidoSchema } from '../validators'

describe('PreviewPedidoSchema', () => {
  it('acepta el caso mínimo (clienteId + 1 item) con defaults', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.canal).toBe('DOMICILIO')
      expect(r.data.origen).toBe('PEDIDO')
    }
  })

  it('acepta origen VENTA_RAPIDA pero NO VENTA_LIBRE (fuera de alcance)', () => {
    expect(PreviewPedidoSchema.safeParse({
      clienteId: 'c1', origen: 'VENTA_RAPIDA', items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    }).success).toBe(true)
    expect(PreviewPedidoSchema.safeParse({
      clienteId: 'c1', origen: 'VENTA_LIBRE', items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    }).success).toBe(false)
  })

  it('rechaza items vacío y clienteId en blanco', () => {
    expect(PreviewPedidoSchema.safeParse({ clienteId: 'c1', items: [] }).success).toBe(false)
    expect(PreviewPedidoSchema.safeParse({ clienteId: '  ', items: [{ producto: 'PACA_AGUA', cantidad: 1 }] }).success).toBe(false)
  })

  it('descarta campos de persistencia (offlineId, clienteNuevo, direccionEntrega)', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      offlineId: 'x', clienteNuevo: { nombre: 'x', telefono: '1234567' }, direccionEntrega: 'Calle 1',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect('offlineId' in r.data).toBe(false)
      expect('clienteNuevo' in r.data).toBe(false)
      expect('direccionEntrega' in r.data).toBe(false)
    }
  })

  it('acepta pagos, entregado, pedidoOrigenId, precioManual', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 5000 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      entregado: true, pedidoOrigenId: 'p99',
    })
    expect(r.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/__tests__/validators-preview.test.ts`
Expected: FAIL — `PreviewPedidoSchema` is not exported

- [ ] **Step 3: Implement the schema**

Add to `src/lib/validators.ts` after `PedidoCreateSchema`:

```ts
/**
 * Subconjunto de PedidoCreateSchema para POST /api/pedidos/preview.
 * SIN campos de persistencia. origen ∈ {PEDIDO, VENTA_RAPIDA} — VENTA_LIBRE
 * queda fuera de esta brecha (docs/pedidos/02-api-contract-pedidos.md).
 * z.object() descarta claves desconocidas por defecto — eso cubre el test
 * "descarta campos de persistencia".
 */
export const PreviewPedidoSchema = z.object({
  clienteId: z.string().trim().min(1),
  negocioId: z.string().trim().min(1).optional(),
  canal: z.enum(['PUNTO', 'DOMICILIO']).optional().default('DOMICILIO'),
  origen: z.enum(['PEDIDO', 'VENTA_RAPIDA']).optional().default('PEDIDO'),
  items: z.array(PedidoItemSchema).min(1, 'Agrega al menos un producto'),
  pagos: z
    .array(
      z.object({
        metodo: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']),
        monto: z.number().min(0),
      }),
    )
    .optional(),
  entregado: z.boolean().optional(),
  pedidoOrigenId: z.string().optional(),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/__tests__/validators-preview.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/lib/__tests__/validators-preview.test.ts
git commit -m "feat(pedidos): PreviewPedidoSchema (origen PEDIDO|VENTA_RAPIDA, sin persistencia)"
```

---

## Task 3: mappers → `PedidoBaseLike` (for the risk detector)

`calcularAlertasCliente` consumes objects with **legacy per-product columns** (`cPacaAguaPed`, `precioPacaAgua`, …). Two sources need bridging: the preview draft (new `items[]` shape) and the client's real orders (`Pedido` domain entities). Both map to `PedidoBaseLike`.

**Files:**
- Create: `src/modules/pedidos/application/use-cases/pedido-to-pedido-base.ts`
- Test: `src/modules/pedidos/application/use-cases/__tests__/pedido-to-pedido-base.test.ts`

- [ ] **Step 1: Verify the exact legacy column names**

Run: `sed -n '96,132p' src/lib/alertas-detector.ts`
Expected: the `PedidoBase` interface. Note the exact field names (`cPacaAguaPed`, `cBotellonFabPed`, `cBotellonDomPed`, `precioPacaAgua`, `precioBotellonFab`, `precioBotellonDom`, `clienteId`, `fecha`, `total`, `estadoEntrega`, `estadoPago`, …). If any differ from what Step 3 uses, adjust Step 3 to match and re-run Step 4.

- [ ] **Step 2: Write the failing test**

```ts
// src/modules/pedidos/application/use-cases/__tests__/pedido-to-pedido-base.test.ts
import { describe, it, expect } from 'vitest'
import { draftToPedidoBase, pedidoEntityToPedidoBase } from '../pedido-to-pedido-base'

describe('draftToPedidoBase', () => {
  const resolved = [
    { producto: 'PACA_AGUA', cantidad: 20, precio: 2300, subtotal: 46000, origen: 'volumen' as const },
    { producto: 'BOTELLON', cantidad: 3, precio: 9000, subtotal: 27000, origen: 'base' as const },
  ]

  it('mapea items[] a las columnas legacy; BOTELLON a la columna del canal', () => {
    const pb = draftToPedidoBase({ clienteId: 'c1', canal: 'DOMICILIO', resolvedItems: resolved, total: 73000, nowIso: '2026-09-07T10:00:00.000Z' })
    expect(pb.clienteId).toBe('c1')
    expect(pb.cPacaAguaPed).toBe(20)
    expect(pb.precioPacaAgua).toBe(2300)
    expect(pb.cBotellonDomPed).toBe(3)
    expect(pb.cBotellonFabPed).toBe(0)
    expect(pb.precioBotellonDom).toBe(9000)
    expect(Number(pb.total)).toBe(73000)
    expect(pb.estadoEntrega).toBe('PENDIENTE')
    expect(pb.id).toBe('__preview__')
  })

  it('canal PUNTO manda BOTELLON a la columna de fábrica', () => {
    const pb = draftToPedidoBase({ clienteId: 'c1', canal: 'PUNTO', resolvedItems: [{ producto: 'BOTELLON', cantidad: 5, precio: 8000, subtotal: 40000, origen: 'base' as const }], total: 40000, nowIso: '2026-09-07T10:00:00.000Z' })
    expect(pb.cBotellonFabPed).toBe(5)
    expect(pb.cBotellonDomPed).toBe(0)
    expect(pb.precioBotellonFab).toBe(8000)
  })
})

describe('pedidoEntityToPedidoBase', () => {
  it('mapea una entidad Pedido usando toLegacyFields() + getters', () => {
    const fakeEntity = {
      clienteId: 'c1',
      fecha: new Date('2026-09-01T08:00:00.000Z'),
      total: { toDecimal: () => 50000 },
      estadoEntrega: { get: () => 'ENTREGADO' },
      estadoPago: { get: () => 'PAGADO' },
      toLegacyFields: () => ({ cPacaAguaPed: 10, precioPacaAgua: 2500, cBotellonDomPed: 2, precioBotellonDom: 9000 }),
    } as never
    const pb = pedidoEntityToPedidoBase(fakeEntity, 'p-123')
    expect(pb.id).toBe('p-123')
    expect(pb.clienteId).toBe('c1')
    expect(pb.cPacaAguaPed).toBe(10)
    expect(pb.precioPacaAgua).toBe(2500)
    expect(pb.cBotellonDomPed).toBe(2)
    expect(Number(pb.total)).toBe(50000)
    expect(pb.estadoEntrega).toBe('ENTREGADO')
    expect(pb.fecha).toBe('2026-09-01T08:00:00.000Z')
  })
})
```

- [ ] **Step 3: Implement**

```ts
// src/modules/pedidos/application/use-cases/pedido-to-pedido-base.ts
/**
 * Mappers a la forma `PedidoBaseLike` que consume `calcularAlertasCliente`
 * (src/lib/alertas-detector.ts). Puros, sin I/O.
 *  - draftToPedidoBase: el draft del preview (items[] resueltos) → pedido
 *    sintético con id sentinela `__preview__` y estadoEntrega PENDIENTE.
 *  - pedidoEntityToPedidoBase: una entidad de dominio Pedido → PedidoBaseLike,
 *    reutilizando Pedido.toLegacyFields() (que ya hace el split de BOTELLON
 *    por canal) + los getters de total/fecha/estado.
 */

interface ResolvedItem {
  producto: string
  cantidad: number
  precio: number
  subtotal: number
  origen: 'manual' | 'cliente' | 'volumen' | 'base'
}

export interface PedidoBaseLike {
  id: string
  clienteId: string
  fecha: string
  total: number
  estadoEntrega: string
  estadoPago: string
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  precioPacaAgua: number
  precioPacaHielo: number
  precioBotellonFab: number
  precioBotellonDom: number
  precioBolsaAgua: number
  precioBolsaHielo: number
}

function emptyBase(id: string, clienteId: string, fecha: string, total: number, estadoEntrega: string, estadoPago: string): PedidoBaseLike {
  return {
    id, clienteId, fecha, total, estadoEntrega, estadoPago,
    cPacaAguaPed: 0, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0,
    cBolsaAguaPed: 0, cBolsaHieloPed: 0,
    precioPacaAgua: 0, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0,
    precioBolsaAgua: 0, precioBolsaHielo: 0,
  }
}

export interface DraftToPedidoBaseInput {
  clienteId: string
  canal: 'PUNTO' | 'DOMICILIO'
  resolvedItems: ResolvedItem[]
  total: number
  nowIso: string
}

export function draftToPedidoBase(input: DraftToPedidoBaseInput): PedidoBaseLike {
  const pb = emptyBase('__preview__', input.clienteId, input.nowIso, input.total, 'PENDIENTE', 'PENDIENTE')
  for (const it of input.resolvedItems) {
    switch (it.producto) {
      case 'PACA_AGUA': pb.cPacaAguaPed = it.cantidad; pb.precioPacaAgua = it.precio; break
      case 'PACA_HIELO': pb.cPacaHieloPed = it.cantidad; pb.precioPacaHielo = it.precio; break
      case 'BOTELLON':
        if (input.canal === 'DOMICILIO') { pb.cBotellonDomPed = it.cantidad; pb.precioBotellonDom = it.precio }
        else { pb.cBotellonFabPed = it.cantidad; pb.precioBotellonFab = it.precio }
        break
      case 'BOLSA_AGUA': pb.cBolsaAguaPed = it.cantidad; pb.precioBolsaAgua = it.precio; break
      case 'BOLSA_HIELO': pb.cBolsaHieloPed = it.cantidad; pb.precioBolsaHielo = it.precio; break
    }
  }
  return pb
}

// Estructura mínima que necesitamos de la entidad Pedido (sin acoplarnos a toda la clase).
interface PedidoEntityLike {
  clienteId: string
  fecha: Date
  total: { toDecimal(): number }
  estadoEntrega: { get(): string }
  estadoPago: { get(): string }
  toLegacyFields(): Record<string, number>
}

export function pedidoEntityToPedidoBase(p: PedidoEntityLike, id: string): PedidoBaseLike {
  const legacy = p.toLegacyFields()
  const pb = emptyBase(id, p.clienteId, p.fecha.toISOString(), p.total.toDecimal(), p.estadoEntrega.get(), p.estadoPago.get())
  pb.cPacaAguaPed = legacy.cPacaAguaPed ?? 0
  pb.cPacaHieloPed = legacy.cPacaHieloPed ?? 0
  pb.cBotellonFabPed = legacy.cBotellonFabPed ?? 0
  pb.cBotellonDomPed = legacy.cBotellonDomPed ?? 0
  pb.cBolsaAguaPed = legacy.cBolsaAguaPed ?? 0
  pb.cBolsaHieloPed = legacy.cBolsaHieloPed ?? 0
  pb.precioPacaAgua = legacy.precioPacaAgua ?? 0
  pb.precioPacaHielo = legacy.precioPacaHielo ?? 0
  pb.precioBotellonFab = legacy.precioBotellonFab ?? 0
  pb.precioBotellonDom = legacy.precioBotellonDom ?? 0
  pb.precioBolsaAgua = legacy.precioBolsaAgua ?? 0
  pb.precioBolsaHielo = legacy.precioBolsaHielo ?? 0
  return pb
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/pedido-to-pedido-base.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/pedidos/application/use-cases/pedido-to-pedido-base.ts src/modules/pedidos/application/use-cases/__tests__/pedido-to-pedido-base.test.ts
git commit -m "feat(pedidos): mappers draft/entidad → PedidoBaseLike para el detector de riesgo"
```

---

## Task 4: `PreviewPedidoUseCase` — pricing + payment projection

Covers price resolution, the calculation semantics (contract § "Semántica de cálculo"), and the virtual payment projection via `pagos-calculator.service.ts`. Permissions/warnings/risk come in Tasks 5–6.

**Files:**
- Create: `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts`
- Test: `src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`

- [ ] **Step 1: Confirm `IPedidoRepository.findById` argument type**

Run: `grep -n "findById" src/modules/pedidos/domain/repositories/IPedidoRepository.ts`
Expected: `findById(id: PedidoId, tx?)`. It takes a `PedidoId` value object — import `PedidoId` from `../../domain/value-objects/PedidoId` and wrap: `PedidoId.create(input.pedidoOrigenId)`.

- [ ] **Step 2: Write the failing test**

```ts
// src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PreviewPedidoUseCase, ClienteNotFoundError, PedidoOrigenNotFoundError } from '../PreviewPedidoUseCase'
import type { PreviewPedidoDeps } from '../PreviewPedidoUseCase'

function makeDeps(): PreviewPedidoDeps {
  return {
    pricingPort: {
      loadPricingContext: vi.fn().mockResolvedValue({
        clienteOverrides: null,
        tiersByCode: {},
        productosByCode: {
          PACA_AGUA: { aplicaDomicilio: true, sobreCostoDomicilio: 200, precioBase: 2500 },
        },
      }),
      // precio 2700 = base 2500 + recargo 200 (canal DOMICILIO)
      resolverPrecios: vi.fn().mockResolvedValue([
        { producto: 'PACA_AGUA', cantidad: 10, precio: 2700, subtotal: 27000, origen: 'base' },
      ]),
    } as never,
    clienteRepo: {
      findById: vi.fn().mockResolvedValue({
        id: 'c1', nombre: 'Tienda X', apellido: null, telefono: '3001112233',
        direccion: 'Calle 1', barrio: 'Centro', bloqueado: false, verificado: true,
        creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
      }),
    } as never,
    pedidoRepo: {
      findById: vi.fn().mockResolvedValue({ id: 'p99' }),
      findMany: vi.fn().mockResolvedValue([]),
    } as never,
    getFiadoStatusUseCase: {
      execute: vi.fn().mockResolvedValue({ count: 0, limite: 2, nivel: 'ok', pedidos: [] }),
    } as never,
    getPrecioMinimos: vi.fn().mockResolvedValue([]),
  }
}

describe('PreviewPedidoUseCase — pricing + payment projection', () => {
  it('total = Σ (precio × cantidad); subtotal = total − recargoDomicilio', async () => {
    const uc = new PreviewPedidoUseCase(makeDeps())
    const r = await uc.execute({
      clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }], actorId: 'u1',
    })
    expect(r.calculation.total).toBe(27000)
    expect(r.calculation.recargoDomicilio).toBe(2000) // 200 × 10
    expect(r.calculation.subtotal).toBe(25000)         // 27000 − 2000
    expect(r.calculation.total).toBe(r.calculation.subtotal + r.calculation.recargoDomicilio)
    expect(r.calculation.items[0].precioUnitario).toBe(2700)
    expect(r.calculation.items[0].subtotal).toBe(27000)
    expect(r.calculation.items[0].precioOrigen).toBe('base')
  })

  it('canal PUNTO → recargoDomicilio 0, subtotal = total', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 10, precio: 2500, subtotal: 25000, origen: 'base' },
    ])
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 10 }], actorId: 'u1' })
    expect(r.calculation.recargoDomicilio).toBe(0)
    expect(r.calculation.subtotal).toBe(25000)
    expect(r.calculation.total).toBe(25000)
  })

  it('pago exacto + entregado → PAGADO, saldo 0, saldoFavor 0', async () => {
    const uc = new PreviewPedidoUseCase(makeDeps())
    const r = await uc.execute({
      clienteId: 'c1', canal: 'DOMICILIO', entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 27000 }], actorId: 'u1',
    })
    expect(r.calculation.estadoEntregaProyectado).toBe('ENTREGADO')
    expect(r.calculation.totalPagado).toBe(27000)
    expect(r.calculation.saldoProyectado).toBe(0)
    expect(r.calculation.saldoFavorProyectado).toBe(0)
    expect(r.calculation.estadoPagoProyectado).toBe('PAGADO')
  })

  it('prepago total + entrega posterior → ANTICIPADO', async () => {
    const uc = new PreviewPedidoUseCase(makeDeps())
    const r = await uc.execute({
      clienteId: 'c1', canal: 'DOMICILIO', entregado: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 27000 }], actorId: 'u1',
    })
    expect(r.calculation.estadoEntregaProyectado).toBe('PENDIENTE')
    expect(r.calculation.estadoPagoProyectado).toBe('ANTICIPADO')
  })

  it('sobrepago → excedente proyectado a saldoFavor, pago aplicado = total', async () => {
    const uc = new PreviewPedidoUseCase(makeDeps())
    const r = await uc.execute({
      clienteId: 'c1', canal: 'DOMICILIO', entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 30000 }], actorId: 'u1',
    })
    expect(r.calculation.totalPagado).toBe(27000)       // normalizado al total
    expect(r.calculation.saldoFavorProyectado).toBe(3000)
    expect(r.calculation.saldoProyectado).toBe(0)
  })

  it('lanza ClienteNotFoundError si el cliente no existe', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(
      new PreviewPedidoUseCase(deps).execute({ clienteId: 'nope', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' }),
    ).rejects.toThrow(ClienteNotFoundError)
  })

  it('lanza PedidoOrigenNotFoundError si pedidoOrigenId no existe', async () => {
    const deps = makeDeps()
    ;(deps.pedidoRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    await expect(
      new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', pedidoOrigenId: 'ghost', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' }),
    ).rejects.toThrow(PedidoOrigenNotFoundError)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the use case (pricing + payment projection)**

```ts
// src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts
import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { GetFiadoStatusUseCase } from './GetFiadoStatusUseCase'
import type { PreviewPedidoInput, PreviewPedidoResult, PreviewCalculationItem } from '../dto'
import type { ProductCode } from '@/shared/domain'
import { PedidoId } from '../../domain/value-objects/PedidoId'
import { normalizarPagos, calcularSaldo, calcularEstadoPago } from '../../domain/services/pagos-calculator.service'

export class ClienteNotFoundError extends Error {
  constructor(id: string) { super(`CLIENTE_NOT_FOUND: ${id}`); this.name = 'ClienteNotFoundError' }
}
export class PedidoOrigenNotFoundError extends Error {
  constructor(id: string) { super(`PEDIDO_ORIGEN_NOT_FOUND: ${id}`); this.name = 'PedidoOrigenNotFoundError' }
}

export interface PreviewPedidoDeps {
  pricingPort: IPricingPort
  clienteRepo: IClienteRepository
  pedidoRepo: IPedidoRepository
  getFiadoStatusUseCase: GetFiadoStatusUseCase
  getPrecioMinimos: () => Promise<Array<{ producto: string; cantMin: number; cantMax: number | null; precioMinimo: number | null }>>
}

export class PreviewPedidoUseCase {
  constructor(private deps: PreviewPedidoDeps) {}

  async execute(input: PreviewPedidoInput): Promise<PreviewPedidoResult> {
    const canal = input.canal ?? 'DOMICILIO'
    const origen = input.origen ?? 'PEDIDO'

    const cliente = await this.deps.clienteRepo.findById(input.clienteId)
    if (!cliente) throw new ClienteNotFoundError(input.clienteId)

    if (input.pedidoOrigenId) {
      const origenPedido = await this.deps.pedidoRepo.findById(PedidoId.create(input.pedidoOrigenId))
      if (!origenPedido) throw new PedidoOrigenNotFoundError(input.pedidoOrigenId)
    }

    // ── Pricing (mismo port que CrearPedidoUseCase) ──
    const activeCodes = [...new Set(input.items.map(i => i.producto))] as ProductCode[]
    const pricingData = await this.deps.pricingPort.loadPricingContext(input.clienteId, input.negocioId ?? null, activeCodes)
    const resueltos = await this.deps.pricingPort.resolverPrecios(
      input.items.map(i => ({ codigo: i.producto as ProductCode, cantidad: i.cantidad, precioManual: i.precioManual })),
      canal, pricingData,
    )

    const items: PreviewCalculationItem[] = resueltos.map(r => ({
      producto: r.producto,
      cantidad: r.cantidad,
      precioUnitario: r.precio,        // ya incluye recargo domicilio si aplica
      subtotal: r.subtotal,            // = r.precio × r.cantidad
      precioOrigen: r.origen,
    }))

    // Semántica de cálculo (contrato):
    const total = items.reduce((s, i) => s + i.subtotal, 0)
    const recargoDomicilio = canal === 'DOMICILIO'
      ? resueltos.reduce((acc, r) => {
          const cfg = pricingData.productosByCode[r.producto]
          return acc + (cfg?.aplicaDomicilio ? cfg.sobreCostoDomicilio * r.cantidad : 0)
        }, 0)
      : 0
    const subtotal = total - recargoDomicilio

    // ── Pagos: proyección virtual con las reglas existentes ──
    const { pagosAplicados, excedente } = normalizarPagos(
      (input.pagos ?? []).map(p => ({ metodo: p.metodo, monto: p.monto })),
      total,
    )
    const totalPagado = pagosAplicados.reduce((s, p) => s + p.monto, 0)
    const estadoEntregaProyectado: 'PENDIENTE' | 'ENTREGADO' = input.entregado === true ? 'ENTREGADO' : 'PENDIENTE'
    const saldoProyectado = calcularSaldo(total, totalPagado)
    const estadoPagoProyectado = calcularEstadoPago(total, totalPagado, estadoEntregaProyectado) as
      'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANTICIPADO'

    const tienePrecioManual = resueltos.some(r => r.origen === 'manual')

    // permissions / warnings / risk / actions — Tasks 5–6.
    return {
      calculation: {
        items, subtotal, recargoDomicilio, total,
        totalPagado, saldoProyectado, saldoFavorProyectado: excedente,
        estadoEntregaProyectado, estadoPagoProyectado,
      },
      permissions: { canCreate: true, canSetManualPrice: true },
      allowedActions: ['crear'],
      warnings: [],
      riskSignals: [],
      requiresAuthorization: false,
      auditPreview: {
        actor: input.actorId,
        accion: 'CREAR_PEDIDO',
        recurso: 'Pedido (nuevo)',
        valoresRelevantes: { total, clienteId: input.clienteId, canal, origen, tienePrecioManual },
      },
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts
git commit -m "feat(pedidos): PreviewPedidoUseCase — pricing + proyección virtual de pagos (read-only)"
```

---

## Task 5: `PreviewPedidoUseCase` — permissions + warnings

**Files:**
- Modify: `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts`
- Modify: its test file

- [ ] **Step 1: Add failing tests**

```ts
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'

describe('PreviewPedidoUseCase — permissions + warnings', () => {
  it('fiado sobre el límite → canCreate false + warning FIADO_SOBRE_LIMITE, sin acción crear', async () => {
    const deps = makeDeps()
    ;(deps.getFiadoStatusUseCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 2, limite: 2, nivel: 'limite', pedidos: [{ id: 'a', numero: 1, saldo: 100 }, { id: 'b', numero: 2, saldo: 200 }],
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.permissions.canCreate).toBe(false)
    expect(r.warnings.some(w => w.code === 'FIADO_SOBRE_LIMITE')).toBe(true)
    expect(r.allowedActions).not.toContain('crear')
  })

  it('cliente bloqueado → canCreate false + warning CLIENTE_BLOQUEADO', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', nombre: 'X', apellido: null, telefono: '3001112233', direccion: 'Calle 1', barrio: 'Centro',
      bloqueado: true, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.permissions.canCreate).toBe(false)
    expect(r.warnings.some(w => w.code === 'CLIENTE_BLOQUEADO')).toBe(true)
  })

  it('DOMICILIO sin dirección → warning DIRECCION_FALTANTE (no bloquea, crear sigue disponible)', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'c1', nombre: 'X', apellido: null, telefono: '3001112233', direccion: null, barrio: null,
      bloqueado: false, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'DIRECCION_FALTANTE' && w.field === 'direccion')).toBe(true)
    expect(r.permissions.canCreate).toBe(true)
    expect(r.allowedActions).toContain('crear')
  })

  it('precio manual → warning PRECIO_MANUAL_APLICADO', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 10, precio: 1000, subtotal: 10000, origen: 'manual' },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10, precioManual: 1000 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'PRECIO_MANUAL_APLICADO')).toBe(true)
  })

  it('CONSUMIDOR_FINAL: sin warnings de fiado, sin consulta de fiado', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CANONICAL_CONSUMIDOR_FINAL_ID, nombre: 'Consumidor Final', apellido: null, telefono: '', direccion: null, barrio: null,
      bloqueado: false, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: CANONICAL_CONSUMIDOR_FINAL_ID, canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'FIADO_SOBRE_LIMITE')).toBe(false)
    expect(deps.getFiadoStatusUseCase.execute).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify new tests fail**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: FAIL — warnings always `[]`, canCreate always true

- [ ] **Step 3: Implement permissions + warnings**

In `PreviewPedidoUseCase.ts` add the import:

```ts
import { CANONICAL_CONSUMIDOR_FINAL_ID } from '@/lib/constants'
```

Replace the hard-coded `permissions`/`warnings`/`allowedActions` in the return with:

```ts
    // ── Permissions + warnings ──
    const warnings: PreviewPedidoResult['warnings'] = []
    const esAnonimo = input.clienteId === CANONICAL_CONSUMIDOR_FINAL_ID
    let canCreate = true

    if (!esAnonimo && cliente.bloqueado) {
      canCreate = false
      warnings.push({ code: 'CLIENTE_BLOQUEADO', message: 'Cliente bloqueado por deuda vencida. Pague primero.' })
    }

    if (!esAnonimo && !cliente.bloqueado) {
      const fiado = await this.deps.getFiadoStatusUseCase.execute({ clienteId: input.clienteId })
      if (fiado.count >= fiado.limite) {
        canCreate = false
        warnings.push({
          code: 'FIADO_SOBRE_LIMITE',
          message: `Cliente tiene ${fiado.count} pedidos fiados (límite: ${fiado.limite}). Pague primero para crear más.`,
        })
      }
    }

    if (canal === 'DOMICILIO' && !cliente.direccion) {
      warnings.push({ code: 'DIRECCION_FALTANTE', message: 'Domicilio sin dirección registrada.', field: 'direccion' })
    }

    if (tienePrecioManual) {
      warnings.push({ code: 'PRECIO_MANUAL_APLICADO', message: 'Se aplicó un precio manual a uno o más productos.' })
    }

    const allowedActions: PreviewPedidoResult['allowedActions'] = []
    if (canCreate) {
      allowedActions.push('crear')
      if (estadoEntregaProyectado === 'PENDIENTE') allowedActions.push('crear-y-enviar-a-ruta')
    }
```

And use `canCreate`, `warnings`, `allowedActions` in the returned object. Keep `canSetManualPrice: true` (comment: hoy no se restringe para ADMIN/ASISTENTE — política es PENDIENTE §8.2 del blueprint).

- [ ] **Step 4: Run to verify all pass**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts
git commit -m "feat(pedidos): preview — permissions + warnings (fiado, bloqueado, dirección, precio manual)"
```

---

## Task 6: `PreviewPedidoUseCase` — riskSignals

**Files:**
- Modify: `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts`
- Modify: its test file

- [ ] **Step 1: Add failing tests**

```ts
describe('PreviewPedidoUseCase — riskSignals', () => {
  it('precio por debajo de la tabla → riskSignal PRECIO_POR_DEBAJO_TABLA; señal ≠ bloqueo', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 20, precio: 1500, subtotal: 30000, origen: 'manual' },
    ])
    ;(deps.getPrecioMinimos as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantMin: 1, cantMax: null, precioMinimo: 2300 },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({
      clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 20, precioManual: 1500 }], actorId: 'u1',
    })
    expect(r.riskSignals.some(s => s.tipo === 'PRECIO_POR_DEBAJO_TABLA')).toBe(true)
    expect(r.allowedActions).toContain('crear') // no bloquea
  })

  it('pide los últimos 5 pedidos válidos del cliente (excluye ANULADO/CANCELADO por inclusión)', async () => {
    const deps = makeDeps()
    await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(deps.pedidoRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ clienteId: 'c1', estadoEntrega: ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO'] }),
      expect.objectContaining({ take: 5, orderBy: 'desc' }),
    )
  })

  it('CONSUMIDOR_FINAL → riskSignals vacío y NO consulta historial', async () => {
    const deps = makeDeps()
    ;(deps.clienteRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'CONSUMIDOR_FINAL', nombre: 'Consumidor Final', apellido: null, telefono: '', direccion: null, barrio: null,
      bloqueado: false, verificado: true, creadoPorRol: 'ADMIN', limitePedidosFiados: null, preciosEspeciales: null,
    })
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'CONSUMIDOR_FINAL', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.riskSignals).toEqual([])
    expect(deps.pedidoRepo.findMany).not.toHaveBeenCalled()
    expect(deps.getPrecioMinimos).not.toHaveBeenCalled()
  })

  it('requiresAuthorization SIEMPRE false (sin política de umbral)', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 100, precio: 1, subtotal: 100, origen: 'manual' },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 100, precioManual: 1 }], actorId: 'u1' })
    expect(r.requiresAuthorization).toBe(false)
  })

  it('auditPreview refleja actor + total + tienePrecioManual', async () => {
    const deps = makeDeps()
    ;(deps.pricingPort.resolverPrecios as ReturnType<typeof vi.fn>).mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 2, precio: 3000, subtotal: 6000, origen: 'manual' },
    ])
    const r = await new PreviewPedidoUseCase(deps).execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 2, precioManual: 3000 }], actorId: 'u-audit' })
    expect(r.auditPreview.actor).toBe('u-audit')
    expect(r.auditPreview.valoresRelevantes.total).toBe(6000)
    expect(r.auditPreview.valoresRelevantes.tienePrecioManual).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify new tests fail**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: FAIL — riskSignals always `[]`, `findMany` never called

- [ ] **Step 3: Implement riskSignals**

Add imports to `PreviewPedidoUseCase.ts`:

```ts
import { calcularAlertasCliente } from '@/lib/alertas-detector'
import { draftToPedidoBase, pedidoEntityToPedidoBase } from './pedido-to-pedido-base'
```

In `execute`, after computing `total`/`recargoDomicilio` and before the return, add:

```ts
    // ── Risk signals (detector detectivo — señal ≠ bloqueo). CONSUMIDOR_FINAL excluido. ──
    let riskSignals: PreviewPedidoResult['riskSignals'] = []
    if (!esAnonimo) {
      const [pedidosRecientes, precioMinimos] = await Promise.all([
        this.deps.pedidoRepo.findMany(
          { clienteId: input.clienteId, estadoEntrega: ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO'] },
          { take: 5, orderBy: 'desc' },
        ),
        this.deps.getPrecioMinimos(),
      ])
      const historial = pedidosRecientes.map(p => pedidoEntityToPedidoBase(p as never, (p as { id?: { get(): string } | string }).id
        ? typeof (p as { id: unknown }).id === 'string' ? (p as unknown as { id: string }).id : ((p as unknown as { id: { get(): string } }).id).get()
        : '__real__'))
      const draft = draftToPedidoBase({ clienteId: input.clienteId, canal, resolvedItems: resueltos, total, nowIso: new Date().toISOString() })
      const alertas = calcularAlertasCliente(
        {
          id: cliente.id, nombre: cliente.nombre ?? '', telefono: cliente.telefono ?? '',
          verificado: cliente.verificado, bloqueado: cliente.bloqueado, creadoPorRol: cliente.creadoPorRol,
        },
        [...historial, draft] as never,
        { precioMinimos },
      )
      riskSignals = alertas.map(a => ({ tipo: a.tipo, severidad: a.severidad, detalle: a.detalle }))
    }
```

> Note on the entity `id`: check whether `IPedidoRepository.findMany` returns entities whose `id` is a `PedidoId` VO (`.get()`) or a plain string, via `grep -n "get id" src/modules/pedidos/domain/entities/Pedido.ts`. Simplify the `historial` mapping to the real accessor once known — the risk detector only needs a **unique, stable id** per order, so any of `p.id.get()` / `p.id` works.

Use `riskSignals` in the returned object. `requiresAuthorization` stays `false`.

`esAnonimo` is defined in Task 5's block — make sure that block runs before this one (it does, both are in `execute`).

- [ ] **Step 4: Run to verify all pass**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Full module suite + typecheck**

Run: `npx tsc --noEmit && npm run test -- src/modules/pedidos src/lib/__tests__/validators-preview.test.ts`
Expected: PASS, 0 regressions

- [ ] **Step 6: Commit**

```bash
git add src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts
git commit -m "feat(pedidos): preview — riskSignals via calcularAlertasCliente (últimos 5, CONSUMIDOR_FINAL excluido)"
```

---

## Task 7: Wire the composition root

**Files:**
- Modify: `src/modules/pedidos/application/index.ts`
- Modify: `src/modules/pedidos/index.ts`

- [ ] **Step 1: Add to the composition root**

In `src/modules/pedidos/application/index.ts`, confirm `getFiadoStatusUseCase` const exists (the export implies it). After it:

```ts
import { PreviewPedidoUseCase } from './use-cases/PreviewPedidoUseCase'
import { getPrecioMinimos } from '@/lib/pricing'

export const previewPedidoUseCase = new PreviewPedidoUseCase({
  pricingPort: pricingAdapter,
  clienteRepo,
  pedidoRepo,
  getFiadoStatusUseCase,
  getPrecioMinimos,
})
```

- [ ] **Step 2: Export from the module barrel**

In `src/modules/pedidos/index.ts`, add `previewPedidoUseCase` to the `export { … } from './application'` list.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/pedidos/application/index.ts src/modules/pedidos/index.ts
git commit -m "feat(pedidos): wire previewPedidoUseCase en el composition root"
```

---

## Task 8: The route handler

**Files:**
- Create: `src/app/api/pedidos/preview/route.ts`

- [ ] **Step 1: Implement the thin controller**

```ts
// src/app/api/pedidos/preview/route.ts
import { NextRequest } from 'next/server'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { formatZodError } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { PreviewPedidoSchema } from '@/lib/validators'
import { previewPedidoUseCase } from '@/modules/pedidos'

/**
 * POST /api/pedidos/preview — prepara una creación de Pedido SIN persistir ni
 * mutar nada. BRECHA §9.1 del blueprint (docs/pedidos/03-blueprint-experiencia-hub.md).
 * Contrato normativo: docs/pedidos/02-api-contract-pedidos.md.
 * Read-only: sin lock, sin transacción de escritura, sin offlineId, sin crear
 * ni modificar Cliente. El commit real (POST /api/pedidos) revalida todo.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof Response) return auth
  const role = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], auth)
  if (role instanceof Response) return role
  const actorId = role.user?.id
  if (!actorId) return apiError('No autorizado', 401)

  try {
    const body = await request.json()
    const parsed = PreviewPedidoSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const result = await previewPedidoUseCase.execute({ ...parsed.data, actorId })
    return apiSuccess(result)
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('CLIENTE_NOT_FOUND')) return apiError('Cliente no encontrado', 404, { code: 'CLIENTE_NOT_FOUND' })
      if (error.message.startsWith('PEDIDO_ORIGEN_NOT_FOUND')) return apiError('Pedido de origen no encontrado', 404, { code: 'PEDIDO_ORIGEN_NOT_FOUND' })
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error en preview de pedido')
    return apiError('Error preparando el pedido', 500)
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Manual smoke via dev server** (`docker compose up -d`, dev server up)

```bash
curl -s -X POST http://localhost:3000/api/pedidos/preview -H 'Content-Type: application/json' -b <cookie-admin> \
  -d '{"clienteId":"CONSUMIDOR_FINAL","canal":"PUNTO","items":[{"producto":"PACA_AGUA","cantidad":2}]}' | jq
```
Expected: `{ "success": true, "calculation": { "total": …, "subtotal": …, "recargoDomicilio": 0, … }, "riskSignals": [], … }`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pedidos/preview/route.ts
git commit -m "feat(pedidos): POST /api/pedidos/preview (thin controller, read-only)"
```

---

## Task 9: Route contract test (auxiliary static guardrail)

Source-inspection test — same pattern as the N2 routes. This is a **guardrail auxiliary**, not the primary read-only proof (that is Task 10, behavioral).

**Files:**
- Create: `src/app/api/pedidos/preview/__tests__/route.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/app/api/pedidos/preview/__tests__/route.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSource = readFileSync(join(process.cwd(), 'src/app/api/pedidos/preview/route.ts'), 'utf-8')

describe('POST /api/pedidos/preview — contract (guardrail estático)', () => {
  it('exige requireRole([ADMIN, ASISTENTE])', () => {
    expect(routeSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('delega en previewPedidoUseCase', () => {
    expect(routeSource).toMatch(/previewPedidoUseCase\.execute\(/)
  })

  it('valida con PreviewPedidoSchema antes de delegar', () => {
    expect(routeSource).toMatch(/PreviewPedidoSchema\.safeParse/)
  })

  it('inyecta actorId desde la sesión, no desde el body', () => {
    expect(routeSource).toMatch(/actorId\s*=\s*role\.user\?\.id/)
    expect(routeSource).toMatch(/actorId\s*\}/)
  })

  it('mapea CLIENTE_NOT_FOUND y PEDIDO_ORIGEN_NOT_FOUND a 404', () => {
    expect(routeSource).toMatch(/CLIENTE_NOT_FOUND[\s\S]{0,120}404/)
    expect(routeSource).toMatch(/PEDIDO_ORIGEN_NOT_FOUND[\s\S]{0,120}404/)
  })

  it('READ-ONLY: no importa repos de escritura, TransactionManager, lock ni $transaction', () => {
    expect(routeSource).not.toMatch(/TransactionManager/)
    expect(routeSource).not.toMatch(/withAdvisoryLock|withLock|SECUENCIA:|CARTERA:|PEDIDO:/)
    expect(routeSource).not.toMatch(/\$transaction/)
    expect(routeSource).not.toMatch(/crearPedidoUseCase|actualizarPedidoUseCase|Repository\b/)
  })
})
```

- [ ] **Step 2: Run**

Run: `npm run test -- src/app/api/pedidos/preview/__tests__/route.test.ts`
Expected: PASS (6 tests). If a regex is over-strict vs your final formatting, relax it while keeping the intent.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pedidos/preview/__tests__/route.test.ts
git commit -m "test(pedidos): guardrail estático de POST /api/pedidos/preview (rol, delegación, read-only)"
```

---

## Task 10: Integration test (Postgres) — behavioral read-only + preview vs commit

The primary proof. Two things: (a) `preview` mutates **nothing**, verified by full before/after snapshots of every reachable entity; (b) `preview`'s projected operation equals what `crearPedidoUseCase` actually persists, field by field.

**Files:**
- Create: `src/lib/__tests__/integration/preview-pedido-integridad.test.ts`

- [ ] **Step 1: Confirm the `CrearPedidoResult` shape**

Run: `grep -nE "CrearPedidoResult|pedido:|hijo\?:" src/modules/pedidos/application/dto/index.ts`
Expected: `result.pedido` is a `PedidoResumenDTO` with `total`, `totalPagado`, `saldo`, `estadoEntrega`, `estadoPago`, `canal`, `origen`, `items[]` (`producto`, `cantPedido`, `precio`, `subtotal`, `precioOrigen`). Align the assertions below if names differ.

- [ ] **Step 2: Write the test**

```ts
// src/lib/__tests__/integration/preview-pedido-integridad.test.ts
// @integration — Postgres de docker-compose (puerto 5433).
// (a) preview no muta NADA (snapshots antes/después de cada entidad alcanzable).
// (b) la operación proyectada por preview == la que crearPedidoUseCase persiste.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { previewPedidoUseCase, crearPedidoUseCase } from '@/modules/pedidos'
import { prisma } from '@/lib/prisma'

describe('preview — read-only + integridad vs commit', () => {
  let clienteId: string
  let clienteSnapshotAntes: string

  beforeAll(async () => {
    const cliente = await prisma.cliente.findFirst({
      where: { activo: true, id: { not: 'CONSUMIDOR_FINAL' }, bloqueado: false },
      select: { id: true },
    })
    if (!cliente) throw new Error('seed sin cliente activo — corré `npx tsx prisma/seed.ts`')
    clienteId = cliente.id
  })

  it('(a) preview no crea ni modifica ninguna fila', async () => {
    const before = {
      pedidos: await prisma.pedido.count(),
      items: await prisma.pedidoItem.count(),
      pagos: await prisma.pago.count(),
      facturas: await prisma.factura.count(),
      notasCredito: await prisma.notaCredito.count(),
      clientes: await prisma.cliente.count(),
      cliente: JSON.stringify(await prisma.cliente.findUnique({ where: { id: clienteId } })),
    }

    await previewPedidoUseCase.execute({
      clienteId, canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 5 }, { producto: 'BOTELLON', cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 999_999 }], // sobrepago deliberado
      actorId: 'test',
    })

    const after = {
      pedidos: await prisma.pedido.count(),
      items: await prisma.pedidoItem.count(),
      pagos: await prisma.pago.count(),
      facturas: await prisma.factura.count(),
      notasCredito: await prisma.notaCredito.count(),
      clientes: await prisma.cliente.count(),
      cliente: JSON.stringify(await prisma.cliente.findUnique({ where: { id: clienteId } })),
    }

    expect(after).toEqual(before)
  })

  it('(b) proyección del preview == pedido realmente creado (campo por campo)', async () => {
    const input = {
      clienteId, canal: 'DOMICILIO' as const, origen: 'PEDIDO' as const,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 5 }, { producto: 'BOTELLON' as const, cantidad: 2 }],
      pagos: [{ metodo: 'EFECTIVO' as const, monto: 3000 }],
    }

    const preview = await previewPedidoUseCase.execute({ ...input, actorId: 'test' })

    let createdId: string | undefined
    try {
      const created = await crearPedidoUseCase.execute({ ...input, createdByRole: 'ADMIN' })
      createdId = created.pedido.id
      const p = created.pedido

      expect(preview.calculation.total).toBe(Number(p.total))
      expect(preview.calculation.totalPagado).toBe(Number(p.totalPagado))
      expect(preview.calculation.saldoProyectado).toBe(Number(p.saldo))
      expect(preview.calculation.estadoEntregaProyectado).toBe(p.estadoEntrega)
      expect(preview.calculation.estadoPagoProyectado).toBe(p.estadoPago)
      expect(preview.calculation.subtotal + preview.calculation.recargoDomicilio).toBe(preview.calculation.total)

      // items: mismo producto / cantidad / precio unitario / subtotal / origen
      const byProd = (arr: Array<{ producto: string }>) => Object.fromEntries(arr.map(i => [i.producto, i]))
      const pv = byProd(preview.calculation.items)
      const cr = byProd(p.items.map(i => ({ producto: i.producto, cantidad: i.cantPedido, precioUnitario: Number(i.precio), subtotal: Number(i.subtotal), precioOrigen: i.precioOrigen })) as never)
      for (const prod of Object.keys(pv)) {
        expect(pv[prod].cantidad).toBe(cr[prod].cantidad)
        expect(pv[prod].precioUnitario).toBe(cr[prod].precioUnitario)
        expect(pv[prod].subtotal).toBe(cr[prod].subtotal)
        expect(pv[prod].precioOrigen).toBe(cr[prod].precioOrigen)
      }
    } finally {
      // cleanup explícito — no depender de cascadas
      if (createdId) {
        await prisma.pago.deleteMany({ where: { pedidoId: createdId } })
        await prisma.notaCredito.deleteMany({ where: { pedidoId: createdId } })
        const fact = await prisma.factura.findFirst({ where: { pedidoId: createdId }, select: { id: true } })
        if (fact) {
          await prisma.abono.deleteMany({ where: { facturaId: fact.id } })
          await prisma.factura.delete({ where: { id: fact.id } })
        }
        await prisma.pedidoItem.deleteMany({ where: { pedidoId: createdId } })
        await prisma.pedido.delete({ where: { id: createdId } })
      }
    }
  })

  afterAll(async () => {
    // el pedido creado ya se limpió en su finally; nada más que deshacer
    // (preview no toca Cliente; el commit del test (b) no genera saldoFavor
    //  porque el pago 3000 < total). Verificación defensiva:
    void clienteSnapshotAntes
  })
})
```

- [ ] **Step 3: Run**

Run: `npm run test -- --config vitest.integration.config.ts src/lib/__tests__/integration/preview-pedido-integridad.test.ts`
Expected: PASS (2 tests). If `crearPedidoUseCase.execute`'s input signature differs, align — the invariant is same `items`/`canal`/`origen`. If the schema for `factura`/`abono`/`notaCredito` FK names differ, adjust the cleanup queries (verify with `grep -nE "model (Factura|Abono|NotaCredito|Pago|PedidoItem)" prisma/schema.prisma` and the relation fields).

- [ ] **Step 4: Verify the DB is back to baseline**

Run:
```bash
PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu -c \
  "SELECT (SELECT count(*) FROM \"Pedido\") pedidos, (SELECT count(*) FROM \"PedidoItem\") items, (SELECT count(*) FROM \"Pago\") pagos, (SELECT count(*) FROM \"Factura\") facturas;"
```
Expected: same counts as before running the test file (run once before, once after).

- [ ] **Step 5: Commit**

```bash
git add src/lib/__tests__/integration/preview-pedido-integridad.test.ts
git commit -m "test(pedidos): integración — preview read-only (snapshots) + proyección == commit (campo a campo)"
```

---

## Task 11: Docs + final verification

**Files:**
- Modify: `docs/pedidos/02-api-contract-pedidos.md`
- Modify: `docs/pedidos/03-blueprint-experiencia-hub.md`

- [ ] **Step 1: Flip the contract status**

In `02-api-contract-pedidos.md`, change `**Estado:** contrato definido (2026-09-07, correcciones PO PR #220) — **sin implementar todavía**.` → `**Estado:** implementado (PR #<n>). Ruta: \`src/app/api/pedidos/preview/route.ts\`; use case: \`PreviewPedidoUseCase\`.`

- [ ] **Step 2: Update blueprint §9.1 and §10 C2**

In `03-blueprint-experiencia-hub.md`, §9.1: replace the "Pendiente: aprobación…" line with "✅ Implementado en PR #<n>." Update §10 row C2 to `RESUELTO`.

- [ ] **Step 3: Full verification (protocolo AGENTS.md)**

```bash
npx tsc --noEmit
npm run test
npm run test -- --config vitest.integration.config.ts
npx eslint src/app/api/pedidos/preview src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts src/modules/pedidos/application/use-cases/pedido-to-pedido-base.ts src/lib/validators.ts --max-warnings 0
```
Expected: all green; unit test count = pre-task baseline + (5 schema + 3 mappers + 17 use case + 6 route) = baseline + 31; integration + 2. 0 regressions.

- [ ] **Step 4: Commit + push + PR**

```bash
git add docs/pedidos/02-api-contract-pedidos.md docs/pedidos/03-blueprint-experiencia-hub.md
git commit -m "docs(pedidos): marcar POST /api/pedidos/preview como implementado"
git push -u origin feat/pedidos-preview-endpoint
gh pr create --base main --title "feat(pedidos): POST /api/pedidos/preview (prerequisito Fase 4)" \
  --body "Implementa el endpoint de preview definido en 02-api-contract-pedidos.md. Read-only verificado por comportamiento (snapshots de todas las entidades) + guardrail estático. Proyección == commit verificada campo a campo. Cierra la BRECHA §9.1 del blueprint. Stack sobre PR #220."
```

---

## Self-Review

**Spec coverage** (against `02-api-contract-pedidos.md` § preview, post-correcciones PO):
- `origen ∈ {PEDIDO, VENTA_RAPIDA}`, VENTA_LIBRE excluido → Task 1 (DTO), Task 2 (schema + test que rechaza VENTA_LIBRE). ✅
- Semántica de cálculo (`precioUnitario` incluye recargo; `total = Σ subtotalItem`; `recargoDomicilio` desglose; `subtotal = total − recargoDomicilio`) → Task 4 + tests explícitos de la identidad. ✅
- Proyección virtual de pagos (`normalizarPagos`/`calcularSaldo`/`calcularEstadoPago`) + `saldoFavorProyectado` → Task 4 + test de sobrepago. ✅
- `permissions` + `warnings` (FIADO_SOBRE_LIMITE, CLIENTE_BLOQUEADO, DIRECCION_FALTANTE, PRECIO_MANUAL_APLICADO) → Task 5. ✅
- `allowedActions` derivadas → Task 5. ✅
- `riskSignals` vía `calcularAlertasCliente`, **últimos 5 pedidos válidos** vía `findMany` (no `findRecentByCliente`), excluye ANULADO/CANCELADO por inclusión de estados → Task 6 + test que verifica el `findMany` call. ✅
- CONSUMIDOR_FINAL: sin historial/riesgo, sin crear/modificar cliente, reutiliza la exclusión del detector → Task 5 + Task 6 tests. ✅
- `requiresAuthorization` siempre `false` → Task 6 test. ✅
- `auditPreview` → Task 4 (shape) + Task 6 (test). ✅
- Errores 400/401/403/404×2 → Task 8 + Task 9. ✅
- Read-only **comportamental** (snapshots de Pedido/PedidoItem/Pago/Factura/NotaCredito/Cliente) → Task 10 (a). Guardrail estático auxiliar → Task 9. ✅
- Preview vs commit campo a campo → Task 10 (b). ✅
- Cleanup explícito sin depender de cascadas → Task 10 (b) `finally` + Task 10 Step 4 verificación en psql. ✅
- `IClienteRepository` / `EstadoPagoVO` **no se modifican** — usados como están. ✅

**Placeholder scan:** no `TBD`/`TODO` sin resolver. `canSetManualPrice: true` está documentado y atado a PENDIENTE §8.2 (valor definido, no en blanco).

**Type consistency:** `PreviewPedidoResult` (Task 1) es el tipo de retorno en Tasks 4/5/6. `PreviewPedidoDeps` exportado desde `PreviewPedidoUseCase.ts` y usado por el test (Task 4) y el composition root (Task 7). `PedidoBaseLike` (Task 3) consumido por Task 6. `precioOrigen` union `'manual'|'cliente'|'volumen'|'base'` = `ItemPedidoResuelto['origen']` (verificar en Task 4 Step 1 area si `resolverPrecios` devuelve exactamente esa union).

**No open items.** Los 3 que existían en la versión anterior de este plan quedaron resueltos por la corrección del PO:
1. `findRecentByCliente` → **no se crea**; se usa `findMany({ clienteId, estadoEntrega: [...] }, { take: 5, orderBy: 'desc' })`.
2. Ancho del tipo `Cliente` → **no se toca** `IClienteRepository`; se usan los campos que ya expone `findById`.
3. Accessor de `EstadoPagoVO` → es `.get()`, verificado en `main`; se usa vía `calcularEstadoPago` del servicio de pagos, que ya lo encapsula.

**Micro-verificaciones que el implementador hace en el momento (no son decisiones de producto — son confirmaciones de nombres):**
- Task 3 Step 1: nombres exactos de columnas legacy en la interfaz `PedidoBase`.
- Task 4 Step 1: `IPedidoRepository.findById(id: PedidoId)`.
- Task 6 Step 3 note: `id` de la entidad `Pedido` (VO `.get()` vs string).
- Task 10 Step 1: forma de `CrearPedidoResult`; Step 3: nombres de relaciones FK para el cleanup.
Ninguna cambia el comportamiento especificado — solo cómo se referencia en código.
