const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Insertando datos...')

  // Users
  const users = [
    { username: 'admin', password: 'admin123', rol: 'ADMIN' },
    { username: 'asistente', password: 'asistente123', rol: 'ASISTENTE' },
    { username: 'contador', password: 'contador123', rol: 'CONTADOR' },
    { username: 'repartidor', password: 'repartidor123', rol: 'REPARTIDOR' },
    { username: 'sellador', password: 'sellador123', rol: 'SELLADOR' },
  ]
  for (const u of users) {
    try { await prisma.user.create({ data: u }) } catch (e) {}
  }

  // Rutas
  const rutas = [
    { nombre: 'Norte', dias: 'LUN,MIE,VIE' },
    { nombre: 'Centro', dias: 'MAR,JUE,SAB' },
    { nombre: 'Sur', dias: 'LUN,MIE,VIE' },
  ]
  for (const r of rutas) {
    try { await prisma.ruta.create({ data: r }) } catch (e) {}
  }

  // Obtener IDs de rutas
  const rutasDb = await prisma.ruta.findMany({ select: { id: true } })
  
  // Clientes (usar IDs de rutas reales)
  const clientes = [
    { nombre: 'Juan Pérez', telefono: '3123456789', direccion: 'Cra 10 #5-20', barrio: 'Centro', precioAguaPref: 12000, frecuencia: 'SEMANAL', cadaNDias: 7, rutaId: rutasDb[0]?.id },
    { nombre: 'María López', telefono: '3123456790', direccion: 'Cra 15 #10-30', barrio: 'Norte', precioAguaPref: 12000, frecuencia: 'QUINCENAL', cadaNDias: 15, rutaId: rutasDb[0]?.id },
    { nombre: 'Pedro Gómez', telefono: '3123456791', direccion: 'Cra 20 #15-40', barrio: 'Sur', precioAguaPref: 12000, frecuencia: 'DIARIA', cadaNDias: 1, rutaId: rutasDb[1]?.id },
    { nombre: 'Ana Rodríguez', telefono: '3123456792', direccion: 'Cra 25 #20-50', barrio: 'Centro', precioAguaPref: 12000, frecuencia: 'NINGUNA' },
    { nombre: 'Carlos Mendoza', telefono: '3123456793', direccion: 'Cra 30 #25-60', barrio: 'Norte', precioAguaPref: 12000, frecuencia: 'DIARIA', cadaNDias: 1, rutaId: rutasDb[2]?.id },
  ]
  for (const c of clientes) {
    try { await prisma.cliente.create({ data: c }) } catch (e) { console.log('Error cliente:', e.message) }
  }

  // Trabajadores
  const trabajadores = [
    { nombre: 'Carlos Repo', rol: 'REPARTIDOR', tipoPago: 'COMISION', usaMoto: true, comPacaAgua: 200, comPacaHielo: 200, activo: true },
    { nombre: 'Ana Sell', rol: 'SELLADOR', tipoPago: 'COMISION', usaMoto: false, comPacaAgua: 200, comPacaHielo: 200, activo: true },
    { nombre: 'Pedro Admin', rol: 'ADMIN', tipoPago: 'SALARIO', usaMoto: false, comPacaAgua: 0, comPacaHielo: 0, salarioFijo: 1500000, activo: true },
  ]
  for (const t of trabajadores) {
    try { await prisma.trabajador.create({ data: t }) } catch (e) {}
  }

  // Config
  const configs = [
    { clave: 'BASE_DIA', valor: '40000' },
    { clave: 'COM_SELLADOR', valor: '300' },
    { clave: 'COM_REPARTIDOR', valor: '200' },
    { clave: 'PRECIO_AGUA', valor: '12000' },
    { clave: 'PRECIO_HIELO', valor: '5000' },
  ]
  for (const c of configs) {
    try { await prisma.config.create({ data: c }) } catch (e) {}
  }

  console.log('=== DATOS INSERTADOS ===')
  const usersCount = await prisma.user.count()
  const rutasCount = await prisma.ruta.count()
  const clientesCount = await prisma.cliente.count()
  const trabajadoresCount = await prisma.trabajador.count()
  const configCount = await prisma.config.count()
  
  console.log('Usuarios:', usersCount)
  console.log('Rutas:', rutasCount)
  console.log('Clientes:', clientesCount)
  console.log('Trabajadores:', trabajadoresCount)
  console.log('Config:', configCount)

  await prisma.$disconnect()
}

main().catch(console.error)