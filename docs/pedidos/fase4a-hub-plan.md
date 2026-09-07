# Fase 4a — Pedido Hub: shell + focos + lista adaptativa · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o superpowers:executing-plans, tarea por tarea. Steps con checkbox (`- [ ]`).

**Goal:** Reemplazar la superficie de consulta de `/pedidos` (tabs Hoy/Fiados/Alertas + banda de ~20 chips de filtro) por el **Pedido Hub** del blueprint: cabecera de focos accionables + lista adaptativa (responsive table, 5 columnas por defecto, microcopy de estado, acción destacada derivada del estado). **Detrás del flag `NEXT_PUBLIC_PEDIDOS_V2`** (OFF por defecto → UI actual intacta).

**Fuera de alcance de 4a** (fases siguientes): peek / detalle contextual (4b) · command menu (4b) · captura rediseñada / `PedidosWorkspace` (Composición) · N2/G11 en el flujo (Fases 5/6) · retiro de la UI legacy (Fase 10).

**Architecture:** SSR (`page.tsx`) sigue trayendo la lista paginada. `GET /api/pedidos/counts` se **extiende** (aditivo) con los conteos que faltan para los focos (un solo round-trip). Un cliente nuevo `pedido-hub/` orquesta lista + focos, deriva estado/acción con `pedido-transitions.service` + `visual-states.ts` (**no redefine reglas**), y consume realtime `pedido.*`/`pago.*`/`embarque.*` + polling 60s. El flag envuelve solo la vista de consulta dentro de `pedidos-client/index.tsx`; FAB, modales y las vistas autocontenidas (atrasados/enRiesgo) quedan compartidos.

**Tech Stack:** Next.js 16 App Router (SSR + Client Components), React 19, Vitest 3, Playwright 1.59, Tailwind 4. Sin librerías nuevas.

**Autoridad:** `docs/pedidos/03-blueprint-experiencia-hub.md` §2 (arquitectura de información) + §4 (carga). Gates aplicables: **G2** (sin destinos Recurrentes/Únicos/Alertas/Fiados), **G5** (origen/canal/entrega/pago no colapsados), **G6** (estado = microcopy, no badges apilados), **G9** (offline muestra estado real), **G10** (Playwright happy + responsive + offline).

**Precedente en el repo:** Embarques Command Center (`src/app/(app)/embarques/embarques-client/command-center/`) — mismo patrón flag + `KpiRow` derivado de la lista + `data-testid` desktop/mobile + realtime. **Diferencia clave:** los focos del Hub necesitan conteos cross-cutting (fiado $, N2) que no se pueden derivar de una página paginada → van en `/counts`.

**Gate:** No se ejecuta hasta que el PO apruebe (a) este plan y (b) PR #220 + #221. Es la primera fase que toca UI visible a los 6 usuarios (00-plan §2.6).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/app/api/pedidos/counts/route.ts` | +`enRutaCount`, `esperandoPagoTotal`, `pendientesN2Count` (aditivo) | Modify |
| `src/app/api/pedidos/counts/__tests__/route-focos.test.ts` | shape del GET incluye los conteos nuevos | Create |
| `src/lib/flags.ts` (o donde vivan los flags) | helper `pedidosV2Enabled()` | Modify/Create |
| `src/app/(app)/pedidos/pedido-hub/derive-operacion.ts` | puro: `(pedido) → { estadoLegible, accionDestacada, focos }` reusando transitions + visual-states | Create |
| `src/app/(app)/pedidos/pedido-hub/foco-strip.tsx` | los 5 focos como filtros de un clic; disciplina de color | Create |
| `src/app/(app)/pedidos/pedido-hub/operacion-list.tsx` | responsive table (desktop) / tarjetas (mobile), 5 columnas por defecto | Create |
| `src/app/(app)/pedidos/pedido-hub/index.tsx` | orquesta: SSR data + counts + realtime + polling + foco state | Create |
| `src/app/(app)/pedidos/pedido-hub/types.ts` | tipos del Hub | Create |
| `src/app/(app)/pedidos/pedido-hub/__tests__/derive-operacion.test.ts` | unit del derivador | Create |
| `src/app/(app)/pedidos/pedido-hub/__tests__/foco-strip.test.tsx` | unit del strip (multi-pertenencia, color, un-clic) | Create |
| `src/app/(app)/pedidos/pedido-hub/__tests__/operacion-list.test.tsx` | unit de la lista (columnas, microcopy, acción destacada, responsive) | Create |
| `src/app/(app)/pedidos/pedidos-client/index.tsx` | condicionar la vista de consulta al flag | Modify |
| `src/app/(app)/pedidos/loading.tsx` | skeleton del Hub cuando el flag está ON | Modify |
| `e2e/pedidos-hub.spec.ts` | E2E: focos filtran, microcopy, responsive, offline | Create |
| `.env.example` | descomentar la nota de `NEXT_PUBLIC_PEDIDOS_V2` | Modify |

---

## Task 1: Extender `GET /api/pedidos/counts` con los conteos de focos

**Files:**
- Modify: `src/app/api/pedidos/counts/route.ts`
- Test: `src/app/api/pedidos/counts/__tests__/route-focos.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/pedidos/counts/__tests__/route-focos.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'src/app/api/pedidos/counts/route.ts'), 'utf-8')

describe('GET /api/pedidos/counts — focos del Hub', () => {
  it('el response incluye los conteos nuevos', () => {
    expect(src).toMatch(/enRutaCount/)
    expect(src).toMatch(/esperandoPagoTotal/)
    expect(src).toMatch(/pendientesN2Count/)
  })

  it('enRuta se cuenta por estadoEntrega EN_RUTA', () => {
    expect(src).toMatch(/estadoEntrega:\s*['"]EN_RUTA['"]/)
  })

  it('esperandoPagoTotal suma saldo de ENTREGADO con saldo > 0 (excluye CONSUMIDOR_FINAL)', () => {
    expect(src).toMatch(/CANONICAL_CONSUMIDOR_FINAL_ID/)
    expect(src).toMatch(/_sum:\s*\{\s*saldo:\s*true\s*\}|aggregate/)
  })

  it('pendientesN2 se cuenta sobre ObligacionPendiente activa', () => {
    expect(src).toMatch(/obligacionPendiente|ObligacionPendiente/)
  })
})
```

- [ ] **Step 2: Run — expect fail**

Run: `npm run test -- src/app/api/pedidos/counts/__tests__/route-focos.test.ts`
Expected: FAIL (los identificadores no existen aún)

- [ ] **Step 3: Verificar el nombre del modelo N2 y su estado activo**

Run: `grep -nE "model ObligacionPendiente" prisma/schema.prisma && grep -nE "estado|ABIERTA|status" prisma/schema.prisma | grep -A2 -B2 Obligacion`
Expected: confirma el modelo `ObligacionPendiente` y su campo de estado (probablemente `estado: EstadoObligacion` con valor `ABIERTA`). Ajustar Step 4 al nombre real. Si el modelo se llama distinto, usar el real y actualizar el test.

- [ ] **Step 4: Implementar los 3 conteos (aditivo, en paralelo)**

En `route.ts`, dentro del `try`, agregar al `Promise.all` existente (o crear uno) — **sin quitar** los conteos actuales:

```ts
    const [enRutaCount, esperandoPagoAgg, pendientesN2Count] = await Promise.all([
      prisma.pedido.count({ where: { estadoEntrega: 'EN_RUTA' } }),
      prisma.pedido.aggregate({
        _sum: { saldo: true },
        where: {
          estadoEntrega: 'ENTREGADO',
          saldo: { gt: 0 },
          clienteId: { not: CANONICAL_CONSUMIDOR_FINAL_ID },
        },
      }),
      prisma.obligacionPendiente.count({ where: { estado: 'ABIERTA' } }), // ajustar al enum real (Step 3)
    ])
```

Y en el `apiSuccess({...})`:

```ts
      enRutaCount,
      esperandoPagoTotal: Number(esperandoPagoAgg._sum.saldo ?? 0),
      pendientesN2Count,
```

- [ ] **Step 5: Run — expect pass**

Run: `npm run test -- src/app/api/pedidos/counts/__tests__/route-focos.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Smoke en vivo** (dev server + cookie admin)

```bash
curl -s http://localhost:3000/api/pedidos/counts -b <cookie> | jq
```
Expected: incluye `enRutaCount`, `esperandoPagoTotal`, `pendientesN2Count` además de los 4 previos.

- [ ] **Step 7: Actualizar `02-api-contract-pedidos.md`** §1.2 (fila de `GET /api/pedidos/counts`) con los 3 campos nuevos.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/pedidos/counts/route.ts src/app/api/pedidos/counts/__tests__/route-focos.test.ts docs/pedidos/02-api-contract-pedidos.md
git commit -m "feat(pedidos): counts — enRuta/esperandoPagoTotal/pendientesN2 para los focos del Hub"
```

---

## Task 2: Flag `pedidosV2Enabled()`

**Files:**
- Modify/Create: `src/lib/flags.ts` (verificar dónde viven los flags con `grep -rn "NEXT_PUBLIC_" src/lib/*.ts | grep -i flag`)
- Test: `src/lib/__tests__/flags-pedidos-v2.test.ts`

- [ ] **Step 1: Ubicar el patrón de flags existente**

Run: `grep -rn "NEXT_PUBLIC_VENTA_RUTA_ENTREGA_POSTERIOR\|NEXT_PUBLIC_PAGO_CONFIRMACION" src/ | grep -v test | head`
Expected: muestra cómo se leen otros flags `NEXT_PUBLIC_*` (probablemente `process.env.NEXT_PUBLIC_X === 'true'` inline o un helper). Seguir ese patrón exacto.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/__tests__/flags-pedidos-v2.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { pedidosV2Enabled } from '../flags'

describe('pedidosV2Enabled', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('false por defecto (sin la env)', () => {
    vi.stubEnv('NEXT_PUBLIC_PEDIDOS_V2', '')
    expect(pedidosV2Enabled()).toBe(false)
  })
  it('true solo con exactamente "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_PEDIDOS_V2', 'true')
    expect(pedidosV2Enabled()).toBe(true)
    vi.stubEnv('NEXT_PUBLIC_PEDIDOS_V2', '1')
    expect(pedidosV2Enabled()).toBe(false)
  })
})
```

- [ ] **Step 3: Run — expect fail**, then **Step 4: implementar** siguiendo el patrón del Step 1:

```ts
// en src/lib/flags.ts (o el archivo de flags del repo)
export function pedidosV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_PEDIDOS_V2 === 'true'
}
```

- [ ] **Step 5: Run — expect pass. Step 6: Commit**

```bash
git add src/lib/flags.ts src/lib/__tests__/flags-pedidos-v2.test.ts
git commit -m "feat(pedidos): flag pedidosV2Enabled()"
```

---

## Task 3: `derive-operacion.ts` — derivación pura de estado/acción/focos

Este módulo es la única pieza que traduce el dominio a la presentación del Hub. **No** redefine transiciones ni la cascada de estado — las consume.

**Files:**
- Create: `src/app/(app)/pedidos/pedido-hub/derive-operacion.ts`
- Create: `src/app/(app)/pedidos/pedido-hub/types.ts`
- Test: `src/app/(app)/pedidos/pedido-hub/__tests__/derive-operacion.test.ts`

- [ ] **Step 1: Definir tipos**

```ts
// src/app/(app)/pedidos/pedido-hub/types.ts
import type { Pedido } from '../pedidos-client/types'

export type FocoKey = 'porPlanificar' | 'enRuta' | 'esperandoPago' | 'pendientesN2' | 'excepciones'

export interface FocoCount {
  key: FocoKey
  label: string
  value: number
  /** monto en $ si el foco lo muestra (esperandoPago). */
  amount?: number
  /** 'none' | 'amber' | 'red' — disciplina de color: color solo si hay algo que hacer hoy. */
  tone: 'none' | 'amber' | 'red'
}

export interface OperacionDerivada {
  estadoLegible: string          // microcopy, p.ej. "Entregado · debe $12.000 · 3 días"
  accionDestacada: AccionDestacada | null
  focos: FocoKey[]               // a qué focos pertenece esta operación (multi-pertenencia)
}

export type AccionDestacada =
  | { key: 'planificar'; label: 'Planificar' }
  | { key: 'registrar-entrega'; label: 'Registrar entrega' }
  | { key: 'completar-pendiente'; label: 'Completar pendiente' }
  | { key: 'registrar-pago'; label: 'Registrar pago' }
  | { key: 'confirmar-pago'; label: 'Confirmar pago' }
  | { key: 'resolver-excepcion'; label: 'Resolver excepción' }
  | { key: 'ver-cartera'; label: 'Ver cartera' }

export interface DeriveContext {
  /** true si el pedido tiene una ObligacionPendiente activa (viene del payload de la lista o de counts-por-id — ver Task 4). */
  tienePendienteN2?: boolean
  /** true si el pedido tiene disputa/discrepancia/alerta ALTA abierta. */
  tieneExcepcion?: boolean
  /** true si el cliente está bloqueado / promesa vencida. */
  clienteBloqueado?: boolean
  /** hoy en Bogotá (YYYY-MM-DD) para calcular "hace N días". */
  hoyBogota: string
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/app/(app)/pedidos/pedido-hub/__tests__/derive-operacion.test.ts
import { describe, it, expect } from 'vitest'
import { deriveOperacion } from '../derive-operacion'
import type { Pedido } from '../../pedidos-client/types'

const base = (over: Partial<Pedido>): Pedido => ({
  id: 'p1', numero: 1, clienteId: 'c1', nombreCli: 'Tienda X', telefonoCli: '300',
  zonaCli: '', barrioCli: '', tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'PENDIENTE',
  origen: 'PEDIDO', estadoEntrega: 'PENDIENTE', estadoPago: 'PENDIENTE',
  items: [], cPacaAguaPed: 0, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0,
  cBolsaAguaPed: 0, cBolsaHieloPed: 0, cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
  cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0, precioPacaAgua: 0, precioPacaHielo: 0,
  precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 0, total: 10000, saldo: 10000, fecha: '2026-09-07T08:00:00.000Z',
  ...over,
})
const ctx = { hoyBogota: '2026-09-07' }

describe('deriveOperacion', () => {
  it('PENDIENTE sin embarque → acción "Planificar", foco porPlanificar', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'PENDIENTE', embarqueId: undefined }), ctx)
    expect(d.accionDestacada?.key).toBe('planificar')
    expect(d.focos).toContain('porPlanificar')
    expect(d.estadoLegible).toMatch(/[Pp]endiente/)
  })

  it('EN_RUTA → acción "Registrar entrega", foco enRuta', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'EN_RUTA', embarqueId: 'e1' }), ctx)
    expect(d.accionDestacada?.key).toBe('registrar-entrega')
    expect(d.focos).toContain('enRuta')
  })

  it('ENTREGADO con saldo → microcopy con deuda + días, acción "Registrar pago", foco esperandoPago', () => {
    const d = deriveOperacion(
      base({ estadoEntrega: 'ENTREGADO', estadoPago: 'PARCIAL', totalPagado: 4000, saldo: 6000, fecha: '2026-09-04T08:00:00.000Z' }),
      ctx,
    )
    expect(d.accionDestacada?.key).toBe('registrar-pago')
    expect(d.focos).toContain('esperandoPago')
    expect(d.estadoLegible).toMatch(/6\.000/)
    expect(d.estadoLegible).toMatch(/3 d[ií]as/)
  })

  it('pago reportado sin confirmar → acción "Confirmar pago"', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'ENTREGADO', estadoPago: 'PAGADO', saldo: 0, totalPagado: 10000, pagoReportadoPendiente: true }), ctx)
    expect(d.accionDestacada?.key).toBe('confirmar-pago')
  })

  it('excepción abierta → acción "Resolver excepción", foco excepciones', () => {
    const d = deriveOperacion(base({ disputaAbierta: true }), { ...ctx, tieneExcepcion: true })
    expect(d.accionDestacada?.key).toBe('resolver-excepcion')
    expect(d.focos).toContain('excepciones')
  })

  it('pendiente N2 activo → acción "Completar pendiente", foco pendientesN2', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'ENTREGADO', saldo: 0, totalPagado: 10000 }), { ...ctx, tienePendienteN2: true })
    expect(d.accionDestacada?.key).toBe('completar-pendiente')
    expect(d.focos).toContain('pendientesN2')
  })

  it('CANCELADO/ANULADO → sin acción destacada, sin focos', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'ANULADO', estadoPago: 'ANULADO' }), ctx)
    expect(d.accionDestacada).toBeNull()
    expect(d.focos).toEqual([])
  })

  it('multi-pertenencia: EN_RUTA + excepción → ambos focos', () => {
    const d = deriveOperacion(base({ estadoEntrega: 'EN_RUTA', embarqueId: 'e1', disputaAbierta: true }), { ...ctx, tieneExcepcion: true })
    expect(d.focos).toEqual(expect.arrayContaining(['enRuta', 'excepciones']))
  })
})
```

- [ ] **Step 3: Run — expect fail. Step 4: Implementar**

```ts
// src/app/(app)/pedidos/pedido-hub/derive-operacion.ts
import type { Pedido } from '../pedidos-client/types'
import type { OperacionDerivada, AccionDestacada, DeriveContext, FocoKey } from './types'
import { calcularEstadoPagoVisual } from '@/modules/pedidos/presentation/visual-states'

function diasDesde(fechaIso: string, hoyBogota: string): number {
  const f = new Date(fechaIso).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  const d1 = new Date(f + 'T00:00:00-05:00').getTime()
  const d2 = new Date(hoyBogota + 'T00:00:00-05:00').getTime()
  return Math.max(0, Math.round((d2 - d1) / 86_400_000))
}

const money = (n: number) => new Intl.NumberFormat('es-CO').format(n)

export function deriveOperacion(p: Pedido, ctx: DeriveContext): OperacionDerivada {
  const terminal = p.estadoEntrega === 'CANCELADO' || p.estadoEntrega === 'ANULADO'
  if (terminal) {
    return { estadoLegible: p.estadoEntrega === 'ANULADO' ? 'Anulado' : 'Cancelado', accionDestacada: null, focos: [] }
  }

  const visual = calcularEstadoPagoVisual({
    estadoPago: p.estadoPago, estadoEntrega: p.estadoEntrega,
    saldo: Number(p.saldo), total: Number(p.total), totalPagado: Number(p.totalPagado),
    pagoReportado: p.pagoReportadoPendiente, pagoDiscrepante: p.pagoDiscrepante,
  })

  const focos: FocoKey[] = []
  if (p.estadoEntrega === 'PENDIENTE' && !p.embarqueId) focos.push('porPlanificar')
  if (p.estadoEntrega === 'EN_RUTA') focos.push('enRuta')
  if (p.estadoEntrega === 'ENTREGADO' && Number(p.saldo) > 0) focos.push('esperandoPago')
  if (ctx.tienePendienteN2) focos.push('pendientesN2')
  if (ctx.tieneExcepcion || p.disputaAbierta || p.pagoDiscrepante) focos.push('excepciones')

  // Acción destacada — prioridad contextual (blueprint §1.3):
  // excepción > pendiente N2 > confirmar pago > registrar pago > registrar entrega > planificar
  let accionDestacada: AccionDestacada | null = null
  if (focos.includes('excepciones')) accionDestacada = { key: 'resolver-excepcion', label: 'Resolver excepción' }
  else if (ctx.clienteBloqueado) accionDestacada = { key: 'ver-cartera', label: 'Ver cartera' }
  else if (ctx.tienePendienteN2) accionDestacada = { key: 'completar-pendiente', label: 'Completar pendiente' }
  else if (p.estadoEntrega === 'ENTREGADO' && p.pagoReportadoPendiente && Number(p.saldo) === 0) accionDestacada = { key: 'confirmar-pago', label: 'Confirmar pago' }
  else if (p.estadoEntrega === 'ENTREGADO' && Number(p.saldo) > 0) accionDestacada = { key: 'registrar-pago', label: 'Registrar pago' }
  else if (p.estadoEntrega === 'EN_RUTA') accionDestacada = { key: 'registrar-entrega', label: 'Registrar entrega' }
  else if (p.estadoEntrega === 'PENDIENTE') accionDestacada = { key: 'planificar', label: 'Planificar' }

  // Microcopy de estado (blueprint principio 2 — se lee, no se descifra)
  let estadoLegible: string
  if (p.estadoEntrega === 'PENDIENTE') estadoLegible = p.embarqueId ? 'Pendiente · asignado' : 'Pendiente · sin planificar'
  else if (p.estadoEntrega === 'EN_RUTA') estadoLegible = 'En ruta'
  else if (p.estadoEntrega === 'NO_ENTREGADO') estadoLegible = 'No entregado'
  else if (p.estadoEntrega === 'ENTREGADO' && Number(p.saldo) > 0) {
    const d = diasDesde(p.fecha, ctx.hoyBogota)
    estadoLegible = `Entregado · debe $${money(Number(p.saldo))}${d > 0 ? ` · ${d} día${d === 1 ? '' : 's'}` : ''}`
  } else if (visual.key === 'REPORTADO') estadoLegible = 'Entregado · pago sin confirmar'
  else if (visual.key === 'DISCREPANTE') estadoLegible = 'Entregado · pago discrepante'
  else if (visual.key === 'PAGADO' && visual.label === 'Anticipado') estadoLegible = 'Pagado por anticipado'
  else estadoLegible = 'Entregado · pagado'

  return { estadoLegible, accionDestacada, focos }
}
```

- [ ] **Step 5: Run — expect pass (8 tests). Step 6: Commit**

```bash
git add src/app/\(app\)/pedidos/pedido-hub/derive-operacion.ts src/app/\(app\)/pedidos/pedido-hub/types.ts src/app/\(app\)/pedidos/pedido-hub/__tests__/derive-operacion.test.ts
git commit -m "feat(pedidos): derive-operacion — estado legible + acción destacada + focos (reusa visual-states/transitions)"
```

---

## Task 4: `foco-strip.tsx` — cabecera de focos

**Files:**
- Create: `src/app/(app)/pedidos/pedido-hub/foco-strip.tsx`
- Test: `src/app/(app)/pedidos/pedido-hub/__tests__/foco-strip.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/(app)/pedidos/pedido-hub/__tests__/foco-strip.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FocoStrip } from '../foco-strip'
import type { FocoCount } from '../types'

const focos: FocoCount[] = [
  { key: 'porPlanificar', label: 'Por planificar', value: 3, tone: 'amber' },
  { key: 'enRuta', label: 'En ruta', value: 5, tone: 'none' },
  { key: 'esperandoPago', label: 'Esperando pago', value: 8, amount: 120000, tone: 'red' },
  { key: 'pendientesN2', label: 'Pendientes', value: 0, tone: 'none' },
  { key: 'excepciones', label: 'Excepciones', value: 2, tone: 'red' },
]

describe('FocoStrip', () => {
  it('renderiza los 5 focos con su número; esperandoPago muestra el $', () => {
    render(<FocoStrip focos={focos} activeFoco={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Por planificar')).toBeInTheDocument()
    expect(screen.getByText('120.000')).toBeInTheDocument()
  })

  it('un clic en un foco llama onSelect con su key; re-clic deselecciona', async () => {
    const onSelect = vi.fn()
    render(<FocoStrip focos={focos} activeFoco={null} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Por planificar/ }))
    expect(onSelect).toHaveBeenCalledWith('porPlanificar')
    render(<FocoStrip focos={focos} activeFoco="porPlanificar" onSelect={onSelect} />)
    await userEvent.click(screen.getAllByRole('button', { name: /Por planificar/ })[1])
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('disciplina de color: value 0 → sin color aunque tone lo pida', () => {
    render(<FocoStrip focos={[{ key: 'pendientesN2', label: 'Pendientes', value: 0, tone: 'amber' }]} activeFoco={null} onSelect={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /Pendientes/ })
    expect(btn.className).not.toMatch(/amber|red/)
  })

  it('el foco activo tiene aria-pressed', () => {
    render(<FocoStrip focos={focos} activeFoco="enRuta" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /En ruta/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [ ] **Step 2: Run — expect fail. Step 3: Implementar**

```tsx
// src/app/(app)/pedidos/pedido-hub/foco-strip.tsx
'use client'

import type { FocoCount, FocoKey } from './types'

const toneClass = (tone: FocoCount['tone'], value: number) => {
  if (value === 0) return 'text-gray-700'
  if (tone === 'red') return 'text-red-600'
  if (tone === 'amber') return 'text-amber-600'
  return 'text-gray-800'
}
const money = (n: number) => new Intl.NumberFormat('es-CO').format(n)

export function FocoStrip({
  focos, activeFoco, onSelect,
}: {
  focos: FocoCount[]
  activeFoco: FocoKey | null
  onSelect: (key: FocoKey | null) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" data-testid="foco-strip" role="group" aria-label="Focos del día">
      {focos.map((f) => {
        const active = activeFoco === f.key
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : f.key)}
            data-testid={`foco-${f.key}`}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
              active ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className="block text-xs text-gray-500">{f.label}</span>
            <span className={`block text-lg font-bold ${toneClass(f.tone, f.value)}`}>
              {f.value}
              {f.amount != null && <span className="ml-1 text-sm font-medium">· ${money(f.amount)}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run — expect pass. Step 5: Commit**

```bash
git add src/app/\(app\)/pedidos/pedido-hub/foco-strip.tsx src/app/\(app\)/pedidos/pedido-hub/__tests__/foco-strip.test.tsx
git commit -m "feat(pedidos): FocoStrip — cabecera de focos accionables (filtro de un clic, disciplina de color)"
```

---

## Task 5: `operacion-list.tsx` — lista adaptativa

**Files:**
- Create: `src/app/(app)/pedidos/pedido-hub/operacion-list.tsx`
- Test: `src/app/(app)/pedidos/pedido-hub/__tests__/operacion-list.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/(app)/pedidos/pedido-hub/__tests__/operacion-list.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { OperacionList } from '../operacion-list'
import type { Pedido } from '../../pedidos-client/types'

const p = (over: Partial<Pedido>): Pedido => ({
  id: 'p1', numero: 101, clienteId: 'c1', nombreCli: 'Tienda La Esquina', telefonoCli: '300',
  zonaCli: '', barrioCli: '', tipo: 'DOMICILIO', canal: 'DOMICILIO', estado: 'EN_RUTA',
  origen: 'PEDIDO', estadoEntrega: 'EN_RUTA', estadoPago: 'PENDIENTE',
  items: [{ producto: 'PACA_AGUA', cantPedido: 20, cantEntrega: 0, precio: 2300, subtotal: 46000 }],
  cPacaAguaPed: 20, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
  cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  precioPacaAgua: 2300, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
  totalPagado: 0, total: 46000, saldo: 46000, fecha: '2026-09-07T08:00:00.000Z', ...over,
})

describe('OperacionList', () => {
  it('desktop: 5 columnas, microcopy de estado (no badges apilados), acción destacada', () => {
    render(<OperacionList pedidos={[p({})]} viewport="desktop" hoyBogota="2026-09-07" onAccion={vi.fn()} onOpen={vi.fn()} />)
    const tabla = screen.getByTestId('pedido-hub-desktop')
    const row = within(tabla).getByRole('row', { name: /Tienda La Esquina/ })
    expect(within(row).getByText('En ruta')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Registrar entrega' })).toBeInTheDocument()
    // origen PEDIDO no muestra chip (G5)
    expect(within(row).queryByText('PEDIDO')).not.toBeInTheDocument()
  })

  it('origen ≠ PEDIDO muestra chip discreto', () => {
    render(<OperacionList pedidos={[p({ origen: 'VENTA_RAPIDA' })]} viewport="desktop" hoyBogota="2026-09-07" onAccion={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText(/Venta rápida/i)).toBeInTheDocument()
  })

  it('mobile: tarjetas (no tabla ancha), data-testid pedido-hub-mobile', () => {
    render(<OperacionList pedidos={[p({})]} viewport="mobile" hoyBogota="2026-09-07" onAccion={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByTestId('pedido-hub-mobile')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('clic en la acción destacada llama onAccion(pedido, accionKey)', async () => {
    const onAccion = vi.fn()
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<OperacionList pedidos={[p({})]} viewport="desktop" hoyBogota="2026-09-07" onAccion={onAccion} onOpen={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar entrega' }))
    expect(onAccion).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'registrar-entrega')
  })

  it('empty state cuando no hay pedidos', () => {
    render(<OperacionList pedidos={[]} viewport="desktop" hoyBogota="2026-09-07" onAccion={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByText(/[Nn]o hay operaciones/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — expect fail. Step 3: Implementar**

`OperacionList` recibe `pedidos: Pedido[]`, `viewport: 'desktop' | 'mobile'`, `hoyBogota`, `onAccion(pedido, accionKey)`, `onOpen(pedido)`. Usa `deriveOperacion` por fila. Desktop = `<table data-testid="pedido-hub-desktop">` con 5 columnas (Operación / Qué / Estado / Total / Acción). Mobile = `<div data-testid="pedido-hub-mobile">` con tarjetas 1 columna (contexto → operación → total → CTA, ALS §12). Origen chip solo si `!== 'PEDIDO'`. Canal ícono solo si `DOMICILIO`. Resumen de items = `formatItemsResumen(pedido)` (helper que ya existe en `pedidos-client` o se extrae — verificar con `grep -rn "pacas agua\|resumen.*item\|formatItems" src/app/\(app\)/pedidos`). Fila clickeable → `onOpen(pedido)` (en 4a abre el modal de detalle legacy vía el callback; en 4b será el peek). `EmptyState` de `@/components/empty-state`.

> **No** implementar peek ni selección múltiple en 4a. La fila llama `onOpen` que el orquestador cablea al modal de detalle **existente** de `pedidos-client` (reutilización — el rediseño del detalle es 4b).

- [ ] **Step 4: Run — expect pass. Step 5: Commit**

```bash
git add src/app/\(app\)/pedidos/pedido-hub/operacion-list.tsx src/app/\(app\)/pedidos/pedido-hub/__tests__/operacion-list.test.tsx
git commit -m "feat(pedidos): OperacionList — responsive table/tarjetas, 5 columnas, microcopy, acción destacada"
```

---

## Task 6: `pedido-hub/index.tsx` — orquestador

**Files:**
- Create: `src/app/(app)/pedidos/pedido-hub/index.tsx`

- [ ] **Step 1: Implementar el orquestador**

Responsabilidades:
- Recibe `initialPedidos: Pedido[]` (de `page.tsx`), `initialCounts` (opcional).
- `usePedidos(params, { autoFetch: false, refetchOnParamsChange: false })` — reusa el hook; el orquestador maneja los filtros vía `router.push` + `startTransition` (patrón de `/clientes` post-fix de filtros lentos, AGENTS.md #22/#23).
- Fetch de `/api/pedidos/counts` (plano, no `fetchResilient` — es lectura de conteos): al montar + en cada evento realtime relevante.
- `useRealtimeListener(['pedido.*', 'pago.*', 'embarque.*', 'route_plan.updated'], refetch, { debounceMs: 500 })`.
- `usePollingRefetch(refetch, 60_000)`.
- Estado del foco activo → filtra la lista **client-side sobre la página cargada** para los focos que se pueden derivar (`deriveOperacion(...).focos`), y **además** empuja el filtro server-side equivalente a la URL cuando el foco necesita datos fuera de la página (p.ej. "esperando pago" con rango "todos"). En 4a: el foco activo = filtro client-side sobre `pedidos` + un badge "N de M en esta página" si la lista está paginada. (El filtrado server-side por foco completo se afina en 4b junto con el peek.)
- Rango temporal: control propio (`DateRangeFilter`), **independiente de los focos**, persistente en URL. **Cambiar un foco NUNCA cambia el rango** (corrige el bug del baseline).
- 4 estados de red (§4.7 del blueprint): loading (skeleton), success, offline (badge "sin conexión" + datos en memoria, **no** ErrorState si ya había datos — `useOnlineStatus()`), error (ErrorState + retry solo si no hay datos previos).
- `onOpen(pedido)` → llama un callback que `pedidos-client` cablea al modal de detalle legacy.
- `onAccion(pedido, key)` → en 4a, mapea a las acciones existentes de `pedidos-client` (enviar a ruta, entregar, etc.) vía callbacks; NO reimplementa las mutaciones.
- Desktop/mobile: `useMediaQuery` o el helper del repo (`grep -rn "useMediaQuery\|matchMedia\|1024" src/hooks`) → pasa `viewport` a `OperacionList`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/pedidos/pedido-hub/index.tsx
git commit -m "feat(pedidos): pedido-hub/index — orquesta lista + focos + counts + realtime + 4 estados de red"
```

---

## Task 7: Cablear el flag en `pedidos-client/index.tsx`

**Files:**
- Modify: `src/app/(app)/pedidos/pedidos-client/index.tsx`
- Modify: `src/app/(app)/pedidos/loading.tsx`

- [ ] **Step 1: Condicionar la vista de consulta**

En `pedidos-client/index.tsx`, donde hoy se renderiza el bloque de tabs + filtros + tablas (`activeTab === 'hoy' | 'fiados' | 'alertas'`), envolver:

```tsx
{pedidosV2Enabled() ? (
  <PedidoHub
    initialPedidos={pedidos}
    onOpen={(p) => { setSelectedPedido(p); setShowDetailModal(true) }}
    onAccion={handleHubAccion}
  />
) : (
  <>{/* ...tabs + PedidoFilters + PedidoTable/FiadosTable/AlertasTable actuales... */}</>
)}
```

- `handleHubAccion(pedido, key)` — switch que llama las funciones ya existentes (`cambiarEstado`, `setPedidoEditando`, abrir modal de pago, etc.). **Cero lógica nueva de mutación.**
- FAB, modales (crear/venta rápida/detalle/editar/embarque), y las vistas autocontenidas `atrasados`/`enRiesgo` quedan **fuera** del condicional (compartidas).
- Con el flag OFF: **el árbol renderizado es idéntico byte a byte al actual.**

- [ ] **Step 2: Skeleton del Hub en `loading.tsx`**

Agregar una variante: si `pedidosV2Enabled()`, renderizar skeleton de (header + foco strip de 5 chips + filas de tabla) en vez del skeleton de tabs. (Server component — `process.env` disponible.)

- [ ] **Step 3: Type-check + unit suite**

Run: `npx tsc --noEmit && npm run test -- src/app/\(app\)/pedidos`
Expected: PASS, 0 regresiones (los tests existentes de `pedidos-client` corren con el flag OFF).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/pedidos/pedidos-client/index.tsx src/app/\(app\)/pedidos/loading.tsx
git commit -m "feat(pedidos): flag NEXT_PUBLIC_PEDIDOS_V2 envuelve la vista de consulta con el Pedido Hub"
```

---

## Task 8: E2E `pedidos-hub.spec.ts`

**Files:**
- Create: `e2e/pedidos-hub.spec.ts`

- [ ] **Step 1: Escribir el spec**

Con `NEXT_PUBLIC_PEDIDOS_V2=true` en `playwright.config.ts` `webServer.env` (o un project dedicado). Cubre (G10):
- login admin → `/pedidos` → `foco-strip` visible con 5 focos.
- clic en un foco → la lista se filtra (menos filas / badge de conteo); re-clic → vuelve.
- cambiar el rango de fecha → los focos **no** cambian, la vista **no** salta a "hoy".
- una fila muestra microcopy de estado (texto, no ≥2 badges) y **una** acción destacada.
- clic en la fila → abre el detalle (modal legacy en 4a).
- responsive: viewport mobile → `pedido-hub-mobile` (tarjetas); desktop → `pedido-hub-desktop` (tabla). `responsiveContainer(page, 'pedido-hub-mobile', 'pedido-hub-desktop')`.
- offline: `context.setOffline(true)` tras cargar → badge "sin conexión", datos intactos, sin pantalla de error.
- **con el flag OFF** (otro project o test): la UI actual (tabs) sigue funcionando.

- [ ] **Step 2: Correr localmente**

Run: `set -a; . ./.env; set +a && NEXT_PUBLIC_PEDIDOS_V2=true npx playwright test e2e/pedidos-hub.spec.ts`
Expected: PASS. (En sandbox sin Chromium, dejar constancia de que corre en CI — patrón AGENTS.md #20.)

- [ ] **Step 3: Commit**

```bash
git add e2e/pedidos-hub.spec.ts playwright.config.ts
git commit -m "test(pedidos): E2E del Pedido Hub (focos, microcopy, responsive, offline, flag OFF intacto)"
```

---

## Task 9: Verificación de gates + docs

- [ ] **Step 1: Verificación completa (protocolo AGENTS.md)**

```bash
npx tsc --noEmit
npm run test
npm run test -- --config vitest.integration.config.ts
npx eslint src/app/\(app\)/pedidos/pedido-hub src/app/api/pedidos/counts --max-warnings 0
```

- [ ] **Step 2: Checklist de gates del blueprint §6.3**

| Gate | Cómo se verifica en 4a |
|---|---|
| G2 | `grep`: el Hub no linkea a `/recurrentes`; no hay tabs Fiados/Alertas |
| G5 | inspección: no hay un control único "tipo"; origen/canal son señales separadas |
| G6 | test de `OperacionList`: la celda Estado renderiza texto, no ≥2 badges |
| G7 | `grep`: `derive-operacion.ts` importa de `visual-states`/`pedido-transitions`, no define transiciones |
| G9 | E2E offline pasa |
| G10 | conteo de specs (happy + responsive + offline + flag-off) |

- [ ] **Step 3: Métrica vs baseline (Ronda 1)**

Con Playwright, contra el Hub (flag ON): contar botones visibles en el shell y chips de filtro siempre visibles. Baseline: ~50 botones / ~20 chips. Meta 4a: foco strip (5) + acción destacada por fila + rango de fecha + 1 toggle "filtros avanzados" colapsado. Documentar el número real.

- [ ] **Step 4: Actualizar `00-plan-frontend-rediseno-integral.md`** §Fase 4 con el estado de 4a (✅ IMPLEMENTADO) y `docs/pedidos/03-blueprint-experiencia-hub.md` §7 (fila Fase 4).

- [ ] **Step 5: Commit + push + PR**

```bash
git add docs/
git commit -m "docs(pedidos): Fase 4a del Hub implementada"
git push -u origin feat/pedidos-hub-4a
gh pr create --base feat/pedidos-preview-endpoint --title "feat(pedidos): Fase 4a — Pedido Hub (shell + focos + lista adaptativa)" --body "Blueprint §2. Detrás de NEXT_PUBLIC_PEDIDOS_V2 (OFF por defecto). Sin peek/command-menu (4b). Stack sobre #221."
```

---

## Self-Review

**Cobertura del blueprint §2:**
- Shell (header + barra de foco + focos + lista) → Tasks 4, 5, 6. Barra de comando (⌘K) → **4b** (documentado como fuera de alcance).
- Focos como capa de priorización, multi-pertenencia, "Todo" sin tab → Task 3 (focos[]) + Task 4 (deselección) + Task 6 (foco activo = filtro).
- Cambiar filtro ≠ saltar a "hoy" → Task 6 Step 1 + Task 8 E2E.
- Responsive table Fiori, 5 columnas, microcopy, acción destacada → Task 5.
- `data-testid` desktop/mobile → Task 5.
- Densidad por rol → **parcial en 4a** (el Hub se muestra a todos los roles de oficina; el modo REPARTIDOR/CONTADOR se afina en fases siguientes — documentado).
- Realtime + 4 estados de red → Task 6.

**Placeholder scan:** Task 6 describe el orquestador en prosa con responsabilidades explícitas (no código completo) porque su forma exacta depende de helpers del repo que el implementador confirma en el momento (`useMediaQuery`, `formatItemsResumen`, `useOnlineStatus`) — cada uno con su `grep` de localización. No hay "TODO" abandonados.

**Consistencia de tipos:** `Pedido` (de `pedidos-client/types.ts`) es la entrada de `deriveOperacion` y `OperacionList`. `FocoKey`/`FocoCount`/`OperacionDerivada`/`AccionDestacada` viven en `pedido-hub/types.ts` y se usan consistentes en Tasks 3–6.

**Micro-verificaciones del implementador (no decisiones de producto):**
- Task 1 Step 3: nombre del modelo/enum de N2 (`ObligacionPendiente` / estado `ABIERTA`).
- Task 2 Step 1: patrón de lectura de flags del repo.
- Task 5 Step 3: helper de resumen de items; `EmptyState`.
- Task 6 Step 1: `useMediaQuery`/`useOnlineStatus` del repo.

**Decisiones de alcance ya tomadas (no reabrir en ejecución):** peek, command menu, selección múltiple, filtrado server-side por foco completo, rediseño del detalle, `PedidosWorkspace` → todas son 4b o Composición.
