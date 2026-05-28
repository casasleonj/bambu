/**
 * Migration: Create Negocio records from existing Cliente data
 *
 * For each Cliente that has nombreNegocio populated:
 * 1. Create a Negocio record with all business-specific fields
 * 2. Set Cliente.negocioDefaultId to the new Negocio
 * 3. Update existing Pedido records to point to the Negocio
 * 4. Update existing PlantillaRecurrente to use negocioId
 * 5. Update existing Factura records to use negocioId
 *
 * SAFE: Does NOT delete any fields from Cliente. All legacy fields remain as fallback.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting Negocio migration...\n')

  // 1. Find all clientes with nombreNegocio
  const clientesConNegocio = await prisma.cliente.findMany({
    where: {
      nombreNegocio: { not: null },
    },
    include: {
      pedidos: true,
      plantillaRecurrente: true,
      facturas: true,
    },
  })

  console.log(`📋 Found ${clientesConNegocio.length} clientes with negocio data\n`)

  let negociosCreados = 0
  let pedidosActualizados = 0
  let plantillasActualizadas = 0
  let facturasActualizadas = 0
  let errores = 0

  for (const cliente of clientesConNegocio) {
    try {
      // Create Negocio from cliente's business fields
      const negocio = await prisma.negocio.create({
        data: {
          clienteId: cliente.id,
          nombre: cliente.nombreNegocio!,
          tipoNegocio: cliente.tipoNegocio,
          direccion: cliente.direccion,
          barrio: cliente.barrio,
          referencia: cliente.referencia,
          linkUbicacion: cliente.linkUbicacion,
          horaApertura: cliente.horaApertura,
          rutaId: cliente.rutaId,
          preciosEspeciales: cliente.preciosEspeciales,
          habAgua: cliente.habAgua,
          habHielo: cliente.habHielo,
          habBotellon: cliente.habBotellon,
          habBolsaAgua: cliente.habBolsaAgua,
          habBolsaHielo: cliente.habBolsaHielo,
          frecuencia: cliente.frecuencia !== 'NINGUNA' ? cliente.frecuencia : null,
          cadaNDias: cliente.cadaNDias,
          activo: cliente.activo,
        },
      })

      negociosCreados++

      // Set as default negocio for this cliente
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { negocioDefaultId: negocio.id },
      })

      // Update pedidos to point to this negocio
      if (cliente.pedidos.length > 0) {
        const result = await prisma.pedido.updateMany({
          where: {
            id: { in: cliente.pedidos.map((p) => p.id) },
          },
          data: { negocioId: negocio.id },
        })
        pedidosActualizados += result.count
      }

      // Update plantilla recurrente if exists
      if (cliente.plantillaRecurrente) {
        await prisma.plantillaRecurrente.update({
          where: { id: cliente.plantillaRecurrente.id },
          data: {
            negocioId: negocio.id,
            // Keep clienteId for backward compatibility during transition
          },
        })
        plantillasActualizadas++
      }

      // Update facturas to point to this negocio
      if (cliente.facturas.length > 0) {
        const result = await prisma.factura.updateMany({
          where: {
            id: { in: cliente.facturas.map((f) => f.id) },
          },
          data: { negocioId: negocio.id },
        })
        facturasActualizadas += result.count
      }

      console.log(
        `✅ ${cliente.nombre} ${cliente.apellido || ''} → "${negocio.nombre}" (${cliente.pedidos.length} pedidos, ${cliente.facturas.length} facturas)`,
      )
    } catch (error) {
      errores++
      console.error(
        `❌ Error migrating cliente ${cliente.id} (${cliente.nombre}):`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  // 2. Handle clientes WITHOUT nombreNegocio but with pedidos
  // These are residential clients - no negocio needed
  const clientesSinNegocio = await prisma.cliente.count({
    where: {
      nombreNegocio: null,
    },
  })
  console.log(`\n🏠 ${clientesSinNegocio} clientes without negocio (residential) — no action needed`)

  // 3. Summary
  console.log('\n📊 Migration Summary:')
  console.log(`   Negocios creados:       ${negociosCreados}`)
  console.log(`   Pedidos actualizados:   ${pedidosActualizados}`)
  console.log(`   Plantillas actualizadas: ${plantillasActualizadas}`)
  console.log(`   Facturas actualizadas:  ${facturasActualizadas}`)
  console.log(`   Errores:                ${errores}`)

  if (errores > 0) {
    console.log('\n⚠️  Some clientes failed to migrate. Check errors above.')
    process.exit(1)
  }

  console.log('\n✅ Migration completed successfully!')
  console.log('\n📝 Next steps:')
  console.log('   1. Verify data: Check that negocios were created correctly')
  console.log('   2. Test order creation with negocio selection')
  console.log('   3. Test auto-embarques with negocio.rutaId')
  console.log('   4. Test price resolution with negocio.preciosEspeciales')
}

main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
