'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useBaseCaja } from '@/hooks/use-base-caja'
import { todayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

export default function BaseCajaModal() {
  const router = useRouter()
  const { data: session } = useSession()
  const { setBaseDia: persistBaseDia } = useBaseCaja()
  const [showModal, setShowModal] = useState(false)
  const [baseDiaInput, setBaseDiaInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking')

  useEffect(() => {
    // Wait for session to be available before checking
    if (session === undefined) return
    checkBaseDia()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function checkBaseDia() {
    setStatus('checking')
    // Fix #6: Only ADMIN and ASISTENTE should see base caja modal
    const userRole = (session?.user as { role?: string } | undefined)?.role
    if (userRole !== 'ADMIN' && userRole !== 'ASISTENTE') {
      setStatus('ready')
      return
    }

    try {
      const today = todayInBogota()

      // Fix #5: Parallel API calls instead of sequential
      const [cierreRes, configRes] = await Promise.all([
        fetch('/api/cierre/last'),
        fetch(`/api/config?clave=BASE_DIA_${today}`),
      ])

      // Fix #2: Use timezone helpers consistently
      if (cierreRes.ok) {
        const cierreData = await cierreRes.json()
        if (cierreData.cierre) {
          const cierreDate = new Date(cierreData.cierre.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

          // Today already closed — no modal needed
          if (cierreDate === today) {
            setStatus('ready')
            return
          }

          // Fix #2: Calculate yesterday using Bogota timezone
          const yesterdayDate = new Date(startOfDayInBogota(today))
          yesterdayDate.setDate(yesterdayDate.getDate() - 1)
          const yesterday = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

          // Gap detected — redirect to first unclosed day
          if (cierreDate !== yesterday) {
            const nextUnclosed = new Date(cierreData.cierre.fecha)
            nextUnclosed.setDate(nextUnclosed.getDate() + 1)
            const targetDate = nextUnclosed.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
            const targetUrl = `/cierre?fecha=${targetDate}`
            const currentPath = window.location.pathname + window.location.search
            if (currentPath !== targetUrl) {
              // Fix #4: Use Next.js router for SPA navigation
              router.push(targetUrl)
            }
            return
          }
        }
      }

      // Check if base was already set for today
      if (configRes.ok) {
        const configData = await configRes.json()
        if (configData.config) {
          setBaseDiaInput(configData.config.valor)
          persistBaseDia(configData.config.valor)
          setStatus('ready')
          return
        }
      }

      // No cierre and no base for today — show modal
      setShowModal(true)
    } catch (error) {
      // Fix #3: Don't show modal on error — just log and let user proceed
      console.error('[base-caja] Error checking base:', error)
      toast.error('No se pudo verificar el estado de caja')
      setStatus('error')
    }
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault()
    if (!baseDiaInput || isNaN(Number(baseDiaInput)) || Number(baseDiaInput) < 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    setSaving(true)
    try {
      const today = todayInBogota()
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
      console.error('[base-caja] Error saving base:', error)
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Fix #1: Never render anything until verification is complete
  if (status === 'checking') {
    return null
  }

  if (!showModal) {
    return null
  }

  // Fix #10: Wrap in <form> so Enter key works
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

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="base-dia-input" className="block text-sm font-medium text-gray-700 mb-2">
              Monto en caja
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                $
              </span>
              <input
                id="base-dia-input"
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

          <Button
            type="submit"
            disabled={saving || !baseDiaInput}
            className="w-full mt-6 py-4 text-lg"
            size="lg"
          >
            {saving ? 'Guardando...' : 'Continuar →'}
          </Button>
        </form>
      </div>
    </div>
  )
}
