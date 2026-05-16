import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import CambiarContrasenaClient from './cambiar-contrasena-client'

export default async function CambiarContrasenaPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true, nombre: true, apellido: true },
  })
  if (!user) redirect('/login')
  if (!user.mustChangePassword) redirect('/dashboard')

  const displayName = `${user.nombre} ${user.apellido}`.trim() || session.user.name || 'Usuario'

  return <CambiarContrasenaClient displayName={displayName} />
}
