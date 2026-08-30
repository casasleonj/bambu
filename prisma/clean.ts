import { Prisma, PrismaClient } from '@prisma/client'

// clean.ts es un script de mantenimiento/dev; usa DIRECT_URL (usuario con
// permisos de DDL) para poder hacer TRUNCATE CASCADE. Si no está definido,
// cae de forma segura a DATABASE_URL (puede fallar por permisos).
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
})

// FIX: lock-contention entre TRUNCATE y transacciones de la app en vuelo
// (ver AGENTS.md Known Issue #20 — "Mecanismo concreto de lock-contention").
// TRUNCATE requiere lock ACCESS EXCLUSIVE; si un test E2E deja una request
// (ej. POST /api/clientes, transacción Serializable) en vuelo cuando el
// siguiente spec dispara resetDatabase(), el TRUNCATE puede quedar
// bloqueado indefinidamente esperando ese lock (y bloquear a su vez nuevas
// transacciones detrás suyo en la cola de locks de Postgres), degenerando
// en la cascada de fallos "sin relación" documentada en el issue #25.
//
// SET LOCAL lock_timeout acota esa espera a un valor corto: si no consigue
// el lock a tiempo, Postgres cancela con SQLSTATE 55P03 (lock_not_available)
// en vez de colgar. Reintentamos un par de veces con backoff corto porque la
// transacción bloqueante real (ej. executeSerializableWithRetry) tiene su
// propio timeout de 15s (ver src/lib/serializable.ts) — casi siempre libera
// el lock sola dentro de esa ventana.
const TRUNCATE_LOCK_TIMEOUT_MS = 3_000
const TRUNCATE_MAX_RETRIES = 4

// FIX: causa raíz del lock-contention (no solo el síntoma). El lock_timeout
// de arriba acotaba la espera, pero seguía dependiendo del timeout propio
// (15s) de la transacción bloqueante para liberar el lock. Esto ataca la
// causa directamente: antes de truncar, mata cualquier conexión de OTRO
// backend sobre esta misma base que lleve "idle in transaction" o "active"
// más de 2s — el patrón exacto de una request de un test anterior (ej.
// POST /api/clientes con transacción Serializable) que quedó en vuelo sin
// cerrarse cuando el siguiente spec dispara resetDatabase(). Postgres hace
// rollback automático de lo que esa conexión tuviera abierto — no hay
// pérdida de datos reales porque esto solo corre contra la DB de test.
// Patrón estándar de CI (pg_terminate_backend sobre pg_stat_activity,
// excluyendo el propio backend vía pg_backend_pid()).
async function terminateStaleConnections(): Promise<void> {
  try {
    const terminated = await prisma.$queryRawUnsafe<{ pid: number; terminated: boolean }[]>(`
      SELECT pid, pg_terminate_backend(pid) AS terminated
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state IN ('idle in transaction', 'active')
        AND now() - state_change > interval '2 seconds'
    `)
    if (terminated.length > 0) {
      console.log(`Terminated ${terminated.length} stale connection(s): ${terminated.map((t) => t.pid).join(', ')}`)
    }
  } catch (e) {
    // No crítico: si esto falla (ej. permisos), el flujo de lock_timeout +
    // retry de abajo sigue funcionando como red de seguridad.
    console.log(`terminateStaleConnections error (non-fatal): ${e instanceof Error ? e.message : 'unknown'}`)
  }
}

function isLockTimeoutError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2010') {
    const meta = err.meta as { code?: string; message?: string } | undefined
    if (meta?.code === '55P03') return true
    if (typeof meta?.message === 'string' && /lock timeout/i.test(meta.message)) return true
  }
  return err instanceof Error && /lock timeout|55P03/i.test(err.message)
}

async function truncateWithRetry(table: string): Promise<void> {
  for (let attempt = 0; attempt < TRUNCATE_MAX_RETRIES; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${TRUNCATE_LOCK_TIMEOUT_MS}ms'`)
          await tx.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`)
        },
        { timeout: TRUNCATE_LOCK_TIMEOUT_MS + 5_000 },
      )
      console.log(`Cleaned ${table}`)
      return
    } catch (e) {
      if (isLockTimeoutError(e) && attempt < TRUNCATE_MAX_RETRIES - 1) {
        console.log(`Lock contention on ${table}, terminating stale connections and retrying (${attempt + 1}/${TRUNCATE_MAX_RETRIES})...`)
        await terminateStaleConnections()
        const backoffMs = 200 * (attempt + 1)
        await new Promise((r) => setTimeout(r, backoffMs))
        continue
      }
      console.log(`Skipped ${table}: ${e instanceof Error ? e.message : 'unknown'}`)
      return
    }
  }
}

async function clean() {
  // Mata cualquier conexión colgada de un spec anterior ANTES de arrancar
  // el loop — el caso más común documentado en AGENTS.md #20 es que la
  // contención ya existe al momento de llamar a clean.ts, no que aparezca
  // a mitad del loop.
  await terminateStaleConnections()

  // Orden: tablas hijas primero, luego padres. TRUNCATE CASCADE mitiga
  // dependencias circulares (p. ej. Cliente <-> Negocio).
  const tables = [
    'SesionActiva',
    // Planificador de distribución (hijas → padre; TRUNCATE CASCADE igual las cubre).
    'PlanActividad',
    'PlanParada',
    'PlanExcepcion',
    'PlanDiaVersion',
    'PlanGrupo',
    'PlanDia',
    'ImportStagingContacto',
    'ImportStagingRow',
    'CasoEvento',
    'AbonoDeuda',
    'DeduccionDeuda',
    'ContactoCliente',
    'Factura',
    'Negocio',
    'Pedido',
    'PlantillaProducto',
    'PlantillaRecurrente',
    'Caso',
    'EmbarqueProducto',
    'Gasto',
    'GpsTrack',
    'PedidoItem',
    'Pago',
    'NotaCredito',
    'Abono',
    'ProduccionItem',
    'PrecioVolumen',
    'CompraInsumo',
    'DescuentoRepartidor',
    'DeudaTrabajador',
    'Nomina',
    'Produccion',
    'Embarque',
    'Ruta',
    'Trabajador',
    'Cliente',
    'Proveedor',
    'Insumo',
    'Producto',
    'Config',
    'Historial',
    'PushSubscription',
    'CierreDia',
    'ImportBatch',
    'User',
  ]

  for (const table of tables) {
    await truncateWithRetry(table)
  }
  console.log('Database cleaned')
}

clean()
  .catch(console.error)
  .finally(() => prisma.$disconnect())