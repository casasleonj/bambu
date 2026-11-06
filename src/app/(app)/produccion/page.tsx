import ProduccionClient from './produccion-client'
import { parseDateParam } from '@/lib/dates'
import { todayInBogota } from '@/lib/date-helpers'

export default async function ProduccionPage({ searchParams }: {
  searchParams: Promise<{ fecha?: string | string[] }>
}) {
  const params = await searchParams
  const fecha = parseDateParam(typeof params.fecha === 'string' ? params.fecha : undefined, todayInBogota())
  return <ProduccionClient key={fecha} initialFecha={fecha} />
}
