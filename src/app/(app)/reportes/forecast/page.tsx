import { requirePagePermission } from '@/lib/auth-guard'
import { ForecastClient } from './forecast-client'

export default async function ForecastPage() {
  await requirePagePermission('view:reportes')
  return <ForecastClient />
}
