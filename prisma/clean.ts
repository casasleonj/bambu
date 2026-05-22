import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clean() {
  const tables = [
    'Abono',
    'CierreDia',
    'Produccion',
    'Pago',
    'Factura',
    'PedidoItem',
    'Pedido',
    'NotaCredito',
    'Embarque',
    'GpsTrack',
    'DescuentoRepartidor',
    'Cliente',
    'Trabajador',
    'User',
    'Config',
    'PrecioHistorial',
    'PrecioVolumen',
    'Producto',
    'Ruta',
    'PlantillaRecurrente',
    'Insumo',
    'Proveedor',
    'Gasto',
    'Nomina',
    'Caso',
    'CasoEvento',
  ]
  
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)
      console.log(`Cleaned ${table}`)
    } catch (e) {
      console.log(`Skipped ${table}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }
  console.log('Database cleaned')
}

clean()
  .catch(console.error)
  .finally(() => prisma.$disconnect())