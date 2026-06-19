/**
 * 09-realistic-day/clean-test-state.ts
 *
 * Limpia estado de la DB que puede romper los tests "realistic-day":
 * - CierreDia con fecha >= hoy (porque el modal de base caja detecta "gap"
 *   y redirige a /cierre?fecha=X si el último cierre no fue ayer)
 * - Config con clave BASE_DIA_* (porque queremos que el modal SI aparezca
 *   para probar el flujo de llenado)
 *
 * Uso: npx tsx e2e/qa-comprehensive/09-realistic-day/clean-test-state.ts
 *
 * Idempotente: corre múltiples veces sin error.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 1)

  // 1. Borrar cierres con fecha >= hoy (los del día actual o futuro)
  const cierresDeleted = await prisma.cierreDia.deleteMany({
    where: { fecha: { gte: today } },
  })

  // 1b. Borrar cierres de los últimos 7 días para que no haya gaps
  //     (el modal redirige si el último cierre no fue ayer)
  const recentDate = new Date()
  recentDate.setDate(recentDate.getDate() - 7)
  const recentCierresDeleted = await prisma.cierreDia.deleteMany({
    where: { fecha: { gte: recentDate, lt: today } },
  })

  // 2. Borrar cierres viejos (hace más de 30 días) para no acumular
  const oldDate = new Date()
  oldDate.setDate(oldDate.getDate() - 30)
  const oldCierresDeleted = await prisma.cierreDia.deleteMany({
    where: { fecha: { lt: oldDate } },
  })

  // 3. Borrar Config con clave BASE_DIA_YYYY-MM-DD (no BASE_DIA genérico,
  //    porque ese es el default de la app)
  const baseConfigDeleted = await prisma.config.deleteMany({
    where: {
      clave: { startsWith: 'BASE_DIA_' },
    },
  })

  // 4. Borrar embarques ABIERTOS/EN_RUTA de tests anteriores.
  //    El endpoint /api/embarques/[id]/cerrar requiere conciliación
  //    completa (pedidos, productos, etc) y falla con 400 si los pedidos
  //    ya están en estados raros. Es más simple y determinístico borrar
  //    directo desde la DB para los tests.
  const embarquesDeleted = await prisma.embarque.deleteMany({
    where: {
      estado: { in: ['ABIERTO', 'EN_RUTA'] },
    },
  })

  console.log(
    JSON.stringify({
      cierresHoyFuturo: cierresDeleted.count,
      cierresRecientes: recentCierresDeleted.count,
      cierresViejos: oldCierresDeleted.count,
      baseConfigDeleted: baseConfigDeleted.count,
      embarquesAbiertos: embarquesDeleted.count,
    })
  )
}

main()
  .catch((e) => {
    console.error('Error cleaning test state:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
