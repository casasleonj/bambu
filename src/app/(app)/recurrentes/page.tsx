import { leerCatalogoRecurrentes } from '@/lib/recurrentes-catalogo'
import { logger } from '@/lib/logger'
import type { Recurrente } from './recurrentes-client/types'
import RecurrentesClient from './recurrentes-client'

export default async function RecurrentesPage() {
  let initialRecurrentes: Recurrente[] | undefined
  let initialError: string | undefined
  try {
    initialRecurrentes = JSON.parse(JSON.stringify(await leerCatalogoRecurrentes({}))) as Recurrente[]
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'No se pudo consultar el catálogo de habituales')
    initialError = 'No se pudo consultar la lista de habituales.'
  }
  return <RecurrentesClient initialRecurrentes={initialRecurrentes} initialError={initialError} initialLeidoAt={initialRecurrentes ? new Date().toISOString() : undefined} />
}
