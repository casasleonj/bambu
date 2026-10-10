/**
 * Verificador de integridad (plan v1.2 §5.A), solo lectura.
 *
 * Uso:
 *   npx tsx scripts/verificar-integridad.ts          # tabla resumen + muestras
 *   npx tsx scripts/verificar-integridad.ts --json   # reporte completo en JSON
 *
 * Corre dentro de una transacción READ ONLY: no escribe nada. Sale con código
 * 1 si hay hallazgos CRÍTICOS.
 */

import { prisma } from '@/lib/prisma'
import { verificarIntegridad } from '@/lib/integridad/verificar'

const JSON_OUT = process.argv.includes('--json')

async function main() {
  const reporte = await verificarIntegridad(prisma, { maxMuestras: JSON_OUT ? 1000 : 5 })

  if (JSON_OUT) {
    console.log(JSON.stringify(reporte, null, 2))
  } else {
    console.table(reporte.reglas.map((r) => ({ id: r.id, severidad: r.severidad, cantidad: r.cantidad, regla: r.titulo })))
    for (const r of reporte.reglas.filter((x) => x.cantidad > 0)) {
      console.log(`\n${r.id} (${r.cantidad}):`)
      for (const h of r.hallazgos) console.log(`  ${h.numero ?? h.ref} ${JSON.stringify(h.detalle)}`)
    }
    console.log('\nResumen:', reporte.resumen)
  }

  if (reporte.resumen.CRITICA > 0) process.exitCode = 1
}

main()
  .catch((e: unknown) => {
    console.error('Error verificando integridad:', e instanceof Error ? e.message : e)
    process.exitCode = 2
  })
  .finally(() => prisma.$disconnect())
