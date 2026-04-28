# Venta Rápida + Compra en Punto con Envío

**Fecha:** 2026-04-28
**Estado:** Aprobado

## Resumen

Implementar un flujo de "Venta Rápida" optimizado para atención en punto de venta (mostrador), con opción de convertir la compra en envío a domicilio. El objetivo es minimizar clicks y tiempo de atención cuando hay cola de clientes.

## Escenarios

### Escenario A: Venta rápida pura (mostrador)
- Cliente anónimo llega al punto, compra y se va
- No deja datos (o deja nombre opcional)
- Pago inmediato, entrega inmediata
- Como una tienda de barrio

### Escenario B: Compra en punto con envío
- Cliente viene al punto, paga ahí
- Pide que le envíen el producto a su casa
- Necesita datos básicos: nombre, celular, dirección
- El pedido queda PENDIENTE para asignar a embarque

## Diseño Técnico

### 1. Cliente "Mostrador" (seed)

Crear un cliente genérico en la BD para asociar ventas rápidas anónimas:

```
id: "CLIENTE_MOSTRADOR"
nombre: "Mostrador"
telefono: "0000000000"
direccion: "Punto de venta"
barrio: "N/A"
```

Esto evita hacer `clienteId` nullable y romper queries existentes.

### 2. Componente `VentaRapidaForm`

Nuevo archivo: `src/components/venta-rapida-form.tsx`

**Campos:**
- Nombre (opcional, text input)
- Productos con botones +/- (más rápido que tipear números)
- Toggle "¿Quiere envío a domicilio?"
- Si envío: nombre*, celular*, dirección*, barrio (opcional)
- Método de pago (select, default: EFECTIVO)
- Total calculado automáticamente
- Botón "Cobrar $X" (submit)

**Interacción optimizada:**
- Botones +/- grandes para productos (touch-friendly)
- Solo muestra productos con precio > 0
- Precio NO editable (usa precio PUNTO estándar)
- Pago asume monto completo (sin campo de monto)
- Un solo click para cobrar

### 3. Lógica de guardado

**Sin envío (Escenario A):**
```json
{
  "clienteId": "CLIENTE_MOSTRADOR" | clienteExistente.id,
  "tipo": "MOSTRADOR",
  "canal": "PUNTO",
  "estado": "ENTREGADO",
  "totalPagado": total,
  "saldo": 0
}
```
- Estado ENTREGADO inmediato (ya se entregó en punto)
- Si da nombre y ya existe un cliente con ese nombre/celular, se usa ese cliente
- Si da nombre y no existe, se asocia al "Mostrador" con el nombre en `obs`

**Con envío (Escenario B):**
```json
{
  "clienteId": clienteCreado.id,
  "tipo": "ENVIO",
  "canal": "PUNTO",
  "estado": "PENDIENTE",
  "totalPagado": total,
  "saldo": 0
}
```
- Se busca cliente por celular. Si no existe, se crea con datos básicos
- Estado PENDIENTE para asignar a embarque
- Ya pagado (saldo = 0)

### 4. API

Reutilizar `POST /api/pedidos` existente. Agregar campo opcional `ventaRapida: boolean` al schema de validación para distinguir el flujo en el backend.

Agregar endpoint auxiliar: `POST /api/clientes/quick` para crear cliente con datos mínimos (nombre, celular, dirección) y retornar el ID. Si ya existe por celular, retornar el existente.

### 5. Cambios en la página de pedidos

- Agregar botón `$ Venta Rápida` junto a `+ Nuevo Pedido`
- Estilo diferente: fondo verde para distinguirlo visualmente
- Al hacer click, abre modal con `VentaRapidaForm`
- Tras cobrar exitosamente: cerrar modal, refrescar lista, mostrar toast de confirmación

### 6. Validación (Zod)

Actualizar `PedidoCreateSchema` en `src/lib/validators.ts`:
```
ventaRapida: z.boolean().optional()
tipo: z.enum(['ENVIO', 'MOSTRADOR', 'RECURRENTE']).optional()
```

Nuevo schema `ClienteQuickCreateSchema`:
```
nombre: z.string().min(2)
telefono: z.string().min(7)
direccion: z.string().min(3)
barrio: z.string().optional()
```

### 7. Seed

Agregar en `prisma/seed.ts`:
```typescript
await prisma.cliente.upsert({
  where: { id: 'CLIENTE_MOSTRADOR' },
  update: {},
  create: {
    id: 'CLIENTE_MOSTRADOR',
    nombre: 'Mostrador',
    telefono: '0000000000',
    direccion: 'Punto de venta',
    barrio: 'N/A',
  },
})
```

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `src/components/venta-rapida-form.tsx` | Crear |
| `src/app/(app)/pedidos/page.tsx` | Agregar botón + modal |
| `src/app/api/clientes/quick/route.ts` | Crear endpoint |
| `src/lib/validators.ts` | Agregar schemas |
| `src/app/api/pedidos/route.ts` | Manejar tipo MOSTRADOR + estado ENTREGADO |
| `prisma/seed.ts` | Agregar cliente Mostrador |

## Criterios de éxito

1. Vendedor puede completar una venta rápida en < 5 segundos (3 clicks: producto, +, cobrar)
2. Si marca envío, se piden datos mínimos y el pedido queda PENDIENTE
3. La tabla de pedidos muestra ambos tipos correctamente
4. Stats se actualizan inmediatamente con la nueva venta
5. No se rompe ningún flujo existente
