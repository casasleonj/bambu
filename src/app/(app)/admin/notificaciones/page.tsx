import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { NOTIFICATION_EVENT_META } from '@/lib/notifications/event-types'
import AdminNotificacionesClient from './admin-notificaciones-client'

export default async function AdminNotificacionesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { rol: true },
  })
  if (!user || user.rol !== 'ADMIN') redirect('/dashboard')

  const [rules, usuarios] = await Promise.all([
    prisma.notificationRule.findMany({
      include: { targetUsers: { select: { userId: true } } },
    }),
    prisma.user.findMany({
      where: { activo: true },
      select: { id: true, username: true, nombre: true, apellido: true, rol: true },
      orderBy: { username: 'asc' },
    }),
  ])

  return (
    <AdminNotificacionesClient
      initialRules={JSON.parse(JSON.stringify(rules))}
      usuarios={usuarios}
      eventMeta={NOTIFICATION_EVENT_META}
    />
  )
}
