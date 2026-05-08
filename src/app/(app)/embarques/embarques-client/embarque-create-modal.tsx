import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import type { Trabajador, Ruta } from './types'

export function EmbarqueCreateModal({
  open,
  onClose,
  onCreated,
  trabajadores,
  rutas,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  trabajadores: Trabajador[]
  rutas: Ruta[]
}) {
  const [selectedTrabajadorId, setSelectedTrabajadorId] = useState('')
  const [selectedRutaId, setSelectedRutaId] = useState('')
  const [obs, setObs] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function createEmbarque() {
    if (!selectedTrabajadorId || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/embarques', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trabajadorId: selectedTrabajadorId,
          rutaId: selectedRutaId || undefined,
          obs,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSelectedTrabajadorId('')
        setSelectedRutaId('')
        setObs('')
        onClose()
        onCreated()
        toast.success('Embarque creado')
      } else {
        toast.error(data.error || 'Error creando embarque')
      }
    } catch {
      toast.error('Error creando embarque')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setSelectedTrabajadorId('')
    setSelectedRutaId('')
    setObs('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} className="bg-white rounded-xl p-6 w-full max-w-md">
      <h2 className="text-xl font-bold mb-4">Nuevo Embarque</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Repartidor
          </label>
          <select
            value={selectedTrabajadorId}
            onChange={(e) => {
              setSelectedTrabajadorId(e.target.value)
              const repartidorRuta = rutas.find(r => r.repartidorId === e.target.value)
              if (repartidorRuta) {
                setSelectedRutaId(repartidorRuta.id)
              }
            }}
            className="w-full p-2 border rounded-lg"
          >
            <option value="">Seleccionar...</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ruta (opcional)
          </label>
          <select
            value={selectedRutaId}
            onChange={(e) => setSelectedRutaId(e.target.value)}
            className="w-full p-2 border rounded-lg"
          >
            <option value="">Sin ruta</option>
            {rutas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
          {selectedTrabajadorId && !selectedRutaId && (
            <p className="text-xs text-yellow-600 mt-1">
              Sin ruta asignada. Los pedidos no se agruparán por territorio.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Observaciones
          </label>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            className="w-full p-2 border rounded-lg"
            rows={3}
          />
        </div>
      </div>
      {!selectedTrabajadorId && (
        <p className="text-sm text-amber-600 mt-2">Selecciona un repartidor para habilitar el registro</p>
      )}
      <div className="flex gap-3 mt-6">
        <button
          onClick={handleClose}
          className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          onClick={createEmbarque}
          disabled={!selectedTrabajadorId || submitting}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creando...' : 'Crear'}
        </button>
      </div>
    </Modal>
  )
}
