import { PrismaClient } from '@prisma/client'

// clean.ts es un script de mantenimiento/dev; usa DIRECT_URL (usuario con
// permisos de DDL) para poder hacer TRUNCATE CASCADE. Si no está definido,
// cae de forma segura a DATABASE_URL (puede fallar por permisos).
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
})

async function clean() {
  // Orden: tablas hijas primero, luego padres. TRUNCATE CASCADE mitiga
  // dependencias circulares (p. ej. Cliente <-> Negocio).
  const tables = [
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
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`)
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