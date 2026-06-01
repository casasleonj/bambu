import { getTodayRange, getYesterdayRange } from '@/lib/dates'
import { fetchDashboardData } from '@/modules/dashboard'
import { toLegacyDashboardData } from '@/modules/dashboard/presentation'
import { DashboardClient } from './dashboard-client'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const revalidate = 60

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const today = getTodayRange()
  const yesterday = getYesterdayRange()

  const dddData = await fetchDashboardData(
    { start: today.startOfDay, end: today.endOfDay },
    { start: yesterday.startOfDay, end: yesterday.endOfDay },
  )

  // Adapt DDD shape to legacy DashboardClient shape
  const data = JSON.parse(JSON.stringify(toLegacyDashboardData(dddData)))

  return <DashboardClient data={data} />
}
