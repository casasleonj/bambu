'use client'

import type { CalidadDatos } from './types'

const REC: Record<CalidadDatos['recomendacion'], { txt: string; cls: string }> = {
  OK: { txt: 'La base geográfica alcanza para planificar.', cls: 'bg-green-50 border-green-200 text-green-800' },
  BACKFILL_SUGERIDO: {
    txt: 'Conviene correr el backfill de coordenadas para mejorar la precisión del plan.',
    cls: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  BACKFILL_NECESARIO: {
    txt: 'El planificador va a generar muchas excepciones. Correr el backfill de coordenadas antes de usar el plan en serio: scripts/backfill-coords-clientes.ts',
    cls: 'bg-red-50 border-red-200 text-red-800',
  },
}

function Bar({ label, value, total, pct }: { label: string; value: number; total: number; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{value}/{total} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded mt-1 overflow-hidden">
        <div
          className={`h-full ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

export function CalidadDatosPanel({ d }: { d: CalidadDatos }) {
  const rec = REC[d.recomendacion]
  return (
    <section className="bg-white rounded-lg shadow-sm border overflow-hidden" data-testid="calidad-datos">
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">Calidad de datos geográficos</h2>
        <p className="text-sm text-gray-500">Qué tan lista está la base para que el sistema planifique solo</p>
      </div>

      <div className={`mx-6 my-4 rounded-lg border p-3 text-sm ${rec.cls}`}>{rec.txt}</div>

      <div className="px-6 pb-5 space-y-3">
        <Bar label="Clientes con coordenadas" value={d.conCoords} total={d.clientesActivos} pct={d.pctCoords} />
        <Bar label="Clientes con barrio" value={d.conBarrio} total={d.clientesActivos} pct={d.pctBarrio} />
        <Bar
          label="Demanda real (60 días) con coordenadas efectivas"
          value={d.demanda60d.conCoordsEfectivas}
          total={d.demanda60d.pedidos}
          pct={d.demanda60d.pctCoords}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-sm">
          <Stat label="Sin geo útil" value={d.sinGeoUtil} warn={d.sinGeoUtil > 0} />
          <Stat label="Con link de Maps" value={d.conLinkUbicacion} hint="recuperables con backfill" />
          <Stat label="Con ruta habitual" value={d.conRuta} warn={d.conRuta === 0} />
          <Stat label="Barrios distintos" value={d.barriosDistintos} />
          <Stat label="Negocios con coords" value={`${d.negociosConCoords}/${d.negociosActivos}`} />
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value, warn, hint }: { label: string; value: number | string; warn?: boolean; hint?: string }) {
  return (
    <div>
      <div className={`text-xl font-bold ${warn ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}{hint && <span className="block text-gray-400">{hint}</span>}</div>
    </div>
  )
}
