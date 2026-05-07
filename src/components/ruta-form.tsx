'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { RutaFormData, RutaFormProps } from './ruta-form-types'
import { DIAS_SEMANA } from './ruta-form-types'

export { type RutaFormData, type RutaFormProps } from './ruta-form-types'

export default function RutaForm({ initialData, rutaId, onSuccess }: RutaFormProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [repartidores, setRepartidores] = useState<Array<{ id: string; nombre: string }>>([])
  const [formData, setFormData] = useState<RutaFormData>({
    nombre: initialData?.nombre || '',
    dias: initialData?.dias || '',
    repartidorId: initialData?.repartidorId || '',
    repartidorRespaldoId: initialData?.repartidorRespaldoId || '',
    horarioInicio: initialData?.horarioInicio || '06:00',
    horarioFin: initialData?.horarioFin || '14:00',
  })

  useEffect(() => {
    async function fetchRepartidores() {
      try {
        const res = await fetch('/api/trabajadores?rol=REPARTIDOR&activo=true')
        const data = await res.json()
        setRepartidores(data.trabajadores || [])
      } catch (error) {
        console.error('Error fetching repartidores:', error)
      }
    }
    fetchRepartidores()
  }, [])

  function toggleDia(dia: string) {
    const diasArray = formData.dias ? formData.dias.split(',') : []
    if (diasArray.includes(dia)) {
      setFormData({
        ...formData,
        dias: diasArray.filter((d) => d !== dia).join(','),
      })
    } else {
      setFormData({
        ...formData,
        dias: [...diasArray, dia].join(','),
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const url = rutaId ? `/api/rutas?id=${rutaId}` : '/api/rutas'
      const method = rutaId ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(rutaId ? 'Ruta actualizada' : 'Ruta creada')
        if (onSuccess) {
          onSuccess()
        } else {
          router.push('/rutas')
        }
      } else {
        toast.error(data.error || 'Error al guardar')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="ruta-nombre" className="block text-sm font-medium text-gray-700 mb-1">
          Nombre de la ruta
        </label>
        <input
          id="ruta-nombre"
          type="text"
          required
          value={formData.nombre}
          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
          placeholder="Ej: Barrio Norte"
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div>
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">
          Días de entrega
        </legend>
        <div className="flex gap-2 flex-wrap">
          {DIAS_SEMANA.map((dia) => {
            const isSelected = formData.dias?.includes(dia.key)
            return (
              <button
                key={dia.key}
                type="button"
                onClick={() => toggleDia(dia.key)}
                aria-pressed={isSelected}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {dia.label}
              </button>
            )
          })}
        </div>
      </fieldset>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ruta-repartidor" className="block text-sm font-medium text-gray-700 mb-1">
            Repartidor principal
          </label>
          <select
            id="ruta-repartidor"
            value={formData.repartidorId}
            onChange={(e) =>
              setFormData({ ...formData, repartidorId: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Sin asignar</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="ruta-respaldo" className="block text-sm font-medium text-gray-700 mb-1">
            Repartidor de respaldo
          </label>
          <select
            id="ruta-respaldo"
            value={formData.repartidorRespaldoId}
            onChange={(e) =>
              setFormData({ ...formData, repartidorRespaldoId: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Sin asignar</option>
            {repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="ruta-hora-inicio" className="block text-sm font-medium text-gray-700 mb-1">
            Hora inicio
          </label>
          <input
            id="ruta-hora-inicio"
            type="time"
            value={formData.horarioInicio}
            onChange={(e) =>
              setFormData({ ...formData, horarioInicio: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label htmlFor="ruta-hora-fin" className="block text-sm font-medium text-gray-700 mb-1">
            Hora fin
          </label>
          <input
            id="ruta-hora-fin"
            type="time"
            value={formData.horarioFin}
            onChange={(e) =>
              setFormData({ ...formData, horarioFin: e.target.value })
            }
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
        >
          {submitting ? 'Guardando...' : rutaId ? 'Actualizar Ruta' : 'Crear Ruta'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/rutas')}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
