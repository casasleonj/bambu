# Estrategia de Testing - MVP Agua Bambú v2 (1 Semana)

**Agente Tester Pipeline** | **Fecha:** 2026-04-26  
**Estado:** Aprobado para ejecución | **Riesgo:** Alto (sin tests previos, 20 APIs sin validación)

---

## 1. TIPOS DE TESTS VIABLES EN 1 SEMANA

### Prioridad por Viabilidad (Pareto 80/20)

| Tipo | Viabilidad | Esfuerzo | Valor | Decisión |
|------|-----------|----------|-------|----------|
| **API Integration Tests** | ✅ Alta | 2 días | 🔥 Crítico | **MANDATORIO** |
| **E2E Críticos (Playwright)** | ✅ Alta | 2 días | 🔥 Crítico | **MANDATORIO** |
| **Unit Tests Utils/Negocio** | ✅ Media | 1 día | Alto | **Recomendado** |
| **Auth/Security Tests** | ✅ Alta | 0.5 días | 🔥 Crítico | **MANDATORIO** |
| **Contract Tests (Zod)** | ✅ Media | 0.5 días | Alto | **MANDATORIO** |
| **Visual Regression** | ❌ Baja | 2 días | Medio | **Fuera de scope** |
| **Load Tests** | ❌ Baja | 1 día | Medio | **Post-MVP** |
| **Unit Tests UI Components** | ⚠️ Media | 1.5 días | Medio | **Post-MVP** |

### Justificación

- **Sin tests existentes**, el riesgo de regresión al implementar 7 tareas en 7 días es **extremo**.
- **API Integration Tests** son la mejor inversión: validan lógica de negocio, DB, auth y serialización en una sola prueba.
- **E2E con Playwright** cubren los flujos críticos que cruzan frontend + backend + DB.
- **No se testearán componentes UI aislados** (React Testing Library) por falta de tiempo; los E2E cubren la interfaz.

---

## 2. HERRAMIENTAS RECOMENDADAS

### Stack de Testing MVP

```json
{
  "devDependencies": {
    "vitest": "^3.0.0",
    "@vitest/ui": "^3.0.0",
    "playwright": "^1.50.0",
    "@playwright/test": "^1.50.0",
    "@testing-library/react": "^16.0.0",
    "msw": "^2.7.0",
    "zod": "^3.24.0"
  }
}
```

| Herramienta | Propósito | Razón |
|-------------|-----------|-------|
| **Vitest** | API Integration + Unit | Rápido, ESM nativo, compatible con Next.js 16 |
| **Playwright** | E2E Críticos | Unificado (WebKit, Chromium, Firefox), genera traces |
| **Zod** | Validación + Contract Tests | Requerido por Tarea 1 (middleware protege APIs) |
| **MSW** | Mock Service Worker | Para testear offline sync sin servidor real |
| **Prisma Test Utils** | Seed/Reset DB por test | `prisma.$transaction` + `beforeEach` |

### Configuración Sugerida

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

```typescript
// src/test/setup.ts
import { prisma } from '@/lib/prisma'

// Reset DB antes de cada test de API
beforeEach(async () => {
  const tablas = [
    'abono', 'factura', 'pedido', 'embarque',
    'produccion', 'nomina', 'cierreDia', 'gasto',
    'compraInsumo', 'insumo', 'proveedor',
    'historial', 'config', 'cliente', 'trabajador', 'ruta', 'user'
  ]
  for (const tabla of tablas) {
    await prisma.$executeRawUnsafe(`DELETE FROM ${tabla};`)
  }
})

afterAll(async () => {
  await prisma.$disconnect()
})
```

---

## 3. CASOS DE PRUEBA CRÍTICOS POR TAREA MVP

### TAREA 1: Hashing de Passwords + Zod + Middleware Protege APIs

**Contexto actual detectado:**
- `auth.ts` compara `user.password === credentials.password` (plaintext)
- Ninguna API valida body con Zod
- Middleware protege rutas de página pero NO APIs (`/api/*` no requieren auth)

| # | Caso de Prueba | Datos de Entrada | Resultado Esperado |
|---|----------------|------------------|-------------------|
| 1.1 | Login con password en plaintext falla tras migración bcrypt | `{username:"admin", password:"123456"}` donde DB tiene hash bcrypt | `401 Unauthorized`. No plaintext matching |
| 1.2 | Login exitoso con bcrypt | `{username:"admin", password:"correcta"}` | `200 OK`, JWT con role, session válida 4h |
| 1.3 | Usuario inactivo con JWT válido intenta acceder | Usuario `activo=false`, token JWT vigente | Middleware rechaza con `401` o redirect `/login` |
| 1.4 | API POST /api/pedidos sin JWT válido | Request sin cookie de sesión | `401 Unauthorized` (tras fix middleware) |
| 1.5 | Zod rechama body inválido en POST /api/pedidos | `{clienteId:"", productos:"no-es-array"}` | `400 Bad Request` con detalle de errores Zod |
| 1.6 | Zod permite body válido | `{clienteId:"cuid", productos:{agua19L:2}}` | `201 Created`, pedido creado |
| 1.7 | Rate limiting en login | 10 intentos fallidos en 1 minuto | `429 Too Many Requests` |

---

### TAREA 2: Generación Automática de Pedidos Recurrentes

**Contexto:** Cliente tiene `frecuencia` (NINGUNA/DIARIA/SEMANAL/QUINCENAL/MENSUAL) y campos `ultEntrega`, `proxEntrega`.

| # | Caso de Prueba | Datos de Entrada | Resultado Esperado |
|---|----------------|------------------|-------------------|
| 2.1 | Cliente DIARIA genera pedido automático al correr job | Cliente `frecuencia="DIARIA"`, `proxEntrega=hoy`, `activo=true` | Se crea pedido con `tipo="RECURRENTE"`, `numero` secuencial, factura vinculada |
| 2.2 | Cliente DIARIA pero desactivado NO genera pedido | `activo=false`, `frecuencia="DIARIA"` | No se crea pedido. Job ignora cliente |
| 2.3 | Cliente SEMANAL solo genera si `proxEntrega === hoy` | `frecuencia="SEMANAL"`, `proxEntrega=2026-04-26` | Pedido creado. `proxEntrega` actualizada a +7 días |
| 2.4 | Cliente MENSUAL calcula correctamente mes siguiente | `proxEntrega=2026-01-31` (enero) | `proxEntrega` actualizada a `2026-02-28` (no 31 feb) |
| 2.5 | Pedido recurrente hereda precios preferenciales del cliente | `precioAguaPref=7500` | Pedido creado con `precioAgua=7500`, total calculado correcto |
| 2.6 | Cliente con frecuencia NINGUNA nunca genera recurrente | `frecuencia="NINGUNA"` | Excluido del job. Cero pedidos recurrentes |

---

### TAREA 3: Panel de Configuración de Precios

**Contexto actual:** Precios hardcodeados (`12000`, `5000`) en `POST /api/pedidos`. Config vía tabla `Config` (clave/valor).

| # | Caso de Prueba | Datos de Entrada | Resultado Esperado |
|---|----------------|------------------|-------------------|
| 3.1 | Precio fábrica $7,500 se aplica a pedido sin preferencia | `Config["PRECIO_AGUA_BASE"]=7500`, cliente sin `precioAguaPref` | Pedido creado con `precioAgua=7500` |
| 3.2 | Precio domicilio $10,000 se aplica por config global | `Config["PRECIO_AGUA_DOMICILIO"]=10000`, `tipo="ENVIO"` | `precioAgua=10000` en pedido |
| 3.3 | Precio preferencial del cliente anula config global | `precioAguaPref=8500`, `PRECIO_AGUA_DOMICILIO=10000` | `precioAgua=8500` (cliente gana) |
| 3.4 | Config faltante usa fallback seguro | No existe `PRECIO_HIELO` en config | Usa `5000` (fallback). No crash |
| 3.5 | Panel guarda config y afecta inmediatamente nuevos pedidos | POST `/api/config` → POST `/api/pedidos` | Precio actualizado reflejado en segundo pedido |

---

### TAREA 4: Múltiples Métodos de Pago por Pedido

**Contexto actual:** Pedido tiene un solo campo `metodoPago` y `montoPagado`. Factura tiene `montoPagado` y `saldo`.

| # | Caso de Prueba | Datos de Entrada | Resultado Esperado |
|---|----------------|------------------|-------------------|
| 4.1 | Un solo pago completo marca factura PAGADA | `monto=total`, `metodo="EFECTIVO"` | `factura.estado="PAGADA"`, `saldo=0`, `montoPagado=total` |
| 4.2 | Múltiples pagos acumulan en factura | Abono1 `$5000` + Abono2 `$5000` para factura `$10000` | `montoPagado=10000`, `saldo=0`, estado `PAGADA` |
| 4.3 | **Suma de pagos > total del pedido** | Abono1 `$6000` + Abono2 `$6000` para factura `$10000` | **Rechazado con `400`**. No se permite sobre-pago. `Math.max(0,...)` es bug silencioso |
| 4.4 | Pedido mixto: efectivo + transferencia | `pagos:[{monto:5000, metodo:"EFECTIVO"}, {monto:5000, metodo:"TRANSFERENCIA"}]` | Pedido registra ambos métodos. Cierre del día suma por método correctamente |
| 4.5 | Pago parcial deja factura EMITIDA con saldo correcto | `monto=3000`, `total=10000` | `estado="EMITIDA"`, `saldo=7000` |
| 4.6 | Pago en pedido SIN factura existente | POST `/api/abonos` con `facturaId` inexistente | `404 Not Found` |

---

### TAREA 5: Fix Producción Multi-Turno + Race Conditions en Números Secuenciales

**Contexto actual detectado:**
- `GET /api/produccion` usa `findFirst` del día (solo devuelve UN turno, bug multi-turno)
- `POST /api/pedidos` hace `findFirst orderBy numero desc` → `+1` (race condition explícita)
- Embarques y facturas usan el mismo patrón
- Producción page llama a `/api/cierre-dia` que **NO EXISTE** (404 garantizado)

| # | Caso de Prueba | Datos de Entrada | Resultado Esperado |
|---|----------------|------------------|-------------------|
| 5.1 | Producción MAÑANA + TARDE del mismo día coexisten | POST turno MAÑANA → POST turno TARDE | `GET /api/produccion?all=true` devuelve **ambos**. `findFirst` corregido |
| 5.2 | Producción con stock inicial del último cierre | Último cierre: `stockFinAgua=50` | Producción `stockIniAgua=50` |
| 5.3 | **Race condition: dos usuarios crean pedido simultáneamente** | Dos requests concurrentes POST `/api/pedidos` | **Números únicos garantizados** (transacción DB o sequence) |
| 5.4 | **Race condition embarques** | Dos requests concurrentes POST `/api/embarques` | Números `embarque.numero` únicos, no duplicados |
| 5.5 | **Race condition facturas** | Dos facturas creadas simultáneamente | Números `FAC-XXXXX` únicos, secuencial |
| 5.6 | Cálculo de producción redondea promedio correctamente | `conteoAAgua=7, conteoBAgua=8` | `prodAgua=8` (Math.round(7.5)=8) |
| 5.7 | Producción sin cierre previo usa stock 0 | No hay `CierreDia` previo | `stockIniAgua=0`, `stockIniHielo=0` |

---

### TAREA 6: Offline Pragmático (localStorage Backup + Sync Manual)

**Contexto actual:** Dexie para pedidos, localStorage para queue, sync automático on `online` event.

| # | Caso de Prueba | Datos de Entrada | Resultado Esperado |
|---|----------------|------------------|-------------------|
| 6.1 | Crear pedido offline lo guarda en Dexie | `navigator.onLine=false`, click "Crear Pedido" | Registro en `BambuOfflineDB.pedidos` con `synced=false` |
| 6.2 | Sync manual envía pedidos pendientes | 3 pedidos offline → click "Sincronizar" | 3 POSTs a `/api/pedidos`, marcados `synced=true` |
| 6.3 | **Sync manual cuando servidor devuelve 500** | Primer pedido causa `500 Internal Server Error` en servidor | Pedido1 permanece `synced=false`. Pedido2+ continúan intentando. Queue no se limpia completamente |
| 6.4 | Sync automático al recuperar conexión | Desconectar → crear pedido → reconectar | Evento `online` dispara sync automático. Pedido sincronizado |
| 6.5 | Conflictos de número secuencial en sync offline | Pedido offline creado con `numero=0` (temporal) | Al sync, servidor asigna `numero` real. Frontend actualiza |
| 6.6 | Queue en localStorage persiste tras recarga | Crear pedido offline → F5 | `localStorage.getItem('syncQueue')` contiene el pedido |

---

### TAREA 7: Testing + Bug Fixes (General)

| # | Caso de Prueba | Datos de Entrada | Resultado Esperado |
|---|----------------|------------------|-------------------|
| 7.1 | Pedido con clienteId inexistente | `clienteId="no-existo"` | `404 Not Found` o `400 Bad Request`. No crash |
| 7.2 | GET /api/clientes solo devuelve activos | Cliente `activo=false` en DB | No aparece en lista. `where: {activo: true}` funciona |
| 7.3 | DELETE /api/clientes/[id] desactiva (soft delete) | DELETE cliente | `activo=false`. Registro preservado con pedidos históricos |
| 7.4 | DELETE pedido con factura vinculada | DELETE `/api/pedidos/123` donde existe `factura.pedidoId=123` | **Decisión de diseño:** `409 Conflict` (no permitir) o cascade definido |
| 7.5 | Cierre del día calcula totales correctamente | 5 pedidos variados del día | `totalVentas`, `cobrado`, `fiado`, `efectivo`, `nequi` = sumas exactas |
| 7.6 | Producción page carga stock inicial sin 404 | GET `/api/cierre-dia` o equivalente | Endpoint existe. Devuelve último cierre o valores default |

---

## 4. EDGE CASES CRÍTICOS (Tests Obligatorios)

### 4.1 Pedido Recurrente: Cliente con Frecuencia DIARIA pero Desactivado

```typescript
test('T2-EDGE-01: cliente desactivado nunca genera pedido recurrente', async () => {
  const cliente = await prisma.cliente.create({
    data: {
      nombre: 'Cliente Inactivo',
      telefono: '3000000000',
      frecuencia: 'DIARIA',
      activo: false,
      proxEntrega: new Date(), // hoy
    }
  })

  await ejecutarJobRecurrentes() // La función que implemente Tarea 2

  const pedidos = await prisma.pedido.findMany({ where: { clienteId: cliente.id } })
  expect(pedidos).toHaveLength(0)
})
```

### 4.2 Múltiples Pagos: Suma de Pagos > Total del Pedido

```typescript
test('T4-EDGE-01: rechaza sobre-pago en abono', async () => {
  // Setup: pedido $10,000, factura $10,000
  const factura = await crearFactura({ total: 10000, saldo: 10000 })

  await request(app)
    .post('/api/abonos')
    .send({ facturaId: factura.id, monto: 6000, metodoPago: 'EFECTIVO' })
    .expect(201)

  // Segundo abono de $6000 debería ser rechazado (solo quedan $4000)
  const res = await request(app)
    .post('/api/abonos')
    .send({ facturaId: factura.id, monto: 6000, metodoPago: 'TRANSFERENCIA' })
    .expect(400)

  expect(res.body.error).toContain('monto excede saldo')
})
```

**Bug actual detectado:** `abonos/route.ts` línea 57 usa `Math.max(0, factura.total - nuevoPagado)` lo que **acepta silenciosamente** el sobre-pago y solo lo capa a cero. Esto es un bug financiero grave.

### 4.3 Offline: Sync Manual cuando Servidor Devuelve 500

```typescript
test('T6-EDGE-01: sync con error 500 conserva pedido en cola', async () => {
  // Simular 3 pedidos en Dexie
  await queuePedido({ clienteId: '1', productos: { agua19L: 2 } })
  await queuePedido({ clienteId: '2', productos: { agua19L: 3 } })

  // Mockear servidor para que falle en el primero
  server.use(
    http.post('/api/pedidos', async ({ request }) => {
      const body = await request.json()
      if (body.clienteId === '1') return new HttpResponse(null, { status: 500 })
      return HttpResponse.json({ success: true })
    })
  )

  await syncPedidos()

  const remaining = await offlineDb.pedidos.where('synced').equals(0).toArray()
  expect(remaining).toHaveLength(1) // El que falló persiste
  expect(remaining[0].data.clientId).toBe('1')
})
```

### 4.4 Race Condition: Dos Usuarios Crean Pedido al Mismo Tiempo

```typescript
test('T5-EDGE-01: números secuenciales únicos bajo concurrencia', async () => {
  // Crear 10 pedidos concurrentes
  const promises = Array.from({ length: 10 }, (_, i) =>
    request(app)
      .post('/api/pedidos')
      .send({ clienteId: cliente.id, productos: { agua19L: i + 1 } })
  )

  const responses = await Promise.all(promises)
  const numeros = responses.map(r => r.body.pedido?.numero).filter(Boolean)

  // Todos los números deben ser únicos
  expect(new Set(numeros).size).toBe(numeros.length)

  // Deben ser secuenciales 1..10
  const sorted = [...numeros].sort((a, b) => a - b)
  expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
})
```

**Implementación recomendada para fix:** Usar `$transaction` con `isolationLevel: 'Serializable'` o query raw con `INSERT ... RETURNING` sobre SQLite con `AUTOINCREMENT`, o alternativa: tabla `Secuencia` con row-level lock.

### 4.5 Auth: Usuario Desactivado Intenta Login con JWT Válido

```typescript
test('T1-EDGE-01: usuario desactivado con JWT vigente es rechazado', async () => {
  // Crear usuario, loguear, obtener JWT
  const user = await prisma.user.create({
    data: { username: 'temp', password: await bcrypt.hash('pass', 10), activo: true }
  })
  const jwt = await loginY obtenerJWT('temp', 'pass')

  // Desactivar usuario
  await prisma.user.update({ where: { id: user.id }, data: { activo: false } })

  // Intentar acceder a API protegida con JWT anterior
  const res = await request(app)
    .get('/api/pedidos')
    .set('Cookie', `next-auth.session-token=${jwt}`)
    .expect(401)

  expect(res.body.error).toContain('usuario desactivado')
})
```

**Nota:** El middleware actual (NextAuth v5) valida el JWT por firma/expiración pero **no re-verifica `activo`** en DB. Esto es una vulnerabilidad de seguridad.

---

## 5. FLUJOS END-TO-END CRÍTICOS (Playwright)

### Flujo E2E #1: Crear Cliente → Generar Recurrente → Embarque → Entrega Parcial → Cobro Mixto → Cerrar Día

```typescript
// tests/e2e/flujo-critico.spec.ts
import { test, expect } from '@playwright/test'

test('flujo completo del día Bambú', async ({ page }) => {
  // 1. Login
  await page.goto('/login')
  await page.fill('[name="username"]', 'admin')
  await page.fill('[name="password"]', 'admin123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/')

  // 2. Crear cliente con frecuencia DIARIA
  await page.goto('/clientes')
  await page.click('text=+ Nuevo Cliente')
  await page.fill('[name="nombre"]', 'Cliente E2E')
  await page.fill('[name="telefono"]', '3001234567')
  await page.selectOption('[name="frecuencia"]', 'DIARIA')
  await page.fill('[name="precioAguaPref"]', '8500')
  await page.click('text=Guardar')
  await expect(page.locator('text=Cliente E2E')).toBeVisible()

  // 3. Generar pedido recurrente (simular job o crear manual)
  await page.goto('/pedidos')
  await page.click('text=+ Nuevo Pedido')
  await page.fill('[placeholder="Buscar por nombre o teléfono..."]', 'Cliente E2E')
  await page.click('text=Cliente E2E')
  await page.fill('[name="agua19L"]', '5')
  await page.click('text=Crear Pedido')
  await expect(page.locator('text=PENDIENTE')).toBeVisible()

  // 4. Crear embarque y asignar pedido
  await page.goto('/embarques')
  await page.click('text=Nuevo Embarque')
  await page.selectOption('[name="trabajadorId"]', '1')
  await page.click('text=Crear')
  // Asignar pedido al embarque
  await page.check(`input[value="${pedidoId}"]`)
  await page.click('text=Asignar')

  // 5. Registrar entrega parcial (3 de 5)
  await page.goto(`/embarques/${embarqueId}`)
  await page.fill('[name="cAguaEnt"]', '3')
  await page.click('text=Actualizar Entrega')
  await expect(page.locator('text=3 / 5')).toBeVisible()

  // 6. Registrar cobro mixto
  await page.goto('/facturas')
  await page.click('text=Registrar Abono')
  await page.fill('[name="monto"]', '15000') // 3 unidades × 8500 = 25500 parcial
  await page.selectOption('[name="metodoPago"]', 'EFECTIVO')
  await page.click('text=Guardar Abono')
  await page.click('text=Registrar Abono')
  await page.fill('[name="monto"]', '10500')
  await page.selectOption('[name="metodoPago"]', 'TRANSFERENCIA')
  await page.click('text=Guardar Abono')
  await expect(page.locator('text=PAGADA')).toBeVisible()

  // 7. Cerrar día
  await page.goto('/cierre')
  await page.click('text=Cerrar Día')
  await expect(page.locator('text=Cierre completado')).toBeVisible()
  await expect(page.locator('text=$25,500')).toBeVisible() // Ventas
  await expect(page.locator('text=$15,000')).toBeVisible() // Efectivo
  await expect(page.locator('text=$10,500')).toBeVisible() // Transferencia
})
```

### Flujo E2E #2: Offline → Online Sync

```typescript
test('offline sync completo', async ({ page, context }) => {
  await login(page)

  // Simular offline
  await context.setOffline(true)

  // Crear pedido offline
  await page.goto('/pedidos')
  await page.click('text=+ Nuevo Pedido')
  await page.fill('[placeholder="Buscar..."]', 'Cliente Offline')
  // ... crear pedido ...

  // Verificar banner offline
  await expect(page.locator('text=Modo offline')).toBeVisible()

  // Recuperar conexión
  await context.setOffline(false)

  // Verificar sync automático
  await page.waitForTimeout(2000)
  await expect(page.locator('text=1 pedido sincronizado')).toBeVisible()
})
```

### Flujo E2E #3: Producción Multi-Turno

```typescript
test('producción mañana y tarde', async ({ page }) => {
  await login(page)
  await page.goto('/produccion')

  // Turno mañana
  await page.fill('[name="conteoAAgua"]', '100')
  await page.fill('[name="conteoBAgua"]', '102')
  await page.selectOption('[name="turno"]', 'MANANA')
  await page.click('text=Confirmar')
  await expect(page.locator('text=Producción registrada')).toBeVisible()

  // Turno tarde
  await page.goto('/produccion')
  await page.fill('[name="conteoAAgua"]', '80')
  await page.fill('[name="conteoBAgua"]', '82')
  await page.selectOption('[name="turno"]', 'TARDE')
  await page.click('text=Confirmar')

  // Verificar ambos turnos en reporte
  await page.goto('/reportes')
  await expect(page.locator('text=MAÑANA')).toBeVisible()
  await expect(page.locator('text=TARDE')).toBeVisible()
})
```

---

## 6. PARTES DEL CÓDIGO SIN COBERTURA Y RIESGO ALTO

### Mapa de Riesgo vs Cobertura

```
RIESGO ALTO  │  ████████████████████████████████████████
             │  │Auth│  │Pedidos│  │Pagos│  │Cierre│  │Sync│
RIESGO MEDIO │  ████████████████████
             │  │Clientes│  │Embarques│  │Producción│
RIESGO BAJO  │  ████████████████
             │  │Insumos│  │Proveedores│  │Nómina│  │Gastos│
             └────────────────────────────────────────────────
              Sin Tests     Tests Parciales     Tests Completos
```

### Módulos Críticos Sin Validación (Riesgo Máximo)

| Módulo | Archivo | Riesgo | Por qué |
|--------|---------|--------|---------|
| **Auth** | `src/lib/auth.ts` | 🔴 Crítico | Passwords en plaintext, no re-valida `activo` en JWT, compara `===` |
| **Pedidos POST** | `src/app/api/pedidos/route.ts` | 🔴 Crítico | No validación body, race condition en `numero`, precios hardcodeados |
| **Abonos** | `src/app/api/abonos/route.ts` | 🔴 Crítico | Permite sobre-pago silencioso (`Math.max(0, ...)`) |
| **Embarques** | `src/app/api/embarques/route.ts` | 🟠 Alto | Race condition en `numero`, no valida `trabajadorId` existencia antes de usarlo (sí valida, pero luego conecta dos veces) |
| **Cierre** | `src/app/api/cierre/route.ts` | 🟠 Alto | Cálculos manuales con `reduce`, sin transacción, expuesto a race conditions |
| **Producción** | `src/app/api/produccion/route.ts` | 🟠 Alto | `findFirst` del día = bug multi-turno, llama `/api/cierre-dia` inexistente desde frontend |
| **Offline Sync** | `src/lib/db/offline.ts` | 🟠 Alto | Catch silencioso en sync, no reintenta, no reporta error al usuario |
| **Middleware** | `src/middleware.ts` | 🟡 Medio | No protege `/api/*`, solo páginas. Bypass de auth en APIs |

### Bugs Confirmados Requieren Tests Antes de Fix

1. **Producción page 404:** `fetch('/api/cierre-dia')` en `produccion/page.tsx:52` → endpoint no existe.
2. **Race condition confirmada:** Patrón `findFirst({orderBy:{numero:'desc'}})` + `+1` en pedidos, embarques, facturas, abonos.
3. **Sobre-pago silencioso:** `abonos/route.ts:57` `Math.max(0, total - pagado)` permite `montoPagado > total`.
4. **Auth plaintext:** `auth.ts:27` compara string directo, sin bcrypt.
5. **Middleware incompleto:** No protege APIs REST, solo rutas de página.
6. **Producción single-turno:** `GET /api/produccion` usa `findFirst` en lugar de `findMany`.
7. **No hay validación Zod:** Todas las APIs aceptan cualquier body.
8. **Frecuencia schema mismatch:** Schema usa `DIARIA` pero frontend `clientes/page.tsx:42` usa `DIARIO`.

---

## 7. PLAN DE TESTING POR DÍA (7 DÍAS)

### Día 1: Infraestructura + Auth + Seguridad

| Hora | Actividad | Entregable |
|------|-----------|------------|
| 0-2h | Instalar Vitest, Playwright, Zod. Configurar `vitest.config.ts` y `setup.ts` | Tests corren con `npm test` |
| 2-4h | Tests T1: Auth (bcrypt, login, JWT, usuario desactivado) | `src/test/auth.test.ts` verde |
| 4-6h | Tests T1: Middleware protege APIs + Zod validation en 3 APIs críticas | `pedidos`, `clientes`, `abonos` validados |

### Día 2: API Integration - Pedidos + Pagos

| Hora | Actividad | Entregable |
|------|-----------|------------|
| 0-3h | Tests T4: Múltiples métodos de pago (abonos, sobre-pago, parcial, completo) | `abonos.test.ts` |
| 3-6h | Tests T5: Race conditions en pedidos (concurrentes, números únicos) | `pedidos-race.test.ts` |

### Día 3: API Integration - Recurrentes + Config + Producción

| Hora | Actividad | Entregable |
|------|-----------|------------|
| 0-3h | Tests T2: Generación pedidos recurrentes (frecuencias, desactivados, fechas) | `recurrentes.test.ts` |
| 3-4.5h | Tests T3: Configuración precios (fábrica vs domicilio, preferencial) | `config.test.ts` |
| 4.5-6h | Tests T5: Producción multi-turno + stock inicial | `produccion.test.ts` |

### Día 4: Offline + Sync

| Hora | Actividad | Entregable |
|------|-----------|------------|
| 0-3h | Tests T6: Dexie queue, localStorage persistencia, sync manual | `offline.test.ts` |
| 3-5h | Tests T6: Sync con errores (500, 404, timeout), reintentos | `offline-errors.test.ts` |
| 5-6h | Tests T6: Sync automático on `online` event | `offline-auto.test.ts` |

### Día 5: E2E Playwright - Flujos Críticos

| Hora | Actividad | Entregable |
|------|-----------|------------|
| 0-3h | E2E Flujo #1: Cliente → Pedido → Embarque → Entrega → Cobro → Cierre | `flujo-critico.spec.ts` |
| 3-5h | E2E Flujo #2: Offline → Online sync completo | `offline-sync.spec.ts` |
| 5-6h | E2E Flujo #3: Producción multi-turno | `produccion-turnos.spec.ts` |

### Día 6: Cobertura de Huecos + Bug Fixes

| Hora | Actividad | Entregable |
|------|-----------|------------|
| 0-2h | Tests para bugs confirmados (404 producción, schema mismatch DIARIA/DIARIO) | `regression.test.ts` |
| 2-4h | Tests T7: Cierre del día (cálculos, métodos de pago, edge cases) | `cierre.test.ts` |
| 4-6h | Ejecutar suite completa, medir cobertura, documentar gaps | Reporte de cobertura |

### Día 7: Regresión Final + Estabilización

| Hora | Actividad | Entregable |
|------|-----------|------------|
| 0-2h | Ejecutar TODOS los tests. Fallos = tickets P0 | Suite verde |
| 2-4h | Tests de regresión para fixes del día 6 | Nuevos tests verdes |
| 4-5h | Documentar tests como guía de uso (ejemplos vivos) | `TESTING.md` actualizado |
| 5-6h | Integrar tests en CI (GitHub Actions) | `.github/workflows/test.yml` |

---

## 8. MÉTRICAS DE ÉXITO

| Métrica | Objetivo | Medición |
|---------|----------|----------|
| Tests API Integration | ≥ 50 tests | `vitest --reporter=verbose` |
| Tests E2E | ≥ 10 escenarios | `playwright test` |
| Cobertura APIs críticas | 100% (pedidos, abonos, auth, cierre) | `v8` coverage |
| Cobertura módulos riesgo alto | ≥ 80% | `v8` coverage |
| Bugs detectados pre-producción | ≥ 5 | Este documento ya lista 8 |
| Tiempo suite completa | < 2 minutos | Cronómetro |
| Tests flake-free | 100% | 5 ejecuciones consecutivas idénticas |

---

## 9. ANEXOS

### A. Seed para Tests

```typescript
// src/test/seed.ts
export async function seedTestDB() {
  await prisma.user.create({
    data: {
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      rol: 'ADMIN',
      activo: true,
    }
  })

  await prisma.config.createMany({
    data: [
      { clave: 'PRECIO_AGUA_BASE', valor: '7500' },
      { clave: 'PRECIO_AGUA_DOMICILIO', valor: '10000' },
      { clave: 'PRECIO_HIELO', valor: '5000' },
    ]
  })

  await prisma.trabajador.create({
    data: { nombre: 'Juan Test', rol: 'REPARTIDOR', activo: true }
  })
}
```

### B. Helper para Requests Autenticadas

```typescript
// src/test/helpers.ts
export async function authRequest(method: string, url: string, body?: any) {
  const session = await getTestSession() // Login programático
  return request(app)[method.toLowerCase()](url)
    .set('Cookie', `next-auth.session-token=${session.token}`)
    .send(body)
}
```

### C. Simulación de Concurrencia

```typescript
// src/test/concurrency.ts
export async function concurrentRequests(
  count: number,
  factory: (i: number) => Promise<Response>
) {
  const start = Date.now()
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => factory(i))
  )
  return {
    results,
    duration: Date.now() - start,
    allSuccess: results.every(r => r.status >= 200 && r.status < 300),
  }
}
```

---

## 10. RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Tests lentos por Prisma/DB real | Media | Alto | Usar SQLite en memoria (`:memory:`) o paralelizar workers |
| Flaky tests por race conditions | Alta | Alto | Aislar tests de concurrencia, usar retries solo para ellos |
| NextAuth difícil de mockear en tests | Media | Medio | Usar `CredentialsProvider` con test user hardcodeado |
| Falta de tiempo (1 semana) | Alta | Crítico | Priorizar API tests sobre E2E si es necesario |
| SQLite no soporta `SERIALIZABLE` | Confirmado | Alto | Usar `$transaction` con `SELECT ... FOR UPDATE` alternativo o tabla de locks |

**Nota sobre SQLite:** SQLite con Prisma no soporta `SERIALIZABLE`. Para fix de race conditions en números secuenciales, la solución robusta es:

```typescript
// src/lib/secuencia.ts
export async function getNextNumero(tipo: 'PEDIDO' | 'EMBARQUE') {
  return prisma.$transaction(async (tx) => {
    // UPDATE primero para lock implícito en SQLite
    await tx.$executeRaw`UPDATE Secuencia SET valor = valor + 1 WHERE tipo = ${tipo}`
    const seq = await tx.secuencia.findUnique({ where: { tipo } })
    return seq!.valor
  })
}
```

---

**FIN DEL INFORME**

*Generado por Agente Tester Pipeline | Agua Bambú v2 MVP*
