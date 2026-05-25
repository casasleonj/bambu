import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function LoginRedirectPage() {
  const session = await auth()

  if (!session?.user?.role) {
    redirect('/login')
  }

  const role = session.user.role as string

  const destination =
    role === 'REPARTIDOR' ? '/repartidor' :
    role === 'CONTADOR' ? '/reportes' :
    '/dashboard'

  redirect(destination)
}
