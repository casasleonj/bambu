# Informe de Depuración Profunda - Agua Bambú v2
## Agente DEBUGGER - Pipeline MVP 1 semana
### Fecha: 2026-04-26

---

## 1. BUGS DE RUNTIME CONFIRMADOS

### CRÍTICO-001: Autenticación con password en PLANO
- **Archivo:** `src/lib/auth.ts`
- **Línea:** 27
- **Código:** `if (user.password === credentials.password)`
- **Trigger:** Cualquier intento de login
- **Efecto:** Las contraseñas se comparan en texto plano. Sin hashing, exposición total si la base de datos se ve comprometida. Además, permite timing attacks porque el `===` cortocircuita en el primer carácter diferente.
- **Severidad:** CRÍTICA

### CRÍTICO-002: Middleware NO protege APIs
- **Archivo:** `src/middleware.ts`
- **Líneas:** 10-14
- **Código:** `const protectedRoutes = ['/pedidos', '/clientes', ...]`
- **Trigger:** Cualquier request a `/api/*` sin autenticación
- **Efecto:** Todas las APIs son públicas. Un atacante puede crear pedidos, facturas, embarques, abonos, modificar estados, eliminar registros sin autenticarse.
- **Severidad:** CRÍTICA

### CRÍTICO-003: Creación de pedido sin transacción DB
- **Archivo:** `src/app/api/pedidos/route.ts`
- **Líneas:** 64-113
- **Código:** Secuencia de `prisma.pedido.create()` seguido de `prisma.factura.create()`
- **Trigger:** Error en creación de factura después de crear el pedido
- **Efecto:** Pedido queda huérfano sin factura. Inconsistencia financiera irreparable.
- **Severidad:** CRÍTICA

### CRÍTICO-004: Creación de abono sin transacción DB
- **Archivo:** `src/app/api/abonos/route.ts`
- **Líneas:** 44-67
- **Código:** `prisma.abono.create()` seguido de `prisma.factura.update()`
- **Trigger:** Error en update de factura después de crear abono
- **Efecto:** Abono registrado pero saldo de factura no actualizado. Cliente pagó pero sigue apareciendo deudor.
- **Severidad:** CRÍTICA

### ALTO-005: PUT pedido permite cambio de estado sin validación
- **Archivo:** `src/app/api/pedidos/[id]/route.ts`
- **Líneas:** 18-33
- **Código:** `if (body.estado) updateData.estado = body.estado`
- **Trigger:** Request PUT con cualquier string en `estado`
- **Efecto:** Se puede poner `estado: "HACKED"`, saltar validaciones de workflow (ej: marcar ENTREGADO sin embarque), o ANULADO sin reversión de stock/factura.
- **Severidad:** ALTA

### ALTO-006: Número secuencial de pedidos con race condition
- **Archivo:** `src/app/api/pedidos/route.ts`
- **Líneas:** 65-68
- **Código:**
```typescript
const lastPedido = await prisma.pedido.findFirst({ orderBy: { numero: 'desc' } })
const nextNum = (lastPedido?.numero || 0) + 1
```
- **Trigger:** Dos requests concurrentes
- **Efecto:** Ambos requests obtienen el mismo `lastPedido`, generan el mismo `nextNum`, el segundo falla con unique constraint violation (si existe) o genera duplicados (si no hay constraint).
- **Severidad:** ALTA

### ALTO-007: Número secuencial de facturas con race condition
- **Archivo:** `src/app/api/pedidos/route.ts` y `src/app/api/facturas/route.ts`
- **Líneas:** 97-102 (pedidos) y 40-46 (facturas)
- **Código:** Mismo patrón de `findFirst` + `parseInt` + `+1`
- **Trigger:** Requests concurrentes
- **Efecto:** Números de factura duplicados. Violación de constraint unique en `Factura.numero`.
- **Severidad:** ALTA

### ALTO-008: Número secuencial de embarques con race condition
- **Archivo:** `src/app/api/embarques/route.ts`
- **Líneas:** 30-33
- **Código:**
```typescript
const lastEmbarque = await prisma.embarque.findFirst({ orderBy: { numero: 'desc' } })
const nextNum = (lastEmbarque?.numero || 0) + 1
```
- **Trigger:** Requests concurrentes
- **Efecto:** Números de embarque duplicados.
- **Severidad:** ALTA

### ALTO-009: Número secuencial de abonos con race condition
- **Archivo:** `src/app/api/abonos/route.ts`
- **Líneas:** 39-42
- **Código:** Parseo de string `ABO-XXXXX` para obtener siguiente número
- **Trigger:** Requests concurrentes
- **Efecto:** Números de abono duplicados. Violación de constraint unique.
- **Severidad:** ALTA

### ALTO-010: Número secuencial de compras con race condition
- **Archivo:** `src/app/api/compras/route.ts`
- **Líneas:** 28-29
- **Código:** Mismo patrón con `COM-XXXXX`
- **Trigger:** Requests concurrentes
- **Efecto:** Números de compra duplicados.
- **Severidad:** ALTA

### MEDIO-011: Nómina usa `id.slice(-4)` como número secuencial
- **Archivo:** `src/app/api/nomina/route.ts`
- **Línea:** 80
- **Código:** `const nextNum = (lastNomina?.id.slice(-4) || '0000')`
- **Trigger:** Cualquier creación de nómina
- **Efecto:** `nextNum` es un string de 4 caracteres del ID CUID (no numérico), no se incrementa, y se ignora completamente en la creación (el campo `numero` no existe en schema `Nomina`).
- **Severidad:** MEDIA

### MEDIO-012: Producción GET usa `findFirst` por fecha (bug multi-turno)
- **Archivo:** `src/app/api/produccion/route.ts`
- **Líneas:** 6-14
- **Código:** `prisma.produccion.findFirst({ where: { fecha: { gte: hoy, lt: hoy_fin } } })`
- **Trigger:** Múltiples turnos en el mismo día
- **Efecto:** Siempre devuelve solo UN registro de producción. Si hay turno mañana y tarde, solo se ve el primero (orden arbitrario de SQLite).
- **Severidad:** MEDIA

### MEDIO-013: Cierre POST sin validación de duplicados
- **Archivo:** `src/app/api/cierre/route.ts`
- **Líneas:** 53-77
- **Código:** `prisma.cierreDia.create({ data: { fecha: new Date(), ... } })`
- **Trigger:** Clickar "Cerrar Día" dos veces
- **Efecto:** `CierreDia.fecha` tiene `@unique`. El segundo click lanza Prisma error P2002 (Unique constraint failed). El usuario ve "Error al cerrar" sin contexto.
- **Severidad:** MEDIA

### MEDIO-014: Search API siempre devuelve vacío
- **Archivo:** `src/app/api/search/route.ts`
- **Líneas:** 3-6
- **Código:** `return NextResponse.json({ results: [] })`
- **Trigger:** Cualquier búsqueda global
- **Efecto:** La funcionalidad de búsqueda no existe. Los usuarios no pueden encontrar clientes/pedidos por texto libre.
- **Severidad:** MEDIA

### MEDIO-015: Cierre GET calcula `totalPagado` con campo inexistente
- **Archivo:** `src/app/api/cierre/route.ts`
- **Líneas:** 22-23
- **Código:** `const cobrado = pedidos.reduce((acc, p) => acc + p.totalPagado, 0)`
- **Trigger:** Cargar página de cierre
- **Efecto:** `Pedido` tiene `totalPagado` en schema (Float @default(0)), pero también tiene `montoPagado` (Float @default(0)). El cierre usa `totalPagado` mientras que los abonos actualizan `factura.montoPagado`. Hay confusión de campos: `cobrado` siempre será 0 o valor incorrecto porque los abonos no tocan `pedido.totalPagado`.
- **Severidad:** MEDIA

### MEDIO-016: Cierre GET suma `saldo` como fiado sin discriminar estado
- **Archivo:** `src/app/api/cierre/route.ts`
- **Línea:** 24
- **Código:** `const fiado = pedidos.reduce((acc, p) => acc + p.saldo, 0)`
- **Trigger:** Pedidos ANULADOS o CANCELADOS con saldo > 0
- **Efecto:** Los pedidos anulados/cancelados pueden tener saldo residual (no se limpia en DELETE/PUT). El fiado total se infla artificialmente.
- **Severidad:** MEDIA

### MEDIO-017: Offline sync sin manejo de errores persistentes
- **Archivo:** `src/lib/db/offline.ts`
- **Líneas:** 43-57
- **Código:** En `syncPedidos()`, si el fetch falla, solo se hace `console.error`. El pedido se marca como `synced: true` solo si tiene éxito.
- **Trigger:** Error de red durante sync
- **Efecto:** Si el sync falla por error 500 del servidor, el pedido permanece `synced: false` y se reintentará en cada evento `online`. Pero si el servidor acepta el pedido pero falla la factura (bug CRÍTICO-003), el pedido local se marca como synced y la DB del servidor queda inconsistente.
- **Severidad:** MEDIA

### BAJO-018: Offline queue no limpia items fallidos
- **Archivo:** `src/hooks/use-offline-queue.ts`
- **Líneas:** 40-53
- **Código:** `syncQueue()` limpia TODO el queue sin importar si fallaron individualmente
- **Trigger:** Un item del queue falla
- **Efecto:** `setQueue([])` y `localStorage.removeItem('syncQueue')` se ejecutan incluso si algunos items fallaron. Los pedidos fallidos se pierden silenciosamente.
- **Severidad:** BAJA-MEDIA

### BAJO-019: Dexie usa `equals(0)` para boolean `synced`
- **Archivo:** `src/lib/db/offline.ts`
- **Línea:** 44
- **Código:** `offlineDb.pedidos.where('synced').equals(0).toArray()`
- **Trigger:** Query de pedidos no sincronizados
- **Efecto:** El campo `synced` es `boolean` en TypeScript pero Dexie lo almacena como boolean. `equals(0)` puede no funcionar correctamente con booleanos (depende de implementación Dexie/IndexedDB). Debería ser `equals(false)`.
- **Severidad:** BAJA

### BAJO-020: Cliente POST no valida campos requeridos
- **Archivo:** `src/app/api/clientes/route.ts`
- **Líneas:** 19-41
- **Código:** Crea cliente sin validar `nombre` o `telefono`
- **Trigger:** Request con body vacío o incompleto
- **Efecto:** Clientes con nombre vacío o teléfono vacío se crean sin error. El schema los marca como `String` (no nullable), pero Prisma permite strings vacíos.
- **Severidad:** BAJA

### BAJO-021: Producción POST calcula stock final sin considerar ventas
- **Archivo:** `src/app/api/produccion/route.ts`
- **Líneas:** 25-26
- **Código:**
```typescript
const prodAgua = Math.round((body.conteoAAgua + body.conteoBAgua) / 2)
const prodHielo = Math.round((body.conteoAHielo + body.conteoBHielo) / 2)
```
- **Trigger:** Registro de producción
- **Efecto:** Solo guarda el promedio de conteos. No calcula stock final (`stockFinAgua = stockIni + prod - ventas`). Los campos `ventasAgua`, `ventasHielo`, `stockFinAgua`, `stockFinHielo`, `comSelladorAgua`, etc. en el schema se quedan con valores por defecto (0).
- **Severidad:** BAJA

### BAJO-022: Factura POST permite crear factura para pedido que ya tiene factura
- **Archivo:** `src/app/api/facturas/route.ts`
- **Líneas:** 25-58
- **Código:** No verifica si el pedido ya tiene factura asociada
- **Trigger:** Request POST con `pedidoId` que ya tiene factura
- **Efecto:** Violación de constraint unique `Factura_pedidoId_key` (Prisma error P2002). Error 500 expuesto al cliente.
- **Severidad:** BAJA

### BAJO-023: Cierre GET filtra por `fecha` sin timezone
- **Archivo:** `src/app/api/cierre/route.ts`
- **Líneas:** 9-20
- **Código:**
```typescript
const hoy = new Date()
hoy.setHours(0, 0, 0, 0)
// ...where: { fecha: { gte: hoy } }
```
- **Trigger:** Servidor en timezone diferente al cliente
- **Efecto:** El cierre puede incluir/excluir pedidos del día incorrecto dependiendo de la timezone del servidor.
- **Severidad:** BAJA

### BAJO-024: Pedido GET `all=true` excluye ANULADOS
- **Archivo:** `src/app/api/pedidos/route.ts`
- **Línea:** 11
- **Código:** `where: all ? { estado: { not: 'ANULADO' } } : ...`
- **Trigger:** `all=true` con pedidos anulados
- **Efecto:** Los pedidos anulados no aparecen en listado "todos". Para auditoría o recuperación, no son accesibles por esta API.
- **Severidad:** BAJA

### BAJO-025: Pedido-form envía estructura incompatible con API
- **Archivo:** `src/components/pedido-form.tsx`
- **Líneas:** 93-114
- **Código:** El `onSubmit` genera objeto con `cantidades`, `precios`, `clienteData`, pero la API espera `productos`, `clienteId`, `metodoPago`.
- **Trigger:** Enviar formulario de pedido
- **Efecto:** Si el form se conecta directamente a `/api/pedidos`, la API recibe campos incorrectos. `productos` será undefined, el cálculo de total falla (NaN), pero el pedido se crea con totales en 0.
- **Severidad:** BAJA

### BAJO-026: Embarque POST usa `connect` innecesario y potencialmente conflictivo
- **Archivo:** `src/app/api/embarques/route.ts`
- **Líneas:** 44-58
- **Código:**
```typescript
data: {
  numero: nextNum,
  trabajadorId: body.trabajadorId,
  ...
  trabajador: { connect: { id: body.trabajadorId } }
}
```
- **Trigger:** Crear embarque
- **Efecto:** Se especifica `trabajadorId` y `trabajador.connect` simultáneamente. Prisma normalmente maneja esto, pero es redundante y puede causar advertencias o comportamiento indefinido en versiones específicas.
- **Severidad:** BAJA

### BAJO-027: Gasto POST acepta fecha en string sin validación
- **Archivo:** `src/app/api/gastos/route.ts`
- **Líneas:** 33-41
- **Código:** `fecha: fecha ? new Date(fecha) : new Date()`
- **Trigger:** Enviar string de fecha inválida
- **Efecto:** `new Date('invalid')` devuelve `Invalid Date` que Prisma puede rechazar o almacenar como NULL dependiendo de la versión.
- **Severidad:** BAJA

### BAJO-028: Config GET sin `keys` devuelve estructura inconsistente
- **Archivo:** `src/app/api/config/route.ts`
- **Líneas:** 4-23
- **Código:** Con `keys` devuelve `Record<string, string>`, sin `keys` devuelve `{ configs: [...] }`
- **Trigger:** Consumir API de config de dos formas diferentes
- **Efecto:** Los clientes deben manejar dos estructuras de respuesta diferentes.
- **Severidad:** BAJA

---

## 2. RACE CONDITIONS IDENTIFICADAS

### RC-001: Números secuenciales (5 instancias)
| Archivo | Líneas | Entidad | Patrón |
|---------|--------|---------|--------|
| `src/app/api/pedidos/route.ts` | 65-68 | Pedido | `findFirst orderBy desc` + `+1` |
| `src/app/api/pedidos/route.ts` | 97-102 | Factura | `findFirst orderBy desc` + parse + `+1` |
| `src/app/api/embarques/route.ts` | 30-33 | Embarque | `findFirst orderBy desc` + `+1` |
| `src/app/api/abonos/route.ts` | 39-42 | Abono | `findFirst orderBy desc` + parse + `+1` |
| `src/app/api/compras/route.ts` | 28-29 | CompraInsumo | `findFirst orderBy desc` + parse + `+1` |

**Escenario:** Dos usuarios crean un pedido simultáneamente.
**Timeline:**
- T1: Usuario A lee `lastPedido.numero = 100`
- T2: Usuario B lee `lastPedido.numero = 100` (mismo valor)
- T3: Usuario A crea pedido con `numero = 101`
- T4: Usuario B intenta crear pedido con `numero = 101` → UNIQUE CONSTRAINT VIOLATION

**Fix recomendado:** Usar autoincrement/sequence de la base de datos, o transacción serializable con retry.

### RC-002: Abono + actualización de factura
- **Archivo:** `src/app/api/abonos/route.ts`
- **Líneas:** 44-67
- **Código:** Dos operaciones Prisma separadas

**Escenario:** Dos abonos al mismo tiempo para la misma factura.
**Timeline:**
- T1: Abono A lee factura (saldo=100000, montoPagado=0)
- T2: Abono B lee factura (saldo=100000, montoPagado=0)
- T3: Abono A calcula nuevoPagado=50000, saldo=50000
- T4: Abono B calcula nuevoPagado=50000, saldo=50000 (basado en datos stale)
- T5: Abono A actualiza factura (montoPagado=50000, saldo=50000)
- T6: Abono B actualiza factura (montoPagado=50000, saldo=50000) → ¡Sobrescribe! Total pagado debería ser 100000 pero queda en 50000.

**Fix recomendado:** Transacción con `SELECT FOR UPDATE` o atomic increment: `data: { montoPagado: { increment: monto } }`

### RC-003: Compra de insumo + actualización de stock
- **Archivo:** `src/app/api/compras/route.ts`
- **Líneas:** 31-46
- **Código:** `create` seguido de `update` con `increment`

**Nota:** Prisma `increment` es atómico en DB, pero la creación y el incremento no están en transacción. Si la compra se crea pero el incremento falla, el stock no refleja la compra.

### RC-004: Offline sync concurrente
- **Archivo:** `src/lib/db/sync.ts` + `src/hooks/use-offline-queue.ts`
- **Trigger:** Múltiples eventos `online` o múltiples tabs

**Escenario:** El evento `online` dispara `syncOfflineData`. Si el usuario alterna rápidamente online/offline, o tiene múltiples tabs abiertos, el sync se ejecuta concurrentemente.
**Efecto:** Pedidos duplicados en el servidor.

### RC-005: Producción POST con cierre concurrente
- **Archivo:** `src/app/api/produccion/route.ts`
- **Líneas:** 28-30
- **Código:** Lectura de `ultimoCierre` para calcular stock inicial

**Escenario:** Un cierre de día se crea entre la lectura del último cierre y la creación de producción.
**Efecto:** La producción usa stock inicial incorrecto (del cierre anterior en lugar del nuevo).

---

## 3. NULL POINTER RISKS

### NP-001: `cliente.findUnique` sin manejo de null en cálculo de precio
- **Archivo:** `src/app/api/pedidos/route.ts`
- **Línea:** 46
- **Código:** `const precioAgua = cliente?.precioAguaPref || 12000`
- **Riesgo:** BAJO. Usa optional chaining con fallback.

### NP-002: `config.findMany` puede devolver array vacío
- **Archivo:** `src/app/api/pedidos/route.ts`
- **Línea:** 47-48
- **Código:** `const configs = await prisma.config.findMany(); const configMap = Object.fromEntries(...)`
- **Riesgo:** BAJO. `configMap` será `{}`, y los `parseFloat` tienen fallback (`|| 5000`).

### NP-003: `prisma.produccion.findFirst` sin null check antes de usar campos
- **Archivo:** `src/app/api/produccion/route.ts`
- **Línea:** 28-30
- **Código:** `const ultimoCierre = await prisma.cierreDia.findFirst(...)`
- **Riesgo:** BAJO. Se usa con optional chaining (`ultimoCierre?.stockFinAgua || 0`).

### NP-004: `facturas.page.tsx` accede a `cliente.id` sin verificar
- **Archivo:** `src/app/(app)/facturas/page.tsx`
- **Línea:** 152
- **Código:** `onClick={() => registrarAbono(factura.id, (factura as any).cliente?.id)}`
- **Riesgo:** MEDIO. El cast `as any` oculta que `Factura` include no tiene `cliente` en la interfaz TypeScript (aunque sí en la query API). Si la API cambia, esto rompe silenciosamente.

### NP-005: `cierre.page.tsx` asume que `data` existe para alertas
- **Archivo:** `src/app/(app)/cierre/page.tsx`
- **Líneas:** 80-96
- **Código:** `if (!data) return []` - OK, pero `data.aguaVendida` puede ser undefined si la API cambia.
- **Riesgo:** BAJO. Usa optional chaining implícito en los cálculos.

### NP-006: `embarques/[id]/route.ts` PUT no valida que pedidos existan
- **Archivo:** `src/app/api/embarques/[id]/route.ts`
- **Líneas:** 32-41
- **Código:** `await prisma.pedido.updateMany({ where: { id: { in: pedidoIds } }, ... })`
- **Riesgo:** MEDIO. Si `pedidoIds` contiene IDs inexistentes, no hay error. Los pedidos existentes se actualizan, los que no se ignoran silenciosamente. El cliente no sabe cuáles fallaron.

### NP-007: `pedidos/[id]/route.ts` DELETE no verifica existencia
- **Archivo:** `src/app/api/pedidos/[id]/route.ts`
- **Líneas:** 36-43
- **Código:** `await prisma.pedido.delete({ where: { id } })`
- **Riesgo:** MEDIO. Si el ID no existe, Prisma lanza P2025 (Record to delete does not exist). El catch genérico devuelve "Error deleting" sin información.

### NP-008: `produccion/page.tsx` fetch a `/api/cierre-dia` (ruta inexistente)
- **Archivo:** `src/app/(app)/produccion/page.tsx`
- **Línea:** 52
- **Código:** `const res = await fetch('/api/cierre-dia')`
- **Riesgo:** ALTO. No existe `/api/cierre-dia/route.ts`. El `catch` oculta el error y `setStockInicial` nunca se actualiza (queda en 0). El usuario ve "Stock Inicial: 0" siempre.

---

## 4. INCONSISTENCIAS SCHEMA-CÓDIGO

### ISC-001: `clienteId` en migración vs schema
- **Migración:** `Cliente.clienteId TEXT NOT NULL` con UNIQUE index
- **Schema actual:** No tiene campo `clienteId`
- **Efecto:** La migración creó el campo pero el schema de Prisma no lo reconoce. Prisma Client no puede leer/escribir `clienteId`. La aplicación usa `id` (CUID) como identificador.

### ISC-002: Model `Producto` existe en migración pero NO en schema
- **Migración:** Tabla `Producto` con `productoId`, `nombre`, `unidad`, `precioMin`, `precioMax`, etc.
- **Schema actual:** Model `Producto` no existe.
- **Efecto:** Tabla huérfana en SQLite. El código usa productos hardcodeados en el schema de `Pedido` (15 campos: cAguaPed, cAguaEnt, precioAgua, etc.).

### ISC-003: `Pedido` en migración tiene múltiples métodos de pago
- **Migración:** `metodo1`, `monto1`, `metodo2`, `monto2`, `metodo3`, `monto3`
- **Schema actual:** Solo `metodoPago` (String?) y `montoPagado` (Float)
- **Efecto:** La capacidad de múltiples métodos de pago se perdió en la migración al schema. La tarea MVP #4 (múltiples métodos de pago) requiere migrar de vuelta o usar una tabla relacionada.

### ISC-004: `Pedido` en migración tiene campos `nombreCli`, `telefonoCli`, `zonaCli`
- **Migración:** Sí existen.
- **Schema actual:** NO existen. Se usa relación `cliente` con `Cliente`.
- **Efecto:** El frontend (`pedidos/page.tsx`) usa `nombreCli`, `telefonoCli`, `zonaCli` en la interfaz TypeScript pero la API devuelve `cliente: { nombre, telefono, barrio }`. Los campos siempre aparecerán vacíos o undefined en el frontend.

### ISC-005: `Factura` en migración tiene `nombreCli`, `telefonoCli`, `zonaCli`
- **Migración:** Sí existen.
- **Schema actual:** NO existen.
- **Efecto:** Similar a ISC-004. Datos redundantes perdidos.

### ISC-006: `CierreDia` totalmente denormalizado
- **Schema:** 25+ campos calculados manualmente
- **Código:** `src/app/api/cierre/route.ts` calcula todo con `reduce` en JavaScript
- **Efecto:** Si el schema cambia (ej: agregar nuevo método de pago), hay que modificar: schema, API GET, API POST, y frontend. No hay single source of truth.

### ISC-007: `Historial` no se usa en ningún archivo
- **Schema:** Model `Historial` con `entidad`, `registroId`, `accion`, `datos`, `usuarioId`
- **Código:** Ningún archivo importa o usa `prisma.historial`
- **Efecto:** Tabla vacía, auditoría inexistente.

### ISC-008: `Ruta` existe en schema pero código no la usa
- **Schema:** Model `Ruta` con `dias`, `clientes`, `embarques`
- **Código:** Ninguna API expone rutas. Los clientes se crean sin `rutaId`.
- **Efecto:** Funcionalidad de rutas inexistente a pesar de estar modelada.

### ISC-009: `Produccion` tiene campos no usados
- **Schema:** `ventasAgua`, `ventasHielo`, `stockFinAgua`, `stockFinHielo`, `comSelladorAgua`, `comSelladorHielo`, `comSellTotal`
- **Código:** `src/app/api/produccion/route.ts` solo setea `prodAgua`, `prodHielo`, `stockIniAgua`, `stockIniHielo`.
- **Efecto:** Campos quedan con valores default (0). El cierre de día no puede hacer cálculos correctos de stock.

### ISC-010: `Nomina` no tiene campo `numero`
- **Schema:** No existe `numero` en `Nomina`
- **Código:** `src/app/api/nomina/route.ts` intenta calcular `nextNum` (línea 80) pero nunca lo usa.
- **Efecto:** Variable muerta. No hay numeración de nóminas.

### ISC-011: `Abono.metodoPago` es String requerido, no enum
- **Schema:** `metodoPago String` (sin @default, pero el código siempre lo provee)
- **Código:** Frontend y backend usan strings arbitrarios ('EFECTIVO', 'TRANSFERENCIA', etc.)
- **Efecto:** Riesgo de typos. No hay validación de métodos de pago válidos.

### ISC-012: `Embarque` tiene `rutaId` en schema pero no se usa
- **Schema:** `rutaId String?` con relación a `Ruta`
- **Código:** `src/app/api/embarques/route.ts` nunca asigna `rutaId`
- **Efecto:** Embarques no están asociados a rutas.

---

## 5. MEMORY LEAKS

### ML-001: `useOnlineStatus` registra listeners sin cleanup correcto
- **Archivo:** `src/hooks/use-online-status.ts`
- **Líneas:** 11-32
- **Código:** Cleanup sí existe (líneas 28-31), pero el efecto depende de `[setIsOnline]`.
- **Riesgo:** BAJO. `setIsOnline` es estable (de Zustand), por lo que el efecto no se re-ejecuta innecesariamente. No hay leak real.

### ML-002: `useOfflineQueue` efecto sin cleanup de sync
- **Archivo:** `src/hooks/use-offline-queue.ts`
- **Líneas:** 23-27
- **Código:**
```typescript
useEffect(() => {
  if (isOnline && queue.length > 0) {
    syncQueue()
  }
}, [isOnline])
```
- **Riesgo:** MEDIO. Si el componente se desmonta mientras `syncQueue()` está ejecutando fetches, los fetches continúan. Al completar, llaman `setQueue([])` y `localStorage.removeItem` en un componente desmontado. React 18+ maneja esto mejor, pero en Strict Mode puede haber doble ejecución.

### ML-003: Event listener global en `sync.ts`
- **Archivo:** `src/lib/db/sync.ts`
- **Líneas:** 8-9
- **Código:** `window.addEventListener('online', syncOfflineData)`
- **Riesgo:** BAJO. Solo se ejecuta una vez por carga de módulo. No hay `removeEventListener`. Si el módulo se recarga (HMR), puede haber listeners duplicados.

### ML-004: `useEffect` en `pedidos/page.tsx` sin cleanup
- **Archivo:** `src/app/(app)/pedidos/page.tsx`
- **Líneas:** 31-33
- **Código:** `useEffect(() => { fetchPedidos() }, [])`
- **Riesgo:** BAJO. Si el usuario navega rápidamente, el fetch puede completarse después del desmonte. `setPedidos` y `setLoading` en componente desmontado = warning de React. No hay cleanup con AbortController.

### ML-005: Múltiples `useEffect` en páginas sin AbortController
- **Archivos:**
  - `src/app/(app)/cierre/page.tsx` (líneas 44-51)
  - `src/app/(app)/facturas/page.tsx` (líneas 38-40)
  - `src/app/(app)/embarques/page.tsx` (líneas 43-45)
  - `src/app/(app)/produccion/page.tsx` (líneas 46-48)
- **Patrón:** Todos hacen fetch en mount sin cancelación.
- **Riesgo:** BAJO. Mismo problema que ML-004.

---

## 6. PROBLEMAS DE ASYNC/AWAIT

### AA-001: Callbacks sin await en loops
- **Archivo:** `src/lib/db/offline.ts`
- **Líneas:** 43-57
- **Código:** `for (const pedido of unsynced) { try { await fetch(...); await update(...) } catch ... }`
- **Problema:** Los pedidos se procesan secuencialmente. Si hay 100 pedidos, el sync es muy lento. No hay paralelización con `Promise.all` ni control de concurrencia.
- **Riesgo:** BAJO (funcional) / MEDIO (UX)

### AA-002: `syncQueue` no retorna resultado
- **Archivo:** `src/hooks/use-offline-queue.ts`
- **Líneas:** 40-53
- **Código:** `syncQueue` es async pero no retorna qué items fallaron.
- **Problema:** El caller no puede saber si el sync tuvo éxito parcial o total.
- **Riesgo:** BAJO

### AA-003: `fetchPedidos` y otros fetch sin manejo de HTTP error
- **Archivo:** `src/app/(app)/pedidos/page.tsx`
- **Líneas:** 35-45
- **Código:** `const res = await fetch('/api/pedidos'); const data = await res.json()`
- **Problema:** No verifica `res.ok`. Si la API devuelve 500, `data.pedidos` puede ser undefined y `setPedidos(undefined)` causar errores posteriores.
- **Riesgo:** MEDIO. Aunque usa `data.pedidos || []`, si el body no es JSON válido el `await res.json()` lanza SyntaxError.

### AA-004: `embarques/page.tsx` mezcla await y .then()
- **Archivo:** `src/app/(app)/embarques/page.tsx`
- **Líneas:** 47-60
- **Código:**
```typescript
const [embarquesData, trabajadoresData] = await Promise.all([...])
const pedidosData = await fetch('/api/pedidos?all=true').then((r) => r.json())
```
- **Problema:** Inconsistente. `pedidosData` mezcla `await` con `.then()` innecesariamente.
- **Riesgo:** BAJO (estilo)

### AA-005: `assignPedidos` y `cerrarEmbarque` no manejan HTTP error
- **Archivo:** `src/app/(app)/embarques/page.tsx`
- **Líneas:** 91-111, 113-132
- **Problema:** Verifican `if (data.success)` pero no `if (!res.ok)` antes de parsear JSON.
- **Riesgo:** MEDIO. Si la API devuelve 500, `await res.json()` puede fallar.

### AA-006: `auth-server.ts` exporta handlers no usados
- **Archivo:** `src/lib/auth-server.ts`
- **Líneas:** 1-9
- **Problema:** `handlers` se exporta pero solo se usa en `src/app/api/auth/[...nextauth]/route.ts`. La duplicación es confusa.
- **Riesgo:** BAJO

### AA-007: `prisma.ts` sin `$connect` explícito
- **Archivo:** `src/lib/prisma.ts`
- **Problema:** Prisma conecta lazy. En serverless (Vercel), puede haber cold starts con conexiones pendientes.
- **Riesgo:** BAJO

---

## 7. ANÁLISIS POR TAREA MVP

### TAREA 1: Bcrypt + Zod + Middleware APIs

**Bugs que se arreglan:**
- CRÍTICO-001 (password plano) → bcrypt arregla esto
- CRÍTICO-002 (APIs sin protección) → middleware arregla esto

**Nuevos riesgos que se introducen:**
- Si Zod no valida correctamente `estado` en pedidos, CRÍTICO-005 persiste.
- Si el middleware no aplica a rutas dinámicas (`/api/pedidos/[id]`), las APIs siguen expuestas.
- bcrypt es computacionalmente costoso. Sin rate limiting en `/api/auth/[...nextauth]`, vulnerable a DoS por fuerza bruta.
- Si `trustHost: true` en `auth.ts` se mantiene, NextAuth v5 es vulnerable en producción a host header attacks.

**Recomendación:**
- Agregar `await bcrypt.compare()` con timing-safe comparison.
- Asegurar que `middleware.ts` matcher incluya `/api/*`.
- Agregar rate limiting (ej: `lru-cache` o Upstash Redis).

---

### TAREA 2: Generación pedidos recurrentes

**Bugs que se arreglan:**
- Ninguno directamente. Es feature nueva.

**Nuevos riesgos que se introducen:**
- RC-001 se amplifica: los pedidos recurrentes generan múltiples inserts automáticos, aumentando probabilidad de colisiones en `numero`.
- Si la generación es async (cron/job), necesita transacción para evitar duplicados de recurrentes.
- Los campos `frecuencia`, `cadaNDias`, `proxEntrega` en `Cliente` existen en schema pero no se usan. La feature necesita lógica de scheduling que no existe.
- CRÍTICO-003 (sin transacción) se vuelve más crítico: un pedido recurrente que genere factura fallida deja inconsistencias que se acumulan.

**Recomendación:**
- Usar `prisma.$transaction` con `isolationLevel: 'Serializable'`.
- Considerar soft-delete para pedidos recurrentes (no `DELETE` físico).

---

### TAREA 3: Panel configuración precios

**Bugs que se arreglan:**
- Ninguno directamente.

**Nuevos riesgos que se introducen:**
- `src/app/api/config/route.ts` POST permite upsert de cualquier clave/valor sin validación de tipos.
- Si el panel guarda `PRECIO_HIELO` como string no numérico, `parseFloat(configMap.PRECIO_HIELO)` en `pedidos/route.ts` devuelve `NaN` y el fallback `|| 5000` lo oculta, pero el precio real se almacena como `NaN` en la DB.
- RC si dos admins editan config simultáneamente: el último en escribir gana (lost update).

**Recomendación:**
- Validar tipos con Zod antes de upsert.
- Usar categorías de config (ej: `PRECIO_*`, `COM_*`) y validar rangos.

---

### TAREA 4: Múltiples métodos de pago

**Bugs que se arreglan:**
- ISC-003 (schema limitado a un método de pago) se arregla.

**Nuevos riesgos que se introducen:**
- Requiere migración de schema para agregar `metodo1`, `monto1`, etc. o tabla `PagoPedido`.
- Si se usa la estructura de migración original (`metodo1/2/3`), es limitada a 3 métodos.
- `cierre/route.ts` líneas 26-28 solo filtra por 3 métodos. Nuevos métodos requieren modificar el cierre.
- RC-002 (abonos concurrentes) se vuelve más complejo si un abono usa múltiples métodos.

**Recomendación:**
- Crear tabla `Pago` relacionada con `Pedido` y `Factura`.
- Modificar cierre para agregar métodos dinámicamente.

---

### TAREA 5: Fix multi-turno + race conditions

**Bugs que se arreglan:**
- MEDIO-012 (multi-turno) → usar `findMany` en lugar de `findFirst`
- RC-001 a RC-005 (race conditions) → transacciones + autoincrement/sequence

**Nuevos riesgos que se introducen:**
- SQLite no soporta `SELECT FOR UPDATE`. Las transacciones serializables en SQLite pueden degradar performance o no funcionar como esperado.
- Si se cambia a autoincrement para `numero`, los huecos en secuencia (por rollbacks) pueden confundir a usuarios.
- `Produccion` POST necesita recalcular `stockFin*` considerando ventas, lo que requiere query adicional.

**Recomendación:**
- Considerar migrar a PostgreSQL si se necesitan transacciones robustas.
- Para SQLite, usar `INTEGER PRIMARY KEY AUTOINCREMENT` nativo para `numero` en pedidos/embarques.

---

### TAREA 6: Offline pragmático

**Bugs que se arreglan:**
- BAJO-018 (queue no limpia fallidos) → reescribir syncQueue
- BAJO-019 (Dexie `equals(0)`) → usar `equals(false)`

**Nuevos riesgos que se introducen:**
- Offline + autenticación: si el token JWT expira mientras está offline, los syncs fallarán con 401.
- Duplicación de pedidos: si el sync POST tiene éxito pero la respuesta no llega al cliente (timeout), el cliente reintentará y creará duplicado.
- `offline.ts` usa `crypto.randomUUID()` que requiere HTTPS en algunos navegadores. En localhost/http puede fallar.

**Recomendación:**
- Implementar idempotency keys (`Idempotency-Key` header con `localId`).
- Manejar 401 en sync con re-login o refresh token.
- Agregar fallback para `crypto.randomUUID()`.

---

### TAREA 7: Testing

**Bugs que se arreglan:**
- Testing debería capturar: CRÍTICO-001, CRÍTICO-002, CRÍTICO-003, RC-001, RC-002.

**Nuevos riesgos que se introducen:**
- Tests de integración con SQLite pueden pasar pero fallar en PostgreSQL (diferencias en transacciones, fechas, case-sensitivity).
- Mock de `next-auth` en tests puede ocultar bugs de middleware.
- Tests de offline requieren mock de `navigator.onLine` y Dexie/IndexedDB.

**Recomendación:**
- Usar test DB separada.
- Agregar tests E2E para flujos críticos (crear pedido → factura → abono).
- Testear race conditions con herramientas como `k6` o `autocannon`.

---

## RESUMEN EJECUTIVO

| Categoría | Críticos | Altos | Medios | Bajos | Total |
|-----------|----------|-------|--------|-------|-------|
| Runtime Bugs | 4 | 6 | 7 | 12 | 29 |
| Race Conditions | - | - | 5 | - | 5 |
| Null Pointers | - | 1 | 2 | 5 | 8 |
| Schema Inconsistencias | - | - | 5 | 7 | 12 |
| Memory Leaks | - | - | 1 | 4 | 5 |
| Async/Await | - | - | 2 | 5 | 7 |

**Top 5 prioridades para el MVP:**
1. CRÍTICO-002: Proteger APIs con middleware (1 línea de cambio, impacto máximo)
2. CRÍTICO-001: Implementar bcrypt (librería ya disponible, cambio en 1 función)
3. CRÍTICO-003: Transaccionar pedido+factura (previene inconsistencias financieras)
4. RC-001: Fix números secuenciales (usar autoincrement o transacción serializable)
5. RC-002: Atomic increment en abonos (previene pérdida de pagos)

**Nota final:** El proyecto tiene arquitectura pragmática pero acumula deuda técnica crítica en seguridad e integridad de datos. El MVP de 1 semana debería priorizar los 5 items anteriores antes de agregar features nuevas.
