'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'

interface Ruta {
  id: string
  nombre: string
  dias?: string
  activo: boolean
  repartidor?: { id: string; nombre: string }
  repartidorRespaldo?: { id: string; nombre: string }
  horarioInicio?: string
  horarioFin?: string
  _count?: { clientes: number; embarques: number }
}

export default function RutasPage() {
  const router = useRouter()
  const [rutas, setRutas] = useState<Ruta[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function fetchRutas() {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/rutas?all=true')
      const data = await res.json()
      setRutas(data.rutas || [])
    } catch (error) {
      console.error('Error fetching rutas:', error)
      setFetchError('No se pudieron cargar las rutas')
      toast.error('Error al cargar rutas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRutas()
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('Eliminar esta ruta?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/rutas?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Ruta eliminada')
        fetchRutas()
      } else {
        toast.error(data.error || 'Error al eliminar')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexión')
    } finally {
      setDeletingId(null)
    }
  }

  const rutasFiltradas = rutas.filter((r) =>
    r.nombre.toLowerCase().includes(search.toLowerCase()) ||
    r.repartidor?.nombre.toLowerCase().includes(search.toLowerCase())
  )

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900">{fetchError}</h3>
        <button
          onClick={fetchRutas}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          Reintentar
        </button>
      </div>
    )
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rutas</h1>
          <p className="text-gray-600">{rutas.length} rutas activas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/rutas/analisis')}
            className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition"
          >
            Análisis
          </button>
          <button
            onClick={() => router.push('/rutas/nuevo')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            + Nueva Ruta
          </button>
        </div>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Buscar ruta o repartidor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 pl-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <svg
          className="w-5 h-5 text-gray-400 absolute left-3 top-2.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rutasFiltradas.map((ruta) => (
          <div
            key={ruta.id}
            className="bg-white rounded-lg shadow-sm border hover:shadow-md transition p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg">{ruta.nombre}</h3>
                {ruta.dias && (
                  <p className="text-sm text-gray-600">{ruta.dias}</p>
                )}
              </div>
              <span
                className={`px-2 py-1 text-xs rounded ${
                  ruta.activo
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {ruta.activo ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              {ruta.repartidor && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Principal:</span>
                  <span className="font-medium">{ruta.repartidor.nombre}</span>
                </div>
              )}
              {ruta.repartidorRespaldo && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Respaldo:</span>
                  <span className="font-medium">
                    {ruta.repartidorRespaldo.nombre}
                  </span>
                </div>
              )}
              {ruta.horarioInicio && ruta.horarioFin && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Horario:</span>
                  <span>
                    {ruta.horarioInicio} - {ruta.horarioFin}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 mt-4 pt-3 border-t text-sm text-gray-600">
              <span>{ruta._count?.clientes || 0} clientes</span>
              <span>{ruta._count?.embarques || 0} embarques</span>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => router.push(`/rutas/${ruta.id}`)}
                className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(ruta.id)}
                disabled={deletingId === ruta.id}
                className="px-3 py-2 bg-red-50 text-red-600 rounded hover:bg-red-100 transition text-sm disabled:opacity-50"
              >
                {deletingId === ruta.id ? '...' : 'Eliminar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {rutasFiltradas.length === 0 && (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.553-.894L15 7m0 13V7" /></svg>}
          title={search ? 'No se encontraron rutas' : 'No hay rutas creadas'}
          description={search ? undefined : 'Usa el análisis para crear la primera'}
        />
      )}
    </div>
  )
}
