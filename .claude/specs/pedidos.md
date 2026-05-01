# Spec: Módulo Pedidos — Agua Bambú v2

## Estado del pedido vs Estado de pago

El sistema distingue DOS dimensiones independientes:

| Dimensión | Campo DB | Posibles valores | Descripción |
|---|---|---|---|
| **Estado de ENTREGA** | `Pedido.estado` | `PENDIENTE`, `EN_RUTA`, `ENTREGADO`, `CANCELADO`, `ANULADO` | ¿Dónde está el producto? |
| **Estado de PAGO** | Calculado (`saldo`, `totalPagado`) | `POR COBRAR`, `PAGO PARCIAL`, `PAGADO` | ¿Cuánto debe el cliente? |

### Reglas de cálculo de badge de pago (frontend)

```typescript
if (estado !== 'ENTREGADO') return estado  // PENDIENTE, EN_RUTA, etc.

const saldo = Number(pedido.saldo)
const pagado = Number(pedido.totalPagado)

if (saldo === 0) return 'PAGADO'
if (pagado > 0 && saldo > 0) return 'PAGO PARCIAL'
return 'POR COBRAR'
```

### Estado inicial al crear

| Tipo de pedido | `estado` inicial | Razón |
|---|---|---|
| Venta rápida (punto o envío) | `ENTREGADO` | Producto ya entregado en mostrador |
| Pedido agendado (normal) | `PENDIENTE` | Aún no sale, espera embarque |

---

## State Machine de Entrega

```
PENDIENTE --[enviar]--> EN_RUTA --[cerrar embarque]--> ENTREGADO
    |                        |
    |--[cancelar]             |--[volver a pendiente]
    |                        |
    v                        v
CANCELADO              PENDIENTE (reenviar)

ENTREGADO --[anular]--> ANULADO  (solo admin, si no hay pagos)
```

**Transiciones válidas** (enforced en API + UI):

| De | Para | Quién puede | Condiciones |
|---|---|---|---|
| `PENDIENTE` | `EN_RUTA` | Admin, Asistente | Debe asignarse a embarque ABIERTO |
| `PENDIENTE` | `CANCELADO` | Admin, Asistente | Sin restricciones |
| `EN_RUTA` | `ENTREGADO` | Sistema (cierre embarque) | Se copian cantidades pedidas → entregadas |
| `EN_RUTA` | `PENDIENTE` | Admin | Si el embarque aún no sale |
| `EN_RUTA` | `CANCELADO` | Admin | Solo si no se ha entregado |
| `ENTREGADO` | `ANULADO` | Admin | `totalPagado === 0` (o emitir nota crédito) |
| `CANCELADO` | — | Nadie | Terminal |
| `ANULADO` | — | Nadie | Terminal |

---

## API Endpoints

### `POST /api/pedidos`

Crea un pedido nuevo. Determina estado inicial según `ventaRapida`.

**Request body:**
```typescript
{
  clienteId: string,           // min 1
  canal: 'PUNTO' | 'DOMICILIO', // default: DOMICILIO
  productos: { pacaAgua?: number, pacaHielo?: number, ... },
  preciosManuales?: Record<string, number>,  // valores >= 0
  pagos?: { metodo: MetodoPago, monto: number }[],  // opcional, monto >= 0
  obs?: string,                // max 500 chars
  fechaEntrega?: string,       // ISO date
  ventaRapida?: boolean,       // true = estado ENTREGADO
  tipo?: 'ENVIO' | 'PUNTO',    // default por canal
  clienteNuevo?: { nombre, telefono, direccion, barrio? }
}
```

**Response:**
```typescript
{ success: true, pedido: Pedido }  // 201
{ error: ZodError }                // 400
{ error: string }                  // 500
```

### `PUT /api/pedidos/[id]`

Actualiza pedido existente. Solo cambios de estado y cantidades entregadas.

**Request body:**
```typescript
{
  estado?: EstadoPedido,       // transición válida según state machine
  embarqueId?: string | null,  // asignar/quitar de embarque
  cPacaAguaEnt?: number,       // cantidad realmente entregada
  cPacaHieloEnt?: number,
  cBotellonFabEnt?: number,
  cBotellonDomEnt?: number,
  cBolsaAguaEnt?: number,
  cBolsaHieloEnt?: number,
}
```

**Regla especial:** Si `estado === 'ENTREGADO'` y no se proporcionan cantidades entregadas, el sistema copia automáticamente las cantidades pedidas (`cXPed` → `cXEnt`).

### `POST /api/pedidos/[id]/enviar` ⭐ NUEVO

**Atómico**: Cambia estado a `EN_RUTA` + asigna embarque en UNA transacción.

**Request body:**
```typescript
{
  embarqueId: string  // UUID de embarque ABIERTO
}
```

**Validaciones (transaction):**
1. Pedido existe y estado es `PENDIENTE`
2. Embarque existe y estado es `ABIERTO`
3. Pedido no está ya asignado a otro embarque ABIERTO (opcional)
4. Capacidad del embarque no excede 70 pacas con este pedido (opcional, warning)

**Response:**
```typescript
{ success: true, pedido: Pedido }  // 201
{ error: 'Pedido no encontrado' }  // 404
{ error: 'Pedido no está pendiente' }  // 400
{ error: 'Embarque inválido o cerrado' }  // 400
{ error: string }                  // 500
```

**Rollback:** Si algo falla en la transaction, el pedido permanece `PENDIENTE`.

### `DELETE /api/pedidos/[id]`

No elimina físicamente. Marca como `ANULADO`.

**Restricciones:** Solo ADMIN o CONTADOR.

---

## UI Components

### Lista Pedidos (`/pedidos`)

| Elemento | Acción |
|---|---|
| Tabla desktop / Cards mobile | Ver lista de pedidos del día |
| Filtros estado (PENDIENTE, EN_RUTA, ENTREGADO, etc.) | Filtrar por estado de entrega |
| Filtros tipo (ENVIO, PUNTO) | Filtrar por tipo |
| Búsqueda | Buscar por nombre, teléfono, número |
| Botón "Venta Rápida" | Abrir modal venta rápida |
| Botón "+ Nuevo Pedido" | Abrir modal crear pedido |
| Botón avión (fila PENDIENTE) | Iniciar envío → abre modal asignar embarque |
| Botón check (fila EN_RUTA) | Marcar entregado (⚠️ deprecar, usar cierre embarque) |
| Botón ojo (todas las filas) | Ver detalle |

**Columnas tabla:**
| # | Cliente | Teléfono | Productos | Total | Estado (entrega) | Tipo | Acciones |

### Modal Venta Rápida

| Campo | Tipo | Requerido |
|---|---|---|
| Toggle envío/punto | Checkbox | Sí |
| Select productos | Number inputs | Al menos 1 > 0 |
| Select método pago | Dropdown | Sí (incluye FIADO) |
| Cliente buscador | Autocomplete | Solo si envío o fiado |
| Crear nuevo cliente | Form nested | Opcional |

### Modal Crear Pedido (`+ Nuevo Pedido`)

| Campo | Tipo | Requerido |
|---|---|---|
| Cliente buscador | Autocomplete | Sí |
| Productos | Number inputs | Al menos 1 > 0 |
| Pagos | Array de {metodo, monto} | Opcional (vacío = fiado) |
| Observaciones | Text | No |

### Modal Asignar Embarque

**Trigger:** Desde tabla (botón avión) o desde detalle (botón EN RUTA).

| Elemento | Comportamiento |
|---|---|
| Lista embarques ABIERTOS | Botones seleccionables, uno por embarque |
| Indicador capacidad | 🟢 ≤50, 🟠 60, 🔴 65, ⛔ 70+ |
| Warning si excede | Texto rojo si capacidad > 70 con este pedido |
| Botón "Cancelar" | Cierra modal, no cambia nada |
| Botón "Confirmar Envío" | Atómico: estado → EN_RUTA + embarqueId |

**Regla:** No hay "Enviar sin asignar". Si no hay embarques, mostrar mensaje "Crea un embarque primero".

### Modal Detalle Pedido

| Sección | Contenido |
|---|---|
| Header | #numero, badges estado + tipo, nombre, teléfono |
| Resumen | Total, pagado, saldo (si ENTREGADO y saldo > 0) |
| Info grid | Tipo, fecha, hora, embarque (si EN_RUTA) |
| Productos | Lista con íconos, cantidad pedida, precio unitario |
| Timeline estados | Botones clickeables para cambiar estado (solo admins) |
| Ver factura | Link a factura asociada |
| Registrar abono | Botón (solo si saldo > 0) |

---

## Data Flow: Crear Pedido → Entregar

```
1. Crear Pedido
   POST /api/pedidos
   estado = PENDIENTE (normal) o ENTREGADO ( ventaRápida)
   saldo = total - totalPagado
   factura creada automáticamente

2. Enviar Pedido
   POST /api/pedidos/[id]/enviar
   Validar: PENDIENTE, embarque ABIERTO
   estado = EN_RUTA, embarqueId asignado
   Repartidor ve pedido en su embarque

3. Cerrar Embarque
   POST /api/embarques/[id]/cerrar
   Para cada pedido en embarque:
     - NO_ENTREGADO: estado = PENDIENTE, embarqueId = null
     - COMPLETO: estado = ENTREGADO, entregado = pedido
     - PARCIAL: estado = ENTREGADO, entregado parcial, pedido hijo PENDIENTE para faltante
   Factura actualizada con nuevo total si parcial

4. Abonar (si fiado)
   POST /api/abonos
   monto > 0, metodo válido
   factura.saldo -= monto
   Si saldo = 0: factura.estado = PAGADA
```

---

## Billing & Facturas

- Toda venta (punto o envío) genera una `Factura`
- Pedido ENTREGADO con `saldo > 0` aparece en cartera (badge POR COBRAR)
- Abonos se registran contra la factura
- No se pueden abonar facturas ANULADAS
- Nota: Los precios manuales negativos deben ser rechazados por validación (pendiente fix)

---

## Implementation TODO

- [x] Separar estado de entrega vs pago en badges
- [x] Permitir pedidos sin pagos (fiado)
- [x] Estado inicial por ventaRapida, no por pago
- [ ] Crear endpoint atómico `POST /api/pedidos/[id]/enviar`
- [ ] Frontend: usar endpoint atómico, eliminar dos llamadas
- [ ] Cerrar modal detalle antes de abrir embarque (o usar z-index portal)
- [ ] Eliminar "Enviar sin asignar"
- [ ] Validación: preciosManuales >= 0
- [ ] Proteger doble clic en Confirmar Envío
- [ ] Mostrar saldo en tabla de pedidos
- [ ] Botón "Pagar completo" limpia pagos anteriores
- [ ] Confirmación antes de cerrar embarque
- [ ] Acciones rápidas en cards mobile
