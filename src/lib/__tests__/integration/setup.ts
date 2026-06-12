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
