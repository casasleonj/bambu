'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

interface BaseDia {
  id: string
  clave: string
  valor: string
}

export default function BaseCajaModal() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [baseDia, setBaseDia] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    checkBaseDia()
  }, [])

  async function checkBaseDia() {
    try {
      const res = await fetch('/api/config?clave=BASE_DIA')
      const data = await res.json()
      
      if (data.config) {
        setBaseDia(data.config.valor)
      }
      
      // Verificar si es el mismo día
      const today = new Date().toISOString().split('T')[0]
      const lastBaseDate = localStorage.getItem('baseDiaDate')
      
      if (lastBaseDate !== today) {
        setShowModal(true)
      } else {
        setShowModal(false)
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Error checking base:', error)
      setShowModal(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!baseDia || isNaN(Number(baseDia))) {
      alert('Ingresa un monto válido')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: 'BASE_DIA', valor: baseDia }),
      })
      
      if (res.ok) {
        localStorage.setItem('baseDiaDate', new Date().toISOString().split('T')[0])
        localStorage.setItem('baseDia', baseDia)
        setShowModal(false)
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Error saving base:', error)
      alert('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return null
  }

  if (!showModal) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 mx-4">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">💰</div>
          <h2 className="text-2xl font-bold text-gray-800">Base de Caja</h2>
          <p className="text-gray-500 mt-2">
            Ingresa el dinero disponible en caja al iniciar el día
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Monto en caja
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                $
              </span>
              <input
                type="number"
                value={baseDia}
                onChange={(e) => setBaseDia(e.target.value)}
                className="w-full pl-8 pr-4 py-4 text-2xl border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                placeholder="50000"
                autoFocus
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl">
            <p className="text-sm text-blue-800">
              <strong>💡 Tip:</strong> Este monto se usará para calcular el cierre de caja al final del día.
              Incluye el dinero inicial + lo que haya en la caja registradora.
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !baseDia}
          className="w-full mt-6 py-4 bg-blue-600 text-white font-bold text-lg rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Continuar →'}
        </button>
      </div>
    </div>
  )
}