import { useState } from 'react'
import { Modal } from '@/components/modal'
import type { TrabajadorFormData } from './types'
import { rolOptions, rolLabels, tipoPagoOptions, tipoPagoLabels } from './types'

export function TrabajadorFormModal({
  open,
  onClose,
  onSaved,
  isEdit,
  editingId,
  initialData,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  isEdit: boolean
  editingId: string | null
  initialData: TrabajadorFormData
}) {
  const [formData, setFormData] = useState<TrabajadorFormData>(initialData)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      if (isEdit && editingId) {
        const res = await fetch(`/api/trabajadores/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (res.ok) {
          onSaved()
          onClose()
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error || 'Error al actualizar trabajador')
        }
      } else {
        const res = await fetch('/api/trabajadores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (res.ok) {
          onSaved()
          onClose()
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error || 'Error al crear trabajador')
        }
      }
    } catch {
      setFormError('Error de conexion al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">
        {isEdit ? 'Editar Trabajador' : 'Nuevo Trabajador'}
      </h2>
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="trabajador-nombre" className="block text-sm font-medium mb-1">Nombre *</label>
          <input
            id="trabajador-nombre"
            type="text"
            required
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="trabajador-rol" className="block text-sm font-medium mb-1">Rol *</label>
            <select
              id="trabajador-rol"
              required
              value={formData.rol}
              onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {rolOptions.map((r) => (
                <option key={r} value={r}>{rolLabels[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="trabajador-tipoPago" className="block text-sm font-medium mb-1">Tipo de pago</label>
            <select
              id="trabajador-tipoPago"
              value={formData.tipoPago}
              onChange={(e) => setFormData({ ...formData, tipoPago: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {tipoPagoOptions.map((tp) => (
                <option key={tp} value={tp}>{tipoPagoLabels[tp]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="usaMoto"
            type="checkbox"
            checked={formData.usaMoto}
            onChange={(e) => setFormData({ ...formData, usaMoto: e.target.checked })}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <label htmlFor="usaMoto" className="text-sm font-medium text-gray-700">
            Usa moto
          </label>
        </div>

        {formData.usaMoto && (
          <div>
            <label htmlFor="trabajador-capacidadKg" className="block text-sm font-medium mb-1">Capacidad moto (kg)</label>
            <input
              id="trabajador-capacidadKg"
              type="number"
              min={100}
              max={2000}
              value={formData.capacidadKg}
              onChange={(e) => {
                const v = parseInt(e.target.value)
                setFormData({ ...formData, capacidadKg: isNaN(v) ? 500 : v })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Peso maximo que puede cargar la motocarga</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="trabajador-comPacaAgua" className="block text-sm font-medium mb-1">Com. paca agua</label>
            <input
              id="trabajador-comPacaAgua"
              type="number"
              min={0}
              value={formData.comPacaAgua}
              onChange={(e) => setFormData({ ...formData, comPacaAgua: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="trabajador-comPacaHielo" className="block text-sm font-medium mb-1">Com. paca hielo</label>
            <input
              id="trabajador-comPacaHielo"
              type="number"
              min={0}
              value={formData.comPacaHielo}
              onChange={(e) => setFormData({ ...formData, comPacaHielo: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="trabajador-salarioFijo" className="block text-sm font-medium mb-1">Salario fijo</label>
            <input
              id="trabajador-salarioFijo"
              type="number"
              min={0}
              value={formData.salarioFijo}
              onChange={(e) => setFormData({ ...formData, salarioFijo: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="trabajador-telefono" className="block text-sm font-medium mb-1">Telefono</label>
            <input
              id="trabajador-telefono"
              type="text"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
