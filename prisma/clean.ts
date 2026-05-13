import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function clean() {
  const tables = [
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
  ]
  
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`)
      console.log(`Truncated ${table}`)
    } catch (e) {
      console.log(`Skipped ${table}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }
  console.log('Database cleaned')
}

clean()
  .catch(console.error)
  .finally(() => prisma.$disconnect())