# API Security Audit Report — Agua Bambu v2

**Date**: 2026-05-04 | **Auditor**: API Architect + Red Team | **Scope**: Full API surface, proxy, auth, validation

---

## Resumen Ejecutivo

**Una API REST con buena base (Zod en cada ruta, auth centralizada, rate limiting) pero con 5 brechas críticas de autorización en write endpoints y un vector BOLA en embarques.** El diseño es sólido para MVP: 30 rutas, JWT + RBAC, validación con Zod. Pero 6 rutas de escritura no tienen `requireRole()`, permitiendo que cualquier usuario autenticado modifique clientes, proveedores e insumos. El endpoint `PUT /api/embarques/[id]` tiene un bug de ownership que permite robar pedidos entre embarques.

**Estado general**: Sólido para 6 usuarios internos. Necesita parchar 5 brechas de autorización antes de producción.

---

## Scores por Dimensión

| Dimensión | Score | Peso |
|-----------|-------|------|
| Diseño y Contratos | 7/10 | 15% |
| Validación de Inputs | 8/10 | 15% |
| Autenticación y Autorización | 5/10 | 20% |
| Seguridad General (OWASP) | 6/10 | 20% |
| Errores y Observabilidad | 5/10 | 10% |
| Performance y Escalabilidad | 6/10 | 10% |
| Documentación y DX | 3/10 | 5% |
| Testing y Mantenibilidad | 7/10 | 5% |

**TOTAL PONDERADO: 5.85/10**

---

## Paso 0 — Reconocimiento de Superficie

| Métrica | Valor |
|---------|-------|
| Tipo | **REST** (Next.js App Router route handlers) |
| Framework | Next.js 16.2.4 (Turbopack) |
| Total rutas | **30 path patterns** (36 archivos route.ts) |
| Métodos | GET(24), POST(23), PUT(7), DELETE(7), PATCH(0) |
| Auth primaria | NextAuth v5 (Auth.js) — JWT, CredentialsProvider |
| Auth secundaria | Role-based (requireRole) + Ownership (requireOwnership) |
| Versionado | Ninguno |
| Documentación | **No existe** (sin OpenAPI/Swagger) |
| Entry point | `src/proxy.ts` → rate limit + CSRF + auth redirects |

### Clasificación de rutas

| Categoría | Rutas |
|-----------|-------|
| **Públicas** | `/api/auth/*`, `/login` |
| **User** (autenticado) | GET en todas las listas |
| **Admin** | POST/PUT/DELETE en cierre, trabajadores, precios, rutas, producción, gastos, facturas, nomina, compras |
| **Repartidor** | Embarques (GET/POST/cerrar), pedidos enviar |
| **Asistente** | Clientes CRUD, pedidos list/create |
| **Internal** | N/A |
| **S2S** | N/A |

---

## Paso 1 — Diseño y Contratos

### 1.1 RESTfulness
- URLs con recursos y sub-recursos: `/api/clientes/[id]`, `/api/embarques/[id]/cerrar` ✅
- **RPC-style endpoint**: `/api/clientes/quick` (POST para quick-create) — aceptable como atajo de negocio
- **RPC-style**: `/api/embarques/auto`, `/api/pedidos/recurrentes`, `/api/pedidos/[id]/enviar` — acciones que no encajan en CRUD puro. Nombrado con verbo, consistente ✅

### 1.2 Convenciones
- `kebab-case` para URLs ✅
- `PascalCase` para modelos Prisma (obligatorio), pero API responses mezclan camelCase del cliente con PascalCase de Prisma. Inconsistencia: `Cliente.clienteId` (Prisma) vs `cliente.id` (response manual) ⚠️
- Single resource: `{ success: true, embarque: {...} }` ✅
- List resource: `{ success: true, data: [...], total, page, pageSize }` ✅

### 1.3 Status Codes
- 200 para success, 201 implícito en POST (no se usa explícitamente)
- 400 para validación, 401 para no auth, 403 para no role
- 404 para not found, 409 para conflict (trabajador delete)
- 429 para rate limit (desde proxy.ts)
- **No se usa 201 Created** en ningún POST. Deberían retornar 201 en creación de recursos.

### 1.4 Paginación
- **No hay paginación en la mayoría de GETs.** Rutas como `GET /api/pedidos?all=true` retornan todos los registros. Para 6 usuarios y <1000 registros/día esto es aceptable, pero no escala.
- Query params comunes: `all=true`, `desde/hasta` (filtro fecha), `rol`, `activo`
- No hay cursor-based o offset-based paginación estandarizada.

---

## Paso 2 — Validación de Inputs

### 2.1 Coverage
**100% de las rutas usan Zod** (`z.object().safeParse()`). **Excelente.** `src/lib/auth-check.ts:1`

Schemas centralizados: `src/lib/validators.ts` (23 schemas exportados). Schemas inline: `EnviarPedidoSchema`, `CerrarEmbarqueSchema`, `PrecioResolverSchema`, etc.

### 2.2 Calidad de schemas
- `z.coerce.number()` usado para campos numéricos — maneja strings del form data ✅
- `.min(0)`, `.positive()`, `.max(n)` en campos monetarios ✅
- `z.enum()` en roles, estados, canales ✅
- **Gap**: `z.string().datetime()` en `ProduccionCreateSchema.fecha` (line 104) — debería ser `z.coerce.date()` o `z.string().datetime({ offset: true })`. El formato `datetime()` espera ISO 8601 con TZ, pero el frontend podría enviar formatos locales.
- **Gap**: `CierreCreateSchema` acepta `netoCaja: z.coerce.number().min(0)` (line 146) — **el neto debería calcularse server-side, no venir del cliente**. Si un usuario malicioso envía un netoCaja manipulado, la DB lo acepta. La DB tiene CHECK `netoCaja >= 0` pero no verifica consistencia con `baseDia + cobros - gastos - comisiones`.

### 2.3 Mass Assignment
- `ClienteCreateSchema` usa un objeto plano con campos específicos — no hay spread genérico de `req.body` ✅
- Todos los schemas son explícitos en qué campos aceptan
- Campos extra en el body (no definidos en el schema) son ignorados por Zod por defecto ⚠️ — `.strict()` sería más seguro pero podría romper clients que envían campos extra.

### 2.4 Path/Query Params
- `id` de route params **nunca se valida**. En Prisma, un ID inválido lanza excepción → 500 genérico. Ejemplo: `GET /api/clientes/[id]` con `id="'; DROP TABLE--"` → Prisma lo escapa correctamente, pero si se usara en SQL raw sería inyección.
- Query params `desde`, `hasta` (fechas) no se validan en la mayoría de rutas. Se pasan directamente a Prisma `where`.

---

## Paso 3 — Autenticación y Autorización

### 3.1 Auth Mechanism
**NextAuth v5 + CredentialsProvider + JWT** (`src/lib/auth.ts:1`).

- **Anti-enumeration**: bcrypt compare contra dummy hash + delay aleatorio 50-100ms (`auth.ts:9-52`). Excelente implementación. ✅
- **JWT refresh**: Cada 5 minutos re-verifica `rol` y `activo` contra DB (`auth.ts:69-86`). Desactivación de usuario propaga en ≤5 min. ✅
- **Session maxAge**: 30 minutos. Razonable para ERP. ✅
- **Almacenamiento**: JWT en cookie HTTP-only. ✅

### 3.2 RBAC
Roles definidos en `src/lib/constants.ts`:
```
ADMIN, ASISTENTE, CONTADOR
```
PRIVILEGED_ROLES = `[ADMIN, CONTADOR]` — bypass ownership checks.

Los roles de trabajador (`SELLADOR`, `REPARTIDOR`) no existen como `RolUsuario` enum. Los repartidores se autentican como `User` con `rol=ASISTENTE` o similar, y el `requireOwnership` los vincula a sus embarques vía `Trabajador.id == User.id`.

**Problema de modelo**: No hay distinción entre "usuario del sistema" y "trabajador". Un `User` con `rol=ASISTENTE` que también es `Trabajador` con `rol=REPARTIDOR` usa el mismo `id` para ambas tablas. Esto funciona porque el seed crea usuarios con el mismo ID que el trabajador, pero no está documentado ni forzado por FK.

### 3.3 IDOR/BOLA Analysis

**5 brechas críticas:**

| # | Endpoint | Gap | Explotación |
|---|----------|-----|-------------|
| 1 | `PUT /api/clientes/[id]` | Sin `requireRole` | Cualquier autenticado modifica cualquier cliente |
| 2 | `PUT /api/proveedores/[id]` | Sin `requireRole` | Cualquier autenticado modifica cualquier proveedor |
| 3 | `POST /api/proveedores` | Sin `requireRole` | Cualquier autenticado crea proveedores |
| 4 | `POST /api/insumos` | Sin `requireRole` | Cualquier autenticado crea insumos |
| 5 | `POST /api/clientes/quick` | Sin `requireRole` + info leak | Cualquier autenticado crea clientes + enumera por teléfono |

**1 brecha HIGH:**

| # | Endpoint | Gap | Explotación |
|---|----------|-----|-------------|
| 6 | `PUT /api/embarques/[id]` | Sin `requireOwnership` | Repartidor A modifica embarque de Repartidor B + roba pedidos |

**Detalle del bug de embarques** (`src/app/api/embarques/[id]/route.ts:36-99`):
- `requireRole([ADMIN, REPARTIDOR])` presente (línea 39) ✅
- `requireOwnership` AUSENTE ❌ (comparar con GET en línea 16 que SÍ lo tiene)
- Línea 71: `embarqueId: { not: id }` — reasigna pedidos de OTROS embarques al embarque actual
- Un repartidor puede: `PUT /api/embarques/{victima_id}` con `{ pedidoIds: ["pedido_robado"] }` → el pedido se mueve del embarque víctima al atacante

**Info leak en clientes/quick** (`src/app/api/clientes/quick/route.ts:24-31`):
- Si el teléfono ya existe, retorna el cliente COMPLETO: `apiSuccess({ cliente: existing })`
- Vector de enumeración: POST con teléfonos aleatorios → filtra datos PII de clientes existentes

### 3.4 CORS
No se ha auditado configuración CORS. Next.js App Router tiene defaults restrictivos (same-origin para API routes). Para un ERP sin integraciones externas, esto es correcto.

---

## Paso 4 — Seguridad General (OWASP API Top 10)

### 4.1 Rate Limiting
`src/lib/rate-limit.ts` — Redis con fallback a memoria.

| Tier | Dev | Prod |
|------|-----|------|
| auth | 1000/min | 10/15min |
| api | 300/min | 300/min |
| page | 600/min | 600/min |

**Preocupación**: El `identifier` se construye como `${ip}:${type}` en proxy.ts. Si varios usuarios comparten IP (NAT corporativo, misma oficina), comparten rate limit. Un usuario legítimo podría ser bloqueado por el abuso de otro.

### 4.2 CSRF
`src/lib/csrf.ts` — Validación Origin/Referer para POST/PUT/DELETE/PATCH.

- Deshabilitado en desarrollo (línea 27: `if (process.env.NODE_ENV === "development") return null`) ⚠️
- Sin token CSRF (double-submit cookie). Solo confía en headers de origen.
- El fallback a `Referer` es frágil (puede ser suprimido por políticas del browser)

### 4.3 Security Headers
`src/proxy.ts:85` — CSP con nonce + X-RateLimit-* headers.

- CSP con nonce aleatorio por request ✅
- `X-RateLimit-*` headers informativos ✅
- **Falta**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (CSP ya tiene `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-XSS-Protection`

### 4.4 SQL Injection
- **Prisma ORM** en todas las queries — parametrización automática ✅
- **Sin queries raw** detectadas en el código de rutas
- Riesgo: `src/lib/prisma.ts` podría tener `$queryRaw` en uso futuro

### 4.5 Data Exposure
- `GET /api/clientes/[id]` retorna pedidos (últimos 20 con todos los campos) + facturas + patrones de consumo
- `GET /api/pedidos?all=true` retorna TODOS los pedidos con datos completos de cliente
- No hay field-level filtering basado en rol. Un ASISTENTE ve los mismos datos que un ADMIN.

---

## Paso 5 — Manejo de Errores y Observabilidad

### 5.1 Error Handler
- **No hay error handler global.** Cada ruta tiene su propio try/catch.
- `apiError()` en `src/lib/api-response.ts` estandariza el formato: `{ success: false, error: { message, formErrors?, fieldErrors? } }` ✅
- Errores 500 en catch genéricos: `apiError('Error', 500)` — **no incluye detalles del error real** (bueno para seguridad) pero **tampoco loguea** (malo para debugging).

### 5.2 Logging
- **No hay logging estructurado** en las rutas API. Algunos `console.error` dispersos.
- El proyecto tiene `pino` como dependencia (según AGENTS.md: "structured logging (pino)") pero no se usa en API routes.
- No hay correlation ID entre requests.
- No hay tracing distribuido (OpenTelemetry).

### 5.3 Health Check
- **No hay endpoint de health check.** `GET /api/health` no existe.

---

## Paso 6 — Performance y Escalabilidad

### 6.1 Caching
- **No hay estrategia de caching.** Cada GET hace una query fresh a PostgreSQL.
- Next.js App Router caching estático no aplica a API routes dinámicas.

### 6.2 N+1 Queries
- `include` de Prisma maneja joins ✅
- `GET /api/clientes/[id]` incluye: `pedidos (últimos 20)`, `facturas (últimas 20)` → 3 queries (cliente + pedidos + facturas). Aceptable.
- `GET /api/embarques/[id]` incluye: `trabajador`, `ruta`, `pedidos.cliente`, `pedidos.pagos` → queries anidadas pero resueltas por Prisma en una sola consulta SQL con joins.
- **No se detectaron N+1 obvios.**

### 6.3 Payloads
- `GET /api/pedidos?all=true` puede retornar payloads grandes si hay muchos pedidos. Sin paginación.
- `GET /api/clientes?all=true` igual.
- No hay compresión gzip/brotli configurada explícitamente (Next.js lo maneja por defecto en producción).

---

## Paso 7 — Documentación y DX

### 7.1 OpenAPI / Swagger
**No existe.** No hay `openapi.json`, `swagger.yaml`, ni `scalar.yaml`. Un integrador externo necesitaría leer el código fuente para entender los contratos.

### 7.2 TypeScript types
- Schemas Zod exportados desde `src/lib/validators.ts` ✅ — se pueden inferir tipos con `z.infer<>`
- Tipos de response no están formalizados
- No hay SDK o cliente tipado

---

## Paso 8 — Testing y Mantenibilidad

### 8.1 Tests
- **Unit tests**: `src/lib/__tests__/validators.test.ts` (11 tests) — valida schemas Zod ✅
- **E2E tests**: 126 specs Playwright. ~27 pasan (auth + CRUD básico). El resto fallan por login/DB.
- **No hay tests de API específicos** (supertest, MSW, etc.)

### 8.2 Código
- **Separación de concerns**: Buena — `lib/` para auth, validación, rate-limit, locks, sequence
- **Tipado fuerte**: TypeScript strict con Zod ✅
- **Config**: Variables de entorno en `.env` sin secrets hardcodeados ✅
- **Deuda**: `logAudit().catch(() => {})` en 7+ rutas — fire-and-forget, sin reintentos

---

## Paso 9 — OWASP API Security Top 10 (2023)

| # | Riesgo | Presente | Endpoint(s) | Evidencia | Severidad |
|---|--------|----------|-------------|-----------|-----------|
| **API1** | BOLA/IDOR | **SÍ** | `PUT /api/clientes/[id]`, `PUT /api/proveedores/[id]`, `POST /api/proveedores`, `POST /api/insumos`, `POST /api/clientes/quick`, `PUT /api/embarques/[id]` | Sin requireRole/requireOwnership | **CRÍTICA** |
| **API2** | Broken Auth | No | Auth delegado a NextAuth + requireAuth en todas las rutas | verify-auth.ts | — |
| **API3** | Broken Object Property Level Auth | **SÍ** | `PUT /api/clientes/[id]` | ASISTENTE puede modificar `preciosEspeciales` | **HIGH** |
| **API4** | Unrestricted Resource Consumption | Parcial | `GET /api/pedidos?all=true` | Sin paginación, posible payload grande | **MEDIUM** |
| **API5** | Broken Function Level Auth | **SÍ** | `POST /api/proveedores`, `POST /api/insumos`, `POST /api/clientes/quick` | Faltan requireRole en write endpoints | **CRÍTICA** |
| **API6** | Unrestricted Access to Sensitive Business Flows | No | Rate limiting en proxy | rate-limit.ts | — |
| **API7** | Server Side Request Forgery | No | Sin fetching externo en API routes | — | — |
| **API8** | Security Misconfiguration | Parcial | CSP sin `unsafe-eval` en dev (corregido). Sin HSTS. | proxy.ts:85 | **LOW** |
| **API9** | Improper Inventory Management | **SÍ** | 30 endpoints sin documentación, sin versionado | Sin OpenAPI | **MEDIUM** |
| **API10** | Unsafe Consumption of APIs | No | Sin dependencias externas en API routes | — | — |

---

## Vulnerabilidades Encontradas

| # | Endpoint | Método | Vulnerabilidad | Severidad | OWASP |
|---|----------|--------|---------------|-----------|-------|
| 1 | `/api/clientes/[id]` | PUT | Sin requireRole | 🔴 CRÍTICA | API1, API3 |
| 2 | `/api/proveedores/[id]` | PUT | Sin requireRole | 🔴 CRÍTICA | API1 |
| 3 | `/api/proveedores` | POST | Sin requireRole | 🔴 CRÍTICA | API5 |
| 4 | `/api/insumos` | POST | Sin requireRole | 🔴 CRÍTICA | API5 |
| 5 | `/api/clientes/quick` | POST | Sin requireRole + info leak | 🔴 CRÍTICA | API1, API5 |
| 6 | `/api/embarques/[id]` | PUT | Sin requireOwnership (pedido steal) | 🟠 HIGH | API1 |
| 7 | `/api/clientes/quick` | POST | Teléfono enumeration → PII leak | 🟠 HIGH | API1 |
| 8 | `/api/pedidos?all=true` | GET | Sin paginación | 🟡 MEDIUM | API4 |
| 9 | `/api/cierre` | POST | netoCaja del cliente, no server-side | 🟡 MEDIUM | API3 |
| 10 | Todas | — | Sin documentación OpenAPI | 🟡 MEDIUM | API9 |

---

## Top 5 Acciones Inmediatas

| # | Acción | Riesgo | Esfuerzo |
|---|--------|--------|----------|
| 1 | **Agregar `requireRole` a 5 endpoints**: clientes/[id] PUT, proveedores/[id] PUT, proveedores POST, insumos POST, clientes/quick POST | 🔴 | 30 min |
| 2 | **Agregar `requireOwnership` a `PUT /api/embarques/[id]`** | 🟠 | 15 min |
| 3 | **Sanitizar respuesta de `clientes/quick`**: no retornar cliente completo en duplicado | 🟠 | 10 min |
| 4 | **Calcular `netoCaja` server-side** en `POST /api/cierre` | 🟡 | 30 min |
| 5 | **Agregar paginación** a `GET /api/pedidos`, `GET /api/clientes` | 🟡 | 2h |

---

## Deuda Técnica

| Deuda | Riesgo | Esfuerzo | Prioridad |
|-------|--------|----------|-----------|
| Sin OpenAPI/Swagger | DX pobre, sin SDKs | 4h | Media |
| Sin health check endpoint | Monitoreo imposible | 30min | Media |
| Sin paginación en list endpoints | Payloads grandes | 2h | Media |
| logAudit fire-and-forget | Pérdida de auditoría | 1h | Baja |
| Instanceof Response inconsistency | Fragilidad | 30min | Baja |
| Sin logging estructurado en API | Debugging ciego | 3h | Baja |
| Sin correlation ID | Trazabilidad | 2h | Baja |
| Sin 201 Created en POSTs | REST compliance | 15min | Baja |

---

*Fin del reporte. API1 (BOLA) es la prioridad #1. Si no se parcha, el primer repartidor aburrido podria modificar todos los clientes y robar pedidos de otros embarques.*
