import { prisma } from '@/lib/prisma'
import { analizarPatronesEntrega } from '@/lib/route-analysis'

/**
 * Información derivada de una ruta habitual (v4 §42): el sistema muestra qué sabe,
 * no le pide al usuario que lo reconstruya. Clientes/negocios asociados, barrios
 * observados, y — si la ruta tiene repartidor — los barrios donde ese repartidor
 * es dominante según el historial.
 */
export async function RutaResumen({ rutaId, repartidorId }: { rutaId: string; repartidorId: string | null }) {
  const [clientes, negocios, patrones] = await Promise.all([
    prisma.cliente.findMany({
      where: { rutaId, activo: true },
      select: { id: true, nombre: true, barrio: true },
      orderBy: { nombre: 'asc' },
      take: 200,
    }),
    prisma.negocio.findMany({
      where: { rutaId, activo: true },
      select: { id: true, nombre: true, barrio: true },
      orderBy: { nombre: 'asc' },
      take: 200,
    }),
    repartidorId ? analizarPatronesEntrega() : Promise.resolve(null),
  ])

  const barriosAsociados = [
    ...new Set([...clientes, ...negocios].map((x) => x.barrio?.trim()).filter(Boolean)),
  ] as string[]

  const barriosDelRepartidor = patrones
    ? patrones.barrios
        .filter((b) => b.repartidorSugerido?.trabajadorId === repartidorId && b.barrio !== 'SIN_BARRIO')
        .map((b) => ({ barrio: b.barrio, confianza: b.repartidorSugerido!.confianza }))
    : []

  const total = clientes.length + negocios.length

  return (
    <div className="mt-6 bg-white rounded-lg shadow-sm border p-6 space-y-4" data-testid="ruta-resumen">
      <div>
        <h2 className="text-lg font-semibold">Lo que el sistema sabe de esta ruta</h2>
        <p className="text-sm text-gray-500">
          Información derivada del historial y de las asociaciones existentes. No hace falta cargarla a mano.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-xl font-bold">{clientes.length}</div>
          <div className="text-xs text-gray-500">clientes asociados</div>
        </div>
        <div>
          <div className="text-xl font-bold">{negocios.length}</div>
          <div className="text-xs text-gray-500">negocios asociados</div>
        </div>
        <div>
          <div className="text-xl font-bold">{barriosAsociados.length}</div>
          <div className="text-xs text-gray-500">barrios cubiertos</div>
        </div>
      </div>

      {barriosAsociados.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Barrios de los clientes/negocios de esta ruta</p>
          <div className="flex flex-wrap gap-1">
            {barriosAsociados.map((b) => (
              <span key={b} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">{b}</span>
            ))}
          </div>
        </div>
      )}

      {barriosDelRepartidor.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">
            Barrios donde el repartidor de esta ruta es el que más entrega (historial)
          </p>
          <div className="flex flex-wrap gap-1">
            {barriosDelRepartidor.map((b) => (
              <span key={b.barrio} className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded">
                {b.barrio} · {b.confianza}%
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Son candidatos a asociar a esta ruta. El sistema los usa como señal aunque no estén asociados formalmente.
          </p>
        </div>
      )}

      {total === 0 && (
        <p className="text-sm text-gray-500">
          Todavía no hay clientes ni negocios asociados a esta ruta. El planificador igual la usa como señal por
          barrio y por el patrón del repartidor.
        </p>
      )}
    </div>
  )
}
