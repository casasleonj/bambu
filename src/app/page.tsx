import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (session.user.mustChangePassword) redirect('/cambiar-contrasena')
  redirect('/dashboard')
}
