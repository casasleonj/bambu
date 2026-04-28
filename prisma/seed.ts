import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Users
  const users = [
    { username: 'admin', password: await bcrypt.hash('admin123', 10), rol: 'ADMIN' },
    { username: 'asistente', password: await bcrypt.hash('asist123', 10), rol: 'ASISTENTE' },
    { username: 'contador', password: await bcrypt.hash('cont123', 10), rol: 'CONTADOR' },
  ]

  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {},
      create: user,
    })
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

  console.log('🎉 Seed complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
