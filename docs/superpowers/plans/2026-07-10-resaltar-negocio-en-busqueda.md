# Resaltar negocio coincidente en búsqueda de clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando un usuario busca en la lista de clientes y el resultado coincide con un negocio formal, mostrar el nombre de ese negocio en la fila del cliente con opción de abrir su detalle.

**Architecture:** Helper puro en `src/lib/cliente-filters.ts` para detectar coincidencias; componente presentacional `NegocioSearchMatch` que recibe cliente + término + callbacks; integración en `ClienteTable` sin tocar Server Component ni agregar endpoints.

**Tech Stack:** Next.js 16.2.4, React 19, TypeScript 5.9, Tailwind 4.2.4, Vitest, Playwright.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/cliente-filters.ts` | Agregar `getNegocioSearchMatch` (helper puro). |
| `src/lib/cliente-filters.test.ts` | Tests unitarios del helper. |
| `src/components/negocio-search-match.tsx` | Componente que renderiza el mensaje de coincidencia. |
| `src/app/(app)/clientes/clientes-client/cliente-table.tsx` | Recibir callbacks y renderizar `NegocioSearchMatch` en cada fila. |
| `src/app/(app)/clientes/clientes-client/index.tsx` | Pasar `viewNegocio` y `viewCliente` a `ClienteTable`. |
| `e2e/clientes.spec.ts` | Nuevo test E2E de búsqueda por nombre de negocio. |

---

## Task 1: Helper `getNegocioSearchMatch`

**Files:**
- Modify: `src/lib/cliente-filters.ts`
- Test: `src/lib/cliente-filters.test.ts`

- [ ] **Step 1: Write the failing test**

Add at the end of `src/lib/cliente-filters.test.ts`:

```ts
import {
  buildClientesWhere,
  buildClientesRawWhere,
  getClienteNegocioStatus,
  getNegocioSearchMatch,
} from './cliente-filters'
```

Append:

```ts
describe('getNegocioSearchMatch', () => {
  it('devuelve array vacío cuando search está vacío', () => {
    const result = getNegocioSearchMatch({ negocios: [{ id: 'n1', nombre: 'La Esquina' }] }, '')
    expect(result.matchedNegocios).toEqual([])
  })

  it('encuentra coincidencia por nombre de negocio', () => {
    const result = getNegocioSearchMatch(
      { negocios: [{ id: 'n1', nombre: 'La Esquina' }] },
      'esquina'
    )
    expect(result.matchedNegocios).toEqual([{ id: 'n1', nombre: 'La Esquina' }])
  })

  it('encuentra coincidencia por dirección', () => {
    const result = getNegocioSearchMatch(
      { negocios: [{ id: 'n1', nombre: 'Tienda', direccion: 'Calle 5 #10-20' }] },
      'calle 5'
    )
    expect(result.matchedNegocios).toEqual([{ id: 'n1', nombre: 'Tienda' }])
  })

  it('encuentra coincidencia por barrio', () => {
    const result = getNegocioSearchMatch(
      { negocios: [{ id: 'n1', nombre: 'Tienda', barrio: 'Centro' }] },
      'centro'
    )
    expect(result.matchedNegocios).toEqual([{ id: 'n1', nombre: 'Tienda' }])
  })

  it('encuentra coincidencia por tipo de negocio', () => {
    const result = getNegocioSearchMatch(
      { negocios: [{ id: 'n1', nombre: 'Mi Café', tipoNegocio: 'Café' }] },
      'café'
    )
    expect(result.matchedNegocios).toEqual([{ id: 'n1', nombre: 'Mi Café' }])
  })

  it('encuentra coincidencia por referencia', () => {
    const result = getNegocioSearchMatch(
      { negocios: [{ id: 'n1', nombre: 'Tienda', referencia: 'Frente al parque' }] },
      'parque'
    )
    expect(result.matchedNegocios).toEqual([{ id: 'n1', nombre: 'Tienda' }])
  })

  it('devuelve múltiples coincidencias', () => {
    const result = getNegocioSearchMatch(
      {
        negocios: [
          { id: 'n1', nombre: 'La Esquina' },
          { id: 'n2', nombre: 'Esquina Norte' },
          { id: 'n3', nombre: 'Otro' },
        ],
      },
      'esquina'
    )
    expect(result.matchedNegocios).toHaveLength(2)
    expect(result.matchedNegocios.map((n) => n.id).sort()).toEqual(['n1', 'n2'])
  })

  it('no considera negocios con valores null/undefined', () => {
    const result = getNegocioSearchMatch(
      { negocios: [{ id: 'n1', nombre: 'Tienda', direccion: null, barrio: undefined }] },
      'null'
    )
    expect(result.matchedNegocios).toEqual([])
  })

  it('ignora mayúsculas y acentos consistente con búsqueda existente', () => {
    const result = getNegocioSearchMatch(
      { negocios: [{ id: 'n1', nombre: 'Café Central' }] },
      'café'
    )
    expect(result.matchedNegocios).toEqual([{ id: 'n1', nombre: 'Café Central' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/cliente-filters.test.ts -t "getNegocioSearchMatch"
```

Expected: FAIL — `getNegocioSearchMatch is not exported`.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/cliente-filters.ts`:

```ts
export interface NegocioSearchMatch {
  id: string
  nombre: string
}

export interface NegocioSearchMatchResult {
  matchedNegocios: NegocioSearchMatch[]
}

interface NegocioSearchMatchInput {
  id: string
  nombre: string
  tipoNegocio?: string | null
  direccion?: string | null
  barrio?: string | null
  referencia?: string | null
}

/**
 * Devuelve los negocios formales del cliente que coinciden con el término de búsqueda.
 * Coincide insensible a mayúsculas en nombre, tipo, dirección, barrio o referencia.
 */
export function getNegocioSearchMatch(
  cliente: { negocios?: NegocioSearchMatchInput[] | null },
  search: string
): NegocioSearchMatchResult {
  const term = search.trim().toLowerCase()
  if (!term) return { matchedNegocios: [] }

  const negocios = cliente.negocios ?? []
  const matched = negocios.filter((neg) => {
    const fields = [neg.nombre, neg.tipoNegocio, neg.direccion, neg.barrio, neg.referencia]
    return fields.some((field) => typeof field === 'string' && field.toLowerCase().includes(term))
  })

  return { matchedNegocios: matched.map(({ id, nombre }) => ({ id, nombre })) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/cliente-filters.test.ts -t "getNegocioSearchMatch"
```

Expected: 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cliente-filters.ts src/lib/cliente-filters.test.ts
git commit -m "feat(clientes): helper getNegocioSearchMatch para coincidencias de negocio"
```

---

## Task 2: Componente `NegocioSearchMatch`

**Files:**
- Create: `src/components/negocio-search-match.tsx`
- Test: `src/app/(app)/clientes/clientes-client/__tests__/negocio-search-match.test.tsx` (new file)

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/clientes/clientes-client/__tests__/negocio-search-match.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NegocioSearchMatch } from '@/components/negocio-search-match'

describe('NegocioSearchMatch', () => {
  const cliente = {
    id: 'c1',
    negocios: [
      { id: 'n1', nombre: 'La Esquina' },
      { id: 'n2', nombre: 'Esquina Norte' },
      { id: 'n3', nombre: 'Otro' },
    ],
  }

  it('no renderiza nada sin término de búsqueda', () => {
    const { container } = render(
      <NegocioSearchMatch
        cliente={cliente}
        search=""
        onViewNegocio={vi.fn()}
        onViewCliente={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('no renderiza nada si ningún negocio coincide', () => {
    const { container } = render(
      <NegocioSearchMatch
        cliente={cliente}
        search="xyz123"
        onViewNegocio={vi.fn()}
        onViewCliente={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('muestra mensaje para una coincidencia y abre detalle del negocio al click', () => {
    const onViewNegocio = vi.fn()
    render(
      <NegocioSearchMatch
        cliente={cliente}
        search="esquina"
        onViewNegocio={onViewNegocio}
        onViewCliente={vi.fn()}
      />
    )
    const button = screen.getByText(/Coincide con el negocio:/)
    expect(button).toHaveTextContent('La Esquina')
    fireEvent.click(button)
    expect(onViewNegocio).toHaveBeenCalledTimes(1)
    expect(onViewNegocio).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n1', nombre: 'La Esquina' })
    )
  })

  it('muestra conteo para múltiples coincidencias y abre cliente al click', () => {
    const onViewCliente = vi.fn()
    render(
      <NegocioSearchMatch
        cliente={cliente}
        search="esquina"
        onViewNegocio={vi.fn()}
        onViewCliente={onViewCliente}
      />
    )
    const button = screen.getByText('Coincide con 2 negocios')
    fireEvent.click(button)
    expect(onViewCliente).toHaveBeenCalledWith('c1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/app/(app)/clientes/clientes-client/__tests__/negocio-search-match.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/negocio-search-match.tsx`:

```tsx
'use client'

import { getNegocioSearchMatch } from '@/lib/cliente-filters'
import type { NegocioDetail } from '@/components/negocio-detail-modal'

interface NegocioSearchMatchCliente {
  id: string
  negocios?: Array<{
    id: string
    nombre: string
    tipoNegocio?: string | null
    direccion?: string | null
    barrio?: string | null
    referencia?: string | null
    linkUbicacion?: string | null
  }> | null
}

interface NegocioSearchMatchProps {
  cliente: NegocioSearchMatchCliente
  search: string
  onViewNegocio: (negocio: NegocioDetail) => void
  onViewCliente: (id: string) => void
}

export function NegocioSearchMatch({
  cliente,
  search,
  onViewNegocio,
  onViewCliente,
}: NegocioSearchMatchProps) {
  const { matchedNegocios } = getNegocioSearchMatch(cliente, search)
  if (matchedNegocios.length === 0) return null

  function handleClick() {
    if (matchedNegocios.length === 1) {
      const negocio = cliente.negocios?.find((n) => n.id === matchedNegocios[0].id)
      if (negocio) {
        onViewNegocio({
          id: negocio.id,
          nombre: negocio.nombre,
          tipoNegocio: negocio.tipoNegocio ?? null,
          direccion: negocio.direccion ?? null,
          barrio: negocio.barrio ?? null,
          referencia: negocio.referencia ?? null,
          linkUbicacion: negocio.linkUbicacion ?? null,
          horaApertura: null,
          ruta: null,
          _count: { pedidos: 0 },
        })
      }
    } else {
      onViewCliente(cliente.id)
    }
  }

  const label =
    matchedNegocios.length === 1
      ? `Coincide con el negocio: ${matchedNegocios[0].nombre}`
      : `Coincide con ${matchedNegocios.length} negocios`

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mt-0.5 inline-flex items-center gap-1 text-left text-xs font-medium text-blue-600 hover:text-blue-800 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label={label}
    >
      <svg
        className="h-3 w-3 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      {label}
    </button>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/app/(app)/clientes/clientes-client/__tests__/negocio-search-match.test.tsx
```

Expected: 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/negocio-search-match.tsx src/app/(app)/clientes/clientes-client/__tests__/negocio-search-match.test.tsx
git commit -m "feat(clientes): componente NegocioSearchMatch para mostrar coincidencia de negocio"
```

---

## Task 3: Integrar en `ClienteTable`

**Files:**
- Modify: `src/app/(app)/clientes/clientes-client/cliente-table.tsx`

- [ ] **Step 1: Add imports and props**

Near the top of `src/app/(app)/clientes/clientes-client/cliente-table.tsx`, add:

```tsx
import { NegocioSearchMatch } from '@/components/negocio-search-match'
import type { NegocioDetail } from '@/components/negocio-detail-modal'
```

Add to `ClienteTableProps`:

```tsx
interface ClienteTableProps {
  // ... existing props ...
  onViewNegocio: (negocio: NegocioDetail) => void
  onViewCliente: (id: string) => void
}
```

Add to destructured props:

```tsx
export const ClienteTable = React.memo(function ClienteTable({
  // ... existing props ...
  onViewNegocio,
  onViewCliente,
}: ClienteTableProps) {
```

- [ ] **Step 2: Render `NegocioSearchMatch` en cada fila**

Inside the row rendering, after the contact-match IIFE (around line 518) and before the business-status IIFE, insert:

```tsx
{search && (
  <NegocioSearchMatch
    cliente={cliente}
    search={search}
    onViewNegocio={onViewNegocio}
    onViewCliente={onViewCliente}
  />
)}
```

Use this exact location (after line 518 closing `)})()` and before line 519 `})()` that starts business status):

```tsx
                        })()}
                        {search && (
                          <NegocioSearchMatch
                            cliente={cliente}
                            search={search}
                            onViewNegocio={onViewNegocio}
                            onViewCliente={onViewCliente}
                          />
                        )}
                        {(() => {
```

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/clientes/clientes-client/cliente-table.tsx
git commit -m "feat(clientes): renderizar NegocioSearchMatch en cada fila de resultados"
```

---

## Task 4: Pasar callbacks desde `ClientesClient`

**Files:**
- Modify: `src/app/(app)/clientes/clientes-client/index.tsx`

- [ ] **Step 1: Pass props to `ClienteTable`**

Find the `<ClienteTable ... />` JSX (around line 803) and add:

```tsx
      <ClienteTable
        clientes={clientesFiltrados}
        search={search}
        onSearchChange={setSearch}
        fetchError={fetchError}
        onRetry={fetchClientes}
        onCreateClick={openCreateModal}
        onViewCliente={viewCliente}
        onViewNegocio={viewNegocio}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(by, dir) => { setSortBy(by); setSortDir(dir) }}
        selectedClienteId={selectedCliente?.id}
        filtroActivo={filtroActivo}
        filtrosActivos={filtrosActivos}
      />
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/clientes/clientes-client/index.tsx
git commit -m "feat(clientes): conectar callbacks viewNegocio/viewCliente con ClienteTable"
```

---

## Task 5: E2E test de búsqueda por negocio

**Files:**
- Modify: `e2e/clientes.spec.ts`

- [ ] **Step 1: Add E2E test**

After the existing test `buscar cliente filtra resultados` (line 79), insert:

```ts
  test('buscar por nombre de negocio muestra coincidencia y abre detalle', async ({ page }) => {
    await fullLogin(page)
    const unique = `NegocioBusqueda${Date.now()}`
    const cliente = await createClienteFull(page, {
      nombre: 'ClienteConNegocioBusqueda',
      telefono: `3${String(Date.now()).slice(-9)}`,
    })
    await apiPost(page, '/api/negocios', {
      clienteId: cliente.cliente.id,
      nombre: unique,
      tipoNegocio: 'Tienda',
      direccion: 'Calle Busqueda 123',
      barrio: 'Centro Busqueda',
    })

    await goto(page, '/clientes')
    const searchInput = page.locator('input[placeholder*="Buscar"]')
    await searchInput.fill(unique)

    const matchButton = page.getByText(`Coincide con el negocio: ${unique}`)
    await expect(matchButton).toBeVisible()

    await matchButton.click()
    await expect(page.getByRole('heading', { name: unique })).toBeVisible({ timeout: 5000 })
  })
```

- [ ] **Step 2: Run the new E2E test**

```bash
npx playwright test e2e/clientes.spec.ts --project=chromium -g "buscar por nombre de negocio muestra coincidencia y abre detalle"
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/clientes.spec.ts
git commit -m "test(e2e): búsqueda por nombre de negocio muestra coincidencia"
```

---

## Task 6: Verificación final

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: no output (success).

- [ ] **Step 2: Unit tests**

```bash
npm run test
```

Expected: All tests pass except possible pre-existing `headers.test.ts` timeout.

- [ ] **Step 3: Full E2E clientes suite**

```bash
npx playwright test e2e/clientes.spec.ts --project=chromium --reporter=line
```

Expected: 63 passed (62 existing + 1 new). Note: suite takes ~10-11 minutes with `workers: 1`.

- [ ] **Step 4: Commit any fixes**

If any fix was needed, commit with descriptive message.

---

## Rollback

- Feature flag: no se requiere; cambios son UI-only y reversibles.
- Para revertir: eliminar el componente, las importaciones, el helper y el test E2E; restaurar `ClienteTable` props.
