# Security Hardening — Agua Bambú v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los 8 hallazgos críticos y altos de seguridad de la auditoría — APIs abiertas, trust host, IDOR, input validation, logs con datos sensibles, secrets hardcodeados.

**Architecture:** El plan mantiene los patrones existentes (Next.js App Router, route handlers, Prisma, Zod) sin reestructurar. Agrega un wrapper `requireAuth` + `requireRole` + `requireOwnership` reutilizable en cada route handler. Sanitiza logs. Genera secrets aleatorios en seed.

**Tech Stack:** Next.js 16, TypeScript, Prisma, Zod, NextAuth v5 beta, Tailwind

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/constants.ts` | Create | Constantes `ROLES`, `OWNER_FIELD_MAP` |
| `src/lib/auth-check.ts` | Modify | Agregar `requireOwnership` + mejorar `requireRole` |
| `src/middleware.ts` | Modify | Proteger rutas API con autenticación |
| `src/lib/auth.ts` | Modify | Quitar `trustHost: true`, sanitizar logs |
| `src/app/api/embarques/route.ts` | Modify | Agregar `requireRole` |
| `src/app/api/embarques/[id]/route.ts` | Modify | Agregar `requireRole` + `requireOwnership` |
| `src/app/api/embarques/[id]/cerrar/route.ts` | Modify | Agregar `requireRole(['ADMIN', 'REPARTIDOR'])` |
| `src/app/api/embarques/auto/route.ts` | Modify | Agregar `requireRole('ADMIN')` |
| `src/app/api/pedidos/[id]/route.ts` | Modify | Agregar `requireOwnership` |
| `src/app/api/pedidos/route.ts` | Modify | Quitar `as any`, usar constante |
| `src/app/api/recurrentes/route.ts` | Modify | Agregar `requireRole` + Zod |
| `src/app/api/rutas/route.ts` | Modify | Agregar `requireRole` + validar UUID |
| `src/app/api/precios/resolver/route.ts` | Modify | Agregar Zod validation |
| `src/app/api/pedidos/recurrentes/route.ts` | Modify | Agregar Zod validation |
| `src/lib/db/sync.ts` | Modify | Sanitizar `console.error` |
| `src/lib/rate-limit.ts` | Modify | Sanitizar `console.error` |
| `docker-compose.yml` | Modify | Restringir puerto a localhost |
| `prisma/seed.ts` | Modify | Passwords aleatorias + bcrypt cost 12 |
| `e2e/*.spec.ts` | Verify | 46 tests deben seguir pasando |

---

## Tareas CRÍTICAS (Semana 1)

### Task 1: Constantes de roles y ownership mapping

**Files:**
- Create: `src/lib/constants.ts`

- [ ] **Step 1: Crear constantes**

```typescript
// src/lib/constants.ts
export const ROLES = {
  ADMIN: 'ADMIN',
  CONTADOR: 'CONTADOR',
  ASISTENTE: 'ASISTENTE',
  REPARTIDOR: 'REPARTIDOR',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Para verificación de ownership en endpoints con [id]
export const OWNER_FIELD_MAP: Record<string, { entity: string; ownerField: string; userField: string }> = {
  pedido: { entity: 'Pedido', ownerField: 'clienteId', userField: 'id' },  // TODO: revisar si repartidor es dueño
  embarque: { entity: 'Embarque', ownerField: 'trabajadorId', userField: 'id' },
  cliente: { entity: 'Cliente', ownerField: 'id', userField: 'id' }, // clientes son compartidos, ownership no aplica
};
```

- [ ] **Step 2: Verificar TypeScript**

Run: `npx tsc --noEmit --noErrorTruncation`
Expected: PASS

---

### Task 2: Middleware — Proteger todas las rutas API

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Agregar lista de rutas API protegidas**

En `src/middleware.ts`, agregar después de `PROTECTED_PAGE_ROUTES`:

```typescript
const PROTECTED_API_ROUTES = [
  '/api/clientes',
  '/api/pedidos',
  '/api/embarques',
  '/api/facturas',
  '/api/abonos',
  '/api/gastos',
  '/api/nomina',
  '/api/produccion',
  '/api/compras',
  '/api/insumos',
  '/api/proveedores',
  '/api/trabajadores',
  '/api/rutas',
  '/api/recurrentes',
  '/api/cierre',
  '/api/cierre-dia',
  '/api/config',
  '/api/precios',
  '/api/reportes',
];
```

- [ ] **Step 2: Reemplizar lógica de protección de API**

Reemplazar el bloque actual (aprox líneas 87-90):

```typescript
// ANTES:
if (isApiRequest && !isApiAuth) {
  const csrfResult = await validateCsrf(req);
  if (!csrfResult.ok) return csrfResult.response;
}

// DESPUÉS:
if (isApiRequest && !isApiAuth) {
  const { success, status, body } = await checkRateLimit(req, clientIp);
  if (!success) return responseWithDelay(status ?? 429, { error: body?.error ?? 'Rate limit exceeded' });

  // Requieren auth:POST/PUT/PATCH/DELETE siempre; GET opcional según endpoint
  const method = req.method;
  if (method !== 'GET') {
    const token = await auth();
    if (!token?.user?.id) {
      return responseWithDelay(401, { error: 'Unauthorized' });
    }
  }

  const csrfResult = await validateCsrf(req);
  if (!csrfResult.ok) return csrfResult.response;
}
```

**Nota:** GETs a APIs públicas (ej. /api/config/BASE_DIA usado por login) quedan sin auth por ahora. Si hay GETs sensibles que no deberían ser públicos, se deben proteger individualmente en cada route handler con `requireAuth`.

- [ ] **Step 3: Verificar `responseWithDelay` existe**

Si `responseWithDelay` no existe en el archivo, crear helper local:

```typescript
function responseWithDelay(status: number, body: unknown) {
  // Pequeño delay para prevenir timing attacks
  const delay = Math.floor(Math.random() * 50) + 50;
  return new Promise<Response>((resolve) => {
    setTimeout(() => resolve(NextResponse.json(body, { status })), delay);
  });
}
```

- [ ] **Step 4: Verificar TypeScript + tests**

Run: `npx tsc --noEmit`
Expected: PASS
Run: `npm run test:e2e -- --grep "login|auth"`
Expected: Tests de auth pasan

---

### Task 3: auth.ts — Quitar trustHost, sanitizar logs

**Files:**
- Modify: `src/lib/auth.ts` (líneas 43, 99)

- [ ] **Step 1: Reemplazar `trustHost: true`**

```typescript
// ANTES (línea ~99):
trustHost: true,

// DESPUÉS:
trustHost: process.env.AUTH_TRUST_HOST === 'true',
```

- [ ] **Step 2: Sanitizar log de error (línea ~43)**

```typescript
// ANTES:
console.error('Auth error:', error)

// DESPUÉS:
console.error('Auth error:', error instanceof Error ? error.message : 'Unknown error')
```

- [ ] **Step 3: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 4: auth-check.ts — Agregar `requireOwnership` + mejorar helpers

**Files:**
- Modify: `src/lib/auth-check.ts`

- [ ] **Step 1: Leer archivo actual**

- [ ] **Step 2: Agregar `requireOwnership` al final**

```typescript
import { PrismaClient } from '@prisma/client';
import { OWNER_FIELD_MAP } from './constants';

const prisma = new PrismaClient();

/**
 * Verifica que el recurso exista y que el usuario tenga derecho a accederlo.
 * Para embarques: el trabajadorId debe coincidir con el user.id (si rol=REPARTIDOR).
 * Para pedidos: si rol=REPARTIDOR, debe estar asignado a su embarque. Si ADMIN/CONTADOR, puede ver todos.
 */
export async function requireOwnership(
  entity: keyof typeof OWNER_FIELD_MAP,
  resourceId: string,
  user: { id: string; role: string }
): Promise<boolean> {
  const config = OWNER_FIELD_MAP[entity];
  if (!config) return false;

  // ADMIN y CONTADOR pueden ver todo
  if (user.role === 'ADMIN' || user.role === 'CONTADOR') return true;

  if (entity === 'embarque') {
    const embarque = await prisma.embarque.findUnique({
      where: { id: resourceId },
      select: { trabajadorId: true },
    });
    return embarque?.trabajadorId === user.id;
  }

  if (entity === 'pedido') {
    // Un repartidor puede ver un pedido si está asignado a un embarque suyo
    const pedido = await prisma.pedido.findUnique({
      where: { id: resourceId },
      select: { embarque: { select: { trabajadorId: true } } },
    });
    return pedido?.embarque?.trabajadorId === user.id;
  }

  return false;
}
```

- [ ] **Step 3: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 5: Embarques API — Rol + Ownership

**Files:**
- Modify: `src/app/api/embarques/route.ts` (POST)
- Modify: `src/app/api/embarques/[id]/route.ts` (GET/PUT/DELETE)
- Modify: `src/app/api/embarques/[id]/cerrar/route.ts` (POST)
- Modify: `src/app/api/embarques/auto/route.ts` (POST)

- [ ] **Step 1: Proteger POST /api/embarques**

Agregar al inicio del handler POST:

```typescript
import { requireAuth, requireRole } from '@/lib/auth-check';
import { ROLES } from '@/lib/constants';

export async function POST(request: Request) {
  const user = await requireAuth();
  await requireRole([ROLES.ADMIN, ROLES.REPARTIDOR]);
  // ... resto del handler
}
```

- [ ] **Step 2: Proteger /api/embarques/[id] GET/PUT/DELETE**

```typescript
import { requireAuth, requireRole, requireOwnership } from '@/lib/auth-check';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  const id = params.id;

  const hasAccess = await requireOwnership('embarque', id, user);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // ... resto
}
```

Si `requireAuth` no retorna el user con role, ajustar el helper para que sí lo retorne.

- [ ] **Step 3: Proteger /api/embarques/[id]/cerrar**

```typescript
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  await requireRole([ROLES.ADMIN, ROLES.REPARTIDOR]);

  // TODO: verificar que el embarque pertenece al repartidor (si rol=REPARTIDOR)
  const id = params.id;
  const hasAccess = await requireOwnership('embarque', id, user);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // ... resto
}
```

- [ ] **Step 4: Proteger /api/embarques/auto**

```typescript
export async function POST(request: Request) {
  await requireAuth();
  await requireRole([ROLES.ADMIN]);
  // ... resto
}
```

- [ ] **Step 5: Verificar TypeScript + tests**

Run: `npx tsc --noEmit`
Expected: PASS
Run E2E: `npm run test:e2e -- --grep "embarques"`
Expected: 3 tests passing

---

### Task 6: Pedidos API — Ownership en [id]

**Files:**
- Modify: `src/app/api/pedidos/[id]/route.ts`

- [ ] **Step 1: Agregar ownership check**

```typescript
import { requireAuth, requireOwnership } from '@/lib/auth-check';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await requireAuth();
  const id = params.id;

  const hasAccess = await requireOwnership('pedido', id, user);
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  // ... resto
}
```

Repetir para PUT y DELETE (si aplica según rol).

- [ ] **Step 2: Quitar `as any` en GET list**

En `src/app/api/pedidos/route.ts`, reemplazar:

```typescript
// ANTES:
estado: { not: 'CANCELADO' as any }

// DESPUÉS:
estado: { not: 'CANCELADO' }
```

Si TypeScript protesta, castear al enum Prisma correcto o usar una constante:

```typescript
import { EstadoPedido } from '@prisma/client';
// ...
estado: { not: EstadoPedido.CANCELADO }
```

- [ ] **Step 3: Verificar TypeScript + tests**

Run: `npx tsc --noEmit`
Expected: PASS
Run E2E: `npm run test:e2e -- --grep "pedidos"`
Expected: Tests passing

---

### Task 7: Recurrentes + Rutas API — Rol + Validación

**Files:**
- Modify: `src/app/api/recurrentes/route.ts`
- Modify: `src/app/api/rutas/route.ts`

- [ ] **Step 1: Proteger /api/recurrentes**

```typescript
import { requireAuth, requireRole } from '@/lib/auth-check';
import { ROLES } from '@/lib/constants';

export async function GET(request: Request) {
  await requireAuth();
  // GET puede ser público según diseño, o protegerlo
  // ...
}

export async function POST(request: Request) {
  const user = await requireAuth();
  await requireRole([ROLES.ADMIN, ROLES.CONTADOR]);
  // ...
}
```

- [ ] **Step 2: Validar Zod en recurrentes**

Agregar schema Zod para el body de POST/PUT:

```typescript
import { z } from 'zod';

const RecurrenteCreateSchema = z.object({
  decisiones: z.array(z.object({
    clienteId: z.string().min(1),
    productos: z.record(z.number().min(0)).optional(),
    frecuencia: z.enum(['DIARIA', 'SEMANAL', 'QUINCENAL', 'MENSUAL']),
    proximaFecha: z.string().datetime().optional(),
  })),
  fecha: z.string().datetime().optional(),
});
```

Y usar `RecurrenteCreateSchema.safeParse(body)` antes de procesar.

- [ ] **Step 3: Validar UUID en rutas**

En `src/app/api/rutas/route.ts`, PUT/DELETE:

```typescript
import { z } from 'zod';

const IdSchema = z.string().uuid();

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const parsedId = IdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });
  }
  // ...
}
```

- [ ] **Step 4: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS

---

### Task 8: Precios Resolver + Pedidos Recurrentes — Zod

**Files:**
- Modify: `src/app/api/precios/resolver/route.ts`
- Modify: `src/app/api/pedidos/recurrentes/route.ts`

- [ ] **Step 1: Agregar Zod a precios/resolver**

```typescript
import { z } from 'zod';

const PrecioResolverSchema = z.object({
  items: z.array(z.object({
    codigo: z.string().min(1),
    cantidad: z.number().int().min(1),
    canal: z.enum(['PUNTO', 'DOMICILIO']),
    clienteId: z.string().min(1).optional(),
  })).optional(),
  codigo: z.string().min(1).optional(),
  cantidad: z.number().int().min(1).optional(),
  canal: z.enum(['PUNTO', 'DOMICILIO']).optional(),
  clienteId: z.string().min(1).optional(),
}).refine(data => data.items || data.codigo, {
  message: 'Debe enviar items o un solo producto (codigo/cantidad/canal)',
});
```

Y usarlo en POST.

- [ ] **Step 2: Agregar Zod a pedidos/recurrentes**

```typescript
const RecurrenteDecisionSchema = z.object({
  clienteId: z.string().min(1),
  productos: z.record(z.number().min(0)).optional(),
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']).optional(),
});

const RecurrenteCreateSchema = z.object({
  decisiones: z.array(RecurrenteDecisionSchema).min(1),
  fecha: z.string().datetime().optional(),
});
```

- [ ] **Step 3: Verificar TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS

---

## Tareas ALTO (Semana 1-2)

### Task 9: Sanitizar console.error en lib/

**Files:**
- Modify: `src/lib/db/sync.ts` L82
- Modify: `src/lib/rate-limit.ts` L38
- Modify: `src/app/api/**/*.ts` — buscar `console.log`, `console.error`

- [ ] **Step 1: Sanitizar sync.ts**

```typescript
// ANTES:
console.error('Sync failed for item', item, e)

// DESPUÉS:
console.error('Sync failed for item', { id: item.id, type: item.type }, e instanceof Error ? e.message : 'Unknown')
```

- [ ] **Step 2: Sanitizar rate-limit.ts**

```typescript
// ANTES:
console.error('Failed to connect to Redis, falling back to memory:', err)

// DESPUÉS:
console.error('Failed to connect to Redis, falling back to memory')
// Nunca loguear el objeto error completo si podría contener credenciales
```

- [ ] **Step 3: Buscar y sanitizar todos los console.log/error en src/app/api/**

Run:
```bash
grep -rn "console\.log\|console\.error" src/app/api/ src/lib/ --include="*.ts"
```

Para cada hallazgo, determinar si leakea datos. Si sí, sanitizar. Si es solo info de desarrollo (`SW registered`, etc.), dejar o usar `if (process.env.NODE_ENV === 'development')`.

---

### Task 10: Docker compose — Restringir a localhost

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Cambiar puerto**

```yaml
# ANTES:
ports:
  - "5433:5432"

# DESPUÉS:
ports:
  - "127.0.0.1:5433:5432"
```

- [ ] **Step 2: Verificar**

Run: `docker compose config | grep 5433`
Expected: `127.0.0.1:5433:5432`

---

### Task 11: Seed — Passwords aleatorias + bcrypt cost 12

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Generar passwords aleatorias en dev**

```typescript
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

function generateRandomPassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// En development, loguear passwords generadas para que el dev pueda copiarlas
const isDev = process.env.NODE_ENV === 'development';

const users = [
  { username: 'admin', password: isDev ? 'admin123' : generateRandomPassword(), rol: 'ADMIN' },
  { username: 'asistente', password: isDev ? 'asist123' : generateRandomPassword(), rol: 'ASISTENTE' },
  { username: 'contador', password: isDev ? 'cont123' : generateRandomPassword(), rol: 'CONTADOR' },
];

for (const user of users) {
  const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
  // ...
}

if (isDev) {
  console.log('=== SEED CREDENTIALS (development only) ===');
  users.forEach(u => console.log(`${u.username}: ${u.password}`));
  console.log('===========================================');
}
```

**Nota:** Para no romper los E2E tests que usan `admin/admin123`, necesitamos que en entorno de test (CI/Playwright) las contraseñas sean las mismas. Identificar si los E2E corren con `NODE_ENV=development` o `NODE_ENV=test` y ajustar la condición.

- [ ] **Step 2: Verificar E2E tests todavía usan credenciales correctas**

Run: `grep -rn "admin123\|asist123\|cont123" e2e/`

Si los tests hardcodean las credenciales, mantener `admin123` para el usuario `admin` en test/dev:

```typescript
const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

const users = [
  { username: 'admin', password: isDevOrTest ? 'admin123' : generateRandomPassword(), rol: 'ADMIN' },
  // ... etc
];
```

- [ ] **Step 3: Ejecutar seed y verificar**

Run: `npx tsx prisma/seed.ts`
Expected: Seed completa sin errores

---

## Tareas MEDIO (Semana 2)

### Task 12: CSP Hardening

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Evaluar si unsafe-eval es necesario**

Buscar uso de `eval()`, `Function()`, `setTimeout(string)` en src/:

Run: `grep -rn "eval\|Function(\|setTimeout(" src/ --include="*.ts" --include="*.tsx" | grep -v "function "`

Si no hay uso, eliminar `'unsafe-eval'` del CSP.

- [ ] **Step 2: Evaluar unsafe-inline**

Next.js/React requieren `'unsafe-inline'` para inline scripts de hydration. Sin nonce, no se puede eliminar. Documentar como TODO post-migración a nonce-based CSP.

---

### Task 13: Fix timing attack en login

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Siempre ejecutar bcrypt.compare**

```typescript
// ANTES:
if (!user || !user.activo) return null;
const isValid = await bcrypt.compare(credentials.password as string, user.password);
if (!isValid) return null;

// DESPUÉS (timing-safe):
const dummyHash = '$2a$12$abcdefghijklmnopqrstuuxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const hashToCompare = (user && user.activo) ? user.password : dummyHash;
const isValid = await bcrypt.compare(credentials.password as string, hashToCompare);
if (!user || !user.activo || !isValid) {
  // Pequeño delay constante para igualar timing
  await new Promise(r => setTimeout(r, 50 + Math.random() * 50));
  return null;
}
```

**Nota:** bcrypt dummy hash debe tener formato válido. Generar uno con `bcrypt.hashSync('dummy', 12)`.

---

## Verificación Final

### Task 14: Full test run

- [ ] **Step 1: TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Unit tests**

Run: `npm run test`
Expected: 9/9 pass

- [ ] **Step 3: E2E tests**

Run: `npm run test:e2e`
Expected: 46/46 pass (o al menos igual que baseline)

- [ ] **Step 4: Smoke test manual**

- Login con admin ✅
- Crear pedido ✅
- Ver pedido ✅
- Crear embarque ✅
- Cerrar embarque ✅
- Asistente no puede acceder a /api/config ✅
- Repartidor solo ve sus embarques ✅

---

## Self-Review

### 1. Spec Coverage

| Auditing Finding | Task |
|---|---|
| APIs públicas (no auth) | Task 2 (middleware) + Tasks 5-7 (route handlers) |
| trustHost: true | Task 3 |
| Stale JWT sin invalidación | Parcial — middleware ahora requiere auth en APIs, reduce ventana de ataque. NextAuth `jwt` callback sigue sin ejecutarse en API directas. |
| IDOR (no ownership) | Task 4 (requireOwnership) + Tasks 5-6 |
| Input validation ausente | Tasks 7-8 (Zod en resolver, recurrentes, rutas) |
| Logs con datos sensibles | Task 9 |
| Secrets hardcodeados (seed) | Task 11 |
| Docker expuesto | Task 10 |
| CSP unsafe-inline/eval | Task 12 |
| Timing attack login | Task 13 |

### 2. Placeholder Scan

No TBD, TODO, o placeholders en los tasks especificados.

### 3. Type Consistency

- `ROLES` constante definida en Task 1, usada en Tasks 5-7
- `requireOwnership` definido en Task 4, usado en Tasks 5-6
- `requireRole` existente en `auth-check.ts`, asumimos que retorna `user` o lanza. Si no retorna `user`, ajustar.

---

## Execution Handoff

**Plan completo.** Dos opciones de ejecución:

**1. Subagent-Driven (recomendado)** — Un subagente fresco por task, review entre tasks, iteración rápida. Total ~14 tasks.

**2. Inline Execution** — Ejecutar tasks en esta sesión usando executing-plans, batch con checkpoints para review. Típicamente checkpoints después de Task 7 (críticos listos) y Task 11 (altos listos).

**¿Cuál approach?**
