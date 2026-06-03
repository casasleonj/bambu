# Agua Bambú v2

Sistema ERP para negocio de distribución de agua y hielo.

Construido con Next.js 16, React 19, PostgreSQL, Prisma y Auth.js v5. Diseñado para trabajar en zonas rurales con conectividad 2G/3G intermitente.

---

## ¿Qué hace?

- **Pedidos** — Registro de pedidos a domicilio y ventas en punto.
- **Embarques** — Asignación de pedidos a rutas y entrega por repartidor.
- **Fiados / Abonos** — Manejo de crédito a clientes con pagos parciales.
- **Recurrentes** — Pedidos programados que se generan automáticamente.
- **Clientes / Proveedores / Insumos** — Catálogos y datos maestros.
- **Reportes** — Producción, deudas, cierres de caja.
- **Producción** — Control de pacas de agua y hielo fabricadas.

---

## Cómo correr localmente

### Requisitos

- Node.js 20+ y npm
- Docker (para PostgreSQL + Redis)

### Pasos

```bash
# 1. Levantar PostgreSQL y Redis
docker compose up -d

# 2. Instalar dependencias
npm install

# 3. Copiar variables de entorno
cp .env.example .env

# 4. Generar cliente Prisma + aplicar schema
npx prisma generate
npx prisma db push

# 5. Sembrar datos iniciales
npx tsx prisma/seed.ts

# 6. Levantar dev server
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

### Credenciales de desarrollo

| Usuario      | Contraseña  | Rol          |
|--------------|-------------|--------------|
| `admin`      | `admin123`  | ADMIN        |
| `asistente`  | `asist123`  | ASISTENTE    |
| `contador`   | `cont123`   | CONTADOR     |
| `repartidor` | `rep123`    | REPARTIDOR   |

---

## Comportamiento offline (importante)

La app **funciona sin internet**. Diseñada para repartidores en zonas rurales.

### Qué pasa cuando no hay red

1. **Tu acción se registra localmente** — el indicador muestra `Offline` con un contador de cambios pendientes (ej: `Offline • 3`).
2. **Toast aparece** — "Sin conexión. Cambio guardado, se enviará al recuperar la red."
3. **Sincronización automática** — al volver la conexión, la app envía los cambios en cola. Verás `Online` (sin contador) cuando termine.
4. **Deduplicación** — si envías el mismo cambio dos veces (ej: doble click), el servidor lo detecta por `offlineId` y no lo duplica.

### Cuándo se sincroniza

- **Automático** — al volver la conexión a internet.
- **Periódico** — cada 30 segundos cuando estás online.
- **Manual** — click en el indicador de conexión cuando hay cambios pendientes (el cursor se vuelve pointer y se ilumina).

### Qué pasa si la cola se llena

La cola tiene un límite de **500 cambios pendientes**. Si la alcanzas, verás un error: *"Cola offline llena. Espera a que se sincronicen los cambios pendientes."* Esto protege la app de crecer sin control cuando no hay red por días.

### Qué se sincroniza

| Acción | Endpoint | Deduplicación |
|--------|----------|---------------|
| Crear pedido | `POST /api/pedidos` | Por `offlineId` (único) |
| Anular pedido | `POST /api/pedidos/[id]/anular` | Estado del pedido |
| Marcar entregado | `POST /api/pedidos/[id]/entrega` | Estado + foto |
| Asignar a embarque | `POST /api/pedidos/[id]/enviar` | Por `offlineId` |
| Pagar fiado | `POST /api/pedidos/pagar-fiado` | Por `Pago.offlineId` |
| Generar recurrentes | `POST /api/pedidos/recurrentes` | Por `recurrenteBatchId` |
| Venta libre | `POST /api/pedidos/venta-libre` | Por `Pedido.offlineId` |
| Asignar pedidos a embarque | `PUT /api/embarques/[id]` | Por `Embarque.offlineId` |
| Cancelar embarque | `DELETE /api/embarques/[id]` | Estado del embarque |
| Crear cliente | `POST /api/clientes` | Por `offlineId` (único) |

---

## Estructura técnica

```
src/
├── app/                  # Next.js App Router
│   ├── (auth)/          # Login, etc.
│   └── (app)/           # Páginas protegidas por rol
│       ├── dashboard/
│       ├── pedidos/
│       ├── embarques/
│       ├── repartidor/
│       ├── clientes/
│       └── reportes/
├── components/          # Componentes UI
├── hooks/               # Hooks de React
├── lib/                 # Utilidades, Prisma, auth, rate-limit
│   ├── fetch-resilient.ts   # Wrapper offline-first
│   ├── db/
│   │   ├── offline.ts      # Dexie (IndexedDB) con cola requestQueue
│   │   └── sync.ts         # Drenado de cola al reconectar
│   └── prisma.ts
├── modules/             # Bounded contexts DDD
│   ├── dashboard/
│   └── pedidos/
└── proxy.ts             # Auth + rate limiting (antes middleware)
```

### Stack

- **Frontend**: Next.js 16, React 19, TypeScript 5, Tailwind 4
- **Backend**: Next.js API Routes, Auth.js v5 (JWT), Zod
- **DB**: PostgreSQL 17 (Docker / Supabase)
- **Offline**: Dexie 4 (IndexedDB), Serwist (PWA service worker)
- **Calidad**: Vitest (unit), Playwright (E2E), ESLint, Sentry, Pino

---

## Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Type check
npx tsc --noEmit
```

### Tests E2E destacados

- `e2e/offline-resilience.spec.ts` — Deduplicación por offlineId
- `e2e/offline-ventas.spec.ts` — Pagos fiados y ventas libres
- `e2e/offline-operaciones.spec.ts` — Embarques (PUT/DELETE)
- `e2e/offline-finanzas.spec.ts` — Creación de clientes
- `e2e/offline-full-flow.spec.ts` — Ciclo completo: abort → enqueue → drain
- `e2e/offline-counter.spec.ts` — UI del contador de pendientes

---

## Deploy

Ver `AGENTS.md` sección "Deploy to Vercel + Supabase" para variables de entorno y comandos.

```bash
# Verificar migrations antes de deploy
npx prisma migrate status

# Deploy
vercel --prod
```

---

## Licencia

Privado. Todos los derechos reservados.
