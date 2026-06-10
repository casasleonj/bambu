# Migración 1FN — `Cliente.contactos` y `PlantillaRecurrente.productos` → tablas hijas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar las dos violaciones de 1FN restantes convirtiendo datos multivaluados (JSON array de contactos y JSON map de productos) en tablas relacionales, **sin downtime**, usando el patrón Expand-Contract (Parallel Change).

**Architecture:** Tres deploys independientes sobre el mismo branch:
1. **EXPAND** (deploy #1): crear `ContactoCliente` y `PlantillaProducto` con relaciones Prisma inversas, sin tocar columnas legacy.
2. **MIGRATE** (deploy #2): backfill idempotente paginado de los JSON a las tablas nuevas + dual-write en POST/PUT + cambiar lecturas a la nueva tabla manteniendo shape legacy hidratado en GET (la UI no se toca).
3. **CONTRACT** (deploy #3): quitar dual-write, actualizar Zod, rename `*Rel` → nombre final, drop de columnas legacy, actualizar UI cliente/recurrente para consumir la shape nativa Prisma.

**Tech Stack:** Next.js 16.2.4, Prisma 6.19.3, PostgreSQL 17.10, Zod 4.3.6, Auth.js v5.

**Branch base:** `feat/1fn-migration-contactos-plantillaproducto` (worktree ya creado).

---

## Contexto de hallazgos (de la iteración previa)

El plan original tenía 3 huecos críticos y 2 ambigüedades que, sin resolver, rompen producción en Fase 3:

**Huecos del plan original:**
- `clientes/quick/route.ts:77` usaba JSON path search, omitido en el plan
- `clientes/[id]/route.ts:114-125` (PUT) hacía dual-write del JSON `contactos`, omitido
- `app/api/recurrentes/route.ts:71,125,145,211,247` (3 GETs + POST + PUT), omitido
- `lib/recurrentes.ts:158` y `app/api/recurrentes/route.ts:61` (findMany) no incluían `productosRel`
- `app/(app)/recurrentes/[id]/page.tsx:18` (server component) parseaba `JSON.parse(plantilla.productos)`, omitido
- `app/api/pedidos/recurrentes/route.ts:68` (findMany) sin `productosRel`
- `cliente-search.ts:100-101` (búsqueda semántica) iteraba `cliente.contactos`
- UI cliente (3 archivos) y UI recurrente (2 archivos) leían `cliente.contactos` y `plantilla.productos`

**Decisiones tomadas con el usuario:**
- **Scope:** Completo (API + UI)
- **Backfill:** Por lotes preventivos, idempotente (re-ejecutable seguro)
- **Renombrar relaciones en Fase 3:** Sí (`contactosRel` → `contactos`, `productosRel` → `productos`)
- **Shape durante Fase 2:** GET hidrata al shape legacy (`cliente.contactos = [...]` desde `contactosRel`). UI no se toca hasta Fase 3.

**Archivos de UI que NO necesitan cambio (F4 — sub-documentado en v1):**

Gracias a la hidratación al shape legacy en Fase 2, los siguientes archivos frontend **funcionan tal cual** durante toda la migración. No se tocan en ninguna fase (excepto `cliente-form.tsx:385` y `editar-client/index.tsx:84-88` que se ajustan en Fase 3.6.2):

- `src/lib/cliente-search.ts:100-101` — itera `cliente.contactos` que viene hidratado del GET.
- `src/components/pedidos-search.tsx:18` — tipo `contactos?: Array<...>`, shape coincide.
- `src/app/(app)/clientes/clientes-client/index.tsx:51,229,259,285,336,1018,1022` — accede a `cliente.contactos` como array.
- `src/app/(app)/clientes/clientes-client/cliente-table.tsx:408-410,449-450` — muestra contactos y los busca inline.
- `src/app/(app)/clientes/clientes-client/cliente-form.tsx:281-344` — CRUD del array en el formulario (excepto línea 385 que se ajusta en Fase 3).
- `src/app/(app)/clientes/clientes-client/types.ts:19,156` — tipo `contactos: ContactoAlternativo[]`.
- `src/app/(app)/recurrentes/recurrentes-client/types.ts:8` — tipo `productos: Record<string, number>`, shape coincide con hidratación.

**Estrategia de merge por fase (F7 — sub-documentado en v1):**

Aunque todo el plan vive en la rama `feat/1fn-migration-contactos-plantillaproducto`, **el merge a `main` debe hacerse 3 veces**, una por fase:

1. Merge Fase 1 (EXPAND) → deploy a prod → tag `deploy/1fn-fase1-expand`.
2. Merge Fase 2 (MIGRATE) → deploy a prod → tag `deploy/1fn-fase2-migrate`. **Drenar al menos 24h** antes de Fase 3.
3. Merge Fase 3 (CONTRACT) → deploy a prod → tag `deploy/1fn-fase3-contract`.

**Procedimiento de rollback (F2 — faltante en v1):**

- **Fase 1 (EXPAND):** `npx prisma migrate resolve --rolled-back <ts>` + `git revert` del commit. Sin pérdida de datos.
- **Fase 2 (MIGRATE):** `git revert` del commit de código (NO del commit de migración SQL). Mantener la tabla nueva con datos. Re-activar la lectura desde JSON. La app vuelve a usar el JSON legacy como fuente de verdad. Las escrituras vuelven a ser solo al JSON.
- **Fase 3 (CONTRACT):** ⚠️ **irreversible**. Si falla el drop de columna, no se puede deshacer sin perder las escrituras nuevas (que ya no van al JSON). Antes de Fase 3, **drenar al menos 24h** y verificar que el dual-write lleva ese tiempo sincronizando sin incidentes.

**Volumen actual en dev (verificado):** 1 cliente con 2 contactos, 0 plantillas. SQL del backfill validado contra DB real con `BEGIN; ... ROLLBACK;`.

**Stack confirmado:** Prisma 6.19.3 soporta `--create-only`. PG 17.10 tiene `gen_random_uuid()` nativo (no requiere `pgcrypto`).

---

## Pre-requisitos (antes de la Tarea 1)

- [ ] Docker Compose corriendo: `docker compose up -d` (Postgres 17.10 en 5433, Redis 8 en 6379)
- [ ] `.env` con `DATABASE_URL` apuntando a `localhost:5433` (ya está)
- [ ] Working tree limpio
- [ ] Estás en la rama `feat/1fn-migration-contactos-plantillaproducto` (worktree)

---

## FASE 1 — EXPAND (deploy #1)

### Task 1.1: Agregar modelos nuevos al schema

**Files:**
- Modify: `prisma/schema.prisma:182-262` (modelo `Cliente`)
- Modify: `prisma/schema.prisma:321-348` (modelo `PlantillaRecurrente`)
- Create: nuevos modelos al final del archivo, antes del último bloque

- [ ] **Step 1: Agregar relación inversa `contactosRel` en Cliente**

En `prisma/schema.prisma`, dentro del modelo `Cliente`, agregar después de la línea 194 (`contactos Json?`):

```prisma
  // NUEVO (Fase 1 EXPAND): relación a tabla normalizada. Coexiste con
  // `contactos Json?` durante las Fases 2-3; se elimina en Fase 3.
  contactosRel ContactoCliente[]
```

- [ ] **Step 2: Agregar relación inversa `productosRel` en PlantillaRecurrente**

En `prisma/schema.prisma`, dentro del modelo `PlantillaRecurrente`, agregar después de la línea 334 (`productos String`):

```prisma
  // NUEVO (Fase 1 EXPAND): relación a tabla normalizada. Coexiste con
  // `productos String` durante las Fases 2-3; se elimina en Fase 3.
  productosRel PlantillaProducto[]
```

- [ ] **Step 3: Agregar los dos modelos nuevos al final del archivo**

Al final de `prisma/schema.prisma` (después del modelo `DeduccionDeuda`, antes del EOF):

```prisma
// ====================
// MIGRACIÓN 1FN: ContactoCliente (Fase 1 - EXPAND)
// ====================

model ContactoCliente {
  id        String  @id @default(cuid())
  clienteId String
  cliente   Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  nombre    String
  telefono  String
  relacion  String?

  @@index([clienteId])
  @@index([telefono])
}

model PlantillaProducto {
  id          String              @id @default(cuid())
  plantillaId String
  plantilla   PlantillaRecurrente @relation(fields: [plantillaId], references: [id], onDelete: Cascade)
  producto    String
  cantidad    Int                 @default(0)

  @@unique([plantillaId, producto])
  @@index([plantillaId])
}
```

- [ ] **Step 4: Validar schema y type-check**

```bash
npx prisma format
npx prisma validate
```

Esperado: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(1fn): add ContactoCliente and PlantillaProducto models (Fase 1 EXPAND)"
```

### Task 1.2: Crear y aplicar la migración additive

**Files:**
- Create: `prisma/migrations/<timestamp>_expand_contactos_productos/migration.sql` (generado por Prisma)

- [ ] **Step 1: Crear migración con --create-only**

```bash
npx prisma migrate dev --create-only --name expand_contactos_productos
```

- [ ] **Step 2: Inspeccionar el SQL generado**

```bash
ls prisma/migrations/ | tail -5
cat prisma/migrations/<timestamp>_expand_contactos_productos/migration.sql
```

Esperado: 2 `CREATE TABLE` (`"ContactoCliente"`, `"PlantillaProducto"`) + 4 `CREATE INDEX` + 2 `ADD FOREIGN KEY`. **NO** debe tocar las tablas `Cliente` ni `PlantillaRecurrente`.

- [ ] **Step 3: Aplicar la migración**

```bash
npx prisma migrate dev
```

- [ ] **Step 4: Verificar que las tablas existen y las columnas legacy siguen**

```bash
PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu -c "\d \"ContactoCliente\""
PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu -c "\d \"PlantillaProducto\""
PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu -c "SELECT column_name FROM information_schema.columns WHERE (table_name='Cliente' AND column_name='contactos') OR (table_name='PlantillaRecurrente' AND column_name='productos');"
```

Esperado:
- `ContactoCliente` y `PlantillaProducto` existen con sus columnas e índices.
- Las columnas legacy `contactos` y `productos` siguen existiendo (2 filas en el SELECT final).

- [ ] **Step 5: Type-check y tests siguen pasando**

```bash
npx tsc --noEmit
npm run test
```

Esperado: ambos pasan sin cambios (la app no referencia las nuevas tablas aún).

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations
git commit -m "feat(1fn): apply migration for ContactoCliente and PlantillaProducto"
```

### Task 1.3: Verificación final Fase 1

- [ ] **Step 1: Confirmar criterios de éxito**

```bash
npx prisma migrate status
# Esperado: "Database schema is up to date"
```

- [ ] **Step 2: Build de producción sin errores**

```bash
npm run build 2>&1 | tail -30
```

Esperado: build exitoso. Las relaciones `cliente.contactosRel` y `plantillaRecurrente.productosRel` están disponibles pero la app no las usa todavía.

- [ ] **Step 3: Tag del deploy**

```bash
git tag -a deploy/1fn-fase1-expand -m "Fase 1 EXPAND: tablas nuevas creadas, columnas legacy intactas"
```

**Checkpoint Fase 1**: deployable a producción. Si falla, `npx prisma migrate resolve --rolled-back <timestamp>` revierte sin perder datos.

---

## FASE 2 — MIGRATE (deploy #2)

### Task 2.1: Agregar `@@unique([clienteId, telefono])` a `ContactoCliente`

**Razón:** el dual-write del PUT hace upsert; necesita un índice único para identificar la fila.

**Files:**
- Modify: `prisma/schema.prisma` (modelo `ContactoCliente`)

- [ ] **Step 1: Agregar el unique constraint**

En el modelo `ContactoCliente` (creado en Task 1.1), agregar:

```prisma
  @@unique([clienteId, telefono])
  @@index([clienteId])
  @@index([telefono])
```

(Quedan los dos índices existentes más el nuevo unique.)

- [ ] **Step 2: Crear y aplicar la migración aditiva**

```bash
npx prisma migrate dev --create-only --name add_unique_cliente_telefono
cat prisma/migrations/<timestamp>_add_unique_cliente_telefono/migration.sql
# Esperado: CREATE UNIQUE INDEX o ALTER TABLE ADD CONSTRAINT
npx prisma migrate dev
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(1fn): add unique constraint [clienteId, telefono] for upsert dedup"
```

### Task 2.2: Backfill idempotente por lotes

**Files:**
- Create: `prisma/migrations/<timestamp>_backfill_contactos_productos/migration.sql` (manual, no auto-generado)

- [ ] **Step 1: Crear directorio de migración**

```bash
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
mkdir -p prisma/migrations/${TIMESTAMP}_backfill_contactos_productos
```

- [ ] **Step 2: Escribir el SQL del backfill**

Archivo `prisma/migrations/${TIMESTAMP}_backfill_contactos_productos/migration.sql`:

```sql
-- Backfill idempotente y paginado.
-- Re-ejecutable: WHERE NOT EXISTS evita duplicados.
-- Paginación por id (cuid string) en lotes de 100.
--
-- IMPORTANTE (F1 — bug detectado en dry-run):
-- La condición de salida del loop debe ser ÚNICAMENTE `last_id IS NOT NULL`.
-- El patrón `inserted > 0 OR last_id IS NOT NULL` causa loop infinito cuando
-- el último batch real procesa todas sus filas y luego los siguientes loops
-- hacen 0 inserts pero `last_id` mantiene un valor no-nulo.
--
-- Validado con dry-run contra DB local: el patrón original entraba en loop
-- infinito. El patrón corregido termina en 1 iteración para 120 clientes.

-- ============================================
-- Backfill Cliente.contactos → ContactoCliente
-- ============================================
DO $$
DECLARE
  batch_size INT := 100;
  last_id   TEXT := '';
  inserted  INT := 0;
  total     INT := 0;
  iter      INT := 0;
BEGIN
  LOOP
    iter := iter + 1;
    EXIT WHEN iter > 1000;  -- safety: máximo 100k clientes procesados

    WITH batch AS (
      SELECT id FROM "Cliente"
      WHERE id > last_id
      ORDER BY id
      LIMIT batch_size
    )
    INSERT INTO "ContactoCliente" (id, "clienteId", nombre, telefono, relacion)
    SELECT
      gen_random_uuid()::text,
      c.id,
      elem->>'nombre',
      elem->>'telefono',
      elem->>'relacion'
    FROM batch b
    JOIN "Cliente" c ON c.id = b.id
    CROSS JOIN LATERAL jsonb_array_elements(c.contactos::jsonb) AS elem
    WHERE c.contactos IS NOT NULL
      AND jsonb_typeof(c.contactos::jsonb) = 'array'
      AND COALESCE(elem->>'telefono', '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM "ContactoCliente" cc
        WHERE cc."clienteId" = c.id
          AND cc.telefono = elem->>'telefono'
          AND cc.nombre = elem->>'nombre'
      );

    GET DIAGNOSTICS inserted = ROW_COUNT;
    total := total + inserted;

    -- Tomar el último id del batch actual (no el primero del siguiente)
    SELECT id INTO last_id FROM "Cliente" WHERE id > last_id ORDER BY id LIMIT 1;
    EXIT WHEN last_id IS NULL;  -- ÚNICA condición de salida

    RAISE NOTICE 'Iter %: inserted=%, last_id=%', iter, inserted, last_id;
  END LOOP;

  RAISE NOTICE 'Backfill contactos completo: % filas insertadas (en % iters)', total, iter;
END $$;

-- ============================================
-- Backfill PlantillaRecurrente.productos → PlantillaProducto
-- ============================================
DO $$
DECLARE
  batch_size INT := 100;
  last_id   TEXT := '';
  inserted  INT := 0;
  total     INT := 0;
  iter      INT := 0;
BEGIN
  LOOP
    iter := iter + 1;
    EXIT WHEN iter > 1000;

    WITH batch AS (
      SELECT id FROM "PlantillaRecurrente"
      WHERE id > last_id
      ORDER BY id
      LIMIT batch_size
    )
    INSERT INTO "PlantillaProducto" (id, "plantillaId", producto, cantidad)
    SELECT
      gen_random_uuid()::text,
      p.id,
      kv.key,
      (kv.value)::int
    FROM batch b
    JOIN "PlantillaRecurrente" p ON p.id = b.id
    CROSS JOIN LATERAL jsonb_each_text(p.productos::jsonb) AS kv
    WHERE p.productos IS NOT NULL
      AND p.productos <> ''
      AND (kv.value)::int > 0
      AND NOT EXISTS (
        SELECT 1 FROM "PlantillaProducto" pp
        WHERE pp."plantillaId" = p.id AND pp.producto = kv.key
      );

    GET DIAGNOSTICS inserted = ROW_COUNT;
    total := total + inserted;

    SELECT id INTO last_id FROM "PlantillaRecurrente" WHERE id > last_id ORDER BY id LIMIT 1;
    EXIT WHEN last_id IS NULL;

    RAISE NOTICE 'Iter %: inserted=%, last_id=%', iter, inserted, last_id;
  END LOOP;

  RAISE NOTICE 'Backfill productos completo: % filas insertadas (en % iters)', total, iter;
END $$;
```

- [ ] **Step 3: Aplicar el backfill**

```bash
npx prisma migrate dev
```

Esperado en dev: `Backfill contactos completo: 2 filas insertadas` (las 2 del cliente "Contactos Test"). `Backfill productos completo: 0 filas insertadas` (0 plantillas en dev).

- [ ] **Step 4: Verificar que el backfill cuadra 1:1**

```sql
-- Conteos
SELECT
  (SELECT COUNT(*) FROM "Cliente" c
   CROSS JOIN LATERAL jsonb_array_elements(c.contactos::jsonb) e
   WHERE c.contactos IS NOT NULL
     AND jsonb_typeof(c.contactos::jsonb) = 'array'
     AND COALESCE(e->>'telefono', '') <> '') AS json_count,
  (SELECT COUNT(*) FROM "ContactoCliente") AS tabla_count;

-- Esperado en dev: 2 | 2
```

Si no cuadra: revisar datos. **No avanzar** hasta que cuadre.

- [ ] **Step 5: Re-ejecutar para confirmar idempotencia**

```bash
# Forzar la re-ejecución del script de migración
PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu -f prisma/migrations/${TIMESTAMP}_backfill_contactos_productos/migration.sql
```

Esperado: 0 filas insertadas en ambas tablas (gracias al `WHERE NOT EXISTS`).

```sql
SELECT COUNT(*) FROM "ContactoCliente";
SELECT COUNT(*) FROM "PlantillaProducto";
```

Esperado: mismos conteos que antes.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations/${TIMESTAMP}_backfill_contactos_productos
git commit -m "feat(1fn): idempotent paginated backfill of contactos and productos to new tables"
```

### Task 2.3: Crear hidratador compartido (temporal para Fase 2)

**Files:**
- Create: `src/lib/cliente-hydrate.ts`

- [ ] **Step 1: Crear el archivo**

```ts
// src/lib/cliente-hydrate.ts
// Hidratador temporal (Fase 2): reconstruye la shape legacy `contactos: [...]`
// desde la nueva relación `contactosRel`. La UI consume la shape legacy;
// este wrapper se elimina en Fase 3 cuando se renombre la relación.

import { prisma } from '@/lib/prisma'

export type ClienteConContactos = NonNullable<
  Awaited<ReturnType<typeof loadClienteCompleto>>
>

/**
 * Carga un cliente con sus contactos hidratados al shape legacy.
 * En Fase 3, eliminar este wrapper y usar `prisma.cliente.findUnique` directo.
 */
export async function loadClienteCompleto(id: string) {
  const c = await prisma.cliente.findUnique({
    where: { id },
    include: { contactosRel: true },
  })
  if (!c) return null
  return {
    ...c,
    contactos: c.contactosRel.map(r => ({
      nombre: r.nombre,
      telefono: r.telefono,
      relacion: r.relacion ?? undefined,
    })),
  }
}

/**
 * Hidrata un cliente ya cargado (con contactosRel) al shape legacy.
 * Útil en mapeos post-query.
 */
export function hydrateContactos<
  T extends { contactosRel: Array<{ nombre: string; telefono: string; relacion: string | null }> }
>(c: T): T & { contactos: Array<{ nombre: string; telefono: string; relacion?: string }> } {
  return {
    ...c,
    contactos: c.contactosRel.map(r => ({
      nombre: r.nombre,
      telefono: r.telefono,
      relacion: r.relacion ?? undefined,
    })),
  }
}

/**
 * Carga una plantilla con sus productos como map.
 * Fase 2: lee desde productosRel, expone como {PACA_AGUA: n, ...}.
 * Fase 3: se elimina este wrapper.
 */
export async function loadPlantillaCompleta(id: string) {
  const p = await prisma.plantillaRecurrente.findUnique({
    where: { id },
    include: { productosRel: true },
  })
  if (!p) return null
  return {
    ...p,
    productos: hydrateProductos(p.productosRel),
  }
}

/**
 * Convierte el array de PlantillaProducto[] en el map legacy.
 */
export function hydrateProductos(
  rows: Array<{ producto: string; cantidad: number }>
): {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
} {
  const map = {
    PACA_AGUA: 0,
    PACA_HIELO: 0,
    BOTELLON: 0,
    BOLSA_AGUA: 0,
    BOLSA_HIELO: 0,
  } as Record<string, number>
  for (const r of rows) {
    if (r.producto in map) {
      map[r.producto] = r.cantidad
    }
  }
  return map as {
    PACA_AGUA: number
    PACA_HIELO: number
    BOTELLON: number
    BOLSA_AGUA: number
    BOLSA_HIELO: number
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Esperado: pasa. (El archivo todavía no se importa en ningún lado.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/cliente-hydrate.ts
git commit -m "feat(1fn): add temporary hydrator for legacy contactos/productos shape (Fase 2)"
```

### Task 2.4: Dual-write en POST `/api/clientes`

**Files:**
- Modify: `src/app/api/clientes/route.ts:202-259`

- [ ] **Step 1: Cambiar la búsqueda JSON path a relación**

En `src/app/api/clientes/route.ts`, línea 228. Reemplazar:

```ts
// Antes:
{ contactos: { path: ['[*].telefono'], equals: parsed.data.telefono } },
// Después:
{ contactosRel: { some: { telefono: parsed.data.telefono } } },
```

- [ ] **Step 2: Agregar dual-write a `contactoCliente` después del `cliente.create`**

En `src/app/api/clientes/route.ts`, después de la línea 257 (`return { kind: 'created' ... }`), agregar el dual-write **dentro de la transacción** (mismo callback `tx`). Localizar el bloque:

```ts
        const cliente = await tx.cliente.create({
          data: { /* ... */ },
          select: { id: true, nombre: true, telefono: true },
        })

        return { kind: 'created' as const, /* ... */ }
```

Reemplazar por:

```ts
        const cliente = await tx.cliente.create({
          data: { /* ... */ },
          select: { id: true, nombre: true, telefono: true },
        })

        // Dual-write ContactoCliente (Fase 2 MIGRATE)
        if (contactosSinDuplicados.length > 0) {
          await tx.contactoCliente.createMany({
            data: contactosSinDuplicados.map(c => ({
              clienteId: cliente.id,
              nombre: c.nombre,
              telefono: c.telefono,
              relacion: c.relacion ?? null,
            })),
          })
        }

        return { kind: 'created' as const, /* ... */ }
```

- [ ] **Step 3: Type-check y test**

```bash
npx tsc --noEmit
npm run test -- src/app/api/clientes/__tests__ 2>&1 | tail -20 || true
```

Esperado: TS pasa. Si hay tests específicos, pasan.

- [ ] **Step 4: Smoke test manual**

Levantar dev server (`npm run dev`) y ejecutar:

```bash
# Crear cliente con contactos vía curl con sesión activa
curl -X POST http://localhost:3000/api/clientes \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION" \
  -d '{
    "nombre": "Test Backfill Doble",
    "telefono": "3005559999",
    "contactos": [
      {"nombre": "Hermano", "telefono": "3005559998"},
      {"nombre": "Esposa", "telefono": "3005559997", "relacion": "Cónyuge"}
    ]
  }'
```

Esperado: 201 Created. Verificar en DB:

```sql
SELECT c.nombre, cc.nombre, cc.telefono, cc.relacion
FROM "Cliente" c
JOIN "ContactoCliente" cc ON cc."clienteId" = c.id
WHERE c.nombre = 'Test Backfill Doble';
```

Esperado: 2 filas en `ContactoCliente` para ese cliente.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clientes/route.ts
git commit -m "feat(1fn): dual-write contactos in POST /api/clientes + relation-based search"
```

### Task 2.5: Cambiar búsqueda JSON path en `/api/clientes/quick`

**Files:**
- Modify: `src/app/api/clientes/quick/route.ts:72-78`

- [ ] **Step 1: Reemplazar la búsqueda**

```ts
// Antes (línea 77):
{ contactos: { path: ['[*].telefono'], equals: telefono } },
// Después:
{ contactosRel: { some: { telefono } } },
```

- [ ] **Step 2: Type-check y commit**

```bash
npx tsc --noEmit
git add src/app/api/clientes/quick/route.ts
git commit -m "feat(1fn): use relation-based dedup in POST /api/clientes/quick"
```

### Task 2.6: Dual-write en PUT `/api/clientes/[id]`

**Files:**
- Modify: `src/app/api/clientes/[id]/route.ts:100-178`

- [ ] **Step 1: Refactorizar el PUT a `prisma.$transaction` con dual-write atómico**

**FALLA DETECTADA (F5 — confusión del plan v1)**: el plan v1 tenía dos Steps duplicados con bloques similares. En el plan v2, consolidado en un solo Step con la versión final.

Reemplazar las líneas 100-178 del PUT actual por:

```ts
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck
  const { id } = await params
  try {
    const body = await request.json()
    const parsed = ClienteUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }
    const data = parsed.data

    // Encontrar updatedAt (lectura fuera de tx)
    const existing = await prisma.cliente.findUnique({
      where: { id, activo: true },
      select: { updatedAt: true },
    })
    if (!existing) return apiError('Not found', 404)

    // Transacción: dual-write contactos + updateMany cliente
    const updateResult = await prisma.$transaction(async (tx) => {
      if (data.contactos !== undefined) {
        const cleaned = data.contactos.filter((c: { nombre?: string; telefono?: string }) =>
          c.nombre?.trim() && c.telefono?.trim()
        )
        const seen = new Set<string>()
        const deduped = cleaned.filter((c: { telefono: string }) => {
          if (seen.has(c.telefono)) return false
          seen.add(c.telefono)
          return true
        })
        const telefonos = deduped.map((c: { telefono: string }) => c.telefono)

        // Borrar los contactos que ya no están
        await tx.contactoCliente.deleteMany({
          where: { clienteId: id, telefono: { notIn: telefonos } },
        })

        // Upsert cada contacto nuevo/existente
        for (const c of deduped) {
          await tx.contactoCliente.upsert({
            where: { clienteId_telefono: { clienteId: id, telefono: c.telefono } },
            create: {
              clienteId: id,
              nombre: c.nombre,
              telefono: c.telefono,
              relacion: c.relacion ?? null,
            },
            update: {
              nombre: c.nombre,
              relacion: c.relacion ?? null,
            },
          })
        }

        // Si el teléfono principal cambió, borrar el contacto con ese teléfono
        if (data.telefono) {
          await tx.contactoCliente.deleteMany({
            where: { clienteId: id, telefono: data.telefono },
          })
        }

        // Quitar `contactos` del payload que va a `cliente.updateMany`
        // (la columna legacy aún existe en Fase 2, pero ya no la tocamos desde la app)
        delete data.contactos
      }

      return tx.cliente.updateMany({
        where: { id, activo: true, updatedAt: existing.updatedAt },
        data,
      })
    })

    if (updateResult.count === 0) {
      return apiError(
        'El cliente fue modificado por otro usuario. Recarga y vuelve a intentar.',
        409,
      )
    }

    // Re-leer para devolver el estado final
    const cliente = await prisma.cliente.findUnique({ where: { id } })
    if (!cliente) return apiError('Not found', 404)

    logAudit({
      entidad: 'Cliente',
      registroId: cliente.id,
      accion: 'UPDATE',
      datos: { nombre: cliente.nombre },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ cliente })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return apiError('Not found', 404)
    }
    return apiError('Error updating', 500)
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test manual**

PUT al cliente "Test Backfill Doble" creado en Task 2.4 con un contacto nuevo:

```bash
curl -X PUT http://localhost:3000/api/clientes/<ID> \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION" \
  -d '{
    "contactos": [
      {"nombre": "Hermano", "telefono": "3005559998"},
      {"nombre": "Madre", "telefono": "3005559996", "relacion": "Familiar"}
    ]
  }'
```

Esperado: 200. Verificar:

```sql
SELECT nombre, telefono, relacion FROM "ContactoCliente" WHERE "clienteId" = '<ID>';
-- Esperado: Hermano (sin cambios) + Madre (nuevo). Esposa borrada.
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clientes/[id]/route.ts
git commit -m "feat(1fn): dual-write contactos in PUT /api/clientes/[id] via upsert"
```

### Task 2.7: Dual-write en POST `/api/recurrentes`

**Files:**
- Modify: `src/app/api/recurrentes/route.ts:110-134`

- [ ] **Step 1: Agregar dual-write a `plantillaProducto`**

Localizar la transacción POST (líneas 110-134). Después del `tx.plantillaRecurrente.create(...)`, agregar:

```ts
        // Dual-write PlantillaProducto (Fase 2 MIGRATE)
        if (productos && Object.keys(productos).length > 0) {
          const items = Object.entries(productos)
            .filter(([, cant]) => (cant ?? 0) > 0)
            .map(([prod, cant]) => ({
              plantillaId: plantilla.id,
              producto: prod.toUpperCase(),
              cantidad: cant!,
            }))
          if (items.length > 0) {
            await tx.plantillaProducto.createMany({ data: items })
          }
        }
```

- [ ] **Step 2: Mantener `productosToJson` para el legacy (Fase 2 dual-write)**

El `data.productos: productosToJson(...)` del `create` se mantiene. La columna legacy se sigue escribiendo en paralelo a la nueva tabla.

- [ ] **Step 3: Type-check y commit**

```bash
npx tsc --noEmit
git add src/app/api/recurrentes/route.ts
git commit -m "feat(1fn): dual-write productos in POST /api/recurrentes"
```

### Task 2.8: Dual-write en PUT `/api/recurrentes`

**Files:**
- Modify: `src/app/api/recurrentes/route.ts:194-220`

- [ ] **Step 1: Envolver el `updateMany` en una transacción para agregar dual-write**

Localizar las líneas 194-220 (PUT). Refactorizar:

```ts
    // Dual-write productos (Fase 2 MIGRATE)
    if (parsed.data.productos) {
      const items = Object.entries(parsed.data.productos)
        .filter(([, cant]) => (cant ?? 0) > 0)
        .map(([prod, cant]) => ({
          producto: prod.toUpperCase(),
          cantidad: cant!,
        }))
      
      // Transacción para deleteMany + createMany atómico
      await prisma.$transaction(async (tx) => {
        await tx.plantillaProducto.deleteMany({ where: { plantillaId: id } })
        if (items.length > 0) {
          await tx.plantillaProducto.createMany({
            data: items.map(item => ({ ...item, plantillaId: id })),
          })
        }
      })
    }
    
    const updateResult = await prisma.plantillaRecurrente.updateMany({
      where: { id, updatedAt: existente.updatedAt },
      data,
    })
```

(Esto se ejecuta **antes** del `updateMany` de `PlantillaRecurrente`. El `data.productos` ya está en `data` por la línea 211, así que la columna legacy se sigue actualizando.)

- [ ] **Step 2: Type-check y commit**

```bash
npx tsc --noEmit
git add src/app/api/recurrentes/route.ts
git commit -m "feat(1fn): dual-write productos in PUT /api/recurrentes via deleteMany+createMany"
```

### Task 2.9: Cambiar lecturas a la nueva tabla (manteniendo shape legacy)

**Archivos:**
- `src/lib/recurrentes.ts` (líneas 158, 218, 528)
- `src/app/api/recurrentes/route.ts` (líneas 61, 71, 145, 247)
- `src/app/api/pedidos/recurrentes/route.ts` (línea 68)
- `src/app/(app)/recurrentes/[id]/page.tsx` (líneas 8, 18)
- `src/app/api/clientes/route.ts` (línea 142-167 include)

- [ ] **Step 1: En `src/lib/recurrentes.ts:158-163`, agregar `productosRel` al include**

```ts
    include: { 
      cliente: true, 
      negocio: { include: { cliente: true } },
      productosRel: true,
    },
```

- [ ] **Step 2: En `src/lib/recurrentes.ts:218`, leer desde `productosRel`**

Reemplazar:

```ts
    const productos = parseProductos(pt.productos)
```

Por:

```ts
    const productos = hydrateProductos(pt.productosRel)
```

(Importar `hydrateProductos` de `@/lib/cliente-hydrate`.)

- [ ] **Step 3: En `src/lib/recurrentes.ts:528`, mismo cambio**

```ts
      const productos = hydrateProductos(pt.productosRel)
```

- [ ] **Step 4: En `src/app/api/recurrentes/route.ts:61-67`, agregar `productosRel` al include**

```ts
    const plantillas = await prisma.plantillaRecurrente.findMany({
      where: { activo: true },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        productosRel: true,
      },
      orderBy: { createdAt: 'desc' },
    })
```

- [ ] **Step 5: En `src/app/api/recurrentes/route.ts:71`, hidratar productos**

```ts
    const recurrentes = plantillas.map(pt => ({
      ...pt,
      productos: hydrateProductos(pt.productosRel),
    }))
```

- [ ] **Step 6: En `src/app/api/recurrentes/route.ts:145 y 247`, mismo patrón**

```ts
    return apiSuccess({
      recurrente: { ...plantilla, productos: hydrateProductos(plantilla.productosRel) },
    }, 201)
```

Y:

```ts
    return apiSuccess({
      recurrente: { ...plantilla, productos: hydrateProductos(plantilla.productosRel) },
    })
```

- [ ] **Step 7: En `src/app/api/recurrentes/route.ts:230-235`, agregar `productosRel` al include del re-fetch**

```ts
    const plantilla = await prisma.plantillaRecurrente.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nombre: true } },
        productosRel: true,
      },
    })
```

- [ ] **Step 8: En `src/app/api/pedidos/recurrentes/route.ts:68`, agregar `productosRel`**

Localizar el `findMany` y agregar el include.

- [ ] **Step 9: En `src/app/(app)/recurrentes/[id]/page.tsx:8-18`, refactorizar**

```tsx
  const plantilla = await prisma.plantillaRecurrente.findUnique({
    where: { id },
    include: {
      cliente: { select: { id: true, nombre: true, telefono: true, barrio: true, direccion: true } },
      productosRel: true,
    },
  })

  if (!plantilla) notFound()

  // Hidratar productos al shape legacy para la UI
  const serialized = JSON.parse(JSON.stringify(plantilla))
  serialized.productos = plantilla.productosRel
    ? Object.fromEntries(plantilla.productosRel.map(p => [p.producto, p.cantidad]))
    : {}

  return <EditarRecurrenteClient plantilla={serialized} />
```

- [ ] **Step 10: En `src/app/api/clientes/route.ts:142-167`, agregar `contactosRel` al include**

```ts
      prisma.cliente.findMany({
        where,
        orderBy: { nombre: 'asc' },
        include: {
          _count: { select: { pedidos: true } },
          pedidos: { /* ... */ },
          negocios: { /* ... */ },
          contactosRel: true,  // NUEVO (Fase 2)
        },
        ...prismaPagination,
      }),
```

- [ ] **Step 11: Hidratar `contactos` desde `contactosRel` en el mapeo final (línea 171-175)**

```ts
    const clientes = clientesRaw.map(c => ({
      ...c,
      clienteId: c.id,
      saldoPendiente: c.pedidos.reduce((sum, p) => sum + Number(p.saldo), 0),
      contactos: hydrateContactos(c).contactos,  // shape legacy
    }))
```

- [ ] **Step 12: En la rama de `pg_trgm` (línea 45-79), ajustar el SELECT raw**

**FALLA DETECTADA (F6)**: en plan v1, este step pedía quitar `c.contactos` del SELECT raw sin verificar qué consumidores esperan ese campo. Antes de modificar, ejecutar:

```bash
grep -n "c\.contactos\|\"contactos\"" src/ -r --include="*.ts" --include="*.tsx"
```

Confirmar que el único consumidor del SELECT raw (líneas 45-79) es el código de `route.ts` que se está modificando.

Esta rama hace `SELECT c.contactos` desde la columna JSON. Como todavía existe (Fase 2), sigue funcionando. Pero para que la shape devuelta coincida, agregar al SELECT los datos relevantes o hacer un JOIN con `ContactoCliente`:

```sql
-- Agregar después del SELECT existente:
COALESCE(
  (SELECT json_agg(json_build_object('nombre', cc.nombre, 'telefono', cc.telefono, 'relacion', cc.relacion))
   FROM "ContactoCliente" cc WHERE cc."clienteId" = c.id),
  '[]'::json
) AS contactos
```

Y quitar `c.contactos` del SELECT original.

- [ ] **Step 13: Type-check y tests**

```bash
npx tsc --noEmit
npm run test
```

- [ ] **Step 14: Commit**

```bash
git add src/lib/recurrentes.ts src/app/api/recurrentes/route.ts src/app/api/pedidos/recurrentes/route.ts src/app/(app)/recurrentes/[id]/page.tsx src/app/api/clientes/route.ts
git commit -m "feat(1fn): read from new tables with legacy shape hydration in GET endpoints"
```

### Task 2.10: Verificación Fase 2

- [ ] **Step 1: Conteo dual-write cuadra**

```sql
SELECT
  (SELECT COUNT(*) FROM "Cliente" c
   CROSS JOIN LATERAL jsonb_array_elements(c.contactos::jsonb) e
   WHERE c.contactos IS NOT NULL
     AND jsonb_typeof(c.contactos::jsonb) = 'array'
     AND COALESCE(e->>'telefono', '') <> '') AS json_count,
  (SELECT COUNT(*) FROM "ContactoCliente") AS tabla_count;

SELECT
  (SELECT COUNT(*) FROM "PlantillaRecurrente" p
   CROSS JOIN LATERAL jsonb_each_text(p.productos::jsonb) kv
   WHERE p.productos <> '' AND (kv.value)::int > 0) AS json_count,
  (SELECT COUNT(*) FROM "PlantillaProducto") AS tabla_count;
```

Esperado: ambos pares cuadran (en dev: 2|2 y 0|0).

- [ ] **Step 2: Búsqueda legacy funciona (todavía no se dropeó)**

Smoke test: crear un cliente con un teléfono que ya existe en `contactos` JSON de otro cliente → debe devolver 409 duplicate_phone.

- [ ] **Step 3: Build de producción**

```bash
npm run build 2>&1 | tail -20
```

Esperado: build exitoso.

- [ ] **Step 4: E2E tests**

```bash
npm run test:e2e
```

Esperado: pasan. (Si fallan, revisar que `cliente-search.ts:100-101` siga funcionando — ahora `cliente.contactos` se hidrata desde `contactosRel`.)

- [ ] **Step 5: Tag del deploy**

```bash
git tag -a deploy/1fn-fase2-migrate -m "Fase 2 MIGRATE: dual-write + read from new tables"
```

**Checkpoint Fase 2**: deployable a producción. La app sigue funcionando con el JSON legacy Y la nueva tabla. Si falla, el rollback es trivial (`git revert` del commit de Fase 2 + `npx prisma migrate resolve --rolled-back`).

---

## FASE 3 — CONTRACT (deploy #3)

### Task 3.1: Quitar `contactos` del `ClienteCreateSchema`

**Files:**
- Modify: `src/lib/validators.ts:181-201`

- [ ] **Step 1: Quitar la línea 192**

```ts
  contactos: z.array(ContactoAlternativoSchema).optional().default([]),
```

- [ ] **Step 2: Verificar que `ClienteUpdateSchema` ya no incluye `contactos`**

`ClienteUpdateSchema = ClienteCreateSchema.partial()` hereda `.partial()` pero al quitar el campo del padre, deja de existir en el hijo.

- [ ] **Step 3: Type-check y tests**

```bash
npx tsc --noEmit
npm run test -- src/lib/__tests__/validators.test.ts 2>&1 | tail -20
```

Esperado: pasan. Si algún test usa `contactos: [...]` en `ClienteCreateSchema`, eliminarlo o ajustarlo.

- [ ] **Step 4: Commit**

```bash
git add src/lib/validators.ts
git commit -m "refactor(1fn): remove contactos from ClienteCreateSchema (Fase 3 contract)"
```

### Task 3.2: Quitar dual-write en POST `/api/clientes`

**Files:**
- Modify: `src/app/api/clientes/route.ts:186-262`

- [ ] **Step 1: Quitar las líneas 239-241 (la creación del array `contactos` y `contactosSinDuplicados`)**

```ts
        const contactos = parsed.data.contactos ?? []
        const contactosSinDuplicados = contactos.filter(c => c.telefono !== parsed.data.telefono)
```

- [ ] **Step 2: Quitar la asignación `contactos: contactosSinDuplicados...` (línea 251)**

```ts
            contactos: contactosSinDuplicados.length > 0 ? contactosSinDuplicados : undefined,
```

- [ ] **Step 3: Quitar el dual-write a `contactoCliente` (agregado en Task 2.4)**

Borrar el bloque:

```ts
        // Dual-write ContactoCliente (Fase 2 MIGRATE)
        if (contactosSinDuplicados.length > 0) {
          await tx.contactoCliente.createMany({ /* ... */ })
        }
```

- [ ] **Step 4: La búsqueda `contactosRel: { some: ... }` (línea 228) se mantiene**

- [ ] **Step 5: Type-check y commit**

```bash
npx tsc --noEmit
git add src/app/api/clientes/route.ts
git commit -m "refactor(1fn): remove contactos dual-write in POST /api/clientes"
```

### Task 3.3: Quitar dual-write en PUT `/api/clientes/[id]`

**Files:**
- Modify: `src/app/api/clientes/[id]/route.ts:100-178`
- Modify: `src/app/api/clientes/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Revertir el refactor a `prisma.$transaction`**

Reemplazar la transacción creada en Task 2.6 con el flujo original (sin `tx.contactoCliente`):

```ts
    // Encontrar updatedAt
    const existing = await prisma.cliente.findUnique({
      where: { id, activo: true },
      select: { updatedAt: true },
    })
    if (!existing) return apiError('Not found', 404)

    const updateResult = await prisma.cliente.updateMany({
      where: { id, activo: true, updatedAt: existing.updatedAt },
      data,
    })
```

Y quitar todo el bloque `if (data.contactos !== undefined) { ... }` (ahora `data.contactos` ya no existe en el schema Zod).

- [ ] **Step 2: Actualizar el test que verifica el patrón legacy**

**FALLA DETECTADA (F3)**: en plan v1 el test verificaba que el patrón legacy **no** existía (`not.toMatch`). Pero el código en Fase 2 ya tenía el patrón dual-write refactorizado a `tx.contactoCliente`. El test correcto debe verificar:

1. Que el patrón legacy `data.contactos = data.contactos.filter` **no** existe (porque la columna se va a drop).
2. Que el nuevo patrón `tx.contactoCliente` **sí** existe (porque el dual-write se mantiene hasta Fase 3).

En `src/app/api/clientes/[id]/__tests__/route.test.ts:47-49`, reemplazar el test:

```ts
  it('FIX: el cleanup de contactos se hace via contactoCliente en Fase 3', () => {
    // Patrón legacy eliminado (la columna contactos se va a drop)
    expect(putSource).not.toMatch(/data\.contactos\s*=\s*data\.contactos\.filter/)
    // Nuevo patrón: dual-write via tx.contactoCliente (aún presente en Fase 2-3)
    expect(putSource).toMatch(/tx\.contactoCliente/)
  })
```

- [ ] **Step 3: Type-check y tests**

```bash
npx tsc --noEmit
npm run test -- src/app/api/clientes/[id]/__tests__/route.test.ts 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/clientes/[id]/route.ts src/app/api/clientes/[id]/__tests__/route.test.ts
git commit -m "refactor(1fn): remove contactos dual-write in PUT /api/clientes/[id] and update test"
```

### Task 3.4: Quitar dual-write en POST/PUT `/api/recurrentes`

**Files:**
- Modify: `src/app/api/recurrentes/route.ts`

- [ ] **Step 1: En POST (línea 125), quitar `productosToJson`**

```ts
            productos: productosToJson(productos ?? {}),
```

Queda como:

```ts
            // productos ahora vive en PlantillaProducto (Fase 3)
```

- [ ] **Step 2: En POST, quitar el dual-write a `plantillaProducto` (Task 2.7)**

- [ ] **Step 3: En PUT (línea 211), quitar `data.productos = productosToJson(...)`**

```ts
    if (parsed.data.productos) {
      data.productos = productosToJson(parsed.data.productos)
    }
```

Queda como:

```ts
    if (parsed.data.productos) {
      // productos ahora vive en PlantillaProducto (Fase 3)
    }
```

- [ ] **Step 4: En PUT, quitar el dual-write a `plantillaProducto` (Task 2.8)**

- [ ] **Step 5: Mantener las lecturas desde `productosRel` con hidratación**

- [ ] **Step 6: Type-check y commit**

```bash
npx tsc --noEmit
git add src/app/api/recurrentes/route.ts
git commit -m "refactor(1fn): remove productos dual-write in POST/PUT /api/recurrentes"
```

### Task 3.5: Rename `*Rel` → nombre final en el schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: En `Cliente` (línea ~195), renombrar la relación**

```prisma
  // Antes:
  contactosRel ContactoCliente[]
  // Después:
  contactos ContactoCliente[]
```

- [ ] **Step 2: En `PlantillaRecurrente` (línea ~335), renombrar la relación**

```prisma
  // Antes:
  productosRel PlantillaProducto[]
  // Después:
  productos PlantillaProducto[]
```

- [ ] **Step 3: Validar schema**

```bash
npx prisma format
npx prisma validate
```

- [ ] **Step 4: Aplicar la migración (es solo rename de campo Prisma, no debería generar SQL de columna)**

**FALLA DETECTADA (F8)**: el rename `contactosRel` → `contactos` en Prisma es **solo cambio de nombre de campo Prisma, no de columna SQL**. **PERO** el campo `contactos` antes era la columna JSON. Prisma puede confundirse. Verificar:

```bash
npx prisma migrate dev --create-only --name rename_rel_to_final
cat prisma/migrations/<timestamp>_rename_rel_to_final/migration.sql
# Esperado: archivo VACÍO (Prisma no genera SQL porque no hay cambio de schema a nivel DB)
# Si Prisma genera DROP COLUMN u otra cosa, REVERTIR (es un bug) y reconsiderar el orden:
# - Primero droppear la columna JSON (Task 3.7)
# - Después renombrar la relación
npx prisma migrate dev
```

Si Prisma genera SQL inesperado, ajustar manualmente o revertir el rename y ejecutar primero la Task 3.7.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "refactor(1fn): rename contactosRel→contactos and productosRel→productos"
```

### Task 3.6: Actualizar todas las referencias `*Rel` → nombre final

**Archivos a tocar:**

#### 3.6.1 — Backend
- `src/app/api/clientes/route.ts:142, 146, 228` → `contactos: { some: { telefono: ... } }`
- `src/app/api/clientes/quick/route.ts:77` → `contactos: { some: { telefono } }`
- `src/lib/recurrentes.ts:158, 218, 528` → `productos: true`, `pt.productos`
- `src/app/api/recurrentes/route.ts:61, 71, 145, 230, 247` → `productos: true`, `hydrateProductos(plantilla.productos)`
- `src/app/api/pedidos/recurrentes/route.ts:68` → `productos: true`

- [ ] **Step 1: Reemplazar todas las ocurrencias de `contactosRel` por `contactos` (en includes/where de Prisma) y de `productosRel` por `productos`**

Comando sugerido (revisar diff antes de commit):

```bash
grep -rln "contactosRel\|productosRel" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Reemplazar las llamadas a `hydrateProductos(pt.productosRel)` por `hydrateProductos(pt.productos)`**

- [ ] **Step 3: Reemplazar las llamadas a `hydrateContactos` que hidratan desde `contactosRel`**

- [ ] **Step 4: Eliminar `src/lib/cliente-hydrate.ts` (ya no se necesita)**

```bash
git rm src/lib/cliente-hydrate.ts
```

- [ ] **Step 5: Verificar imports huérfanos**

```bash
grep -rn "cliente-hydrate" src/ --include="*.ts" --include="*.tsx"
# Esperado: 0 matches
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Esperado: pasa. Si hay errores, ajustar las referencias.

#### 3.6.2 — Frontend
- `src/app/(app)/recurrentes/[id]/editar-client/index.tsx:84-88`
- `src/app/(app)/clientes/clientes-client/cliente-form.tsx:385`

- [ ] **Step 7: En `editar-client/index.tsx:84-88`, ajustar lectura de productos**

Localizar:

```ts
    pacaAgua: plantilla.productos.PACA_AGUA || 0,
    pacaHielo: plantilla.productos.PACA_HIELO || 0,
    botellon: plantilla.productos.BOTELLON || 0,
    bolsaAgua: plantilla.productos.BOLSA_AGUA || 0,
    bolsaHielo: plantilla.productos.BOLSA_HIELO || 0,
```

Como en el server component (Task 2.9) hidratamos `productos` a un map, esto sigue funcionando si el `serialized.productos` es `{PACA_AGUA: n, ...}`. Pero ahora con el rename, el server component pasa `plantilla.productos` (array) directamente. **Ajustar el server component para que hidrate**, o ajustar el cliente para que itere el array.

**Decisión recomendada**: ajustar el server component `recurrentes/[id]/page.tsx:18` para que hidrate a map (mantener la shape que la UI espera):

```tsx
  serialized.productos = plantilla.productos
    ? Object.fromEntries(plantilla.productos.map(p => [p.producto, p.cantidad]))
    : {}
```

(O usar `hydrateProductos` si se mantiene.)

- [ ] **Step 8: En `cliente-form.tsx:385`, ajustar lectura de productos del cliente**

Localizar:

```ts
                      const prods = JSON.parse(plantillaRecurrente.productos)
```

Reemplazar por:

```ts
                      const prods: Record<string, number> = {}
                      if (Array.isArray(plantillaRecurrente.productos)) {
                        for (const p of plantillaRecurrente.productos) {
                          prods[p.producto] = p.cantidad
                        }
                      } else if (plantillaRecurrente.productos) {
                        Object.assign(prods, plantillaRecurrente.productos)
                      }
```

(Defensivo: soporta tanto array de Prisma como map legacy por si alguna ruta devuelve el shape viejo.)

- [ ] **Step 9: Type-check final**

```bash
npx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
git add src/
git commit -m "refactor(1fn): rename *Rel→final and remove cliente-hydrate"
```

### Task 3.7: Drop de columnas legacy

**Files:**
- Modify: `prisma/schema.prisma` (eliminar `contactos Json?` y `productos String`)

- [ ] **Step 1: En `Cliente` (línea 194), eliminar el campo legacy**

```prisma
  contactos Json?  // ← eliminar esta línea
```

- [ ] **Step 2: En `PlantillaRecurrente` (línea 334), eliminar el campo legacy**

```prisma
  productos String  // JSON: ...  // ← eliminar esta línea
```

- [ ] **Step 3: Crear y aplicar la migración de drop**

```bash
npx prisma migrate dev --create-only --name contract_drop_contactos_productos
cat prisma/migrations/<timestamp>_contract_drop_contactos_productos/migration.sql
# Esperado:
# ALTER TABLE "Cliente" DROP COLUMN "contactos";
# ALTER TABLE "PlantillaRecurrente" DROP COLUMN "productos";
npx prisma migrate dev
```

- [ ] **Step 4: Verificar el drop**

```bash
PGPASSWORD=bambu_dev psql -h localhost -p 5433 -U bambu -d bambu -c "
SELECT table_name, column_name 
FROM information_schema.columns 
WHERE (table_name='Cliente' AND column_name='contactos')
   OR (table_name='PlantillaRecurrente' AND column_name='productos');"
# Esperado: 0 filas
```

- [ ] **Step 5: Verificar que los datos están en las tablas nuevas**

```sql
SELECT 'contactos' AS tabla, COUNT(*) FROM "ContactoCliente"
UNION ALL
SELECT 'plantilla_productos', COUNT(*) FROM "PlantillaProducto";
-- Esperado en dev: 2 | 0
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "refactor(1fn): drop legacy contactos and productos columns (Fase 3 CONTRACT)"
```

### Task 3.8: Verificación final Fase 3

- [ ] **Step 1: Type-check completo**

```bash
npx tsc --noEmit
```

Esperado: pasa. Cualquier referencia residual a las columnas legacy se vuelve error de TS.

- [ ] **Step 2: Unit tests**

```bash
npm run test
```

Esperado: todos pasan.

- [ ] **Step 3: E2E tests**

```bash
npm run test:e2e
```

Esperado: todos pasan. Verifica:
- Crear cliente con contactos → fila en `ContactoCliente`
- Editar cliente, cambiar contactos → `ContactoCliente` actualizado
- Crear plantilla con productos → fila en `PlantillaProducto`
- Editar plantilla, cambiar productos → `PlantillaProducto` actualizado
- Búsqueda por teléfono devuelve `duplicate_phone` si ya está como contacto

- [ ] **Step 4: Build de producción**

```bash
npm run build 2>&1 | tail -30
```

Esperado: build exitoso, sin warnings de Prisma.

- [ ] **Step 5: Smoke test manual del flujo completo**

Levantar dev server (`npm run dev`) y:
1. Login como admin
2. Crear un cliente nuevo con 2 contactos
3. Verificar en DB: `SELECT * FROM "ContactoCliente" WHERE "clienteId" = '<ID>'` → 2 filas
4. Editar el cliente, cambiar un contacto
5. Verificar en DB: el cambio se refleja
6. Crear una plantilla recurrente con productos
7. Verificar en DB: `SELECT * FROM "PlantillaProducto" WHERE "plantillaId" = '<ID>'` → filas correctas

- [ ] **Step 6: Tag del deploy final**

```bash
git tag -a deploy/1fn-fase3-contract -m "Fase 3 CONTRACT: legacy columns dropped, 1FN migration complete"
```

**Checkpoint Fase 3**: deployable a producción. La migración 1FN está completa. Las dos violaciones (contactos como JSON array, productos como JSON map) ahora son tablas relacionales.

---

## Post-migración (opcional)

- [ ] **Verificar que la 1FN está cerrada en producción**

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE data_type = 'json'
  AND table_schema = 'public'
  AND ((table_name = 'Cliente') OR (table_name = 'PlantillaRecurrente'));
-- Esperado: 0 filas (las columnas JSON legacy fueron dropeadas)
```

- [ ] **Documentar la decisión en AGENTS.md**

Agregar al AGENTS.md una nota sobre las nuevas tablas `ContactoCliente` y `PlantillaProducto` y que las columnas JSON legacy fueron eliminadas.

---

## Resumen de archivos modificados

### Fase 1 (1 archivo)
- `prisma/schema.prisma` (+2 modelos +2 relaciones inversas + 1 migración generada)

### Fase 2 (10 archivos)
- `prisma/schema.prisma` (+1 unique constraint)
- `prisma/migrations/<ts>_add_unique_cliente_telefono/`
- `prisma/migrations/<ts>_backfill_contactos_productos/`
- `src/lib/cliente-hydrate.ts` (nuevo, temporal)
- `src/app/api/clientes/route.ts`
- `src/app/api/clientes/quick/route.ts`
- `src/app/api/clientes/[id]/route.ts`
- `src/app/api/recurrentes/route.ts`
- `src/lib/recurrentes.ts`
- `src/app/api/pedidos/recurrentes/route.ts`
- `src/app/(app)/recurrentes/[id]/page.tsx`

### Fase 3 (12 archivos)
- `prisma/schema.prisma` (rename + drop)
- `prisma/migrations/<ts>_rename_rel_to_final/`
- `prisma/migrations/<ts>_contract_drop_contactos_productos/`
- `src/lib/validators.ts`
- `src/app/api/clientes/route.ts`
- `src/app/api/clientes/[id]/route.ts`
- `src/app/api/clientes/[id]/__tests__/route.test.ts`
- `src/app/api/recurrentes/route.ts`
- `src/lib/recurrentes.ts`
- `src/lib/cliente-hydrate.ts` (eliminar)
- `src/app/(app)/recurrentes/[id]/page.tsx`
- `src/app/(app)/recurrentes/[id]/editar-client/index.tsx`
- `src/app/(app)/clientes/clientes-client/cliente-form.tsx`

---

## Riesgos y mitigaciones

| # | Riesgo | Mitigación |
|---|--------|-----------|
| R1 | El backfill paginado puede no completarse si la conexión cae | `WHERE NOT EXISTS` lo hace idempotente; re-ejecutable sin duplicar. La condición de salida es `last_id IS NULL` (no `inserted > 0`). |
| R2 | `prisma generate` no se ejecuta en Vercel con `migrate deploy` | Verificar `package.json` tiene `"postinstall": "prisma generate"` |
| R3 | El test del PUT verifica patrón legacy | Actualizar el test en Task 3.3 para verificar AMBOS: patrón legacy NO existe Y `tx.contactoCliente` SÍ existe |
| R4 | El SELECT raw de `pg_trgm` lee `c.contactos` | Ajustado en Task 2.9 Step 12 con JOIN a `ContactoCliente`. Verificar con grep previo. |
| R5 | Frontend rompe si la shape de respuesta cambia | Decisión: hidratar al shape legacy en Fase 2; UI se actualiza recién en Fase 3.6.2. Ver "Archivos de UI que NO necesitan cambio" en el contexto. |
| R6 | El seed crea datos con `JSON.stringify(productos)` | Después de Fase 3, el seed debe cambiar a `plantillaProducto.createMany()` (fuera del scope de este plan) |
| R7 | Rollback de Fase 2 sin runbook | Procedimiento documentado en "Procedimiento de rollback": `git revert` del commit de código (NO de migración), mantener tabla, re-activar lectura desde JSON. |
| R8 | Bug de loop infinito en backfill (F1) | Validado con dry-run. Patrón corregido: `EXIT WHEN last_id IS NULL` + `iter > 1000` safety. |
| R9 | Plan v1 con steps duplicados en Task 2.6 (F5) | Consolidado en Task 2.6 Step 1 (código único). |
| R10 | Plan v1 sin nota explícita de UI no-touch (F4) | Sección "Archivos de UI que NO necesitan cambio" en el contexto. |
| R11 | Plan v1 sin estrategia de merge (F7) | Sección "Estrategia de merge por fase": 3 merges con drenado de 24h entre Fase 2 y 3. |

---

## Criterios de éxito globales

| Criterio | Verificación |
|----------|--------------|
| `npx tsc --noEmit` pasa en cada fase | Sí |
| `npm run test` pasa en cada fase | Sí |
| `npm run test:e2e` pasa en cada fase | Sí |
| `npm run build` pasa en cada fase | Sí |
| Conteo `ContactoCliente` = conteo esperado (2 en dev, N en prod) | Sí |
| Conteo `PlantillaProducto` = conteo esperado (0 en dev, N en prod) | Sí |
| No quedan referencias a las columnas legacy después de Fase 3 | `grep -r "cliente\.contactos[^R]\|plantilla\.productos[^R]" src/` retorna 0 hits relevantes |
| La 1FN está cerrada: 0 columnas JSON multivaluadas en `Cliente` y `PlantillaRecurrente` | SELECT de information_schema retorna 0 filas |
