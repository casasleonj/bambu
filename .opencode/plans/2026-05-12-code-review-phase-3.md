# Fase 3 — Seguridad + Lógica de Dominio

**Prioridad:** MEDIA  
**Basado en:** Code Review 2026-05-12 (7 fases)  
**Impacto:** Prevención de data corruption, seguridad perimetral

---

## C1. CSP: Eliminar conflicto vercel.json vs proxy.ts

**Problema:** `vercel.json` aplica `script-src 'unsafe-inline' 'unsafe-eval'` en el edge antes de que el proxy.ts pueda aplicar el nonce. El nonce del proxy nunca se usa.

**Corrección:**

`vercel.json` debe reflejar el mismo CSP que proxy.ts (sin unsafe-eval, sin unsafe-inline, con nonce en scripts):

```json
{
  "source": "/(.*)",
  "headers": [
    {
      "key": "Content-Security-Policy",
      "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.openrouter.ai; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    }
  ]
}
```

Nota: El `script-src 'self'` sin `'unsafe-inline'` significa que scripts inline NO se ejecutan. Como proxy.ts genera el nonce pero vercel.json lo pisa, la opción más segura es que vercel.json tenga el CSP restrictivo de seguridad y proxy.ts ya no necesite setear CSP.

**Decisión:** Quitar el seteo de CSP de `proxy.ts` y dejar solo en `vercel.json` (que se ejecuta primero y no puede ser sobrescrito por la app). El nonce pierde utilidad pero al menos el CSP restrictivo se aplica siempre.

---

## C2. CRON_SECRET: Timing-safe comparison

**Archivos:** `src/app/api/cron/alerta-no-verificados/route.ts`, `src/app/api/cron/vencimiento-promesas/route.ts`

```typescript
// ❌ Antes
if (secret !== process.env.CRON_SECRET) { ... }

// ✅ Después
import { timingSafeEqual } from 'crypto'
// ...o su equivalente constante
if (!secret || !process.env.CRON_SECRET || secret.length !== process.env.CRON_SECRET.length) {
  return apiError('Unauthorized', 401)
}
// Ya sabemos que tienen el mismo length, comparamos char por char
```

---

## C3. Race condition: Números de pedido hijo

**Archivo:** `src/app/api/pedidos/[id]/entrega/route.ts:134`

```typescript
// ❌ Antes
const numeroHijo = await tx.pedido.count() + 1

// ✅ Después
import { getNextNumero } from '@/lib/sequence'
const numeroHijo = await getNextNumero(tx, { model: 'pedido', field: 'numero' })
```

---

## C4. Race condition: Números de Nota de Crédito

**Archivo:** `src/app/api/pedidos/[id]/anular/route.ts:77`

```typescript
// ❌ Antes
const nextNum = await tx.notaCredito.count() + 1

// ✅ Después
import { getNextNumero } from '@/lib/sequence'
const nextNum = await getNextNumero(tx, { model: 'notaCredito', field: 'numero' })
```

---

## C5. Recurrentes: Validar cliente bloqueado

**Archivo:** `src/lib/recurrentes.ts` — función `generarPedidosRecurrentes`

Agregar chequeo antes de generar:
```typescript
if (rec.cliente?.bloqueado) {
  // Saltar este recurrente, no generar pedido
  continue
}
```

---

## C6. Venta-libre: Validar cliente bloqueado

**Archivo:** `src/app/api/pedidos/venta-libre/route.ts`

Agregar chequeo después de resolver el cliente:
```typescript
if (cliente?.bloqueado) {
  return apiError('Cliente bloqueado por deuda vencida', 400)
}
```

---

## C7. clean.ts: Agregar guarda de entorno

**Archivo:** `prisma/clean.ts`

```typescript
if (process.env.NODE_ENV === 'production') {
  console.error('No se puede ejecutar clean en producción')
  process.exit(1)
}
```

---

## C8. DB: Agregar índices compuestos faltantes

**Archivo:** `prisma/schema.prisma`

```prisma
model PedidoItem {
  @@unique([pedidoId, producto])  // Evitar items duplicados
}

model PrecioVolumen {
  @@unique([productoId, volumen])  // Evitar dos precios para mismo volumen
}
```

---

## Verificación Fase 3

```bash
npx tsc --noEmit
npm run test:e2e -- --grep "CRON|cron|roles|permisos"
```

