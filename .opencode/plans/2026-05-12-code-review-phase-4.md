# Fase 4 — Dominio: Reglas de Negocio

**Prioridad:** MEDIA  
**Basado en:** Code Review 2026-05-12 (Fase 7 — hallazgos huérfanos)  
**Impacto:** Integridad de datos financieros, consistencia operativa, mantenibilidad del negocio

---

## D1. `puedeCrearPedido` debe reportar TODAS las deudas pendientes

**Archivo:** `src/lib/pedido-utils.ts:115-128`

**Problema:** Solo chequea `pedidosPendientes[0]`. Si el cliente tiene 5 pedidos pendientes, solo reporta 1. El admin ve deuda parcial.

**Corrección:**

```typescript
export function puedeCrearPedido(
  cliente: { bloqueado: boolean; id: string },
  pedidosPendientes: Array<{ id: string; numero: number; saldo: number }>
): string | null {
  if (cliente.bloqueado) {
    return 'Cliente bloqueado por deuda vencida. Pague primero.'
  }

  // ❌ Antes: solo el primero
  // const deuda = pedidosPendientes[0]

  // ✅ Después: todas las deudas
  if (pedidosPendientes.length === 0) return null

  const deudaTotal = pedidosPendientes.reduce((s, p) => s + p.saldo, 0)
  const nums = pedidosPendientes.map(p => `#${p.numero}`).join(', ')
  
  return `${pedidosPendientes.length} pedido(s) sin pagar (${nums}). Saldo total: $${deudaTotal.toLocaleString('es-CO')}`
}
```

---

## D2. Anulación debe revertir pagos y abonos

**Archivo:** `src/app/api/pedidos/[id]/anular/route.ts`

**Problema:** Al anular un pedido pagado, los pagos y abonos quedan en DB como si el pedido todavía existiera. La NC se crea pero no hay reversión financiera real.

**Corrección:**

Dentro de la transacción de anulación, agregar:
```typescript
// 1. Revertir pagos (crear Pago con monto negativo)
for (const pago of pedido.pagos) {
  await tx.pago.create({
    data: {
      pedidoId: id,
      metodo: pago.metodo,
      monto: -pago.monto,  // Negativo = reversión
    },
  })
}

// 2. Revertir abonos asociados a la factura
if (pedido.factura) {
  for (const abono of pedido.factura.abonos) {
    await tx.abono.create({
      data: {
        facturaId: pedido.factura.id,
        clienteId: pedido.clienteId,
        monto: -abono.monto,
        metodoPago: abono.metodoPago,
      },
    })
  }
}

// 3. Marcar factura como ANULADA (ya existente)
// 4. Crear NC (ya existente)
```

**Impacto:** El cierre del día ahora refleja correctamente el neto: la venta anulada se descuenta porque los pagos revertidos cancelan los pagos originales.

---

## D3. Precios base: una sola fuente de verdad

**Archivo:** `src/lib/prices.ts:2-7`, `prisma/schema.prisma`

**Problema:** `DEFAULT_PRICES` hardcodeados en código como fallback. Pero la fuente real de precios es `PrecioVolumen` en DB. Si no hay tier en DB para un producto, el precio cae a 0 (no al default hardcodeado). Los defaults NUNCA se usan realmente en la lógica de pricing.

**Corrección:**

Eliminar `DEFAULT_PRICES` del código. El pricing engine (`resolverPrecio`) ya retorna `{ precio: 0, origen: 'base' }` cuando no hay tier. El seed debe garantizar que todo producto tenga al menos 1 tier en `PrecioVolumen`.

Si un producto no tiene tier en DB, es un error de datos, no de código. Agregar validación en `validate-data.ts`:
```typescript
// Verificar que cada producto activo tenga al menos 1 tier
const productosSinTier = await prisma.producto.findMany({
  where: { precios: { none: { activo: true } } },
})
if (productosSinTier.length > 0) {
  console.warn('Productos sin precio:', productosSinTier.map(p => p.codigo))
}
```

---

## D4. `getNextNumero`: seguro solo dentro de advisory lock

**Archivo:** `src/lib/sequence.ts`

**Problema:** El fallback `MAX(field) + 1` es race-condition-prone. Varios llamadores lo usan SIN advisory lock.

**Corrección:**

Agregar documentación y validación en runtime:

```typescript
export async function getNextNumero(
  tx: TxLike,
  options: { seqName?: string; model: string; field?: string }
): Promise<number> {
  // Preferir secuencias PostgreSQL (siempre thread-safe)
  if (options.seqName) {
    const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval(${options.seqName})
    `
    return Number(nextval)
  }

  // ⚠️ FALLBACK: SOLO seguro dentro de pg_advisory_xact_lock
  // Si no estás usando withAdvisoryLock(), usá seqName en su lugar
  const model = (tx as any)[options.model]
  const field = options.field || 'numero'
  const result = await model.aggregate({ _max: { [field]: true } })
  const maxVal = result._max?.[field]
  let num = 0
  if (typeof maxVal === 'string') {
    const match = maxVal.match(/\d+/)
    num = match ? parseInt(match[0], 10) : 0
  } else {
    num = maxVal || 0
  }
  return num + 1
}
```

**Además:** Agregar `seqName` a todos los llamadores que hoy usan el fallback sin advisory lock:
- `src/app/api/pedidos/[id]/entrega/route.ts` → `seqName: 'pedido_num_seq'`
- `src/app/api/pedidos/[id]/anular/route.ts` → `seqName: 'notacredito_num_seq'`

---

## D5. Thresholds de negocio: mover a tabla Config

**Archivos:** `embarque-capacidad.ts`, `route-analysis.ts`, `cerrar/route.ts`, `alertas-config.ts`, `pedido-utils.ts`

**Problema:** 22+ valores de negocio hardcodeados. Si el dueño necesita ajustar uno, hay que modificar código y redeploy.

**Corrección:**

### D5a. Mover thresholds de capacidad a Config

```prisma
// En seed.ts:
await prisma.config.createMany({
  data: [
    { clave: 'CAPACIDAD_NIVEL_IDEAL', valor: '75' },
    { clave: 'CAPACIDAD_NIVEL_PESADO', valor: '87' },
    { clave: 'CAPACIDAD_NIVEL_MAXIMO', valor: '98' },
    { clave: 'PENALIDAD_DISCREPANCIA', valor: '2500' },
  ],
  skipDuplicates: true,
})
```

Leer en runtime con fallback a los defaults actuales:
```typescript
const idealPct = parseInt((await prisma.config.findUnique({ where: { clave: 'CAPACIDAD_NIVEL_IDEAL' } }))?.valor || '75')
```

### D5b. Mover thresholds de alertas a Config

Alertas que YA están en Config (bien):
- `DIAS_ALERTA_NO_VERIFICADO` → ya configurable

Alertas que NO están en Config (agregar):
- `ALERTA_PEDIDOS_DIA` (umbral para alerta roja: 3)
- `ALERTA_PROMESA_VENCIMIENTO_DIAS` (umbral para "próxima a vencer": 2 días)
- `ALERTA_INTERVALO_PEDIDOS_MIN` (múltiples pedidos rápido: 60 min)
- `ALERTA_DEUDA_REPARTIDOR_PACAS` (umbral deuda alta repartidor: 50 pacas)
- `ALERTA_DEUDA_REPARTIDOR_MONTO` (umbral deuda alta repartidor: $500,000)

---

## D6. Formato de numeración unificado

**Problema:** Pedidos usan `Int` simple (#123), facturas `FAC-00001`, NC `NC-00001`, abonos `ABO-00001`. Sin consistencia.

**Corrección:**

No cambiar el formato de pedidos (rompería compatibilidad). Pero documentar el estándar y crear helper compartido:

```typescript
// src/lib/numeracion.ts
export function formatNumero(prefijo: string, numero: number, digits: number = 5): string {
  return `${prefijo}${numero.toString().padStart(digits, '0')}`
}

// ⚠️ Distinguir entre "display" (visual) y "storage" (numero crudo)
// Pedido.displayNumero (no existe) → "PED-00001"
// Pedido.numero (existe) → 1 (Int, para joins y filtros)
```

**Decisión:** Dejar `pedido.numero` como Int en DB por performance de índices. Agregar campo `pedido.displayNumero` (String) para UI si se necesita formato `PED-00001`. Por ahora, priorizar consistencia en documentos financieros (facturas, NC, abonos) que ya usan el formato `PREFIJO-NNNNN`.

---

## D7. `clean.ts` con guarda de producción

**Archivo:** `prisma/clean.ts`

**Corrección:**
```typescript
if (process.env.NODE_ENV === 'production') {
  console.error('❌ clean.ts no puede ejecutarse en producción')
  process.exit(1)
}
```

---

## Verificación Fase 4

```bash
npx tsc --noEmit
npx tsx prisma/validate-data.ts   # Verificar productos sin precios
npm run test                       # Unit tests de pedido-utils
npm run test:e2e -- --grep "anular|cierre|venta-libre"
```

---

## Orden de implementación sugerido

1. **D4** (getNextNumero + advisory locks) — previene data corruption primero
2. **D7** (clean.ts guard) — 1 línea, previene desastre
3. **D1** (puedeCrearPedido todas las deudas) — visibilidad correcta
4. **D2** (anulación revierte pagos) — integridad financiera
5. **D3** (eliminar DEFAULT_PRICES) — una fuente de verdad
6. **D5** (thresholds a Config) — mantenibilidad
7. **D6** (numeración) — baja prioridad, cosmético
