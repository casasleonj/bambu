# Mapa de Impacto del Schema Prisma

> Documento generado automáticamente. Cualquier cambio en `prisma/schema.prisma` debe revisar este mapa antes de mergear.

## Cómo usar este documento

1. Identifica el modelo que vas a modificar en la sección correspondiente
2. Revisa la lista de archivos que lo usan
3. Ejecuta `npx tsc --noEmit` en cada uno de esos archivos tras el cambio
4. Actualiza este documento si agregas/remueves dependencias

---

## Modelos y sus dependencias

### `User`
**Impacto:** Alta (auth y administración)

| Tipo | Archivos |
|------|----------|
| API routes | `api/pedidos/[id]/route.ts`, `api/auth/force-password-change/route.ts`, `api/auth/profile/route.ts`, `api/users/route.ts`, `api/users/[id]/route.ts`, `api/users/[id]/reset-password/route.ts` |
| Lib | `lib/auth.ts`, `lib/validators.ts` |

**Notas:**
- Cambios en campos `rol`, `activo`, `mustChangePassword` afectan login, admin y auth guards
- `nombre`/`apellido` afectan display name en sesión

---

### `Cliente`
**Impacto:** Crítica (dominio central del negocio)

| Tipo | Archivos |
|------|----------|
| API routes | `api/cierre/route.ts`, `api/embarques/[id]/cerrar/route.ts`, `api/pedidos/route.ts`, `api/pedidos/[id]/route.ts`, `api/pedidos/recurrentes/route.ts`, `api/pedidos/venta-libre/route.ts`, `api/clientes/route.ts`, `api/clientes/quick/route.ts` |
| Lib | `lib/validators.ts` |

**Notas:**
- `saldo`, `fiado`, `limiteCredito` afectan cálculos de cobro y alertas
- Cambios en `activo` pueden romper filtros en múltiples vistas

---

### `Pedido`
**Impacto:** Crítica (más acoplado del sistema)

| Tipo | Archivos |
|------|----------|
| API routes | `api/cierre/route.ts`, `api/embarques/[id]/cerrar/route.ts`, `api/pedidos/route.ts`, `api/pedidos/[id]/enviar/route.ts`, `api/pedidos/[id]/route.ts`, `api/pedidos/[id]/anular/route.ts`, `api/pedidos/[id]/entrega/route.ts`, `api/pedidos/recurrentes/route.ts`, `api/pedidos/venta-libre/route.ts` |
| Lib | `lib/validators.ts`, `lib/pedido-utils.ts`, `lib/db/offline.ts`, `lib/alertas-config.ts`, `lib/recurrentes.ts` |
| Offline | `lib/db/offline.ts` (schema de IndexedDB) |

**Notas:**
- `estado` enum: valores deben estar sincronizados con `lib/pedido-utils.ts` (badges, validaciones)
- `origen` enum: afecta pricing y flujo de venta rápida
- `saldo`/`total`: campos monetarios que requieren cast con `Number()` en application code

---

### `Embarque`
**Impacto:** Alta (operaciones diarias)

| Tipo | Archivos |
|------|----------|
| API routes | `api/cierre/route.ts`, `api/embarques/route.ts`, `api/embarques/[id]/cerrar/route.ts`, `api/embarques/[id]/route.ts`, `api/embarques/auto/route.ts`, `api/pedidos/[id]/enviar/route.ts`, `api/pedidos/[id]/entrega/route.ts`, `api/pedidos/venta-libre/route.ts` |
| Lib | `lib/__tests__/embarque-capacidad.test.ts` |

**Notas:**
- `estado` (PLANIFICADO, EN_RUTA, CERRADO, CANCELADO): cambios rompen flujo de cierre de caja
- `capacidad`/`pesoActual`: afectan validaciones de asignación de pedidos

---

### `Factura`
**Impacto:** Alta (finanzas y reportes)

| Tipo | Archivos |
|------|----------|
| API routes | `api/cierre/route.ts`, `api/pedidos/[id]/entrega/route.ts`, `api/pedidos/pagar-fiado/route.ts`, `api/abonos/route.ts`, `api/clientes/[id]/resumen-facturas/route.ts`, `api/clientes/[id]/historial/route.ts`, `api/facturas/route.ts`, `api/facturas/[id]/route.ts` |
| Lib | `lib/validators.ts` |

**Notas:**
- `estado` (PENDIENTE, PAGADA, PARCIAL, ANULADA): flujo de pagos y cierre
- `saldo` vs `total`: campo monetario, usar `Number()` en arithmetic

---

### `Producto` + `PrecioVolumen`
**Impacto:** Media-Alta (catálogo y pricing)

| Tipo | Archivos |
|------|----------|
| API routes | `api/precios/route.ts`, `api/precios/[id]/route.ts`, `api/productos/route.ts`, `api/clientes/[id]/stats/route.ts` |
| Lib | `lib/pricing.ts`, `lib/prices.ts`, `lib/producto-iconos.tsx`, `lib/alertas-config.ts` |

**Notas:**
- `tipoProducto` enum debe coincidir con `PRODUCT_CODES` en `lib/pricing.ts`
- `PrecioVolumen.precio`: Decimal, cast a `Number()` en UI

---

### `Trabajador` + `Nomina`
**Impacto:** Media (administración de personal)

| Tipo | Archivos |
|------|----------|
| API routes | `api/nomina/route.ts`, `api/nomina/[id]/route.ts`, `api/embarques/route.ts`, `api/trabajadores/route.ts`, `api/trabajadores/[id]/route.ts` |
| Lib | `lib/validators.ts`, `lib/alertas-config.ts`, `lib/comisiones.ts` |

**Notas:**
- `rol` (REPARTIDOR, VENDEDOR, ADMIN): usado en guards de acceso
- `Nomina.estado` afecta cierre de caja (pago de comisiones)

---

### `CierreDia`
**Impacto:** Alta (operación diaria crítica)

| Tipo | Archivos |
|------|----------|
| API routes | `api/cierre/route.ts`, `api/cierre-dia/route.ts` |
| Lib | `lib/validators.ts` |

**Notas:**
- `reporte` (JSON): estructura debe mantenerse compatible con `CierreData` types
- `netoCaja`: calculado server-side, no confiar en valor enviado desde cliente

---

### `Casos` + `CasoEvento`
**Impacto:** Media (CRM de incidencias)

| Tipo | Archivos |
|------|----------|
| API routes | `api/casos/route.ts`, `api/casos/[id]/eventos/route.ts`, `api/casos/[id]/route.ts`, `api/pedidos/[id]/entrega/route.ts`, `api/clientes/[id]/historial/route.ts` |
| Lib | `lib/validators.ts` |

---

### `Produccion`
**Impacto:** Media (planificación de producción)

| Tipo | Archivos |
|------|----------|
| API routes | `api/produccion/route.ts`, `api/produccion/preview/route.ts` |
| Lib | `lib/validators.ts` |

---

### `Gasto` + `CompraInsumo`
**Impacto:** Media (finanzas operativas)

| Tipo | Archivos |
|------|----------|
| API routes | `api/cierre/route.ts`, `api/gastos/route.ts`, `api/compras/route.ts` |
| Lib | `lib/validators.ts` |

---

### `Proveedor` + `Insumo`
**Impacto:** Media (cadena de suministro)

| Tipo | Archivos |
|------|----------|
| API routes | `api/proveedores/route.ts`, `api/proveedores/[id]/route.ts`, `api/insumos/route.ts`, `api/insumos/[id]/route.ts`, `api/compras/route.ts` |
| Lib | `lib/validators.ts` |

---

### `Config`
**Impacto:** Media-Alta (configuración global)

| Tipo | Archivos |
|------|----------|
| API routes | `api/config/route.ts` |
| Lib | `lib/auth.ts`, `lib/validators.ts`, `lib/pricing.ts`, `lib/rate-limit.ts`, `lib/producto-iconos.tsx` |

**Notas:**
- Cambios en claves de config (`empresa_nombre`, `precio_*`) afectan impresión de facturas y pricing

---

### `PlantillaRecurrente`
**Impacto:** Media (suscripciones)

| Tipo | Archivos |
|------|----------|
| API routes | `api/recurrentes/route.ts`, `api/pedidos/recurrentes/route.ts` |
| Lib | `lib/recurrentes.ts`, `lib/validators.ts` |

**Notas:**
- `productos` (JSON): estructura debe mantener compatibilidad con `parseProductos()`
- `saltos` (TEXT[]): afecta generación de pedidos recurrentes

---

### `Abono`
**Impacto:** Media (pagos parciales)

| Tipo | Archivos |
|------|----------|
| API routes | `api/abonos/route.ts`, `api/cierre/route.ts`, `api/pedidos/recurrentes/route.ts`, `api/clientes/[id]/historial/route.ts` |
| Lib | `lib/validators.ts`, `lib/recurrentes.ts` |

---

### `Historial` + `PrecioHistorial`
**Impacto:** Baja (auditoría de precios)

| Tipo | Archivos |
|------|----------|
| API routes | `api/precios/route.ts` |

---

### `NotaCredito`
**Impacto:** Baja (feature no implementada aún)

| Tipo | Archivos |
|------|----------|
| API routes | Ninguno activo |

---

## Checklist pre-cambio de schema

- [ ] Identificar el modelo a modificar arriba
- [ ] Revisar archivos dependientes listados
- [ ] Verificar que enums nuevos/alterados se actualicen en `lib/validators.ts`
- [ ] Verificar que campos `Decimal` se casteen con `Number()` en código application
- [ ] Actualizar `prisma/seed.ts` si el modelo tiene seed data
- [ ] Actualizar `prisma/seed-realista.ts` si aplica
- [ ] Ejecutar `npx tsc --noEmit`
- [ ] Ejecutar `npm run test`
- [ ] Ejecutar `npx playwright test`
- [ ] Actualizar este documento si cambian las dependencias
