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
        const backoffMs = 500 * (attempt + 1)
        console.log(`Lock contention on ${table}, retrying in ${backoffMs}ms (${attempt + 1}/${TRUNCATE_MAX_RETRIES})...`)
        await new Promise((r) => setTimeout(r, backoffMs))
        continue
      }
      console.log(`Skipped ${table}: ${e instanceof Error ? e.message : 'unknown'}`)
      return
    }
  }
}

async function clean() {
  // Orden: tablas hijas primero, luego padres. TRUNCATE CASCADE mitiga
  // dependencias circulares (p. ej. Cliente <-> Negocio).
  const tables = [
    'SesionActiva',
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