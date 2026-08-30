import { PrismaPlanificadorRepository } from '@/modules/planificador/infrastructure/PrismaPlanificadorRepository'
import { serializePlan, resolverNombresPlan } from '@/modules/planificador/presentation/serialize-plan'
import { todayStringBogota } from '@/lib/dates'
import { HoyClient } from './rutas-client/hoy'
import type { PlanDia } from './rutas-client/plan-types'

/**
 * `/rutas` — pantalla "Hoy" del Planificador de Distribución (F5, v4 §37).
 * SSR: carga el plan vigente de hoy y lo pasa al cliente.
 */
export default async function RutasHoyPage() {
  const fecha = todayStringBogota()
  const repo = new PrismaPlanificadorRepository()
  const plan = await repo.obtenerVigentePorFecha(fecha)
  const planSerializado = plan
    ? (JSON.parse(JSON.stringify(serializePlan(plan, await resolverNombresPlan(plan)))) as PlanDia)
    : null

  return (
    <div className="max-w-3xl mx-auto">
      <HoyClient fecha={fecha} planInicial={planSerializado} />
    </div>
  )
}
