import { fetchCurrentDashboardData } from '@/modules/dashboard'
import { toLegacyDashboardData } from '@/modules/dashboard/presentation'
import { DashboardClient } from './dashboard-client'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { logger } from '@/lib/logger'

export const revalidate = 60

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userRole = (session.user as { role?: string } | undefined)?.role ?? null
  let data = null
  try {
    const dddData = await fetchCurrentDashboardData()
    data = JSON.parse(JSON.stringify(toLegacyDashboardData(dddData, userRole)))
  } catch (error) {
    logger.error({ err: error }, 'Dashboard sin lectura inicial disponible')
  }

  return (
    <>
      <DashboardClient data={data} userRole={userRole} />
    </>
  )
}
