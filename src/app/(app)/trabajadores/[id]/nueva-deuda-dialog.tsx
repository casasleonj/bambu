'use client'

import { useState } from 'react'
import { toast } from 'sonner'

const TIPOS = [
  { value: 'PRESTAMO', label: 'Prestamo' },
  { value: 'DEFICIT_EFECTIVO', label: 'Deficit de Efectivo' },
  { value: 'OTRO', label: 'Otro' },
]

export default function NuevaDeudaDialog({
  open,
  onClose,
  trabajadorId,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  trabajadorId: string
  onCreated: () => void
}) {
  const [tipo, setTipo] = useState('PRESTAMO')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!monto || parseFloat(monto) <= 0) {
      toast.error('Ingresa un monto valido')
      return
    }
    if (!descripcion.trim()) {
      toast.error('Ingresa una descripcion')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/deudas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trabajadorId,
          tipo,
          monto: parseFloat(monto),
          descripcion: descripcion.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.message || 'Error creando deuda')
      }

      toast.success('Deuda creada exitosamente')
      setMonto('')
      setDescripcion('')
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Nueva Deuda</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {TIPOS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0"
              min="0"
              step="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Motivo del prestamo o deuda..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Crear Deuda'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
