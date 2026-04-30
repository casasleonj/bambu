import { PrismaClient, RolUsuario } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SALT_ROUNDS = 12

function generateRandomPassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

async function main() {
  console.log('🌱 Seeding database...')

  const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

  // Users — use fixed passwords in dev/test, random in production
  const defaultPasswords: Record<string, string> = {
    admin: 'admin123',
    asistente: 'asist123',
    contador: 'cont123',
  }

  const users = [
    { username: 'admin', password: isDevOrTest ? defaultPasswords.admin : generateRandomPassword(), rol: RolUsuario.ADMIN },
    { username: 'asistente', password: isDevOrTest ? defaultPasswords.asistente : generateRandomPassword(), rol: RolUsuario.ASISTENTE },
    { username: 'contador', password: isDevOrTest ? defaultPasswords.contador : generateRandomPassword(), rol: RolUsuario.CONTADOR },
  ]

  for (const user of users) {
    const hashed = await bcrypt.hash(user.password, SALT_ROUNDS)
    await prisma.user.upsert({
      where: { username: user.username },
      update: isDevOrTest ? {} : { password: hashed },
      create: { ...user, password: hashed },
    })
  }

  // Log generated passwords in production so admin can copy them
  if (!isDevOrTest) {
    console.log('=== PRODUCTION CREDENTIALS (save these now) ===')
    users.forEach(u => console.log(`${u.username}: ${u.password}`))
    console.log('================================================')
  }
  console.log('✅ Users seeded')

  // Prices (skip if any already exist)
  const existingPrices = await prisma.precioHistorial.count()
  if (existingPrices === 0) {
    await prisma.precioHistorial.createMany({
      data: [
        { producto: 'AGUA_GALON', precio: 6500, creadoPor: 'admin' },
        { producto: 'HIELO_5KG', precio: 8000, creadoPor: 'admin' },
        { producto: 'BOTELLON_FABRICA', precio: 7500, creadoPor: 'admin' },
        { producto: 'BOTELLON_DOMICILIO', precio: 10000, creadoPor: 'admin' },
        { producto: 'BOLSA_AGUA', precio: 2500, creadoPor: 'admin' },
        { producto: 'BOLSA_HIELO', precio: 3000, creadoPor: 'admin' },
      ],
    })
    console.log('✅ Prices seeded')
  } else {
    console.log('⏭️ Prices already exist, skipping')
  }

  // Config
  await prisma.config.upsert({
    where: { clave: 'BASE_DIA' },
    update: {},
    create: { clave: 'BASE_DIA', valor: '100000' },
  })
  console.log('✅ Config seeded')

  // Products
  const productosData = [
    { codigo: 'PACA_AGUA', nombre: 'Paca de Agua (40u 300ml)', unidad: 'paca', contenido: '40 bolsas x 300ml' },
    { codigo: 'PACA_HIELO', nombre: 'Paca de Hielo (20u 600ml)', unidad: 'paca', contenido: '20 bolsas x 600ml' },
    { codigo: 'BOTELLON_FAB', nombre: 'Botellón Fábrica 20LT', unidad: 'unidad', contenido: '20 litros' },
    { codigo: 'BOTELLON_DOM', nombre: 'Botellón Domicilio 20LT', unidad: 'unidad', contenido: '20 litros' },
    { codigo: 'BOLSA_AGUA', nombre: 'Bolsa de Agua 300ml', unidad: 'unidad', contenido: '300ml' },
    { codigo: 'BOLSA_HIELO', nombre: 'Bolsa de Hielo 600ml', unidad: 'unidad', contenido: '600ml' },
  ]

  for (const prod of productosData) {
    await prisma.producto.upsert({
      where: { codigo: prod.codigo },
      update: {},
      create: prod,
    })
  }
  console.log('✅ Products seeded')

  // Volume prices
  const preciosData = [
    { codigo: 'PACA_AGUA', canal: 'PUNTO', cantMin: 1, cantMax: 4, precio: 2800 },
    { codigo: 'PACA_AGUA', canal: 'PUNTO', cantMin: 5, cantMax: 9, precio: 2500 },
    { codigo: 'PACA_AGUA', canal: 'PUNTO', cantMin: 10, cantMax: null, precio: 2300 },
    { codigo: 'PACA_AGUA', canal: 'DOMICILIO', cantMin: 1, cantMax: 4, precio: 3000 },
    { codigo: 'PACA_AGUA', canal: 'DOMICILIO', cantMin: 5, cantMax: 9, precio: 2500 },
    { codigo: 'PACA_AGUA', canal: 'DOMICILIO', cantMin: 10, cantMax: null, precio: 2300 },
    { codigo: 'PACA_HIELO', canal: 'PUNTO', cantMin: 1, cantMax: null, precio: 2500 },
    { codigo: 'PACA_HIELO', canal: 'DOMICILIO', cantMin: 1, cantMax: null, precio: 2500 },
    { codigo: 'BOTELLON_FAB', canal: 'PUNTO', cantMin: 1, cantMax: null, precio: 7500 },
    { codigo: 'BOTELLON_DOM', canal: 'DOMICILIO', cantMin: 1, cantMax: null, precio: 10000 },
    { codigo: 'BOLSA_AGUA', canal: 'PUNTO', cantMin: 1, cantMax: null, precio: 300 },
    { codigo: 'BOLSA_AGUA', canal: 'DOMICILIO', cantMin: 1, cantMax: null, precio: 300 },
    { codigo: 'BOLSA_HIELO', canal: 'PUNTO', cantMin: 1, cantMax: null, precio: 500 },
    { codigo: 'BOLSA_HIELO', canal: 'DOMICILIO', cantMin: 1, cantMax: null, precio: 500 },
  ]

  for (const p of preciosData) {
    const producto = await prisma.producto.findUnique({ where: { codigo: p.codigo } })
    if (!producto) continue
    await prisma.precioVolumen.upsert({
      where: { productoId_canal_cantMin: { productoId: producto.id, canal: p.canal, cantMin: p.cantMin } },
      update: { precio: p.precio, cantMax: p.cantMax },
      create: { productoId: producto.id, canal: p.canal, cantMin: p.cantMin, cantMax: p.cantMax, precio: p.precio },
    })
  }
  console.log('✅ Volume prices seeded')

  // Trabajador repartidor para embarques
  await prisma.trabajador.upsert({
    where: { id: 'TRABAJADOR_TEST' },
    update: {},
    create: {
      id: 'TRABAJADOR_TEST',
      nombre: 'Repartidor Test',
      rol: 'REPARTIDOR',
      tipoPago: 'COMISION',
      telefono: '3111111111',
      activo: true,
    },
  })
  console.log('✅ Trabajador repartidor seeded')

  // Cliente genérico para ventas rápidas de mostrador
  await prisma.cliente.upsert({
    where: { id: 'CLIENTE_MOSTRADOR' },
    update: {},
    create: {
      id: 'CLIENTE_MOSTRADOR',
      nombre: 'Mostrador',
      telefono: '0000000000',
      direccion: 'Punto de venta',
      barrio: 'N/A',
    },
  })
  console.log('Cliente Mostrador creado')

  console.log('🎉 Seed complete!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e instanceof Error ? e.message : 'Unknown')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
