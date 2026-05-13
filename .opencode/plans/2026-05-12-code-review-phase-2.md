# Fase 2 — UI/UX + Testing

**Prioridad:** ALTA  
**Basado en:** Code Review 2026-05-12 (7 fases)  
**Impacto:** Experiencia de usuario, calidad, detección temprana de bugs

---

## B1. Manejo de errores consistente en todas las páginas

**Problema:** Solo 3 de 19 páginas muestran error inline con retry. 12+ solo usan `toast.error()` — si el toast desaparece, la página queda en loading infinito.

**Corrección:**

Crear hook compartido `useFetchState`:
```typescript
function useFetchState<T>() {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetch = useCallback(async (url: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url)
      const json = await res.json()
      setData(json.data || json)
    } catch {
      setError('No se pudieron cargar los datos')
    }
    setLoading(false)
  }, [])
  return { data, loading, error, fetch, setLoading }
}
```

Aplicar a todas las páginas que hoy solo manejan toast:
- `gastos`, `facturas`, `compras`, `produccion`, `nomina`, `insumos`, `proveedores`, `trabajadores`, `precios`, `recurrentes`, `cierre`, `rutas`

**Template de error inline:**
```tsx
if (error) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
      <p className="text-red-700 text-sm">{error}</p>
      <button onClick={retry} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm">
        Reintentar
      </button>
    </div>
  )
}
```

---

## B2. Validación inline en formularios

**Problema:** Formularios validan con `toast.error('Completa todos los campos')` pero no indican CUÁL campo falta.

**Corrección:**

Priorizar los 3 formularios más usados:

### B2a. Venta Rápida (`venta-rapida-form/`)
- Agregar estado de error por campo
- Mostrar `text-red-500 text-xs` debajo de inputs inválidos
- El tooltip del botón submit indica por qué está disabled

### B2b. Pedido con Envío (`pedido-form/`)
- Mismo patrón que B2a

### B2c. Pedido Unificado (`pedido-form-unified/`)
- Mismo patrón

**Extraer validación compartida:**
```typescript
export function FieldError({ error }: { error?: string }) {
  if (!error) return null
  return <p className="text-red-500 text-xs mt-1">{error}</p>
}
```

---

## B3. Contraste de color WCAG AA

**Problema:** `text-gray-500` sobre `bg-gray-100` ~3.5:1 (falla WCAG AA que pide 4.5:1).

**Corrección global:**
- Buscar todas las ocurrencias de `text-gray-500`:
  - Si está sobre `bg-gray-100` → cambiar a `text-gray-700`
  - Si está sobre `bg-gray-50` → cambiar a `text-gray-600`
- Buscar todas las ocurrencias de `text-gray-400` sobre `bg-gray-50` → `text-gray-500`

**Además:** Agregar `cursor: pointer` en botones (Tailwind v4 lo sacó por defecto):
```css
/* globals.css */
button:not(:disabled), [role="button"]:not(:disabled) {
  cursor: pointer;
}
```

---

## B4. Testing: Eliminar waitForTimeout

**Problema:** 180 `await page.waitForTimeout(X)` en tests E2E. Son arbitrarios, lentos y flaky.

**Corrección:**

Reemplazar patrones comunes:

```typescript
// ❌ Antes
await page.click('button:has-text("Cobrar")')
await page.waitForTimeout(2000)
await expect(page.locator('h2:has-text("Venta Rapida")')).toHaveCount(0)

// ✅ Después
await page.click('button:has-text("Cobrar")')
await expect(page.locator('h2:has-text("Venta Rapida")')).not.toBeVisible({ timeout: 5000 })
```

Playwright's auto-waiting hace que `not.toBeVisible()` espere automáticamente hasta que el modal desaparezca (o falle con timeout claro).

**Regla:** Ningún `waitForTimeout` nuevo. Los existentes se reemplazan uno por uno con `expect().toBeVisible()`, `waitForURL()`, `waitForResponse()`.

---

## B5. Testing: Shared fixtures

**Problema:** `login()` y `handleBaseCajaModal()` duplicados en 15+ archivos.

**Corrección:**

Crear `e2e/fixtures.ts`:
```typescript
import { test as base, type Page } from '@playwright/test'

export async function login(page: Page, username = 'admin', password = 'admin123') {
  await page.goto('/login')
  await page.fill('input[placeholder="Ingrese usuario"]', username)
  await page.fill('input[placeholder="Ingrese contraseña"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard')
}

export async function dismissBaseCaja(page: Page) {
  const btn = page.locator('button:has-text("Continuar →")')
  if (await btn.count() > 0) {
    await page.fill('input[type="number"]', '50000')
    await btn.click()
  }
}

export const test = base.extend({})
```

Importar `test` de `./fixtures` en vez de `@playwright/test`.

---

## B6. Testing: Debug skipped tests

**Problema:** 11 tests skippeados (10 de roles-permisos, 1 de compras). Son tests de seguridad.

**Corrección:**

- `roles-permisos.spec.ts`: Investigar por qué fallan. Probablemente dependen de seed data específica o del middleware de roles. Resolver y activar.
- `compras.spec.ts`: Asegurar que existan proveedores e insumos antes del test (usar `request.post()` para crear data de setup).

---

## Verificación Fase 2

```bash
npm run test
npm run test:e2e
npx tsc --noEmit
```

