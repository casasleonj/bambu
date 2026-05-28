'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

export default function AbonoDeudaDialog({
  deudaId,
  onClose,
  onAbonado,
}: {
  deudaId: string
  onClose: () => void
  onAbonado: () => void
}) {
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [maxMonto, setMaxMonto] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function fetchDeuda() {
      try {
        const res = await fetch(`/api/deudas/${deudaId}`)
        if (!res.ok) throw new Error('Error cargando deuda')
        const data = await res.json()
        setMaxMonto(data.deuda.montoPendiente)
      } catch {
        toast.error('No se pudo cargar la deuda')
      } finally {
        setLoading(false)
      }
    }
    fetchDeuda()
  }, [deudaId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!monto || parseFloat(monto) <= 0) {
      toast.error('Ingresa un monto valido')
      return
    }
    if (parseFloat(monto) > maxMonto) {
      toast.error(`El abono no puede exceder ${formatCurrency(maxMonto)}`)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/deudas/${deudaId}/abonar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto: parseFloat(monto),
          nota: nota.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.message || 'Error registrando abono')
      }

      toast.success('Abono registrado exitosamente')
      onAbonado()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexion')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Registrar Abono</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="p-4 bg-amber-50 border-b border-amber-200">
          <p className="text-sm text-amber-700">
            Deuda pendiente: <span className="font-bold">{formatCurrency(maxMonto)}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto del Abono</label>
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0"
              min="0"
              max={maxMonto}
              step="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
            <textarea
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="Observacion..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
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
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {submitting ? 'Guardando...' : 'Registrar Abono'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
