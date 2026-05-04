'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface BarrioAnalysis {
  barrio: string
  totalEntregas: number
  repartidores: Array<{
    trabajadorId: string
    nombre: string
    entregas: number
    porcentaje: number
  }>
  repartidorSugerido?: {
    trabajadorId: string
    nombre: string
    confianza: number
  }
  conflicto?: boolean
  conflictoDetalle?: string
}

interface RutaConflict {
  barrio: string
  repartidorActual: string
  repartidorInvadiendo: string
  entregasInvadiendo: number
  severidad: 'baja' | 'media' | 'alta'
}

interface Sugerencia {
  tipo: 'asignar' | 'unificar' | 'investigar'
  barrio: string
  mensaje: string
  datos: Record<string, unknown>
}

export default function RutasAnalisisPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [barrios, setBarrios] = useState<BarrioAnalysis[]>([])
  const [conflictos, setConflictos] = useState<RutaConflict[]>([])
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [_repartidores, setRepartidores] = useState<Array<{ id: string; nombre: string }>>([])
  const [barriosSinRuta, setBarriosSinRuta] = useState<string[]>([])

  async function cargarAnalisis() {
    setLoading(true)
    try {
      const res = await fetch('/api/rutas/analisis')
      const data = await res.json()
      if (data.success) {
        setBarrios(data.barrios || [])
        setConflictos(data.conflictos || [])
        setSugerencias(data.sugerencias || [])
        setRepartidores(data.repartidores || [])
        setBarriosSinRuta(data.barriosSinRuta || [])
      } else {
        toast.error(data.error || 'Error al cargar análisis')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarAnalisis()
  }, [])

  async function crearRutaDesdeSugerencia(
    nombre: string,
    repartidorId?: string
  ) {
    try {
      const res = await fetch('/api/rutas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          repartidorId,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Ruta ${nombre} creada`)
        router.push('/rutas')
      } else {
        toast.error(data.error || 'Error al crear ruta')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexión')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Análisis de Rutas</h1>
          <p className="text-gray-600">
            Patrones de entrega detectados en {barrios.length} barrios
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => cargarAnalisis()}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            Actualizar
          </button>
          <button
            onClick={() => router.push('/rutas')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Ver Rutas
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-3xl font-bold text-blue-600">{barrios.length}</div>
          <div className="text-sm text-gray-600">Barrios analizados</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-3xl font-bold text-red-600">{conflictos.length}</div>
          <div className="text-sm text-gray-600">Conflictos detectados</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-3xl font-bold text-yellow-600">{sugerencias.length}</div>
          <div className="text-sm text-gray-600">Sugerencias</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-3xl font-bold text-green-600">{barriosSinRuta.length}</div>
          <div className="text-sm text-gray-600">Barrios sin ruta</div>
        </div>
      </div>

      {/* Conflictos */}
      {conflictos.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-3">
            Conflictos de Territorio
          </h2>
          <div className="space-y-2">
            {conflictos.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-white p-3 rounded border"
              >
                <div>
                  <span className="font-medium">{c.barrio}</span>
                  <span className="text-gray-600 ml-2">
                    {c.repartidorInvadiendo} entregó {c.entregasInvadiendo} veces
                    (territorio de {c.repartidorActual})
                  </span>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    c.severidad === 'alta'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {c.severidad.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sugerencias */}
      {sugerencias.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-yellow-800 mb-3">
            Sugerencias de Asignación
          </h2>
          <div className="space-y-2">
            {sugerencias.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-white p-3 rounded border"
              >
                <div>
                  <span className="font-medium">{s.mensaje}</span>
                </div>
                <div className="flex gap-2">
                  {s.tipo === 'asignar' && (
                    <button
                      onClick={() =>
                        crearRutaDesdeSugerencia(
                          s.barrio,
                          s.datos?.repartidorId as string
                        )
                      }
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                    >
                      Crear Ruta
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barrios sin ruta */}
      {barriosSinRuta.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Barrios sin Asignar
          </h2>
          <div className="flex flex-wrap gap-2">
            {barriosSinRuta.map((barrio) => (
              <button
                key={barrio}
                onClick={() => crearRutaDesdeSugerencia(barrio)}
                className="px-3 py-1.5 bg-white border rounded-lg hover:border-blue-400 hover:text-blue-600 transition text-sm"
              >
                {barrio}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detalle por barrio */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Detalle por Barrio</h2>
        </div>
        <div className="divide-y">
          {barrios.map((b) => (
            <div key={b.barrio} className="p-4 hover:bg-gray-50 transition">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{b.barrio}</h3>
                    {b.conflicto && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                        Conflicto
                      </span>
                    )}
                    {b.repartidorSugerido && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                        {b.repartidorSugerido.confianza}% {b.repartidorSugerido.nombre}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {b.totalEntregas} entregas totales
                  </p>
                </div>
                <div className="text-right">
                  {b.repartidores.slice(0, 3).map((r) => (
                    <div key={r.trabajadorId} className="text-sm">
                      <span className="font-medium">{r.nombre}</span>
                      <span className="text-gray-500 ml-1">
                        {r.entregas} ({r.porcentaje}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {b.conflictoDetalle && (
                <p className="text-sm text-red-600 mt-2">{b.conflictoDetalle}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
