# `POST /api/pedidos/preview` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the read-only `POST /api/pedidos/preview` endpoint that prepares a pedido-creation operation (prices, projected state, permissions, allowed actions, warnings, risk signals, audit preview) without persisting anything — the prerequisite for the redesigned capture (`PedidosWorkspace`) and the Pedido Hub.

**Architecture:** A new `PreviewPedidoUseCase` in `src/modules/pedidos/application/use-cases/` composes existing domain services and read-only repositories — it never writes, never takes a lock, never opens a write transaction. It reuses `IPricingPort.resolverPrecios` (same as `CrearPedidoUseCase`), `EstadoPagoVO.proyectar`, `getFiadoStatusUseCase`, `pedido-transitions.service.ts`, and `calcularAlertasCliente` (`src/lib/alertas-detector.ts`, no Prisma). A thin route controller (`src/app/api/pedidos/preview/route.ts`) validates a Zod subset of `PedidoCreateSchema`, delegates, and maps errors — mirroring the pattern of the N2 endpoints (`gestionar-pendiente/route.ts`). The real commit (`POST /api/pedidos`) revalidates everything; the preview is authoritative over nothing.

**Tech Stack:** Next.js 16 App Router route handlers, Zod 4, Vitest 3, Prisma 6 (read-only queries), the project's DDD `src/modules/pedidos/` structure.

**Contract:** `docs/pedidos/02-api-contract-pedidos.md` § "Endpoint nuevo (Fase 4 / prerequisito del blueprint — BRECHA §9.1)". Do not diverge from it without updating that file.

**Gate:** This plan is not executed until PR #220 (blueprint + contract) is approved.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/modules/pedidos/application/dto/index.ts` | add `PreviewPedidoInput` / `PreviewPedidoResult` types | Modify |
| `src/lib/validators.ts` | add `PreviewPedidoSchema` (Zod subset of `PedidoCreateSchema`) | Modify |
| `src/modules/pedidos/application/use-cases/draft-to-pedido-base.ts` | pure mapper: preview draft + resolved prices → synthetic `PedidoBase` for the risk detector | Create |
| `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts` | the use case: compose pricing + projection + permissions + warnings + risk + actions + audit, read-only | Create |
| `src/modules/pedidos/application/index.ts` | wire `previewPedidoUseCase` in the composition root | Modify |
| `src/modules/pedidos/index.ts` | export `previewPedidoUseCase` + `PreviewPedidoInput`/`PreviewPedidoResult` | Modify |
| `src/app/api/pedidos/preview/route.ts` | thin controller: auth → role → Zod → delegate → map errors | Create |
| `src/modules/pedidos/application/use-cases/__tests__/draft-to-pedido-base.test.ts` | unit tests for the mapper | Create |
| `src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts` | unit tests for the use case (mocked deps) | Create |
| `src/app/api/pedidos/preview/__tests__/route.test.ts` | route contract test (source inspection + runtime with mock) | Create |
| `src/lib/__tests__/integration/preview-pedido-integridad.test.ts` | Postgres: preview total == what `CrearPedidoUseCase` would compute | Create |
| `docs/pedidos/02-api-contract-pedidos.md` | flip "sin implementar todavía" → implemented | Modify |
| `docs/pedidos/03-blueprint-experiencia-hub.md` | §9.1: mark preview as built | Modify |

---

## Task 1: DTO types

**Files:**
- Modify: `src/modules/pedidos/application/dto/index.ts` (append near the other `*Input`/`*Result` interfaces)

- [ ] **Step 1: Add the types**

```ts
// ─── Preview (Fase 4, prerequisito del blueprint — BRECHA §9.1) ───────────────
// Read-only. NUNCA persiste. Ver docs/pedidos/02-api-contract-pedidos.md.

export interface PreviewPedidoInput {
  clienteId: string
  negocioId?: string
  canal?: 'PUNTO' | 'DOMICILIO'
  origen?: 'PEDIDO' | 'VENTA_RAPIDA' | 'VENTA_LIBRE'
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
  precioUnitario: number
  subtotal: number
  precioOrigen: 'manual' | 'cliente' | 'volumen' | 'base'
}

export interface PreviewPedidoResult {
  calculation: {
    items: PreviewCalculationItem[]
    subtotal: number
    recargoDomicilio: number
    total: number
    totalPagado: number
    saldoProyectado: number
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

Verify `ProductCode` is already imported at the top of the file (it is used by `CrearPedidoInput`). If not, add `import type { ProductCode } from '@/shared/domain'`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (types only, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/modules/pedidos/application/dto/index.ts
git commit -m "feat(pedidos): PreviewPedidoInput/Result DTOs para el endpoint de preview"
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
  it('acepta el caso mínimo (clienteId + 1 item)', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 2 }],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.canal).toBe('DOMICILIO') // default
      expect(r.data.origen).toBe('PEDIDO') // default
    }
  })

  it('rechaza items vacío', () => {
    const r = PreviewPedidoSchema.safeParse({ clienteId: 'c1', items: [] })
    expect(r.success).toBe(false)
  })

  it('rechaza clienteId en blanco', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: '   ',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
    })
    expect(r.success).toBe(false)
  })

  it('NO acepta campos de persistencia (offlineId, clienteNuevo)', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 1 }],
      offlineId: 'x',
      clienteNuevo: { nombre: 'x', telefono: '1234567' },
    })
    // strip mode: parse succeeds but the extra keys are not in data
    expect(r.success).toBe(true)
    if (r.success) {
      expect('offlineId' in r.data).toBe(false)
      expect('clienteNuevo' in r.data).toBe(false)
    }
  })

  it('acepta pagos, entregado, pedidoOrigenId', () => {
    const r = PreviewPedidoSchema.safeParse({
      clienteId: 'c1',
      items: [{ producto: 'PACA_AGUA', cantidad: 1, precioManual: 5000 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 5000 }],
      entregado: true,
      pedidoOrigenId: 'p99',
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
 * SIN campos de persistencia (offlineId, clienteNuevo, actualizarCliente,
 * direccionEntrega, barrioEntrega, productos legacy, preciosManuales record).
 * El preview es read-only: ver docs/pedidos/02-api-contract-pedidos.md.
 */
export const PreviewPedidoSchema = z.object({
  clienteId: z.string().trim().min(1),
  negocioId: z.string().trim().min(1).optional(),
  canal: z.enum(['PUNTO', 'DOMICILIO']).optional().default('DOMICILIO'),
  origen: OrigenPedidoSchema.optional().default('PEDIDO'),
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

Note: `z.object` defaults to stripping unknown keys, which is what the "NO acepta campos de persistencia" test asserts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/__tests__/validators-preview.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/lib/__tests__/validators-preview.test.ts
git commit -m "feat(pedidos): PreviewPedidoSchema (Zod subset de PedidoCreateSchema)"
```

---

## Task 3: draft → PedidoBase mapper (for the risk detector)

`calcularAlertasCliente` consumes `PedidoBase[]` with **legacy per-product columns** (`cPacaAguaPed`, `precioPacaAgua`, …). The preview draft has the new `items[]` shape. This pure mapper bridges them so the draft can be fed to the detector alongside the client's real orders.

**Files:**
- Create: `src/modules/pedidos/application/use-cases/draft-to-pedido-base.ts`
- Test: `src/modules/pedidos/application/use-cases/__tests__/draft-to-pedido-base.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/pedidos/application/use-cases/__tests__/draft-to-pedido-base.test.ts
import { describe, it, expect } from 'vitest'
import { draftToPedidoBase } from '../draft-to-pedido-base'

describe('draftToPedidoBase', () => {
  const resolved = [
    { producto: 'PACA_AGUA', cantidad: 20, precio: 2300, subtotal: 46000, origen: 'volumen' as const },
    { producto: 'BOTELLON', cantidad: 3, precio: 9000, subtotal: 27000, origen: 'base' as const },
  ]

  it('mapea items[] a las columnas legacy que el detector lee', () => {
    const pb = draftToPedidoBase({
      clienteId: 'c1',
      canal: 'DOMICILIO',
      resolvedItems: resolved,
      total: 73000,
      nowIso: '2026-09-07T10:00:00.000Z',
    })
    expect(pb.clienteId).toBe('c1')
    expect(pb.cPacaAguaPed).toBe(20)
    expect(pb.precioPacaAgua).toBe(2300)
    expect(pb.cBotellonDomPed).toBe(3) // DOMICILIO → columna dom
    expect(pb.cBotellonFabPed).toBe(0)
    expect(pb.precioBotellonDom).toBe(9000)
    expect(Number(pb.total)).toBe(73000)
    expect(pb.fecha).toBe('2026-09-07T10:00:00.000Z')
  })

  it('canal PUNTO manda BOTELLON a la columna de fábrica', () => {
    const pb = draftToPedidoBase({
      clienteId: 'c1',
      canal: 'PUNTO',
      resolvedItems: [{ producto: 'BOTELLON', cantidad: 5, precio: 8000, subtotal: 40000, origen: 'base' as const }],
      total: 40000,
      nowIso: '2026-09-07T10:00:00.000Z',
    })
    expect(pb.cBotellonFabPed).toBe(5)
    expect(pb.cBotellonDomPed).toBe(0)
    expect(pb.precioBotellonFab).toBe(8000)
  })

  it('el pedido sintético tiene estadoEntrega PENDIENTE y un id sentinela', () => {
    const pb = draftToPedidoBase({
      clienteId: 'c1',
      canal: 'DOMICILIO',
      resolvedItems: resolved,
      total: 73000,
      nowIso: '2026-09-07T10:00:00.000Z',
    })
    expect(pb.estadoEntrega).toBe('PENDIENTE')
    expect(pb.id).toBe('__preview__')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/draft-to-pedido-base.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the mapper**

```ts
// src/modules/pedidos/application/use-cases/draft-to-pedido-base.ts
/**
 * Mapea un draft de preview (items[] resueltos) a la forma `PedidoBase`
 * legacy que consume `calcularAlertasCliente` (src/lib/alertas-detector.ts).
 * Pura, sin I/O. El pedido sintético usa el id sentinela `__preview__` y
 * estadoEntrega PENDIENTE para que el detector lo trate como el pedido "de hoy".
 */

interface ResolvedItem {
  producto: string
  cantidad: number
  precio: number
  subtotal: number
  origen: 'manual' | 'cliente' | 'volumen' | 'base'
}

export interface DraftToPedidoBaseInput {
  clienteId: string
  canal: 'PUNTO' | 'DOMICILIO'
  resolvedItems: ResolvedItem[]
  total: number
  nowIso: string
}

// Shape que el detector lee (subset relevante de PedidoBase).
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

export function draftToPedidoBase(input: DraftToPedidoBaseInput): PedidoBaseLike {
  const pb: PedidoBaseLike = {
    id: '__preview__',
    clienteId: input.clienteId,
    fecha: input.nowIso,
    total: input.total,
    estadoEntrega: 'PENDIENTE',
    estadoPago: 'PENDIENTE',
    cPacaAguaPed: 0,
    cPacaHieloPed: 0,
    cBotellonFabPed: 0,
    cBotellonDomPed: 0,
    cBolsaAguaPed: 0,
    cBolsaHieloPed: 0,
    precioPacaAgua: 0,
    precioPacaHielo: 0,
    precioBotellonFab: 0,
    precioBotellonDom: 0,
    precioBolsaAgua: 0,
    precioBolsaHielo: 0,
  }

  for (const it of input.resolvedItems) {
    switch (it.producto) {
      case 'PACA_AGUA':
        pb.cPacaAguaPed = it.cantidad
        pb.precioPacaAgua = it.precio
        break
      case 'PACA_HIELO':
        pb.cPacaHieloPed = it.cantidad
        pb.precioPacaHielo = it.precio
        break
      case 'BOTELLON':
        if (input.canal === 'DOMICILIO') {
          pb.cBotellonDomPed = it.cantidad
          pb.precioBotellonDom = it.precio
        } else {
          pb.cBotellonFabPed = it.cantidad
          pb.precioBotellonFab = it.precio
        }
        break
      case 'BOLSA_AGUA':
        pb.cBolsaAguaPed = it.cantidad
        pb.precioBolsaAgua = it.precio
        break
      case 'BOLSA_HIELO':
        pb.cBolsaHieloPed = it.cantidad
        pb.precioBolsaHielo = it.precio
        break
    }
  }

  return pb
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/draft-to-pedido-base.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Verify the field names match the real `PedidoBase`**

Run: `grep -nE "cPaca|cBotellon|cBolsa|precioPaca|precioBotellon|precioBolsa|clienteId|estadoEntrega" src/lib/alertas-detector.ts | head -30`
Expected: the interface `PedidoBase` around line 96 lists exactly these column names. If any differ (e.g. `cBotellonFab` vs `cBotellonFabPed`), fix `PedidoBaseLike` and the mapper to match, and re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pedidos/application/use-cases/draft-to-pedido-base.ts src/modules/pedidos/application/use-cases/__tests__/draft-to-pedido-base.test.ts
git commit -m "feat(pedidos): mapper draft→PedidoBase para alimentar el detector de riesgo en el preview"
```

---

## Task 4: `PreviewPedidoUseCase` — pricing + projection

Build the use case incrementally. This task covers price resolution and state projection only; permissions/warnings/risk come in Tasks 5–6.

**Files:**
- Create: `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts`
- Test: `src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts
import { describe, it, expect, vi } from 'vitest'
import { PreviewPedidoUseCase, ClienteNotFoundError, PedidoOrigenNotFoundError } from '../PreviewPedidoUseCase'

function makeDeps(overrides: Partial<Parameters<typeof PreviewPedidoUseCase.prototype.constructor>[0]> = {}) {
  // Minimal fakes — only the methods the use case calls.
  const pricingPort = {
    loadPricingContext: vi.fn().mockResolvedValue({
      clienteOverrides: null,
      tiersByCode: {},
      productosByCode: {
        PACA_AGUA: { aplicaDomicilio: true, sobreCostoDomicilio: 200, precioBase: 2500 },
      },
    }),
    resolverPrecios: vi.fn().mockResolvedValue([
      { producto: 'PACA_AGUA', cantidad: 10, precio: 2700, subtotal: 27000, origen: 'base' },
    ]),
  }
  const clienteRepo = {
    findById: vi.fn().mockResolvedValue({
      id: 'c1', nombre: 'Tienda X', telefono: '3001112233',
      bloqueado: false, verificado: true, creadoPorRol: 'ADMIN',
      limitePedidosFiados: null, direccion: 'Calle 1', barrio: 'Centro',
      preciosEspeciales: null, createdAt: new Date('2025-01-01'),
    }),
  }
  const pedidoRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'p99', numero: 99 }),
    findPendingByCliente: vi.fn().mockResolvedValue([]),
    findRecentByCliente: vi.fn().mockResolvedValue([]),
  }
  const getFiadoStatusUseCase = {
    execute: vi.fn().mockResolvedValue({ count: 0, limite: 2, nivel: 'ok', pedidos: [] }),
  }
  const getPrecioMinimos = vi.fn().mockResolvedValue([])
  return { pricingPort, clienteRepo, pedidoRepo, getFiadoStatusUseCase, getPrecioMinimos, ...overrides } as never
}

describe('PreviewPedidoUseCase — pricing + projection', () => {
  it('calcula subtotal/total desde los precios resueltos por el port', async () => {
    const uc = new PreviewPedidoUseCase(makeDeps())
    const r = await uc.execute({
      clienteId: 'c1', canal: 'DOMICILIO', origen: 'PEDIDO',
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      actorId: 'u1',
    })
    expect(r.calculation.subtotal).toBe(27000)
    expect(r.calculation.total).toBe(27000)
    expect(r.calculation.items[0].precioOrigen).toBe('base')
  })

  it('proyecta estadoEntrega ENTREGADO cuando entregado===true', async () => {
    const uc = new PreviewPedidoUseCase(makeDeps())
    const r = await uc.execute({
      clienteId: 'c1', canal: 'PUNTO', origen: 'VENTA_RAPIDA', entregado: true,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 27000 }],
      actorId: 'u1',
    })
    expect(r.calculation.estadoEntregaProyectado).toBe('ENTREGADO')
    expect(r.calculation.estadoPagoProyectado).toBe('PAGADO')
    expect(r.calculation.saldoProyectado).toBe(0)
  })

  it('prepago total + entrega posterior → ANTICIPADO', async () => {
    const uc = new PreviewPedidoUseCase(makeDeps())
    const r = await uc.execute({
      clienteId: 'c1', canal: 'PUNTO', origen: 'PEDIDO', entregado: false,
      items: [{ producto: 'PACA_AGUA', cantidad: 10 }],
      pagos: [{ metodo: 'EFECTIVO', monto: 27000 }],
      actorId: 'u1',
    })
    expect(r.calculation.estadoEntregaProyectado).toBe('PENDIENTE')
    expect(r.calculation.estadoPagoProyectado).toBe('ANTICIPADO')
  })

  it('lanza ClienteNotFoundError si el cliente no existe', async () => {
    const deps = makeDeps()
    ;(deps as { clienteRepo: { findById: ReturnType<typeof vi.fn> } }).clienteRepo.findById.mockResolvedValue(null)
    const uc = new PreviewPedidoUseCase(deps)
    await expect(
      uc.execute({ clienteId: 'nope', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' }),
    ).rejects.toThrow(ClienteNotFoundError)
  })

  it('lanza PedidoOrigenNotFoundError si pedidoOrigenId no existe', async () => {
    const deps = makeDeps()
    ;(deps as { pedidoRepo: { findById: ReturnType<typeof vi.fn> } }).pedidoRepo.findById.mockResolvedValue(null)
    const uc = new PreviewPedidoUseCase(deps)
    await expect(
      uc.execute({
        clienteId: 'c1', pedidoOrigenId: 'ghost',
        items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1',
      }),
    ).rejects.toThrow(PedidoOrigenNotFoundError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Check the real repo method names before implementing**

Run: `grep -nE "findById|findPendingByCliente|findRecent|findMany|findByCliente" src/modules/pedidos/domain/repositories/IPedidoRepository.ts`
Expected: confirms `findById` and `findPendingByCliente` exist. For the client's recent orders (risk detector input) there may be no ready method — if `findRecentByCliente` does not exist, add it to `IPedidoRepository` + `PrismaPedidoRepository` as a **read-only** method returning the legacy shape the detector needs (last ~10 non-cancelled orders of the client), and add a sub-step here. Mirror `findPendingByCliente`'s implementation.

- [ ] **Step 4: Implement the use case (pricing + projection only)**

```ts
// src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts
import type { IPricingPort } from '../../domain/repositories/IPricingPort'
import type { IClienteRepository } from '../../domain/repositories/IClienteRepository'
import type { IPedidoRepository } from '../../domain/repositories/IPedidoRepository'
import type { GetFiadoStatusUseCase } from './GetFiadoStatusUseCase'
import type { PreviewPedidoInput, PreviewPedidoResult, PreviewCalculationItem } from '../dto'
import type { ProductCode } from '@/shared/domain'
import { EstadoPagoVO } from '../../domain/value-objects/EstadoPago'

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
      const origenPedido = await this.deps.pedidoRepo.findById(input.pedidoOrigenId)
      if (!origenPedido) throw new PedidoOrigenNotFoundError(input.pedidoOrigenId)
    }

    // ── Pricing (mismo port que CrearPedidoUseCase) ──
    const activeCodes = [...new Set(input.items.map(i => i.producto))] as ProductCode[]
    const pricingData = await this.deps.pricingPort.loadPricingContext(
      input.clienteId, input.negocioId ?? null, activeCodes,
    )
    const resueltos = await this.deps.pricingPort.resolverPrecios(
      input.items.map(i => ({ codigo: i.producto as ProductCode, cantidad: i.cantidad, precioManual: i.precioManual })),
      canal, pricingData,
    )

    const items: PreviewCalculationItem[] = resueltos.map(r => ({
      producto: r.producto,
      cantidad: r.cantidad,
      precioUnitario: r.precio,
      subtotal: r.subtotal,
      precioOrigen: r.origen,
    }))
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0)
    // recargoDomicilio = diferencia contra el precio base cuando canal===DOMICILIO.
    const recargoDomicilio = canal === 'DOMICILIO'
      ? resueltos.reduce((acc, r) => {
          const cfg = pricingData.productosByCode[r.producto]
          return acc + (cfg?.aplicaDomicilio ? cfg.sobreCostoDomicilio * r.cantidad : 0)
        }, 0)
      : 0
    const total = subtotal

    const totalPagado = (input.pagos ?? []).reduce((s, p) => s + p.monto, 0)
    const estadoEntregaProyectado: 'PENDIENTE' | 'ENTREGADO' = input.entregado === true ? 'ENTREGADO' : 'PENDIENTE'
    const estadoPagoProyectado = EstadoPagoVO.proyectar(total, totalPagado, estadoEntregaProyectado).get() as
      'PENDIENTE' | 'PARCIAL' | 'PAGADO' | 'ANTICIPADO'
    const saldoProyectado = Math.max(0, total - totalPagado)

    const tienePrecioManual = resueltos.some(r => r.origen === 'manual')

    // permissions / warnings / risk / actions — Tasks 5–6.
    return {
      calculation: {
        items, subtotal, recargoDomicilio, total,
        totalPagado, saldoProyectado, estadoEntregaProyectado, estadoPagoProyectado,
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

Adjust `EstadoPagoVO.proyectar(...).get()` if the VO's accessor is named differently — check with `grep -nE "get\(\)|value|toString" src/modules/pedidos/domain/value-objects/EstadoPago.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts
git commit -m "feat(pedidos): PreviewPedidoUseCase — pricing + proyección de estado (read-only)"
```

---

## Task 5: `PreviewPedidoUseCase` — permissions + warnings

**Files:**
- Modify: `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts`
- Modify: `src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe('PreviewPedidoUseCase — permissions + warnings', () => {
  it('fiado sobre el límite → canCreate false + warning FIADO_SOBRE_LIMITE', async () => {
    const deps = makeDeps()
    ;(deps as { getFiadoStatusUseCase: { execute: ReturnType<typeof vi.fn> } }).getFiadoStatusUseCase.execute
      .mockResolvedValue({ count: 2, limite: 2, nivel: 'limite', pedidos: [{ id: 'a', numero: 1, saldo: 100 }, { id: 'b', numero: 2, saldo: 200 }] })
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.permissions.canCreate).toBe(false)
    expect(r.warnings.some(w => w.code === 'FIADO_SOBRE_LIMITE')).toBe(true)
    expect(r.allowedActions).not.toContain('crear')
  })

  it('cliente bloqueado → canCreate false + warning CLIENTE_BLOQUEADO', async () => {
    const deps = makeDeps()
    ;(deps as { clienteRepo: { findById: ReturnType<typeof vi.fn> } }).clienteRepo.findById.mockResolvedValue({
      id: 'c1', nombre: 'X', telefono: '3001112233', bloqueado: true, verificado: true,
      creadoPorRol: 'ADMIN', limitePedidosFiados: null, direccion: 'Calle 1', barrio: 'Centro',
      preciosEspeciales: null, createdAt: new Date('2025-01-01'),
    })
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.permissions.canCreate).toBe(false)
    expect(r.warnings.some(w => w.code === 'CLIENTE_BLOQUEADO')).toBe(true)
  })

  it('canal DOMICILIO sin dirección resuelta → warning DIRECCION_FALTANTE (no bloquea)', async () => {
    const deps = makeDeps()
    ;(deps as { clienteRepo: { findById: ReturnType<typeof vi.fn> } }).clienteRepo.findById.mockResolvedValue({
      id: 'c1', nombre: 'X', telefono: '3001112233', bloqueado: false, verificado: true,
      creadoPorRol: 'ADMIN', limitePedidosFiados: null, direccion: null, barrio: null,
      preciosEspeciales: null, createdAt: new Date('2025-01-01'),
    })
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'c1', canal: 'DOMICILIO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'DIRECCION_FALTANTE' && w.field === 'direccion')).toBe(true)
    expect(r.permissions.canCreate).toBe(true)
    expect(r.allowedActions).toContain('crear')
  })

  it('precio manual aplicado → warning PRECIO_MANUAL_APLICADO', async () => {
    const deps = makeDeps()
    ;(deps as { pricingPort: { resolverPrecios: ReturnType<typeof vi.fn> } }).pricingPort.resolverPrecios
      .mockResolvedValue([{ producto: 'PACA_AGUA', cantidad: 10, precio: 1000, subtotal: 10000, origen: 'manual' }])
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 10, precioManual: 1000 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'PRECIO_MANUAL_APLICADO')).toBe(true)
  })

  it('CONSUMIDOR_FINAL nunca dispara warnings de fiado', async () => {
    const deps = makeDeps()
    ;(deps as { clienteRepo: { findById: ReturnType<typeof vi.fn> } }).clienteRepo.findById.mockResolvedValue({
      id: 'CONSUMIDOR_FINAL', nombre: 'Consumidor Final', telefono: '', bloqueado: false, verificado: true,
      creadoPorRol: 'ADMIN', limitePedidosFiados: null, direccion: null, barrio: null,
      preciosEspeciales: null, createdAt: new Date('2025-01-01'),
    })
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'CONSUMIDOR_FINAL', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.warnings.some(w => w.code === 'FIADO_SOBRE_LIMITE')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify new tests fail**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: FAIL — 5 new tests fail (warnings always `[]`, canCreate always true)

- [ ] **Step 3: Implement permissions + warnings**

In `PreviewPedidoUseCase.execute`, replace the hard-coded `permissions`/`warnings`/`allowedActions` with:

```ts
    // ── Permissions + warnings ──
    const warnings: PreviewPedidoResult['warnings'] = []
    const esAnonimo = input.clienteId === 'CONSUMIDOR_FINAL'

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

    const canSetManualPrice = true // TODO cuando exista política (§8.2); hoy no se restringe para ADMIN/ASISTENTE
```

And use `canCreate`, `warnings`, `allowedActions`, `canSetManualPrice` in the returned object (replace the placeholders).

> `IClienteRepository.findById` must return `bloqueado` and `direccion`. Verify: `grep -nE "bloqueado|direccion|verificado" src/modules/pedidos/domain/repositories/IClienteRepository.ts`. If the domain `Cliente` type omits them, widen it (read-only fields) and update `PrismaClienteRepository.findById`'s `select`.

- [ ] **Step 4: Run to verify all pass**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts
git commit -m "feat(pedidos): preview — permissions + warnings (fiado, bloqueado, dirección, precio manual)"
```

---

## Task 6: `PreviewPedidoUseCase` — riskSignals + auditPreview finalization

**Files:**
- Modify: `src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts`
- Modify: its test file

- [ ] **Step 1: Add failing tests**

```ts
describe('PreviewPedidoUseCase — riskSignals', () => {
  it('precio por debajo de la tabla → riskSignal PRECIO_POR_DEBAJO_TABLA', async () => {
    const deps = makeDeps()
    ;(deps as { pricingPort: { resolverPrecios: ReturnType<typeof vi.fn> } }).pricingPort.resolverPrecios
      .mockResolvedValue([{ producto: 'PACA_AGUA', cantidad: 20, precio: 1500, subtotal: 30000, origen: 'manual' }])
    ;(deps as { getPrecioMinimos: ReturnType<typeof vi.fn> }).getPrecioMinimos
      .mockResolvedValue([{ producto: 'PACA_AGUA', cantMin: 1, cantMax: null, precioMinimo: 2300 }])
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 20, precioManual: 1500 }], actorId: 'u1' })
    expect(r.riskSignals.some(s => s.tipo === 'PRECIO_POR_DEBAJO_TABLA')).toBe(true)
    // señal ≠ bloqueo: 'crear' sigue disponible
    expect(r.allowedActions).toContain('crear')
  })

  it('sin señales → riskSignals vacío y no bloquea', async () => {
    const uc = new PreviewPedidoUseCase(makeDeps())
    const r = await uc.execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 1 }], actorId: 'u1' })
    expect(r.riskSignals).toEqual([])
  })

  it('requiresAuthorization es SIEMPRE false hoy (sin política de umbral)', async () => {
    const deps = makeDeps()
    ;(deps as { pricingPort: { resolverPrecios: ReturnType<typeof vi.fn> } }).pricingPort.resolverPrecios
      .mockResolvedValue([{ producto: 'PACA_AGUA', cantidad: 100, precio: 1, subtotal: 100, origen: 'manual' }])
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'c1', items: [{ producto: 'PACA_AGUA', cantidad: 100, precioManual: 1 }], actorId: 'u1' })
    expect(r.requiresAuthorization).toBe(false)
  })

  it('auditPreview refleja actor + total + tienePrecioManual', async () => {
    const deps = makeDeps()
    ;(deps as { pricingPort: { resolverPrecios: ReturnType<typeof vi.fn> } }).pricingPort.resolverPrecios
      .mockResolvedValue([{ producto: 'PACA_AGUA', cantidad: 2, precio: 3000, subtotal: 6000, origen: 'manual' }])
    const uc = new PreviewPedidoUseCase(deps)
    const r = await uc.execute({ clienteId: 'c1', canal: 'PUNTO', items: [{ producto: 'PACA_AGUA', cantidad: 2, precioManual: 3000 }], actorId: 'u-audit' })
    expect(r.auditPreview.actor).toBe('u-audit')
    expect(r.auditPreview.valoresRelevantes.total).toBe(6000)
    expect(r.auditPreview.valoresRelevantes.tienePrecioManual).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify new tests fail**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: FAIL — `PRECIO_POR_DEBAJO_TABLA` signal test fails (riskSignals always `[]`)

- [ ] **Step 3: Implement riskSignals**

Add near the top of `PreviewPedidoUseCase.ts`:

```ts
import { calcularAlertasCliente } from '@/lib/alertas-detector'
import { draftToPedidoBase } from './draft-to-pedido-base'
```

In `execute`, before building the return object:

```ts
    // ── Risk signals (detector detectivo, no bloquea) ──
    const [pedidosRecientes, precioMinimos] = await Promise.all([
      this.deps.pedidoRepo.findRecentByCliente(input.clienteId),
      this.deps.getPrecioMinimos(),
    ])
    const draftPedido = draftToPedidoBase({
      clienteId: input.clienteId,
      canal,
      resolvedItems: resueltos,
      total,
      nowIso: new Date().toISOString(),
    })
    const alertas = calcularAlertasCliente(
      {
        id: cliente.id, nombre: cliente.nombre ?? '', telefono: cliente.telefono ?? '',
        verificado: cliente.verificado, bloqueado: cliente.bloqueado,
        creadoPorRol: cliente.creadoPorRol,
        createdAt: cliente.createdAt ? new Date(cliente.createdAt).toISOString() : undefined,
      },
      [...pedidosRecientes, draftPedido] as never,
      { precioMinimos },
    )
    const riskSignals = alertas.map(a => ({ tipo: a.tipo, severidad: a.severidad, detalle: a.detalle }))
```

Use `riskSignals` in the returned object. Keep `requiresAuthorization: false` (comment: activates with §8.2 policy).

> If `IPedidoRepository` has no `findRecentByCliente`, add it (Task 4 Step 3 flagged this). It returns the last ~10 non-cancelled orders of the client in the legacy `PedidoBase` shape the detector reads. Read-only; mirror `findPendingByCliente`.

- [ ] **Step 4: Run to verify all pass**

Run: `npm run test -- src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Full unit suite + typecheck**

Run: `npx tsc --noEmit && npm run test -- src/modules/pedidos`
Expected: PASS, 0 regressions

- [ ] **Step 6: Commit**

```bash
git add src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts src/modules/pedidos/application/use-cases/__tests__/PreviewPedidoUseCase.test.ts
git commit -m "feat(pedidos): preview — riskSignals via calcularAlertasCliente (señal ≠ bloqueo)"
```

---

## Task 7: Wire the composition root

**Files:**
- Modify: `src/modules/pedidos/application/index.ts`
- Modify: `src/modules/pedidos/index.ts`
- Modify: `src/lib/pricing.ts` — confirm `getPrecioMinimos` is exported (it is, per grep); no change expected

- [ ] **Step 1: Add to the composition root**

In `src/modules/pedidos/application/index.ts`, after `getFiadoStatusUseCase` is created:

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

(Place the `getFiadoStatusUseCase` const definition before this if it is not already there — check the file; the export exists so the const does too.)

- [ ] **Step 2: Export from the module barrel**

In `src/modules/pedidos/index.ts`, add `previewPedidoUseCase` to the `export { … } from './application'` list, and add to the DTO re-export coverage (already covered by `export type * from './application/dto'`).

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
 * POST /api/pedidos/preview — prepara una creación de pedido SIN persistir.
 * BRECHA §9.1 del blueprint (docs/pedidos/03-blueprint-experiencia-hub.md).
 * Contrato: docs/pedidos/02-api-contract-pedidos.md.
 * Read-only: sin lock, sin transacción de escritura, sin offlineId.
 * El commit real (POST /api/pedidos) revalida todo.
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

- [ ] **Step 3: Manual smoke via dev server**

Run (dev server up, `docker compose up -d`):
```bash
curl -s -X POST http://localhost:3000/api/pedidos/preview -H 'Content-Type: application/json' -b <cookie-de-sesión-admin> \
  -d '{"clienteId":"CONSUMIDOR_FINAL","canal":"PUNTO","items":[{"producto":"PACA_AGUA","cantidad":2}]}' | jq
```
Expected: `{ "success": true, "calculation": { ... }, "permissions": { ... }, ... }`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pedidos/preview/route.ts
git commit -m "feat(pedidos): POST /api/pedidos/preview (thin controller, read-only)"
```

---

## Task 9: Route contract test

**Files:**
- Create: `src/app/api/pedidos/preview/__tests__/route.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/app/api/pedidos/preview/__tests__/route.test.ts
// Contract test del thin controller: rol, delegación, mapeo de errores, y
// la garantía read-only (el archivo no importa repos de escritura ni lock).
// El PreviewPedidoUseCase en sí está cubierto en su propio test unitario.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/pedidos/preview/route.ts'),
  'utf-8',
)

describe('POST /api/pedidos/preview', () => {
  it('exige requireRole([ADMIN, ASISTENTE])', () => {
    expect(routeSource).toMatch(/requireRole\(\[ROLES\.ADMIN,\s*ROLES\.ASISTENTE\]/)
  })

  it('delega en previewPedidoUseCase (no reimplementa lógica)', () => {
    expect(routeSource).toMatch(/previewPedidoUseCase\.execute\(/)
  })

  it('valida con PreviewPedidoSchema antes de delegar', () => {
    expect(routeSource).toMatch(/PreviewPedidoSchema\.safeParse/)
  })

  it('inyecta actorId desde la sesión, no desde el body', () => {
    expect(routeSource).toMatch(/actorId\s*=\s*role\.user\?\.id/)
    expect(routeSource).toMatch(/\{\s*\.\.\.parsed\.data,\s*actorId\s*\}/)
  })

  it('mapea CLIENTE_NOT_FOUND y PEDIDO_ORIGEN_NOT_FOUND a 404', () => {
    expect(routeSource).toMatch(/CLIENTE_NOT_FOUND[\s\S]{0,120}404/)
    expect(routeSource).toMatch(/PEDIDO_ORIGEN_NOT_FOUND[\s\S]{0,120}404/)
  })

  it('READ-ONLY: no importa repos de escritura, TransactionManager ni advisory lock', () => {
    expect(routeSource).not.toMatch(/TransactionManager/)
    expect(routeSource).not.toMatch(/withAdvisoryLock|withLock|SECUENCIA:|CARTERA:/)
    expect(routeSource).not.toMatch(/\$transaction/)
    expect(routeSource).not.toMatch(/crearPedidoUseCase|Repository\b/)
  })
})
```

- [ ] **Step 2: Run**

Run: `npm run test -- src/app/api/pedidos/preview/__tests__/route.test.ts`
Expected: PASS (6 tests). If the "inyecta actorId" regex is too strict for the exact formatting, relax it to match your final code — keep the intent (actorId comes from `role.user`, not `parsed.data`).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/pedidos/preview/__tests__/route.test.ts
git commit -m "test(pedidos): contract test de POST /api/pedidos/preview (rol, delegación, read-only)"
```

---

## Task 10: Integration test (Postgres) — preview matches the real commit

Proves the preview's `total` and projected state equal what `CrearPedidoUseCase` would actually compute, against real data. This is the one place the composition is verified end-to-end.

**Files:**
- Create: `src/lib/__tests__/integration/preview-pedido-integridad.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/lib/__tests__/integration/preview-pedido-integridad.test.ts
// @integration — corre contra el Postgres de docker-compose (puerto 5433).
// Verifica que POST /api/pedidos/preview calcula el MISMO total/estado que
// POST /api/pedidos realmente persiste, para el mismo input.

import { describe, it, expect, beforeAll } from 'vitest'
import { previewPedidoUseCase, crearPedidoUseCase } from '@/modules/pedidos'
import { prisma } from '@/lib/prisma'

describe('preview vs commit — integridad', () => {
  let clienteId: string

  beforeAll(async () => {
    const cliente = await prisma.cliente.findFirst({
      where: { activo: true, id: { not: 'CONSUMIDOR_FINAL' }, bloqueado: false },
      select: { id: true },
    })
    if (!cliente) throw new Error('seed sin cliente activo — corré `npx tsx prisma/seed.ts`')
    clienteId = cliente.id
  })

  it('el total y el estado proyectado del preview == los del pedido creado', async () => {
    const input = {
      clienteId,
      canal: 'DOMICILIO' as const,
      origen: 'PEDIDO' as const,
      items: [{ producto: 'PACA_AGUA' as const, cantidad: 5 }],
    }

    const preview = await previewPedidoUseCase.execute({ ...input, actorId: 'test' })

    const created = await crearPedidoUseCase.execute({
      ...input,
      createdById: undefined,
      createdByRole: 'ADMIN',
    })

    expect(preview.calculation.total).toBe(Number(created.pedido.total))
    expect(preview.calculation.estadoEntregaProyectado).toBe(created.pedido.estadoEntrega)
    expect(preview.calculation.estadoPagoProyectado).toBe(created.pedido.estadoPago)

    // limpieza
    await prisma.pedido.delete({ where: { id: created.pedido.id } }).catch(() => {})
  })

  it('el preview no creó ninguna fila', async () => {
    const before = await prisma.pedido.count()
    await previewPedidoUseCase.execute({
      clienteId, canal: 'PUNTO', origen: 'VENTA_RAPIDA',
      items: [{ producto: 'PACA_AGUA', cantidad: 3 }], actorId: 'test',
    })
    const after = await prisma.pedido.count()
    expect(after).toBe(before)
  })
})
```

- [ ] **Step 2: Run**

Run: `npm run test -- --config vitest.integration.config.ts src/lib/__tests__/integration/preview-pedido-integridad.test.ts`
Expected: PASS (2 tests). If `crearPedidoUseCase.execute`'s input signature differs (check `CrearPedidoInput`), align the `created` call — the point is same items/canal/origen.

- [ ] **Step 3: Register the migration-independent test in CI**

The integration test needs no migration. Confirm `src/lib/__tests__/integration/**` is already globbed by `vitest.integration.config.ts` (it is — other files live there). No CI list edit needed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/__tests__/integration/preview-pedido-integridad.test.ts
git commit -m "test(pedidos): integración preview vs commit (mismo total/estado, cero filas creadas)"
```

---

## Task 11: Docs + final verification

**Files:**
- Modify: `docs/pedidos/02-api-contract-pedidos.md`
- Modify: `docs/pedidos/03-blueprint-experiencia-hub.md`

- [ ] **Step 1: Flip the contract status**

In `02-api-contract-pedidos.md`, change:
`**Estado:** contrato definido (2026-09-07) — **sin implementar todavía**.`
→
`**Estado:** implementado (PR #<n>). Ruta: \`src/app/api/pedidos/preview/route.ts\`, use case: \`PreviewPedidoUseCase\`.`

- [ ] **Step 2: Update blueprint §9.1**

In `03-blueprint-experiencia-hub.md` §9.1, change "Pendiente: aprobación del contrato → plan de implementación → código." to note it's built, and update §10 row C2 accordingly.

- [ ] **Step 3: Full verification (protocolo AGENTS.md)**

```bash
npx tsc --noEmit
npm run test
npm run test -- --config vitest.integration.config.ts
npx eslint src/app/api/pedidos/preview src/modules/pedidos/application/use-cases/PreviewPedidoUseCase.ts src/modules/pedidos/application/use-cases/draft-to-pedido-base.ts --max-warnings 0
```
Expected: all green, 0 regressions vs the pre-task baseline count.

- [ ] **Step 4: Commit**

```bash
git add docs/pedidos/02-api-contract-pedidos.md docs/pedidos/03-blueprint-experiencia-hub.md
git commit -m "docs(pedidos): marcar POST /api/pedidos/preview como implementado"
```

- [ ] **Step 5: Push + PR**

```bash
git push -u origin feat/pedidos-preview-endpoint
gh pr create --base main --title "feat(pedidos): POST /api/pedidos/preview (prerequisito Fase 4)" --body "Implementa el endpoint de preview definido en 02-api-contract-pedidos.md. Read-only (contract test lo verifica). Cierra la BRECHA §9.1 del blueprint. Depende conceptualmente de PR #220 (blueprint) — mergear después."
```

---

## Self-Review

**Spec coverage** (against `02-api-contract-pedidos.md` § preview):
- Request shape → Task 2 (`PreviewPedidoSchema`). ✅
- `calculation` (items/subtotal/recargo/total/totalPagado/saldo/estados) → Task 4. ✅
- `permissions` (canCreate/canSetManualPrice) → Task 5. ✅
- `allowedActions` → Task 5 (derived from canCreate + projected state). ✅
- `warnings` (FIADO_SOBRE_LIMITE, CLIENTE_BLOQUEADO, DIRECCION_FALTANTE, PRECIO_MANUAL_APLICADO) → Task 5. ✅
- `riskSignals` via `calcularAlertasCliente` → Task 6. ✅
- `requiresAuthorization` always `false` today → Task 6 (test asserts it). ✅
- `auditPreview` → Task 4 (shape) + Task 6 (test). ✅
- Errors 400/401/403/404×2 → Task 8 (route) + Task 9 (contract test). ✅
- Read-only guarantee → Task 9 (grep assertions) + Task 10 (row count unchanged). ✅
- "commit revalidates" → Task 10 (preview total == created total). ✅

**Placeholder scan:** one intentional `TODO` in Task 5 Step 3 (`canSetManualPrice` policy) — it is tied to PENDIENTE §8.2 of the blueprint and the value is defined (`true`), not left blank. Acceptable.

**Type consistency:** `PreviewPedidoResult` (Task 1) is the return type used in Tasks 4/5/6. `precioOrigen` union `'manual'|'cliente'|'volumen'|'base'` matches `ItemPedidoResuelto['origen']` (verify in `src/modules/pedidos/domain/types` during Task 4). `EstadoPagoVO.proyectar(...).get()` accessor to be confirmed in Task 4 Step 4. `findRecentByCliente` is flagged as possibly-new in Tasks 4 and 6 with instructions to add it read-only.

## Open items surfaced by this plan (resolve during execution, not by inventing)

1. `IPedidoRepository.findRecentByCliente` likely does not exist — add it read-only (Tasks 4/6 flag it). If adding a repo method feels out of scope, an alternative is a direct `prisma.pedido.findMany` inside the composition root wrapper — but prefer the repo method for consistency.
2. `IClienteRepository.findById` return type must expose `bloqueado`, `direccion`, `verificado`, `creadoPorRol`, `createdAt` — widen if needed (Task 5).
3. `EstadoPagoVO` accessor name (`.get()` vs `.value`) — confirm in Task 4.
