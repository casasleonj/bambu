# Plan Refinado: Flujo Guiado de Resolución de Casos

Basado en investigación de ERPNext, Odoo, Zendesk, Freshdesk, Jira SM + comunidades.
Ver: `.opencode/plans/2026-05-12-alert-resolution-workflow.md`

---

## Problema UX actual

```
Usuario clic "Crear caso" → POST /api/casos → window.location.href = '/casos'
```
Sin feedback. Sin guía. Sin contexto. El usuario no sabe qué hacer ahora.

---

## Solución: CasoGuiaModal (guía post-creación semi-dinámica)

### Flujo nuevo

```
Usuario clic "Crear caso"
  → POST /api/casos (crea en DB)
  → Abre CasoGuiaModal con datos del caso + checklist filtrado + acciones vivas
  → Usuario completa pasos, marca checkboxes, ejecuta acciones
  → [Resolver] o [Cerrar]
  → Se queda en la misma página
```

### Lo que ve el usuario

```
┌─────────────────────────────────────────────┐
│ ✅ Caso creado exitosamente                 │
│ ─────────────────────────────────────────── │
│ 🔴 [ALTA] Cliente bloqueado                 │
│ Cliente: Bar El Centro  ·  Pedido: #1234   │
│ Creado: 12/05 10:30                         │
│ ─────────────────────────────────────────── │
│ 📋 Pasos sugeridos                          │
│                                             │
│ [✓] 1. Registrar el pago pendiente          │
│          └ [Registrar pago →]              │
│ [ ] 2. Verificar si ya pagó y no se registró│
│ [ ] 3. Negociar nueva promesa de pago        │
│ [ ] 4. Desbloquear cliente                  │
│          └ [Desbloquear →]                 │
│                                             │
│ Asignar a: [Carlos R. ▼]                   │
│                                             │
│ 📝 Notas de resolución:                     │
│ ┌─────────────────────────────────────────┐ │
│ │ El cliente pagó $12,000 en efectivo.    │ │
│ │ Se registró pago y se desbloqueó.       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Cerrar]              [Ir al caso →]        │
└─────────────────────────────────────────────┘
```

---

## 1. Componente nuevo: `CasoGuiaModal`

### Props
```typescript
interface CasoGuiaModalProps {
  caso: {
    id: string
    alertaTipo: AlertaTipo
    severidad: string
    titulo: string
    clienteId: string | null
    pedidoId: string | null
    cliente: { id: string; nombre: string; telefono: string } | null
    pedido: { id: string; numero: number; total: string } | null
  }
  contextData?: {
    clienteVerificado?: boolean
    pedidoDisputa?: boolean
    pedidoEstadoPago?: string
    pedidoTieneFoto?: boolean
  }
  usuarios: Array<{ id: string; username: string; rol: string }>
  onClose: () => void
}
```

### Estados internos
- `checkedSteps: boolean[]` (checklist dinámico)
- `asignadoAId: string` (user id)
- `notasResolucion: string`
- `status: string` (ABIERTO/EN_PROCESO/RESUELTO/CERRADO)
- `actionLoading: string | null` (qué acción se está ejecutando)
- `error: string | null`
- `toast: { type: 'success' | 'error', message: string } | null`

### Lógica de filtrado contextual (semi-dinámico)

Se filtra `GUIA_ALERTAS[alertaTipo].soluciones` según datos disponibles:

| AlertaTipo | Solución | ¿Cuándo se muestra? |
|---|---|---|
| DISPUTA_ABIERTA | "Revisar foto de entrega" | Solo si `pedidoTieneFoto === true` |
| DISPUTA_ABIERTA | "Cerrar la disputa" | Siempre |
| CLIENTE_NO_VERIFICADO | "Marcar como verificado" | Solo si `clienteVerificado === false` |
| CLIENTE_NO_VERIFICADO | "Llamar cliente" | Siempre |
| MONTO_ANOMALO | "Anular pedido" | Solo si `pedidoEstadoPago !== PAGADO` |
| RECLAMACIONES_MULTIPLES | "Bloquear fiados" | Solo si cliente tiene pedidos con saldo |
| PROMESA_PROXIMA_VENCER | "Extender plazo" | Siempre |
| CLIENTE_BLOQUEADO | "Desbloquear cliente" | Siempre (después de pagar) |
| RESTO | Sin filtro | Mostrar todas (max 4) |

### Acciones vivas (conectadas a APIs)

Cada botón de acción del modal ejecuta fetch real:

| Accion ID | Endpoint | Método | Body |
|---|---|---|---|
| `resolver_disputa` | `/api/pedidos/:id` | PATCH | `{ disputaAbierta: false }` |
| `verificar_cliente` | `/api/clientes/:id` | PATCH | `{ verificado: true }` |
| `bloquear_fiados` | `/api/clientes/:id` | PATCH | `{ bloqueado: true }` |
| `extender_plazo` | `/api/pedidos/:id` | PATCH | `{ promesaPagoFecha: newDate }` |
| `justificar_descuento` | `/api/descuentos/:id` | PATCH | `{ justificado: true }` |

Acciones que siguen siendo redirect (muy complejas para modal):
| `registrar_pago` | Redirect a `/pedidos?tab=fiados` | Requiere form de pago |
| `llamar_cliente` | `tel:` link | Navegador nativo |
| `ver_*` (misc) | Redirect a URL correspondiente | Solo navegación |

### Botones de estado
- Si `status === ABIERTO`: [Tomar caso → EN_PROCESO]
- Si `status === EN_PROCESO` o `ABIERTO`: [Resolver → RESUELTO] (requiere notas)
- Si `status === RESUELTO`: [Cerrar → CERRADO]
- Si `status === RESUELTO` o `CERRADO`: [Reabrir → EN_PROCESO]

---

## 2. Modificaciones a archivos existentes

### `alertas-table.tsx`
- Agregar state `casoCreado: Caso | null`
- En `handleCrearCaso()`: en vez de redirect, setear `casoCreado` con la respuesta de la API
- Renderizar `<CasoGuiaModal />` condicional
- Pasar `contextData` extraído de `pedidos` (verificar estado del cliente/pedido)
- Al cerrar modal, `setCasoCreado(null)` (NO redirigir)

### `clientes-client/index.tsx` (tab alertas)
- Agregar state `casoCreado`
- En onClick "Crear caso": fetch POST, guardar en state
- Renderizar `<CasoGuiaModal />` condicional
- Pasar `contextData` desde `selectedCliente` y pedidos
- Al cerrar, `setCasoCreado(null)` + toast de confirmación

### `casos-client/caso-detail.tsx`
- Si se abre desde modal guiado y usuario ya marcó pasos, sincronizar estado
- (low priority, puede ser en iteración 2)

---

## 3. Archivos a crear

| Archivo | Propósito |
|---|---|
| `src/components/caso-guia-modal.tsx` | Modal guiado post-creación con checklist, acciones, asignación |

---

## 4. Lo que NO cambia

- `alertas-config.ts` (GUIA_ALERTAS sigue siendo la fuente de verdad)
- `alertas-utils.ts` (cómputo de alertas)
- API routes (ya funcionan)
- Schema (ya está)
- Dashboard widget (se mantiene)
- Sidebar nav (se mantiene)
- `GuiaAlertaModal` (sigue existiendo para vista de referencia, es distinto de CasoGuiaModal)

---

## 5. Anti-patrones evitados (basado en investigación)

| Anti-patrón | Cómo lo evitamos |
|---|---|
| >4 pasos en checklist | Filtrado contextual + max 4 visibles |
| Sugerencias irrelevantes | Filtrado por contexto del cliente/pedido |
| Resolution Details oculto | Textarea visible siempre en el modal |
| Over-automation | Sin auto-resolve. Usuario resuelve manualmente |
| Sin feedback de creación | ✅ toast + modal que confirma |
| Redirect abrupto | Modal se abre en contexto, no hay redirect |

---

## 6. Orden de implementación

1. `src/components/caso-guia-modal.tsx` (crear)
2. `src/app/(app)/pedidos/pedidos-client/alertas-table.tsx` (modificar)
3. `src/app/(app)/clientes/clientes-client/index.tsx` (modificar)
4. Verificar build (`npm run build`)
