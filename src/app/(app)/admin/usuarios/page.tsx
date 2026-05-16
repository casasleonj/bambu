import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import AdminUsuariosClient from './admin-usuarios-client'

export default async function AdminUsuariosPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { rol: true },
  })
  if (!user || user.rol !== 'ADMIN') redirect('/dashboard')

  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
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

  return <AdminUsuariosClient users={JSON.parse(JSON.stringify(users))} />
}
