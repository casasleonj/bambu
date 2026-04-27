import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Creando usuarios...')

  const usuarios = [
    { username: 'admin', password: 'admin123', rol: 'ADMIN' },
    { username: 'asistente', password: 'asist123', rol: 'ASISTENTE' },
    { username: 'contador', password: 'cont123', rol: 'CONTADOR' },
    { username: 'repartidor', password: 'rep123', rol: 'REPARTIDOR' },
    { username: 'sellador', password: 'sell123', rol: 'SELLADOR' },
  ]

  for (const usuario of usuarios) {
    const existing = await prisma.user.findUnique({
      where: { username: usuario.username },
    })
    
    if (existing) {
      console.log(`Actualizando ${usuario.username}...`)
      await prisma.user.update({
        where: { username: usuario.username },
        data: { password: usuario.password, rol: usuario.rol, activo: true },
      })
    } else {
      console.log(`Creando ${usuario.username}...`)
      await prisma.user.create({
        data: usuario,
      })
    }
  }

  // Verificar usuarios
  const users = await prisma.user.findMany()
  console.log('\nUsuarios en BD:')
  users.forEach(u => console.log(`  - ${u.username} (${u.rol})`))
  
  console.log('\n✅ Listo!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())