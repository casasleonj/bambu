// @tests integration setup — DB real, reset, helpers
// Para tests que tocan Prisma directamente. Usa la misma DB que la app
// (postgresql://app_write:...@localhost:5433/bambu). Antes de cada suite,
// limpia y siembra con prisma/clean.ts + prisma/seed-test.ts.
import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'
import { resolve } from 'path'
import { randomUUID } from 'crypto'

// Cliente Prisma compartido. Usar el de la app (@/lib/prisma) crea
// un ciclo (jsdom environment) en algunos tests, así que instanciamos
// el propio acá. Conexión lazy — solo abre cuando se usa.
export const testPrisma = new PrismaClient({
  log: ['error', 'warn'],
})

/**
 * Reset completo: trunca todas las tablas y siembra datos base.
 * Es LENTO (~2-3s) — llamar solo en beforeAll, no en beforeEach.
 */
export async function resetAndSeed(): Promise<void> {
  const root = resolve(__dirname, '../../../..')
  execSync('npx tsx prisma/clean.ts', { cwd: root, stdio: 'ignore' })
  execSync('npx tsx prisma/seed-test.ts', { cwd: root, stdio: 'ignore' })
}

/**
 * Factory de IDs únicos para no chocar con datos de tests anteriores.
 */
export function uniqueId(prefix = 'test'): string {
  return `${prefix}-${randomUUID()}`
}

/**
 * Helper para desconectar limpiamente.
 */
export async function disconnect(): Promise<void> {
  await testPrisma.$disconnect()
}

/**
 * Helper: crea un cliente de prueba y devuelve su ID.
 */
export async function createTestCliente(suffix: string) {
  return testPrisma.cliente.create({
    data: {
      nombre: `Test Cliente ${suffix}`,
      telefono: `3${Math.floor(Math.random() * 1e9).toString().padStart(9, '0')}`,
      direccion: `Calle Test ${suffix}`,
      barrio: 'Test',
      activo: true,
    },
  })
}

/**
 * Helper: trae el admin user (creado por seed-test).
 */
export async function getAdminUser() {
  const u = await testPrisma.user.findUnique({ where: { username: 'admin' } })
  if (!u) throw new Error('Admin user not found — ¿corriste seed-test?')
  return u
}

/**
 * Helper: trae el repartidor user.
 */
export async function getRepartidorUser() {
  const u = await testPrisma.user.findUnique({ where: { username: 'repartidor' } })
  if (!u) throw new Error('Repartidor user not found — ¿corriste seed-test?')
  return u
}

/**
 * Helper: trae un cliente seedeado (los 5 del seed-test tienen teléfono
 * específico, los creamos fresh).
 */
export async function getSeededCliente() {
  const c = await testPrisma.cliente.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!c) throw new Error('No cliente found — ¿corriste seed-test?')
  return c
}

/**
 * #688 — el servidor solo cierra un día con la base de caja de ESA fecha (Config `BASE_DIA_<fecha>`). Las pruebas que
 * cierran el día la registran con esto y mandan el mismo valor en `baseDia`.
 */
export async function registrarBaseDia(fecha: string, valor = 50000): Promise<number> {
  const clave = `BASE_DIA_${fecha}`
  await testPrisma.config.upsert({ where: { clave }, create: { clave, valor: String(valor) }, update: { valor: String(valor) } })
  return valor
}

/**
 * #616: ya nadie puede REGISTRAR una corrección de precio salvo un ADMIN (que la aplica en el acto). Las solicitudes PENDIENTE
 * que un ASISTENTE dejó antes del cambio siguen existiendo y las resuelve un ADMIN: esto crea una fila así, como la habría dejado el
 * flujo anterior, para probar esa resolución.
 */
export async function sembrarSolicitudPendiente(
  pedidoId: string,
  d: { precioNuevo: number; motivo: string; solicitadoPorId: string; producto?: string; offlineId?: string },
) {
  const producto = d.producto ?? 'PACA_AGUA'
  const item = await testPrisma.pedidoItem.findFirstOrThrow({ where: { pedidoId, producto } })
  const precioAnterior = Number(item.precio)
  return testPrisma.pedidoCorreccionPrecio.create({
    data: {
      pedidoId, producto, cantidad: item.cantPedido, precioAnterior, precioNuevo: d.precioNuevo,
      delta: (d.precioNuevo - precioAnterior) * item.cantPedido, precioRaro: d.precioNuevo < 2000,
      motivo: d.motivo, solicitadoPorId: d.solicitadoPorId, offlineId: d.offlineId ?? null,
    },
  })
}
