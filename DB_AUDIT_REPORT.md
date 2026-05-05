# PostgreSQL Database Audit Report — Agua Bambu v2

**Date**: 2026-05-04 | **Auditor**: Automated deep-dive | **Scope**: Full schema, config, stats

---

## Resumen Ejecutivo

**Una base de datos pequeña (15 MB, 23 tablas) con diseño funcional para MVP pero con deuda técnica acumulada en tipos de datos, índices innecesarios, y seguridad crítica.** El problema más grave es el uso de superuser por la aplicación. El schema está normalizado pero usa `TIMESTAMP WITHOUT TIME ZONE` en cada columna de fecha del sistema — 54 columnas afectadas. Hay 64 índices sin usar (la mayoría serían útiles en producción con datos reales, pero varios compuestos son redundantes).

**Estado general**: Funcional para dev/6 usuarios. Necesita hardening antes de producción.

---

## Scores por Dimensión

| Dimensión | Score | Peso |
|-----------|-------|------|
| Diseño de Schema y Normalización | 7/10 | Alta |
| Tipos de Datos y Constraints | 4/10 | Alta |
| Índices y Performance | 6/10 | Alta |
| Integridad y Consistencia | 5/10 | Alta |
| Seguridad | 2/10 | **Crítica** |
| Funciones/Triggers/Vistas | 4/10 | Media |
| Migraciones y Evolución | 6/10 | Media |
| Backup/DR y HA | 1/10 | Alta |
| Escalabilidad | 7/10 | Media |

**PROMEDIO PONDERADO: 4.8/10**

---

## Paso 0 — Reconocimiento General

| Métrica | Valor |
|---------|-------|
| Versión PostgreSQL | **16.13** (Alpine) — actualizado, seguro ✅ |
| Base de datos | `bambu` |
| Tamaño total | **15 MB** |
| Tablas | 23 |
| Índices | **101** (ratio 4.4 índices/tabla) |
| Filas estimadas | ~90 en total (DB de desarrollo) |
| Extensiones | Solo `plpgsql` |
| Roles | **1**: `bambu` (SUPERUSER) ⚠️ |
| Conexiones máximas | 100 |
| Puerto | `127.0.0.1:5433` |
| Docker | `postgres:16-alpine`, volume `pgdata` |

---

## Paso 1 — Diseño de Schema y Normalización

### 1.1 Normalización ✅
Schema en **3NF**. No hay desnormalización injustificada. Los productos del pedido están embebidos como columnas (`cPacaAguaPed`, `cPacaHieloPed`, etc.) en vez de una tabla `PedidoProducto` — **decisión pragmática correcta para un ERP pequeño con 6 productos fijos**. No abusa de JSONB.

### 1.2 Naming Conventions ⚠️
- **snake_case** consistente ✅
- **Singular** para tablas ✅
- `CompraInsumo` usa PascalCase parcial (debería ser `compra_insumo`)
- `EstadoFactura` y `EstadoEmbarque`, `EstadoPedido` — prefijo `Estado` redundante. El modelo se llama `Factura`, el enum debería llamarse `FacturaEstado`
- Columnas como `cPacaAguaPed`, `cBotellonFabEnt` — crípticas. `c` = cantidad, `Ped` = pedido, `Ent` = entregado. Documentado en código pero no autoexplicativo

### 1.3 Tipos de Datos ❌ (Crítico)
**TODAS las columnas de fecha usan `DateTime` (TIMESTAMP WITHOUT TIME ZONE):**

```
Abono.fecha, Abono.createdAt          → TIMESTAMP WITHOUT TIME ZONE
CierreDia.fecha, CierreDia.createdAt  → TIMESTAMP WITHOUT TIME ZONE
Cliente.createdAt, Cliente.updatedAt  → TIMESTAMP WITHOUT TIME ZONE
Cliente.proxEntrega, Cliente.ultEntrega → TIMESTAMP WITHOUT TIME ZONE
CompraInsumo.fecha, CompraInsumo.createdAt, CompraInsumo.updatedAt → TIMESTAMP WITHOUT TIME ZONE
Embarque.fecha, Embarque.horaSalida, Embarque.horaLlegada → TIMESTAMP WITHOUT TIME ZONE
Factura.fecha, Factura.createdAt, Factura.updatedAt → TIMESTAMP WITHOUT TIME ZONE
Nomina.fechaInicio, Nomina.fechaFin, Nomina.fechaPago → TIMESTAMP WITHOUT TIME ZONE
Pedido.fecha, Pedido.fechaEntrega, Pedido.ultimaGeneracion → TIMESTAMP WITHOUT TIME ZONE
Produccion.fecha → TIMESTAMP WITHOUT TIME ZONE
...
```

**54 columnas en total.** En Colombia (UTC-5), con horario de verano ausente, el impacto es bajo en dev pero **catastrófico en producción remota** (Vercel UTC → Supabase UTC → cliente UTC-5). Las queries de "hoy" de la app usan `getTodayRange()` con ajuste manual de timezone — workaround funcional pero frágil.

**Recomendación**: Migrar a `TIMESTAMPTZ`. Prisma lo soporta con `@db.Timestamptz()`.

Otros issues de tipos:
- `Trabajador.rol` → **String en vez de enum**. Justificado por "flexibilidad" pero sin CHECK constraint
- `Cliente.preciosEspeciales` → **String** que almacena JSON. Debería ser `@db.JsonB`
- `MetodoPago` en `Abono` → **String**, no usa el enum `MetodoPago` definido
- `Pedido.saltarFechas` → `String[]` (array nativo de PostgreSQL). Correcto ✅
- Monetarios: `@db.Decimal(10,2)` consistente ✅
- `Producto.codigo` y `Abono.numero` y `Factura.numero` y `CompraInsumo.numero` y `NotaCredito.numero` → `String @unique` con UNIQUE constraint generado. Correcto ✅

### 1.4 Primary Keys
Todas las tablas tienen PK ✅. Formato: `cuid()` (string aleatorio, ~25 chars). 

**Problema**: `cuid()` produce strings largos que fragmentan índices B-tree. Para tablas con millones de filas (Pedido, Factura), mejor usar `UUIDv7` (ordenable temporalmente) o `BIGINT GENERATED ALWAYS AS IDENTITY`.

### 1.5 Foreign Keys
33 FKs definidas ✅. ON DELETE configuraciones mixtas:
- `Pago` → `Pedido`: **CASCADE** ✅ (único caso correcto)
- `Ruta.*`, `Cliente.*`, `Pedido.embarqueId` → **SET NULL** ✅
- 18 FKs con **RESTRICT** (NO ACTION) — explotarán si la app intenta borrar

### 1.6 Constraints
**0 CHECK constraints en toda la base de datos.** Nada protege la DB de:
- `saldo < 0` en Factura o Pedido
- `totalPagado > total` en Pedido
- `fechaFin < fechaInicio` en Nomina
- `cantMin < cantMax` en PrecioVolumen
- `monto > 0` en Pago/Abono
- Validación de `Trabajador.rol` contra lista permitida

---

## Paso 2 — Índices, Performance y Mantenimiento

### 2.1 Índices
**101 índices para 23 tablas (15MB).** Desglose:
- 23 PK indexes (obligatorios) ✅
- ~12 UNIQUE indexes (obligatorios) ✅
- **66 índices secundarios** declarados con `@@index`

De los 66 secundarios, **64 tienen `idx_scan = 0`** — nunca escaneados. Esto es esperable en dev (pocos datos), pero varios son sospechosos:

### 2.2 Índices Duplicados ❌
```sql
Factura_pedidoId_idx   -- B-tree sobre pedidoId
Factura_pedidoId_key   -- UNIQUE constraint ya crea índice B-tree sobre pedidoId
```
**Índice duplicado**: `Factura_pedidoId_idx` es redundante. El UNIQUE `pedidoId` ya indexa la columna. **Borrar `Factura_pedidoId_idx`** (ahorra 104 kB ahora, más en producción).

### 2.3 Índices Compuestos Excesivos
```
Pedido_fecha_estado_idx        -- (fecha, estado)
Pedido_estado_fecha_idx        -- (estado, fecha)
Pedido_clienteId_estado_idx    -- (clienteId, estado)
Pedido_embarqueId_estado_idx   -- (embarqueId, estado)
Pedido_canal_estado_idx        -- (canal, estado)
```
5 índices compuestos con `estado` en Pedido. Para 6 usuarios y <1000 pedidos/día: **innecesario**. Con 6 productos y pocos estados, los escaneos secuenciales serían más rápidos que mantener 5 índices extra. **Reducir a 2**: `(fecha)` y `(clienteId)`.

### 2.4 Autovacuum
Configuración default de PostgreSQL 16. Correcta para este tamaño. Sin ajustes por tabla.

### 2.5 Dead Tuples
- `CompraInsumo`: **100% dead tuples** (tabla vacía, todas las filas borradas)
- `Factura`: **20% dead tuples**

`VACUUM FULL` o `VACUUM` solucionaría. No es crítico en 15MB.

---

## Paso 3 — Integridad, Consistencia y Datos

### 3.1 Campos de Auditoría
Todas las tablas excepto `User`, `Config`, `PrecioHistorial`, `CierreDia` tienen `createdAt` + `updatedAt` ✅. `User` y `CierreDia` solo tienen `createdAt` — sin `updatedAt`.

### 3.2 Historial (Audit Table)
Existe tabla `Historial` con `(entidad, registroId, accion, datos, usuarioId, fecha)`. Es un **log manual** — la app debe escribir en él explícitamente. No hay triggers. Si la app falla en loguear, se pierde el rastro. 

### 3.3 Soft Delete
- `Cliente.activo`, `Trabajador.activo`, `Proveedor.activo`, `Producto.activo` ✅
- `Ruta.activo` ✅
- `User.activo` ✅
- `PrecioVolumen.activo` ✅
- **No hay soft delete** en `Pedido` (usa estados), `Factura` (usa estados), `Embarque` (usa estados). Correcto para entidades transaccionales.

### 3.4 Datos Huérfanos Potenciales
- `Abono.clienteId` → FK a Cliente pero la app podría crear abonos de clientes ya soft-deleted
- `PrecioHistorial.producto` → **String libre**, no FK a Producto. Si se renombra un producto, el historial queda desincronizado.

---

## Paso 4 — Seguridad (CRÍTICA)

### 4.1 Roles y Permisos 🔴 CRÍTICA
```sql
bambu | superuser: YES | create role: YES | create db: YES | login: YES
```
**Un solo rol. Es SUPERUSER. La aplicación se conecta como superuser.**

Esto es el equivalente a correr la app como `root`. Si hay SQL injection, el atacante tiene acceso total: borrar tablas, leer `pg_authid`, ejecutar comandos del sistema con `COPY ... PROGRAM`.

**Fix inmediato**:
```sql
CREATE ROLE app_read WITH LOGIN PASSWORD 'xxx';
CREATE ROLE app_write WITH LOGIN PASSWORD 'xxx';
GRANT CONNECT ON DATABASE bambu TO app_read, app_write;
GRANT USAGE ON SCHEMA public TO app_read, app_write;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_read;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_write;
-- Quitar superuser a bambu
ALTER ROLE bambu NOSUPERUSER;
```

### 4.2 Row Level Security
**No hay RLS en ninguna tabla.** Para single-tenant no es necesario. Si escala a multi-tenant, requerido.

### 4.3 Datos Sensibles
- `User.password` → almacena hash. No puedo verificar si es bcrypt/scrypt/argon2 desde el schema. La app usa NextAuth v5 con `CredentialsProvider` — asumiendo bcrypt.
- PII presente: `Cliente.nombre`, `Cliente.telefono`, `Cliente.direccion`, `Trabajador.telefono`, `Proveedor.email`. Sin cifrado a nivel columna.

### 4.4 Exposición
- Puerto `5433` bindeado a `127.0.0.1` ✅ (no expuesto a internet)
- Sin SSL/TLS forzado en dev. En Supabase (producción) se fuerza automáticamente.
- `pg_hba.conf`: no accesible desde el container (default trust para conexiones locales)

### 4.5 SQL Injection
No hay funciones dinámicas ni `EXECUTE` en la DB. El riesgo está en la capa de aplicación (Prisma queries raw). La tabla `Historial.datos` almacena JSON como String — posible vector si no se sanitiza.

---

## Paso 5 — Lógica en Base de Datos

- **0 funciones almacenadas** ✅ (toda la lógica en la app)
- **0 triggers** (los defaults de Prisma manejan `@default(now())` y `@updatedAt`)
- **0 vistas** — `reportes` y `dashboard` hacen queries Prisma directos desde Server Components
- `CierreDia` es una **tabla de snapshot manual** (la app inserta al cerrar el día)

---

## Paso 6 — Migraciones y Evolución

- Prisma Migrate ✅
- Hay tabla `_prisma_migrations` con historial
- **No hay migraciones reversibles** (Prisma no soporta `down`)
- Advertencia: `prisma db push` se usó en dev (puede causar drift vs migrations)

---

## Paso 7 — Backup, Recovery, HA

- **No hay evidencia de estrategia de backup.** El Docker volume `pgdata` no tiene snapshots automáticos.
- **No hay WAL archiving** configurado.
- **No hay réplicas.**
- En Supabase (producción): backups diarios automáticos + PITR de 7 días.

**RPO actual en dev**: último respaldo manual (si existe). **RTO**: tiempo de recrear el container.

---

## Paso 8 — Escalabilidad

- 23 tablas, schema limpio, 6 usuarios concurrentes → no hay cuellos de botella previsibles
- Tabla `Pedido` crecerá más rápido (~100-500/día = ~180k/año). Con índices actuales, sin problema hasta ~5M filas.
- Tabla `Historial` crecerá linealmente. Considerar particionar por mes si supera 10M filas.
- `cuid()` como PK no escala bien más allá de ~50M filas por fragmentación de índices. Cambiar a UUIDv7 o BIGINT IDENTITY antes de producción.

---

## Top 5 Acciones Inmediatas

| # | Acción | Riesgo | Esfuerzo |
|---|--------|--------|----------|
| 1 | **Crear roles dedicados** (`app_read`/`app_write`), quitar SUPERUSER | 🔴 Crítico | 1h |
| 2 | **Migrar todas las fechas a TIMESTAMPTZ** | 🟠 Alta | 4h |
| 3 | **Eliminar índice duplicado** `Factura_pedidoId_idx` | 🟡 Media | 5min |
| 4 | **Agregar CHECK constraints** (saldo >= 0, monto > 0, totalPagado <= total) | 🟠 Alta | 2h |
| 5 | **Configurar backups automáticos** (pg_dump cron + WAL archiving) | 🟠 Alta | 2h |

---

## Deuda Técnica

| Deuda | Riesgo | Esfuerzo | Prioridad |
|-------|--------|----------|-----------|
| 54 columnas TIMESTAMP sin TZ | Bugs de zona horaria en prod | 4h | Alta |
| 0 CHECK constraints | Datos inválidos sin rechazo | 2h | Alta |
| Superuser único rol | SQL injection = DB pérdida total | 1h | Crítica |
| 64 índices no verificados en prod | Bloat de escritura en tablas calientes | 2h | Media |
| `PrecioHistorial.producto` sin FK | Historial inconsistente | 30min | Baja |
| `Cliente.preciosEspeciales` String en vez de JSONB | Queries imposibles sobre JSON | 1h | Baja |
| `Trabajador.rol` String sin CHECK | Roles inválidos | 30min | Media |
| `CompraInsumo` nombre con mayúsculas | Inconsistencia naming | 15min | Baja |
| Sin estrategia de backup documentada | Pérdida de datos | 2h | Alta |
| Prisma `db push` usado en vez de `migrate dev` | Drift entre schema y migrations | 1h | Media |

---

## Queries de Diagnóstico

Para ejecutar periódicamente en producción:

```sql
-- 1. Tablas más grandes + bloat
SELECT relname, n_live_tup, n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- 2. Índices sin uso en los últimos N días
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes WHERE idx_scan = 0 ORDER BY pg_relation_size(indexrelid) DESC;

-- 3. Consultas lentas (requiere pg_stat_statements)
-- CREATE EXTENSION pg_stat_statements;
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

-- 4. Conexiones activas
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- 5. Locks bloqueantes
SELECT blocked_locks.pid AS blocked_pid, blocking_locks.pid AS blocking_pid,
  blocked_activity.query AS blocked_query, blocking_activity.query AS blocking_query
FROM pg_locks blocked_locks
JOIN pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- 6. Extensiones disponibles
SELECT * FROM pg_available_extensions ORDER BY name;
```

---

*Fin del reporte. Si el DB muere a las 3 AM, es por el punto #1 (superuser) o #2 (timestamptz).*
