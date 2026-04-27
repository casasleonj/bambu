import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Usuarios
  const usuarios = [
    { username: 'admin', password: 'admin123', rol: 'ADMIN' },
    { username: 'asistente', password: 'asist123', rol: 'ASISTENTE' },
    { username: 'contador', password: 'cont123', rol: 'CONTADOR' },
    { username: 'repartidor', password: 'rep123', rol: 'REPARTIDOR' },
    { username: 'sellador', password: 'sell123', rol: 'SELLADOR' },
  ]

  for (const usuario of usuarios) {
    await prisma.user.upsert({
      where: { username: usuario.username },
      update: {},
      create: usuario,
    })
  }
  console.log('✅ Usuarios creados')

  // Productos
  const productos = [
    { productoId: 'P001', nombre: 'Agua 19L', unidad: 'paca', precioMin: 2300, precioMax: 3200, comXUnidad: 200, tipo: 'AGUA' },
    { productoId: 'P002', nombre: 'Hielo', unidad: 'paca', precioMin: 2500, precioMax: 2500, comXUnidad: 200, tipo: 'HIELO' },
    { productoId: 'P003', nombre: 'Botellón 20L', unidad: 'unidad', precioMin: 7500, precioMax: 7500, comXUnidad: 0, tipo: 'BOTELLON' },
    { productoId: 'P004', nombre: 'Bolsa Agua', unidad: 'unidad', precioMin: 300, precioMax: 300, comXUnidad: 0, tipo: 'BOLSA_AGUA' },
    { productoId: 'P005', nombre: 'Bolsa Hielo', unidad: 'unidad', precioMin: 500, precioMax: 500, comXUnidad: 0, tipo: 'BOLSA_HIELO' },
  ]

  for (const producto of productos) {
    await prisma.producto.upsert({
      where: { productoId: producto.productoId },
      update: {},
      create: producto,
    })
  }
  console.log('✅ Productos creados')

  // Trabajadores
  const trabajadores = [
    { trabajadorId: 'T001', nombre: 'Juan Pérez', rol: 'sellador', tipoPago: 'COMISION', comPacaAgua: 300, comPacaHielo: 300 },
    { trabajadorId: 'T002', nombre: 'Carlos García', rol: 'repartidor', tipoPago: 'COMISION', comPacaAgua: 200, comPacaHielo: 200 },
    { trabajadorId: 'T003', nombre: 'María López', rol: 'repartidor', tipoPago: 'FIJO', salarioFijo: 800000 },
  ]

  for (const trabajador of trabajadores) {
    await prisma.trabajador.upsert({
      where: { trabajadorId: trabajador.trabajadorId },
      update: {},
      create: trabajador,
    })
  }
  console.log('✅ Trabajadores creados')

  // Configuración
  const configs = [
    { clave: 'BASE_DIA', valor: '50000' },
    { clave: 'COM_SELLADOR', valor: '300' },
    { clave: 'COM_REPARTIDOR', valor: '200' },
    { clave: 'STOCK_INI_AGUA', valor: '50' },
    { clave: 'STOCK_INI_HIELO', valor: '30' },
    { clave: 'STOCK_INI_BOTELLON', valor: '20' },
  ]

  for (const config of configs) {
    await prisma.config.upsert({
      where: { clave: config.clave },
      update: {},
      create: config,
    })
  }
  console.log('✅ Configuraciones creadas')

  // Cliente de ejemplo
  await prisma.cliente.upsert({
    where: { clienteId: 'CL-0001' },
    update: {},
    create: {
      clienteId: 'CL-0001',
      nombre: 'María',
      apellido: 'López',
      telefono: '3001234567',
      nombreNegocio: 'Tienda María',
      barrio: 'Norte',
      direccion: 'Calle 123 #45-67',
      frecuencia: 'DIARIO',
    },
  })
  console.log('✅ Cliente de ejemplo creado')

  // Trabajador para embejar
  const sellador = await prisma.trabajador.findUnique({ where: { trabajadorId: 'T001' } })
  
  if (sellador) {
    // Producción de ejemplo
    await prisma.produccion.create({
      data: {
        turno: 'MANANA',
        trabajadorId: sellador.id,
        stockIniAgua: 50,
        stockIniHielo: 30,
        conteoAAgua: 40,
        conteoBAgua: 42,
        conteoAHielo: 25,
        conteoBHielo: 24,
        prodAgua: 41,
        prodHielo: 25,
      },
    })
    console.log('✅ Producción de ejemplo creada')
  }

  console.log('🎉 Seed completado!')
  console.log('')
  console.log('📋 Credenciales de prueba:')
  console.log('   admin / admin123 (ADMIN)')
  console.log('   asistente / asist123 (ASISTENTE)')
  console.log('   contador / cont123 (CONTADOR)')
  console.log('   repartidor / rep123 (REPARTIDOR)')
  console.log('   sellador / sell123 (SELLADOR)')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })