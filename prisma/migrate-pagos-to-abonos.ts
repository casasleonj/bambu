/**
 * Migration script: Create Abono records for historical fiado payments.
 *
 * This script finds all Pago records that were created by the pagar-fiado endpoint
 * (i.e., payments where the pedido has saldo <= 0 and has a factura) and creates
 * corresponding Abono records for traceability.
 *
 * Usage: npx tsx prisma/migrate-pagos-to-abonos.ts
 */

import { PrismaClient } from '@prisma/client'
import { withAdvisoryLock } from '../src/lib/locks'
import { getNextNumero } from '../src/lib/sequence'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration: Pago → Abono for historical fiado payments...\n')

  // Find all pagos where the pedido has a factura and saldo <= 0
  const pagosFiados = await prisma.pago.findMany({
    where: {
      pedido: {
        saldo: { lte: 0 },
        factura: { isNot: null },
      },
    },
    include: {
      pedido: {
        include: {
          factura: true,
          cliente: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Found ${pagosFiados.length} fiado payments to migrate\n`)

  let created = 0
  let skipped = 0
  let errors = 0

  for (const pago of pagosFiados) {
    const pedido = pago.pedido
    if (!pedido.factura) {
      skipped++
      continue
    }

    try {
      // Check if abono already exists for this pago
      const existe = await prisma.abono.findFirst({
        where: {
          pedidoId: pago.pedidoId,
          facturaId: pedido.factura.id,
          monto: pago.monto,
        },
      })

      if (existe) {
        console.log(`  SKIP: Abono already exists for pedido ${pedido.numero}`)
        skipped++
        continue
      }

      // Create abono using advisory lock for sequential numbering
      await withAdvisoryLock('ABONO', async (tx) => {
        const nextNum = await getNextNumero(tx, { model: 'abono', field: 'numero' })
        await tx.abono.create({
          data: {
            numero: `ABO-${nextNum.toString().padStart(5, '0')}`,
            facturaId: pedido.factura!.id,
            clienteId: pedido.clienteId,
            pedidoId: pago.pedidoId,
            monto: pago.monto,
            metodoPago: pago.metodo,
          },
        })
      })

      console.log(`  OK: Created abono for pedido #${pedido.numero} ($${Number(pago.monto).toLocaleString()})`)
      created++
    } catch (err) {
      console.error(`  ERROR: Failed for pedido #${pedido.numero}: ${err}`)
      errors++
    }
  }

  console.log(`\nMigration complete:`)
  console.log(`  Created: ${created}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Errors:  ${errors}`)
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
