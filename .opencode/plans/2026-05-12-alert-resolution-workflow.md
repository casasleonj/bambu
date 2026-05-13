# Plan: Flujo de Resolución de Alertas (Casos)

## Problema
Alertas son 100% volátiles — computadas en cliente, sin persistencia, sin estado, sin asignación, sin resolución. El usuario ve la alerta pero no tiene flujo para abordarla, procesarla y cerrarla.

## Solución
Sistema de **Casos** persistentes en PostgreSQL. Las alertas computadas (existentes) se convierten en Casos cuando el usuario decide actuar. Los Casos tienen lifecycle, asignación, notas y timeline.

---

## Fase 1 — Schema Prisma

### Nuevos modelos

```prisma
enum CasoStatus {
  ABIERTO
  EN_PROCESO
  RESUELTO
  CERRADO
}

model Caso {
  id              String      @id @default(cuid())
  alertaTipo      String      // AlertaTipo value: CLIENTE_BLOQUEADO, DISPUTA_ABIERTA, etc
  severidad       String      // ALTA | MEDIA | BAJA
  titulo          String
  descripcion     String?     @db.Text

  // Polimórfico: link al negocio
  clienteId       String?
  cliente         Cliente?    @relation(fields: [clienteId], references: [id], onDelete: SetNull)
  pedidoId        String?
  pedido          Pedido?     @relation(fields: [pedidoId], references: [id], onDelete: SetNull)

  // Workflow
  status          CasoStatus  @default(ABIERTO)
  asignadoAId     String?
  asignadoA       User?       @relation(fields: [asignadoAId], references: [id], onDelete: SetNull)
  creadoPorId     String
  creadoPor       User        @relation(fields: [creadoPorId], references: [id])

  // Resolución
  notasResolucion String?     @db.Text
  resueltoEn      DateTime?
  cerradoEn       DateTime?

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  eventos         CasoEvento[]

  @@index([status])
  @@index([asignadoAId])
  @@index([clienteId])
  @@index([alertaTipo])
}

model CasoEvento {
  id          String      @id @default(cuid())
  casoId      String
  caso        Caso        @relation(fields: [casoId], references: [id], onDelete: Cascade)
  userId      String
  user        User        @relation(fields: [userId], references: [id])
  accion      String      // creado | asignado | comentado | status_change
  valorPre    String?     // status anterior
  valorPost   String?     // status nuevo
  comentario  String?     @db.Text
  createdAt   DateTime    @default(now())

  @@index([casoId])
  @@index([createdAt])
}
```

### Migración
```bash
npx prisma db push
```

---

## Fase 2 — API Routes

### `src/app/api/casos/route.ts`
- `GET` — listar casos con filtros: `?status=ABIERTO&severidad=ALTA&asignadoA=userId`
- `POST` — crear caso desde alerta
  - Body: `{ alertaTipo, severidad, clienteId?, pedidoId?, titulo, descripcion? }`
  - Crea `Caso` + `CasoEvento` (accion: "creado")
  - Retorna caso creado

### `src/app/api/casos/[id]/route.ts`
- `GET` — detalle del caso con eventos
- `PATCH` — actualizar (status, notasResolucion, asignadoA)
  - Si cambia status → crear CasoEvento con valorPre/valorPost
  - Si status → RESUELTO → set resueltoEn = now()
  - Si status → CERRADO → set cerradoEn = now()

### `src/app/api/casos/[id]/eventos/route.ts`
- `POST` — agregar evento/comentario
  - Body: `{ accion, comentario? }`

### `src/app/api/casos/stats/route.ts`
- `GET` — conteos para dashboard: abiertos, asignados a mí, críticos, +48h sin resolver

---

## Fase 3 — UI

### 3a. Ruta /casos (nuevo layout)
- Sidebar item: "Casos" con icono de escudo
- `src/app/(app)/casos/page.tsx` — Server component, fetch casos
- `src/app/(app)/casos/casos-client/index.tsx` — Client component

### 3b. Tabla de casos
- Columnas: severidad badge, título (link a detalle), cliente, asignado, status badge, creado, días abierto
- Filtros: status (dropdown), severidad, asignado a mí (toggle), búsqueda textual
- Sort: creado desc por defecto
- Status badges: ABIERTO=red, EN_PROCESO=amber, RESUELTO=green, CERRADO=gray

### 3c. Detalle de caso (modal expandido o página /casos/[id])
```
┌─────────────────────────────────────────┐
│ 🔴 [ALTA] Cliente bloqueado            │
│ Cliente: Bar El Centro                  │
│ Pedido: #1234 - $12,000                │
│ ─────────────────────────────────────── │
│ Estado: ● En Proceso                    │
│ Asignado: Carlos R. [Cambiar]          │
│ Abierto: 2d 5h                         │
│ ─────────────────────────────────────── │
│ Notas de resolución:                   │
│ ┌─────────────────────────────────────┐ │
│ │ Se registró pago, cliente           │ │
│ │ desbloqueado                        │ │
│ └─────────────────────────────────────┘ │
│ ─────────────────────────────────────── │
│ Timeline:                               │
│ │ 10/05 08:30 Sistema → Creado         │
│ │ 10/05 08:31 Carlos → Asignado        │
│ │ 10/05 09:15 Carlos → Comentó: "..."  │
│ │ 11/05 10:00 Carlos → Resuelto        │
│ └──────────────────────────────────────┘
│ [Asignar] [Comentar] [Resolver] [Cerrar]│
└─────────────────────────────────────────┘
```

### 3d. Botón "Crear caso" en alertas existentes
- `src/app/(app)/pedidos/pedidos-client/alertas-table.tsx`:
  - En fila expandida de alerta, botón "Crear caso" → POST /api/casos → redirige a /casos
- `src/app/(app)/clientes/clientes-client/index.tsx` (tab alertas):
  - Mismo botón "Crear caso" por alerta

### 3e. Dashboard widget
- Reemplazar "Alertas de Riesgo" con "Casos Activos"
  - Total casos abiertos (con severidad ALTA count)
  - Casos asignados a mí
  - Casos críticos sin resolver > 48h
  - Links a /casos con filtros pre-aplicados

### 3f. Acciones reales en GuiaAlertaModal
- Conectar `onAccion` a mutaciones reales:
  - `resolver_disputa` → PATCH `/api/pedidos/:id` (disputaAbierta=false) + crear caso
  - `registrar_pago` → navegar a fiados
  - `verificar_cliente` → PATCH `/api/clientes/:id` (verificado=true)
  - `bloquear_fiados` → PATCH cliente.credito=0
- Cada acción crea evento en el caso asociado

---

## Fase 4 — Dexie Offline (si aplica)

- Tabla `casos` + `casoEventos` en Dexie
- Operaciones encoladas en `syncQueue` con operation: "createCaso" | "updateCasoStatus" | "addCasoEvent"
- `processSyncQueue` endpoint que recibe operaciones encoladas
- Conflict resolution: server-wins por ahora (simplifica)

---

## No hacer (anti-patrones de la investigación)
- ❌ Auto-asignación round-robin (solo 6 users, asignación manual)
- ❌ SLA automático con breach notifications (trackear métricas sí, automatizar no)
- ❌ Email integration
- ❌ Merge de casos
- ❌ Más de 4 estados (ABIERTO/EN_PROCESO/RESUELTO/CERRADO)
- ❌ Notificaciones push/popup (demasiado para 2G/3G)
- ❌ Cambiar el sistema actual de cómputo de alertas (sigue siendo útil)

---

## Orden de implementación

1. Schema + migración (`prisma/schema.prisma`)
2. API routes (`src/app/api/casos/`)
3. Página list + detalle (`src/app/(app)/casos/`)
4. Dashboard widget
5. Botones "Crear caso" en alertas-table + cliente detail
6. Acciones reales en GuiaAlertaModal
7. Dexie offline sync

---

## Fuentes consultadas

- ERPNext Issue Module: https://docs.erpnext.com/docs/v14/user/manual/en/support/issue
- ERPNext SLA: https://docs.erpnext.com/docs/v14/user/manual/en/support/service-level-agreement
- Odoo Helpdesk 17.0: https://www.odoo.com/documentation/17.0/applications/services/helpdesk.html
- Freshdesk API v2 (ticket schema): https://developers.freshdesk.com/api/#ticket_attributes
- Patrones ITIL Incident Management (industry standard)
