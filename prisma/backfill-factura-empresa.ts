import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BATCH_SIZE = 100

async function main() {
  console.log('🔧 Backfill: aplicando snapshot de empresa a facturas históricas sin datos...\n')

  const configs = await prisma.config.findMany({
    where: {
      clave: { in: ['empresa_nombre', 'empresa_nit', 'empresa_direccion', 'empresa_telefono', 'empresa_email'] },
    },
  })
  const map: Record<string, string> = {}
  configs.forEach(c => { map[c.clave] = c.valor })

  const snapshot = {
    empresaNombre: map.empresa_nombre || 'Agua Bambú SAS',
    empresaNit: map.empresa_nit || '900.123.456-7',
    empresaDireccion: map.empresa_direccion || '',
    empresaTelefono: map.empresa_telefono || '',
    empresaEmail: map.empresa_email || '',
  }

  let updated = 0
  let batch = 0

  while (true) {
    batch++
    const result = await prisma.factura.updateMany({
      where: { empresaNit: null },
      data: snapshot,
      limit: BATCH_SIZE,
    })

    if (result.count === 0) break
    updated += result.count
    console.log(`  Batch ${batch}: ${result.count} facturas actualizadas (total: ${updated})`)
  }

  console.log(`\n✅ Backfill completado: ${updated} facturas actualizadas con snapshot de empresa`)
}

main()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
