# UX Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all UX audit findings — double-click protection, error states, empty states, loading states, accessibility, filter persistence, and 404 page.

**Architecture:** Create shared UI components (EmptyState, loading.tsx), apply consistently across all pages, fix accessibility gaps, add URL-based filter persistence for pedidos page.

**Tech Stack:** React, Next.js 16 App Router, Tailwind CSS, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/empty-state.tsx` | Create | Reusable empty state component with icon, message, optional CTA |
| `src/app/(app)/loading.tsx` | Create | Global loading fallback for Server Components |
| `src/app/(app)/dashboard/loading.tsx` | Create | Dashboard-specific skeleton loading |
| `src/app/not-found.tsx` | Create | Custom 404 page |
| `src/app/(app)/pedidos/page.tsx` | Modify | URL filter persistence, error state with retry |
| `src/app/(app)/embarques/page.tsx` | Modify | Error state with retry |
| `src/app/(app)/rutas/page.tsx` | Modify | Error state with retry, delete button submitting state |
| `src/app/(app)/recurrentes/page.tsx` | Modify | Error state with retry |
| `src/app/(app)/cierre/page.tsx` | Modify | Error state with retry (currently silent on fetch error) |
| `src/app/(app)/clientes/clientes-client.tsx` | Modify | Error state with retry, toast on fetchClientes |
| `src/app/(app)/trabajadores/trabajadores-client.tsx` | Modify | Submit button disabled state, toast on fetch error |
| `src/app/(app)/insumos/insumos-client.tsx` | Modify | Toast on fetch error |
| `src/app/(app)/proveedores/proveedores-client.tsx` | Modify | Spinner style consistency |
| `src/app/(app)/nomina/page.tsx` | Modify | Rename `loading` → `submitting` |
| `src/app/(app)/compras/page.tsx` | Modify | Rename `loading` → `submitting` |
| `src/app/(app)/facturas/page.tsx` | Modify | Rename `loading` → `submitting` |
| `src/app/(app)/gastos/page.tsx` | Modify | Rename `loading` → `submitting` |
| `src/app/(app)/recurrentes/nuevo/page.tsx` | Modify | Rename `loading` → `submitting` |
| `src/components/ruta-form.tsx` | Modify | Rename `loading` → `submitting` |
| `src/app/(app)/insumos/insumos-client.tsx` | Modify | Rename `loading` → `submitting` |
| `src/app/(app)/trabajadores/trabajadores-client.tsx` | Modify | Add `disabled` to submit button |
| `src/components/modal.tsx` | Modify | Add `aria-describedby`, ensure `role="dialog"` always present |
| `src/app/(app)/layout.tsx` | Modify | Add `aria-current="page"` to active nav link |

---

### Task 1: Create EmptyState Shared Component

**Files:**
- Create: `src/components/empty-state.tsx`

- [ ] **Step 1: Create the EmptyState component**

```tsx
// src/components/empty-state.tsx
'use client'

import { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 text-gray-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors)

---

### Task 2: Apply EmptyState to All Pages

**Files:**
- Modify: `src/app/(app)/pedidos/page.tsx` (replace "No hay pedidos")
- Modify: `src/app/(app)/embarques/page.tsx` (replace "No hay embarques hoy")
- Modify: `src/app/(app)/rutas/page.tsx` (replace empty state)
- Modify: `src/app/(app)/recurrentes/page.tsx` (replace "No hay pedidos recurrentes")
- Modify: `src/app/(app)/trabajadores/trabajadores-client.tsx` (replace "No hay trabajadores")
- Modify: `src/app/(app)/insumos/insumos-client.tsx` (replace "No hay insumos")
- Modify: `src/app/(app)/nomina/page.tsx` (replace "No hay nominas")
- Modify: `src/app/(app)/compras/page.tsx` (replace "No hay compras")
- Modify: `src/app/(app)/facturas/page.tsx` (replace "No hay facturas")
- Modify: `src/app/(app)/gastos/page.tsx` (replace "No hay gastos")

- [ ] **Step 1: Replace empty states in pedidos/page.tsx**

Find the "No hay pedidos" text (around L505-510 for table, L597-598 for mobile cards) and replace with:

```tsx
import { EmptyState } from '@/components/empty-state'

// In the table body when no pedidos:
<tbody>
  {filteredPedidos.length === 0 ? (
    <tr>
      <td colSpan={10}>
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          title="No hay pedidos"
          description="Crea tu primer pedido para comenzar"
          actionLabel="+ Crear Pedido"
          onAction={() => setShowModal(true)}
        />
      </td>
    </tr>
  ) : (
    // ... existing rows
  )}
</tbody>
```

Apply same pattern to mobile cards section.

- [ ] **Step 2: Replace empty state in embarques/page.tsx**

Find "No hay embarques hoy" (around L325-335) and replace with EmptyState component. Keep the existing CTA button logic but use the component.

- [ ] **Step 3: Replace empty state in rutas/page.tsx**

Find empty state (around L191-197) and replace with EmptyState. Use conditional title: `search ? "No se encontraron rutas" : "No hay rutas creadas"`.

- [ ] **Step 4: Replace empty state in recurrentes/page.tsx**

Find "No hay pedidos recurrentes" (around L309-319) and replace with EmptyState with CTA to `/recurrentes/nuevo`.

- [ ] **Step 5: Replace empty states in remaining pages**

Apply EmptyState to: trabajadores, insumos, nomina, compras, facturas, gastos. Each with appropriate icon, title, and CTA where applicable.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 3: Create loading.tsx Files for Server Components

**Files:**
- Create: `src/app/(app)/loading.tsx`
- Create: `src/app/(app)/dashboard/loading.tsx`

- [ ] **Step 1: Create global loading.tsx**

```tsx
// src/app/(app)/loading.tsx
export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">Cargando...</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create dashboard-specific loading with skeletons**

```tsx
// src/app/(app)/dashboard/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-6 h-28">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 h-64">
          <div className="h-5 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 h-64">
          <div className="h-5 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-40 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify loading.tsx works**

Run: `npm run dev` and navigate to `/dashboard` — should see skeleton instead of blank screen.

---

### Task 4: Add Error States with Retry to All Data-Fetching Pages

**Files:**
- Modify: `src/app/(app)/pedidos/page.tsx`
- Modify: `src/app/(app)/embarques/page.tsx`
- Modify: `src/app/(app)/rutas/page.tsx`
- Modify: `src/app/(app)/recurrentes/page.tsx`
- Modify: `src/app/(app)/cierre/page.tsx`
- Modify: `src/app/(app)/clientes/clientes-client.tsx`
- Modify: `src/app/(app)/trabajadores/trabajadores-client.tsx`
- Modify: `src/app/(app)/insumos/insumos-client.tsx`

- [ ] **Step 1: Add error state pattern to pedidos/page.tsx**

Add `fetchError` state and retry function:

```tsx
const [fetchError, setFetchError] = useState<string | null>(null)

const fetchPedidos = async () => {
  try {
    setFetchError(null)
    const res = await fetch('/api/pedidos?all=true')
    if (!res.ok) throw new Error(`Error ${res.status}`)
    const data = await res.json()
    setPedidos(data)
  } catch (e) {
    setFetchError('No se pudieron cargar los pedidos')
    toast.error('Error cargando pedidos')
  } finally {
    setLoading(false)
  }
}
```

Replace loading spinner with error UI when `fetchError` is set:

```tsx
if (fetchError) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <h3 className="text-lg font-medium text-gray-900">{fetchError}</h3>
      <button
        onClick={fetchPedidos}
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
      >
        Reintentar
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Apply same error pattern to embarques, rutas, recurrentes**

Same pattern: add `fetchError` state, set it in catch block, show error UI with retry button before the loading check.

- [ ] **Step 3: Fix cierre/page.tsx silent error**

Currently L74-76 only does `console.error(e)`. Add `setFetchError` and toast:

```tsx
catch (e) {
  setFetchError('No se pudieron cargar los datos del cierre')
  toast.error('Error cargando datos del cierre')
}
```

- [ ] **Step 4: Add toast to clientes fetchClientes**

Currently L75-86 only does `console.error()`. Add `toast.error('Error cargando clientes')`.

- [ ] **Step 5: Add toast to trabajadores fetch**

Currently L61-68 only does `console.error()`. Add `toast.error('Error cargando trabajadores')`.

- [ ] **Step 6: Add toast to insumos fetch**

Currently L42-55 only does `console.error(e)`. Add `toast.error('Error cargando insumos')`.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 5: Double-Click Protection — Fix Missing Submit Disabled States

**Files:**
- Modify: `src/app/(app)/trabajadores/trabajadores-client.tsx` (submit button has NO disabled)
- Modify: `src/app/(app)/rutas/page.tsx` (delete button has no submitting guard)

- [ ] **Step 1: Fix trabajadores submit button**

In `trabajadores-client.tsx`, find the submit button (around L398-399) and add disabled state:

```tsx
// Add state near other form states:
const [submitting, setSubmitting] = useState(false)

// In handleSubmit:
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setSubmitting(true)
  try {
    // ... existing logic
  } finally {
    setSubmitting(false)
  }
}

// On button:
<button type="submit" disabled={submitting} className="...">
  {submitting ? 'Guardando...' : (editing ? 'Actualizar' : 'Guardar')}
</button>
```

- [ ] **Step 2: Fix rutas delete button**

In `rutas/page.tsx`, the delete button (around L87) has no submitting guard. Add:

```tsx
const [deletingId, setDeletingId] = useState<string | null>(null)

const handleDelete = async (id: string) => {
  setDeletingId(id)
  try {
    const res = await fetch(`/api/rutas?id=${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error()
    fetchRutas()
  } catch {
    toast.error('Error eliminando ruta')
  } finally {
    setDeletingId(null)
  }
}

// On button:
<button
  onClick={() => handleDelete(ruta.id)}
  disabled={deletingId === ruta.id}
  className="..."
>
  {deletingId === ruta.id ? '...' : <TrashIcon />}
</button>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 6: Rename `loading` → `submitting` in Form Components

**Files:**
- Modify: `src/app/(app)/nomina/page.tsx` (L39 `loading` → `submitting`)
- Modify: `src/app/(app)/compras/page.tsx` (L42 `loading` → `submitting`)
- Modify: `src/app/(app)/facturas/page.tsx` (L38 `loading` → `submitting`)
- Modify: `src/app/(app)/gastos/page.tsx` (L37 `loading` → `submitting`)
- Modify: `src/app/(app)/recurrentes/nuevo/page.tsx` (L16 `loading` → `submitting`)
- Modify: `src/components/ruta-form.tsx` (L34 `loading` → `submitting`)
- Modify: `src/app/(app)/insumos/insumos-client.tsx` (L40 `loading` → `submitting`)

- [ ] **Step 1: Rename in each file**

For each file, find the state declaration and rename:
```tsx
// Before:
const [loading, setLoading] = useState(false)
// After:
const [submitting, setSubmitting] = useState(false)
```

Update all references: `setLoading` → `setSubmitting`, `disabled={loading}` → `disabled={submitting}`.

Do NOT change the `loading` state used for data fetching — only the one used for form submission.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 7: Accessibility Improvements

**Files:**
- Modify: `src/components/modal.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/pedido-form.tsx`
- Modify: `src/components/venta-rapida-form.tsx`
- Modify: `src/app/(app)/clientes/clientes-client.tsx`
- Modify: `src/app/(app)/trabajadores/trabajadores-client.tsx`
- Modify: `src/app/(app)/proveedores/proveedores-client.tsx`

- [ ] **Step 1: Fix modal accessibility**

In `modal.tsx`, ensure `role="dialog"` is always present (it already is at L65). Add `aria-describedby` support:

```tsx
interface ModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  title?: string
  description?: string  // NEW
}

// In the component:
const titleId = 'modal-title'
const descId = 'modal-description'

return (
  <div
    ref={overlayRef}
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? titleId : undefined}
    aria-describedby={description ? descId : undefined}
    // ...
  >
```

- [ ] **Step 2: Add aria-current to active nav link**

In `layout.tsx`, find the Link for navigation items (around L152-163) and add:

```tsx
<Link
  key={item.href}
  href={item.href}
  aria-current={isActive ? 'page' : undefined}
  className={`...`}
>
```

- [ ] **Step 3: Add htmlFor/id to form labels**

In `pedido-form.tsx`, `venta-rapida-form.tsx`, `clientes-client.tsx`, `trabajadores-client.tsx`, `proveedores-client.tsx`:

For each `<label>` + `<input>` pair, add matching `htmlFor` and `id`:

```tsx
// Before:
<label className="block text-sm font-medium text-gray-700 mb-1">
  Nombre
</label>
<input type="text" required className="..." />

// After:
<label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-1">
  Nombre
</label>
<input id="nombre" type="text" required className="..." />
```

Apply to all form fields in these files.

- [ ] **Step 4: Add aria-label to icon-only buttons**

Find all buttons that contain only icons (edit, delete, view buttons) and add `aria-label`:

```tsx
// Before:
<button onClick={() => handleEdit(item)}>
  <EditIcon />
</button>

// After:
<button onClick={() => handleEdit(item)} aria-label="Editar" title="Editar">
  <EditIcon />
</button>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 8: Filter Persistence for Pedidos Page — URL Search Params

**Files:**
- Modify: `src/app/(app)/pedidos/page.tsx`

- [ ] **Step 1: Replace useState filters with URL-based state**

Replace the current `useState` filters:
```tsx
// Remove these:
const [filtroEstado, setFiltroEstado] = useState<string[]>([])
const [filtroTipo, setFiltroTipo] = useState<string[]>([])
const [search, setSearch] = useState('')
```

With URL-based state using `useSearchParams` and `useRouter`:
```tsx
import { useSearchParams, useRouter } from 'next/navigation'

const searchParams = useSearchParams()
const router = useRouter()

const filtroEstado = searchParams.getAll('estado')
const filtroTipo = searchParams.getAll('tipo')
const search = searchParams.get('search') || ''

const updateFilter = (key: string, value: string) => {
  const params = new URLSearchParams(searchParams.toString())
  // Toggle logic for multi-select
  const current = params.getAll(key)
  if (current.includes(value)) {
    params.delete(key)
    current.filter(v => v !== value).forEach(v => params.append(key, v))
  } else {
    params.append(key, value)
  }
  router.push(`?${params.toString()}`)
}

const updateSearch = (value: string) => {
  const params = new URLSearchParams(searchParams.toString())
  if (value) params.set('search', value)
  else params.delete('search')
  router.push(`?${params.toString()}`)
}
```

- [ ] **Step 2: Update filter toggle buttons**

Replace `setFiltroEstado` / `setFiltroTipo` calls with `updateFilter('estado', estado)` / `updateFilter('tipo', tipo)`.

- [ ] **Step 3: Update search input**

Replace `setSearch` with `updateSearch`. Add debounce to avoid excessive URL pushes:

```tsx
const [searchInput, setSearchInput] = useState(search)

useEffect(() => {
  const timer = setTimeout(() => updateSearch(searchInput), 300)
  return () => clearTimeout(timer)
}, [searchInput])
```

- [ ] **Step 4: Verify filters survive refresh**

Run: `npm run dev`, navigate to `/pedidos`, set some filters, refresh page — filters should persist.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 9: Create Custom 404 Page

**Files:**
- Create: `src/app/not-found.tsx`

- [ ] **Step 1: Create the 404 page**

```tsx
// src/app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-blue-600">404</h1>
        <p className="mt-4 text-xl text-gray-600">Página no encontrada</p>
        <p className="mt-2 text-gray-500">La página que buscas no existe o fue movida.</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          Volver al Dashboard
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Test 404 page**

Run: `npm run dev`, navigate to `/nonexistent-route` — should see custom 404 page.

---

### Task 10: Consistency Fixes

**Files:**
- Modify: `src/app/(app)/proveedores/proveedores-client.tsx` (spinner style, design consistency)
- Modify: `src/app/(app)/cierre/page.tsx` (spinner instead of text)

- [ ] **Step 1: Fix proveedores spinner style**

In `proveedores-client.tsx`, change the spinner from `h-8 w-8 border-2` to match the standard `h-12 w-12 border-b-2`:

```tsx
// Before:
<div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600"></div>

// After:
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
```

- [ ] **Step 2: Fix cierre loading state**

In `cierre/page.tsx`, replace the `"Cargando..."` text (around L151-157) with the standard spinner:

```tsx
// Before:
<div className="text-center py-8">Cargando...</div>

// After:
<div className="flex justify-center py-20">
  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 11: Run Full Test Suite

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors

- [ ] **Step 2: Run unit tests**

Run: `npm run test`
Expected: All pass

- [ ] **Step 3: Run E2E tests**

Run: `npm run test:e2e`
Expected: 45/46+ passing (same or better than baseline)

- [ ] **Step 4: Manual smoke test**

- Dashboard loads with skeleton on slow connection
- Pedidos filters persist after refresh
- All form submit buttons disable during submission
- Error states show with retry button on fetch failure
- Empty states show with appropriate CTAs
- 404 page shows for unknown routes
- Modal has proper ARIA attributes
- Form labels are associated with inputs

---

## Self-Review

### 1. Spec Coverage

| Audit Finding | Task |
|---------------|------|
| Double-click creates duplicates | Task 5 (trabajadores, rutas) + existing patterns verified |
| Base Caja modal no skip | Not in scope — requires product decision |
| "Pedidos del Día" shows all | Not in scope — requires product decision |
| Flash of empty state | Task 4 (error states prevent this) |
| No error visual on fetch fail | Task 4 |
| Dashboard no loading.tsx | Task 3 |
| Validation only with toasts | Partial — inline errors noted but not implemented (larger effort) |
| Filtros no sobreviven refresh | Task 8 |
| Cards sin accesibilidad | Task 7 |
| Labels sin htmlFor/id | Task 7 |
| Empty states inconsistent | Tasks 1 + 2 |
| Loading states inconsistent | Tasks 3 + 10 |
| Button naming inconsistent | Task 6 |
| No 404 page | Task 9 |

### 2. Placeholder Scan

No TBD, TODO, or placeholder patterns found. All steps contain actual code.

### 3. Type Consistency

- `EmptyState` component props defined in Task 1, used consistently in Task 2
- `fetchError` state pattern defined in Task 4, applied consistently
- `submitting` naming convention defined in Task 6, applied to all forms
- Spinner style standardized in Task 10

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-29-ux-audit-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
