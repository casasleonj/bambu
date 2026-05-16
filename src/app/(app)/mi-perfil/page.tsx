import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import MiPerfilClient from './mi-perfil-client'

export default async function MiPerfilPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      nombre: true,
      apellido: true,
      rol: true,
      activo: true,
      createdAt: true,
      trabajador: { select: { nombre: true } },
    },
  })
  if (!user) redirect('/login')

  return <MiPerfilClient user={JSON.parse(JSON.stringify(user))} />
}
