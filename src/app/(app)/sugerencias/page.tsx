import { requirePagePermission } from '@/lib/auth-guard'
import { SugerenciasClient } from './sugerencias-client'

export default async function SugerenciasLlamadasPage() {
  await requirePagePermission('view:reportes')
  return <SugerenciasClient />
}
