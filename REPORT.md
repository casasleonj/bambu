# Reporte: Stress Test con Datos Realistas

**Fecha:** 2026-05-01
**Datos:** 1 semana, 250 pedidos/día, 80 clientes, 15 trabajadores, 5 rutas

---

## Resumen

| Métrica | Valor |
|---------|-------|
| Usuarios | 5 |
| Clientes | 81 |
| Trabajadores | 15 |
| Rutas | 5 |
| Pedidos | 1,750 |
| Embarques | 16 |
| Facturas | 1,750 |
| Abonos | 139 |
| Pagos | 1,791 |
| Producción | 21 |
| Gastos | 50 |
| Proveedores | 10 |
| Insumos | 20 |
| Compras | 30 |

**Validación:** 16 PASS | 1 FAIL | 4 WARN
**E2E Roles:** 31 PASS | 5 SKIP | 0 FAIL

---

## Bugs Críticos (FAIL)

### 1. Factura.saldo no se actualiza al crear abonos directamente

**Severidad:** ALTA
**Descripción:** 80 facturas tienen `saldo` incorrecto porque el seed crea abonos directamente en la DB sin pasar por la API `/api/abonos` que actualiza `factura.saldo` y `factura.montoPagado`.

**Ejemplo:**
```
Factura FAC-00012: total=5500, montoPagado=3300, abonos=2200
Saldo esperado: 0 (5500 - 3300 - 2200)
Saldo actual: 2200 ← BUG
```

**Impacto:** En producción, si un abono se crea por fuera de la API (ej. importación manual, script), el saldo de la factura queda desactualizado. El cierre de día mostrará fiado incorrecto.

**Fix:** Agregar trigger de BD o validar en el cierre que recalcule saldos. O hacer que la API de abonos sea el único punto de entrada.

---

## Advertencias (WARN)

### 2. Embarques sin pacasAgua/pacasHielo cargadas

**Severidad:** MEDIA
**Descripción:** Todos los embarques tienen `pacasAgua=0` y `pacasHielo=0`. Los pedidos asignados suman 87-163 pacas pero el embarque dice 0.

**Ejemplo:**
```
Embarque #79: pacasAgua=0, pedidos suman 163 pacas
```

**Impacto:** El cálculo de capacidad del embarque (`calcularPacasEmbarque`) funciona, pero los campos `pacasAgua`/`pacasHielo` en la tabla `Embarque` nunca se actualizan. No hay flujo UI/API que los llene al cerrar embarque.

**Fix:** Al cerrar embarque (`/api/embarques/[id]/cerrar`), calcular y guardar `pacasAgua` y `pacasHielo` basados en los pedidos entregados.

### 3. Pedidos CANCELADO con pagos registrados

**Severidad:** MEDIA
**Descripción:** 115 de 119 pedidos cancelados tienen al menos 1 pago registrado.

**Impacto:** Dinero registrado como cobrado en pedidos que no se entregaron. El cierre de día suma estos pagos como ingresos reales cuando deberían ser devoluciones/anulaciones.

**Fix:** Al cancelar un pedido, o bien:
- Eliminar/revertir los pagos
- Cambiar estado a ANULADO y crear nota de crédito
- Agregar campo `pagosRevertidos` boolean

### 4. Clientes con múltiples pedidos recurrentes

**Severidad:** BAJA-MEDIA
**Descripción:** 60 de 225 clientes recurrentes tienen más de 1 pedido recurrente activo.

**Impacto:** El sistema de generación automática de recurrentes crearía pedidos duplicados para el mismo cliente en la misma fecha.

**Fix:** Agregar validación al crear recurrente: `WHERE NOT EXISTS (SELECT 1 FROM Pedido WHERE clienteId = ? AND esRecurrente = true AND frecuencia = ?)`

### 5. No hay CierreDia registrado

**Severidad:** INFO
**Descripción:** No se crearon cierres de día en el seed. Esto es esperado porque el cierre se hace manualmente al final del día.

**Impacto:** El dashboard no muestra histórico de cierres.

---

## Hallazgos de Flujo y Lógica

### 6. Cierre de día usa cPacaAguaEnt en lugar de cPacaAguaPed

**Archivo:** `src/app/api/cierre/route.ts:38`
```typescript
const aguaVendida = pedidos.reduce((acc, p) => acc + p.cPacaAguaEnt, 0)
```

**Problema:** Los pedidos PENDIENTE o EN_RUTA tienen `cPacaAguaEnt = 0`. Solo los ENTREGADO tienen valores. El cierre debería filtrar por estado o usar `cPacaAguaPed` para ventas del día.

**Impacto:** Si el cierre se hace antes de que todos los embarques regresen, el cierre subestima ventas.

### 7. Cierre de día no filtra por estado del pedido

**Archivo:** `src/app/api/cierre/route.ts:14-17`
```typescript
const pedidos = await prisma.pedido.findMany({
  where: { fecha: { gte: startOfDay } },
  include: { pagos: true },
})
```

**Problema:** Incluye pedidos CANCELADO en el total de ventas. Un pedido cancelado de $10,000 se suma a `totalVentas`.

**Fix:** Agregar `estado: { not: EstadoPedido.CANCELADO }` al where.

### 8. Factura se crea automáticamente para TODO pedido

**Archivo:** `src/app/api/pedidos/route.ts:164-176`

**Problema:** Cada pedido genera una factura, incluso los de punto de venta pagados en efectivo. Esto infla el conteo de facturas y podría confundir al contador.

**Impacto:** 1,750 pedidos = 1,750 facturas. En un mes real serían ~7,500 facturas para operaciones de mostrador que no necesitan factura formal.

### 9. Abono no actualiza Pedido.saldo

**Archivo:** `src/app/api/abonos/route.ts:69-75`

**Problema:** El abono actualiza `factura.saldo` y `factura.montoPagado` pero NO actualiza `pedido.saldo` ni `pedido.totalPagado`.

**Impacto:** La vista de pedidos muestra saldo incorrecto para pedidos con abonos posteriores. El dashboard muestra "POR COBRAR" cuando ya se pagó.

### 10. Middleware: ASISTENTE puede acceder a /nomina

**Archivo:** `src/middleware.ts:24-29`

**Problema:** `/nomina` NO está en `ADMIN_PAGE_ROUTES`, así que ASISTENTE puede ver la página de nómina. Pero la API `/api/nomina` POST requiere ADMIN/CONTADOR.

**Impacto:** Inconsistencia: el asistente ve la página pero no puede crear nómina. Debería estar en `ADMIN_PAGE_ROUTES` o la página debería verificar permisos.

### 11. Precio de venta rápida vs pedido normal

**Problema:** La venta rápida usa `resolverPreciosPedido` con canal PUNTO/DOMICILIO. El pedido normal también. Pero los precios resueltos pueden diferir si el cliente tiene `preciosEspeciales` y el canal cambia entre creación y entrega.

**Impacto:** Un pedido creado a $3,000/paca podría entregarse a $2,500/paca si el volumen cambió. El cierre del embarque recalcula con precios reales, pero el pedido original queda con el precio viejo.

---

## E2E Tests: Roles y Permisos

| Test | Resultado |
|------|-----------|
| 15 páginas protegidas sin auth → redirect login | ✅ PASS |
| API POST sin auth → 401 | ✅ PASS |
| ADMIN: acceso a todas las páginas | ✅ PASS |
| ADMIN: crear cliente API | ✅ PASS |
| ADMIN: crear embarque API | ✅ PASS |
| ADMIN: cerrar día API | ✅ PASS |
| ASISTENTE: acceso dashboard/pedidos/clientes | ✅ PASS |
| ASISTENTE: redirect de admin pages → dashboard | ✅ PASS |
| ASISTENTE: crear cliente API | ✅ PASS |
| ASISTENTE: NO crear embarque → 403 | ✅ PASS |
| ASISTENTE: NO cerrar día → 403 | ✅ PASS |
| ASISTENTE: NO crear nómina → 403 | ✅ PASS |
| CONTADOR: acceso a admin pages | ✅ PASS |
| CONTADOR: crear nómina API | ✅ PASS |
| CONTADOR: NO crear embarque → 403 | ✅ PASS |
| Concurrencia: 2 assistants simultáneos | ✅ PASS |
| Concurrencia: admin + contador simultáneos | ✅ PASS |

---

## Recomendaciones Priorizadas

### P0 (Crítico — fix inmediato)
1. **Cierre de día incluye pedidos CANCELADO** en totalVentas → infla ingresos
2. **Abono no actualiza Pedido.saldo** → dashboard muestra saldos incorrectos

### P1 (Alto — esta semana)
3. **Embarque.pacasAgua/pacasHielo nunca se llenan** → capacidad no se trackea
4. **Pedidos CANCELADO con pagos** → dinero fantasma en caja
5. **Factura.saldo desactualizado si abono fuera de API** → contabilidad incorrecta

### P2 (Medio — próximo sprint)
6. **Clientes con múltiples recurrentes** → pedidos duplicados
7. **ASISTENTE puede ver /nomina** pero no crear → confusión UX
8. **Factura automática para TODO pedido** → infla contabilidad

### P3 (Bajo — backlog)
9. **Precio puede cambiar entre creación y entrega** → discrepancia contable
