'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { StockInicial, FormData, TrabajadorOption } from './types'

const EMPTY_FORM: FormData = {
  trabajadorId: '',
  turno: 'MANANA',
  conteoAAgua: 0,
  conteoBAgua: 0,
  conteoAHielo: 0,
  conteoBHielo: 0,
  obs: '',
}

export default function ProduccionClient() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [stockInicial, setStockInicial] = useState<StockInicial>({ stockIniAgua: 0, stockIniHielo: 0 })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [trabajadores, setTrabajadores] = useState<TrabajadorOption[]>([])
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)

  const selectedTrabajador = trabajadores.find(t => t.id === formData.trabajadorId)

  const fetchTrabajadores = async () => {
    try {
      const res = await fetch('/api/trabajadores')
      const data = await res.json()
      setTrabajadores(data.trabajadores || [])
    } catch {
      toast.error('Error cargando trabajadores')
    }
  }

  const fetchStockInicial = async () => {
    try {
      const res = await fetch('/api/cierre-dia')
      const data = await res.json()
      if (data.ultimoCierre) {
        setStockInicial({
          stockIniAgua: data.ultimoCierre.stockFinAgua,
          stockIniHielo: data.ultimoCierre.stockFinHielo,
        })
      }
    } catch {
      toast.error('Error cargando stock inicial')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStockInicial()
    fetchTrabajadores()
  }, [])

  const prodAgua = Math.round((formData.conteoAAgua + formData.conteoBAgua) / 2)
  const prodHielo = Math.round((formData.conteoAHielo + formData.conteoBHielo) / 2)
  const stockFinAgua = stockInicial.stockIniAgua + prodAgua
  const stockFinHielo = stockInicial.stockIniHielo + prodHielo
  const comAgua = prodAgua * (selectedTrabajador?.comPacaAgua || 200)
  const comHielo = prodHielo * (selectedTrabajador?.comPacaHielo || 200)
  const comisionTotal = comAgua + comHielo

  const handleSubmit = async () => {
    if (!formData.trabajadorId) {
      toast.error('Selecciona un trabajador')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/produccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        toast.success('Produccion registrada correctamente')
        router.refresh()
        setStep(1)
        setFormData(EMPTY_FORM)
      }
    } catch {
      toast.error('Error al registrar')
    } finally {
      setSubmitting(false)
    }
  }

  const renderStepper = () => (
    <div className="flex items-center justify-center mb-8">
      {['Stock Inicial', 'Conteos', 'Confirmar'].map((label, idx) => (
        <div key={idx} className="flex items-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
            step > idx + 1 ? 'bg-green-600 text-white' : step === idx + 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            {step > idx + 1 ? '✓' : idx + 1}
          </div>
          <span className={`ml-2 text-sm ${step >= idx + 1 ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
          {idx < 2 && <div className={`w-16 h-1 mx-2 ${step > idx + 1 ? 'bg-green-600' : 'bg-gray-200'}`} />}
        </div>
      ))}
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Registro de Produccion</h1>
      <p className="text-gray-500 mb-6">Control de produccion diaria</p>
      {renderStepper()}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">Stock Inicial del Dia</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Agua</p>
              <p className="text-3xl font-bold text-blue-600">{stockInicial.stockIniAgua}</p>
              <p className="text-xs text-gray-500">unidades</p>
            </div>
            <div className="bg-cyan-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Hielo</p>
              <p className="text-3xl font-bold text-cyan-600">{stockInicial.stockIniHielo}</p>
              <p className="text-xs text-gray-500">unidades</p>
            </div>
          </div>
          <button onClick={() => setStep(2)} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700">Siguiente →</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">Registro de Conteos</h2>
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-3">Agua</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Conteo A</label>
                <input type="number" min="0" value={formData.conteoAAgua || ''}
                  onChange={(e) => setFormData({ ...formData, conteoAAgua: Number(e.target.value) })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Conteo B</label>
                <input type="number" min="0" value={formData.conteoBAgua || ''}
                  onChange={(e) => setFormData({ ...formData, conteoBAgua: Number(e.target.value) })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="0" />
              </div>
            </div>
            <p className="mt-2 text-center text-lg font-semibold text-blue-600">Promedio: {prodAgua}</p>
          </div>
          <div className="bg-cyan-50 p-4 rounded-lg">
            <h3 className="font-medium text-cyan-800 mb-3">Hielo</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Conteo A</label>
                <input type="number" min="0" value={formData.conteoAHielo || ''}
                  onChange={(e) => setFormData({ ...formData, conteoAHielo: Number(e.target.value) })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-cyan-500" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Conteo B</label>
                <input type="number" min="0" value={formData.conteoBHielo || ''}
                  onChange={(e) => setFormData({ ...formData, conteoBHielo: Number(e.target.value) })}
                  className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-cyan-500" placeholder="0" />
              </div>
            </div>
            <p className="mt-2 text-center text-lg font-semibold text-cyan-600">Promedio: {prodHielo}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300">← Anterior</button>
            <button onClick={() => setStep(3)} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700">Siguiente →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-800">Confirmar Produccion</h2>
          <div className="bg-gray-50 p-4 rounded-lg space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Trabajador:</span>
              <select value={formData.trabajadorId} onChange={(e) => setFormData({ ...formData, trabajadorId: e.target.value })}
                className="p-2 border rounded-lg">
                <option value="">Seleccionar...</option>
                {trabajadores.map((t) => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
              </select>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Turno:</span>
              <select value={formData.turno} onChange={(e) => setFormData({ ...formData, turno: e.target.value as 'MANANA' | 'TARDE' | 'NOCHE' })}
                className="p-2 border rounded-lg">
                <option value="MANANA">Manana</option>
                <option value="TARDE">Tarde</option>
                <option value="NOCHE">Noche</option>
              </select>
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-3">Produccion Calculada</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center"><p className="text-sm text-gray-600">Agua</p><p className="text-2xl font-bold text-green-600">{prodAgua}</p></div>
              <div className="text-center"><p className="text-sm text-gray-600">Hielo</p><p className="text-2xl font-bold text-green-600">{prodHielo}</p></div>
            </div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <p className="text-center">
              <span className="text-purple-600">Comision Sellador:</span>
              <span className="text-2xl font-bold text-purple-700 ml-2">${comisionTotal.toLocaleString()}</span>
            </p>
            <p className="text-xs text-center text-purple-500 mt-1">
              Agua: {prodAgua} x ${selectedTrabajador?.comPacaAgua || 200} + Hielo: {prodHielo} x ${selectedTrabajador?.comPacaHielo || 200}
            </p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold text-blue-800 mb-3">Stock Final Sugerido</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center"><p className="text-sm text-gray-600">Agua</p><p className="text-2xl font-bold text-blue-600">{stockFinAgua}</p></div>
              <div className="text-center"><p className="text-sm text-gray-600">Hielo</p><p className="text-2xl font-bold text-blue-600">{stockFinHielo}</p></div>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Observaciones</label>
            <textarea value={formData.obs} onChange={(e) => setFormData({ ...formData, obs: e.target.value })}
              className="w-full p-3 border rounded-lg" rows={2} placeholder="Observaciones opcionales..." />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300">← Anterior</button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">
              {submitting ? 'Guardando...' : 'Confirmar ✓'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
