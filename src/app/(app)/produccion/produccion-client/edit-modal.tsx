'use client'

import { useState, useMemo } from 'react'
import { Modal } from '@/components/modal'
import { toast } from 'sonner'
import type { ProduccionRegistro } from './types'

interface ProduccionEditModalProps {
  open: boolean
  onClose: () => void
  registro: ProduccionRegistro | null
  onSaved: () => void
}

interface EditFormData {
  conteoAAgua: number
  conteoBAgua: number
  conteoAHielo: number
  conteoBHielo: number
  stockFinFisicoAgua: number
  stockFinFisicoHielo: number
  filtradasAgua: number
  filtradasHielo: number
  rotasAgua: number
  rotasHielo: number
  consumoInternoAgua: number
  consumoInternoHielo: number
  obs: string
}

function buildInitialForm(registro: ProduccionRegistro | null): EditFormData {
  if (!registro) {
    return {
      conteoAAgua: 0, conteoBAgua: 0, conteoAHielo: 0, conteoBHielo: 0,
      stockFinFisicoAgua: 0, stockFinFisicoHielo: 0,
      filtradasAgua: 0, filtradasHielo: 0,
      rotasAgua: 0, rotasHielo: 0,
      consumoInternoAgua: 0, consumoInternoHielo: 0,
      obs: '',
    }
  }
  const agua = registro.items.find(i => i.producto === 'PACA_AGUA')
  const hielo = registro.items.find(i => i.producto === 'PACA_HIELO')
  return {
    conteoAAgua: agua?.conteoA ?? 0,
    conteoBAgua: agua?.conteoB ?? 0,
    conteoAHielo: hielo?.conteoA ?? 0,
    conteoBHielo: hielo?.conteoB ?? 0,
    stockFinFisicoAgua: agua?.stockFinFisico ?? 0,
    stockFinFisicoHielo: hielo?.stockFinFisico ?? 0,
    filtradasAgua: agua?.filtradas ?? 0,
    filtradasHielo: hielo?.filtradas ?? 0,
    rotasAgua: agua?.rotas ?? 0,
    rotasHielo: hielo?.rotas ?? 0,
    consumoInternoAgua: agua?.consumoInterno ?? 0,
    consumoInternoHielo: hielo?.consumoInterno ?? 0,
    obs: registro.obs ?? '',
  }
}

export function ProduccionEditModal({ open, onClose, registro, onSaved }: ProduccionEditModalProps) {
  const [formData, setFormData] = useState<EditFormData>(() => buildInitialForm(registro))
  const [submitting, setSubmitting] = useState(false)

  // Reset form when registro changes
  if (open && registro && formData.obs !== (registro.obs ?? '')) {
    // Simple heuristic; in practice we use key prop from parent
  }

  const agua = useMemo(() => registro?.items.find(i => i.producto === 'PACA_AGUA'), [registro])
  const hielo = useMemo(() => registro?.items.find(i => i.producto === 'PACA_HIELO'), [registro])

  const prodAgua = useMemo(() => Math.round((formData.conteoAAgua + formData.conteoBAgua) / 2), [formData.conteoAAgua, formData.conteoBAgua])
  const prodHielo = useMemo(() => Math.round((formData.conteoAHielo + formData.conteoBHielo) / 2), [formData.conteoAHielo, formData.conteoBHielo])

  const stockFinEsperadoAgua = useMemo(() => (agua?.stockIni ?? 0) + prodAgua - (agua?.ventas ?? 0), [agua, prodAgua])
  const stockFinEsperadoHielo = useMemo(() => (hielo?.stockIni ?? 0) + prodHielo - (hielo?.ventas ?? 0), [hielo, prodHielo])

  const perdidasAgua = useMemo(() => formData.rotasAgua + formData.filtradasAgua + formData.consumoInternoAgua, [formData])
  const perdidasHielo = useMemo(() => formData.rotasHielo + formData.filtradasHielo + formData.consumoInternoHielo, [formData])

  const diferenciaAgua = useMemo(() => stockFinEsperadoAgua - formData.stockFinFisicoAgua - perdidasAgua, [stockFinEsperadoAgua, formData.stockFinFisicoAgua, perdidasAgua])
  const diferenciaHielo = useMemo(() => stockFinEsperadoHielo - formData.stockFinFisicoHielo - perdidasHielo, [stockFinEsperadoHielo, formData.stockFinFisicoHielo, perdidasHielo])

  const hayDiferencia = diferenciaAgua !== 0 || diferenciaHielo !== 0

  const handleSubmit = async () => {
    if (!registro) return
    if (hayDiferencia && !formData.obs.trim()) {
      toast.error('Si hay diferencia de stock debés explicar la causa en observaciones')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/produccion/${registro.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          obs: formData.obs,
          items: [
            {
              producto: 'PACA_AGUA',
              conteoA: formData.conteoAAgua,
              conteoB: formData.conteoBAgua,
              stockFinFisico: formData.stockFinFisicoAgua,
              filtradas: formData.filtradasAgua,
              rotas: formData.rotasAgua,
              consumoInterno: formData.consumoInternoAgua,
            },
            {
              producto: 'PACA_HIELO',
              conteoA: formData.conteoAHielo,
              conteoB: formData.conteoBHielo,
              stockFinFisico: formData.stockFinFisicoHielo,
              filtradas: formData.filtradasHielo,
              rotas: formData.rotasHielo,
              consumoInterno: formData.consumoInternoHielo,
            },
          ],
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Producción actualizada correctamente')
        onSaved()
        onClose()
      } else {
        toast.error(data.error?.message || 'Error al actualizar')
      }
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setSubmitting(false)
    }
  }

  const numberField = (label: string, value: number, onChange: (v: number) => void) => (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        min="0"
        value={value || ''}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={`Editar producción — ${registro?.trabajador.nombre} (${registro?.turno})`}>
      <div className="space-y-6 max-h-[80vh] overflow-y-auto p-1">
        <p className="text-sm text-gray-500">
          Solo se puede editar la producción del día actual. El sistema recalculará automáticamente las diferencias y comisiones.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
            <h3 className="font-semibold text-blue-800 mb-3">💧 Agua</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {numberField('Conteo A', formData.conteoAAgua, (v) => setFormData({ ...formData, conteoAAgua: v }))}
              {numberField('Conteo B', formData.conteoBAgua, (v) => setFormData({ ...formData, conteoBAgua: v }))}
            </div>
            <p className="text-sm text-gray-600 mb-3">Producido: <span className="font-bold text-blue-700">{prodAgua}</span></p>
            {numberField('Stock físico', formData.stockFinFisicoAgua, (v) => setFormData({ ...formData, stockFinFisicoAgua: v }))}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {numberField('Rotas', formData.rotasAgua, (v) => setFormData({ ...formData, rotasAgua: v }))}
              {numberField('Filtradas', formData.filtradasAgua, (v) => setFormData({ ...formData, filtradasAgua: v }))}
              {numberField('Consumo', formData.consumoInternoAgua, (v) => setFormData({ ...formData, consumoInternoAgua: v }))}
            </div>
          </div>

          <div className="bg-cyan-50 border border-cyan-100 p-4 rounded-xl">
            <h3 className="font-semibold text-cyan-800 mb-3">🧊 Hielo</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {numberField('Conteo A', formData.conteoAHielo, (v) => setFormData({ ...formData, conteoAHielo: v }))}
              {numberField('Conteo B', formData.conteoBHielo, (v) => setFormData({ ...formData, conteoBHielo: v }))}
            </div>
            <p className="text-sm text-gray-600 mb-3">Producido: <span className="font-bold text-cyan-700">{prodHielo}</span></p>
            {numberField('Stock físico', formData.stockFinFisicoHielo, (v) => setFormData({ ...formData, stockFinFisicoHielo: v }))}
            <div className="grid grid-cols-3 gap-2 mt-3">
              {numberField('Rotas', formData.rotasHielo, (v) => setFormData({ ...formData, rotasHielo: v }))}
              {numberField('Filtradas', formData.filtradasHielo, (v) => setFormData({ ...formData, filtradasHielo: v }))}
              {numberField('Consumo', formData.consumoInternoHielo, (v) => setFormData({ ...formData, consumoInternoHielo: v }))}
            </div>
          </div>
        </div>

        {(diferenciaAgua !== 0 || diferenciaHielo !== 0) && (
          <div className={`p-4 rounded-lg text-sm border ${diferenciaAgua < 0 || diferenciaHielo < 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className={`font-semibold ${diferenciaAgua < 0 || diferenciaHielo < 0 ? 'text-red-700' : 'text-amber-700'}`}>
              Diferencia detectada: Agua {diferenciaAgua > 0 ? `-${diferenciaAgua}` : diferenciaAgua < 0 ? `+${Math.abs(diferenciaAgua)}` : '0'} · Hielo {diferenciaHielo > 0 ? `-${diferenciaHielo}` : diferenciaHielo < 0 ? `+${Math.abs(diferenciaHielo)}` : '0'}
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {hayDiferencia ? 'Explicar diferencia *' : 'Observaciones'}
          </label>
          <textarea
            value={formData.obs}
            onChange={(e) => setFormData({ ...formData, obs: e.target.value })}
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500"
            rows={3}
            placeholder={hayDiferencia ? 'Explicá la causa de la diferencia...' : 'Observaciones opcionales...'}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
