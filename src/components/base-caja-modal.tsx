'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useBaseCaja } from '@/hooks/use-base-caja'
import { getTodayString } from '@/lib/dates'

export default function BaseCajaModal() {
  const { setBaseDia: persistBaseDia } = useBaseCaja()
  const [showModal, setShowModal] = useState(false)
  const [baseDiaInput, setBaseDiaInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    checkBaseDia()
  }, [])

  async function checkBaseDia() {
    try {
      const today = getTodayString()
      const yesterdayDate = new Date()
      yesterdayDate.setDate(yesterdayDate.getDate() - 1)
      const yesterday = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

      // 1. Check if today was already closed
      const cierreRes = await fetch('/api/cierre/last')
      if (cierreRes.ok) {
        const cierreData = await cierreRes.json()
        if (cierreData.cierre) {
          const cierreDate = new Date(cierreData.cierre.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
          if (cierreDate === today) {
            setShowModal(false)
            setLoading(false)
            return
          }
          // 1.5 If last cierre is not yesterday, there are unclosed days → redirect
          if (cierreDate !== yesterday) {
            const nextUnclosed = new Date(cierreData.cierre.fecha)
            nextUnclosed.setDate(nextUnclosed.getDate() + 1)
            const targetUrl = `/cierre?fecha=${nextUnclosed.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}`
            const currentPath = window.location.pathname + window.location.search
            if (currentPath !== targetUrl) {
              window.location.href = targetUrl
            }
            return
          }
        }
      }

      // 2. Check if base was already set for today
      const configRes = await fetch(`/api/config?clave=BASE_DIA_${today}`)
      if (configRes.ok) {
        const configData = await configRes.json()
        if (configData.config) {
          setBaseDiaInput(configData.config.valor)
          persistBaseDia(configData.config.valor)
          setShowModal(false)
          setLoading(false)
          return
        }
      }

      // 3. No cierre and no base for today — show modal
      setShowModal(true)
    } catch (error) {
      console.error('Error checking base:', error)
      setShowModal(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!baseDiaInput || isNaN(Number(baseDiaInput))) {
      toast.error('Ingresa un monto válido')
      return
    }

    setSaving(true)
    try {
      const today = getTodayString()
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: `BASE_DIA_${today}`, valor: baseDiaInput }),
      })

      if (res.ok) {
        persistBaseDia(baseDiaInput)
        toast.success('Base de caja registrada')
        setShowModal(false)
      } else {
        toast.error('Error al guardar la base')
      }
    } catch (error) {
      console.error('Error saving base:', error)
      toast.error('Error al guardar')
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
            Contá el dinero físico en caja para iniciar el día
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
                min="0"
                value={baseDiaInput}
                onChange={(e) => setBaseDiaInput(e.target.value)}
                className="w-full pl-8 pr-4 py-4 text-2xl border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                placeholder="50000"
                autoFocus
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl">
            <p className="text-sm text-blue-800">
              <strong>💡 Tip:</strong> Este monto se usará para calcular el cierre de caja al final del día.
              Contá billetes y monedas físicamente.
            </p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !baseDiaInput}
          className="w-full mt-6 py-4 text-lg"
          size="lg"
        >
          {saving ? 'Guardando...' : 'Continuar →'}
        </Button>
      </div>
    </div>
  )
}
