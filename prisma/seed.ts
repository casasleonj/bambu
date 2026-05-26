import { PrismaClient, RolUsuario } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const SALT_ROUNDS = 12

async function main() {
  console.log('🌱 Seeding database...')

  const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

  // ====================
  // Usuario admin
  // ====================
  const adminPassword = isDevOrTest ? 'admin123' : 'admin123'
  const hashedAdmin = await bcrypt.hash(adminPassword, SALT_ROUNDS)

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: isDevOrTest ? {} : { password: hashedAdmin },
    create: {
      username: 'admin',
      password: hashedAdmin,
      rol: RolUsuario.ADMIN,
      nombre: 'Administrador',
      apellido: 'Sistema',
      mustChangePassword: false,
    },
  })
  console.log('✅ Admin user seeded')

  // ====================
  // Additional users (dev/test only)
  // ====================
  if (isDevOrTest) {
    const otherUsers = [
      { username: 'asistente', password: 'asist123', rol: RolUsuario.ASISTENTE, nombre: 'Asistente', apellido: 'General' },
      { username: 'contador', password: 'cont123', rol: RolUsuario.CONTADOR, nombre: 'Contador', apellido: 'Principal' },
      { username: 'repartidor', password: 'rep123', rol: RolUsuario.REPARTIDOR, nombre: 'Repartidor', apellido: 'Movil' },
    ]
    for (const u of otherUsers) {
      const hashed = await bcrypt.hash(u.password, SALT_ROUNDS)
      await prisma.user.upsert({
        where: { username: u.username },
        update: {},
        create: { ...u, password: hashed, mustChangePassword: false },
      })
    }
    console.log('✅ Additional users seeded')
  }

  // ====================
  // Configs de empresa
  // ====================
  const configs = [
    { clave: 'BASE_DIA', valor: '100000' },
    { clave: 'DIAS_ALERTA_NO_VERIFICADO', valor: '30' },
    { clave: 'DIAS_VENCIMIENTO_PROMESA', valor: '2' },
    { clave: 'BLOQUEAR_PRECIOS_REPARTIDOR', valor: 'false' },
    { clave: 'MAX_PEDIDOS_DIA_ALERTA', valor: '2' },
    { clave: 'LIMITE_PEDIDOS_FIADOS_DEFAULT', valor: '3' },
    { clave: 'REQUIERE_FOTO_ENTREGA', valor: 'true' },
    { clave: 'empresa_nombre', valor: 'Agua Bambu SAS' },
    { clave: 'empresa_nit', valor: '900.123.456-7' },
    { clave: 'empresa_direccion', valor: 'Calle Principal #123, Bogotá' },
    { clave: 'empresa_telefono', valor: '311 123 4567' },
    { clave: 'empresa_email', valor: 'info@aguabambu.com' },
  ]

  for (const cfg of configs) {
    await prisma.config.upsert({
      where: { clave: cfg.clave },
      update: {},
      create: cfg,
    })
  }
  console.log('✅ Configs seeded')

  // ====================
  // Precios Historial
  // ====================
  const existingPrices = await prisma.precioHistorial.count()
  if (existingPrices === 0) {
    await prisma.precioHistorial.createMany({
      data: [
        { producto: 'AGUA_GALON', precio: 6500, creadoPor: 'admin' },
        { producto: 'HIELO_5KG', precio: 8000, creadoPor: 'admin' },
        { producto: 'BOTELLON', precio: 7500, creadoPor: 'admin' },
        { producto: 'BOLSA_AGUA', precio: 2500, creadoPor: 'admin' },
        { producto: 'BOLSA_HIELO', precio: 3000, creadoPor: 'admin' },
      ],
    })
    console.log('✅ Prices seeded')
  }

  // ====================
  // Productos
  // ====================
  const productosData = [
    { codigo: 'PACA_AGUA', nombre: 'Paca de Agua (40u 300ml)', unidad: 'paca', contenido: '40 bolsas x 300ml', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
    { codigo: 'PACA_HIELO', nombre: 'Paca de Hielo (20u 600ml)', unidad: 'paca', contenido: '20 bolsas x 600ml', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
    { codigo: 'BOTELLON', nombre: 'Botellón 20LT', unidad: 'unidad', contenido: '20 litros', aplicaDomicilio: true, sobreCostoDomicilio: 2500 },
    { codigo: 'BOLSA_AGUA', nombre: 'Bolsa de Agua 300ml', unidad: 'unidad', contenido: '300ml', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
    { codigo: 'BOLSA_HIELO', nombre: 'Bolsa de Hielo 600ml', unidad: 'unidad', contenido: '600ml', aplicaDomicilio: true, sobreCostoDomicilio: 0 },
  ]

  for (const prod of productosData) {
    await prisma.producto.upsert({
      where: { codigo: prod.codigo },
      update: {},
      create: prod,
    })
  }
  console.log('✅ Products seeded')

  // ====================
  // Precios por Volumen
  // ====================
  const preciosData = [
    { codigo: 'PACA_AGUA', cantMin: 1, cantMax: 4, precio: 2800 },
    { codigo: 'PACA_AGUA', cantMin: 5, cantMax: 9, precio: 2500 },
    { codigo: 'PACA_AGUA', cantMin: 10, cantMax: null, precio: 2300 },
    { codigo: 'PACA_HIELO', cantMin: 1, cantMax: null, precio: 2500 },
    { codigo: 'BOTELLON', cantMin: 1, cantMax: null, precio: 7500 },
    { codigo: 'BOLSA_AGUA', cantMin: 1, cantMax: null, precio: 300 },
    { codigo: 'BOLSA_HIELO', cantMin: 1, cantMax: null, precio: 500 },
  ]

  for (const p of preciosData) {
    const producto = await prisma.producto.findUnique({ where: { codigo: p.codigo } })
    if (!producto) continue
    await prisma.precioVolumen.upsert({
      where: { productoId_cantMin: { productoId: producto.id, cantMin: p.cantMin } },
      update: { precio: p.precio, cantMax: p.cantMax },
      create: { productoId: producto.id, cantMin: p.cantMin, cantMax: p.cantMax, precio: p.precio },
    })
  }
  console.log('✅ Volume prices seeded')

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
