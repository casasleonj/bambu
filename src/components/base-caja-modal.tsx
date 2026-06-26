'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useBaseCaja } from '@/hooks/use-base-caja'
import { todayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

export default function BaseCajaModal() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const { setBaseDia: persistBaseDia } = useBaseCaja()
  const [showModal, setShowModal] = useState(false)
  const [baseDiaInput, setBaseDiaInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking')

  const closeModal = useCallback(() => {
    setShowModal(false)
    setBaseDiaInput('')
  }, [])

  const openModal = useCallback((initialValue?: string) => {
    setBaseDiaInput(initialValue ?? '')
    setShowModal(true)
    setStatus('ready')
  }, [])

  const checkBaseDia = useCallback(async () => {
    setStatus('checking')

    const userRole = (session?.user as { role?: string } | undefined)?.role
    if (userRole !== 'ADMIN' && userRole !== 'ASISTENTE') {
      setStatus('ready')
      return
    }

    try {
      const today = todayInBogota()

      const [cierreRes, configRes] = await Promise.all([
        fetch('/api/cierre/last'),
        fetch(`/api/config?clave=BASE_DIA_${today}`),
      ])

      if (cierreRes.ok) {
        const cierreData = await cierreRes.json()
        if (cierreData.cierre) {
          const cierreDate = new Date(cierreData.cierre.fecha).toLocaleDateString('en-CA', {
            timeZone: 'America/Bogota',
          })

          if (cierreDate === today) {
            // Today already closed — do not prompt for base.
            setStatus('ready')
            return
          }

          const yesterdayDate = new Date(startOfDayInBogota(today))
          yesterdayDate.setDate(yesterdayDate.getDate() - 1)
          const yesterday = yesterdayDate.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

          if (cierreDate !== yesterday) {
            const nextUnclosed = new Date(cierreData.cierre.fecha)
            nextUnclosed.setDate(nextUnclosed.getDate() + 1)
            const targetDate = nextUnclosed.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
            const targetUrl = `/cierre?fecha=${targetDate}`
            const currentPath = window.location.pathname + window.location.search
            if (currentPath !== targetUrl) {
              router.push(targetUrl)
            }
            return
          }
        }
      }

      if (configRes.ok) {
        const configData = await configRes.json()
        if (configData.config) {
          persistBaseDia(configData.config.valor)
          setStatus('ready')
          return
        }
      }

      // No cierre and no base for today — show modal for first-time entry.
      openModal()
    } catch (error) {
      console.error('[base-caja] Error checking base:', error)
      toast.error('No se pudo verificar el estado de caja')
      setStatus('error')
    }
  }, [session, router, persistBaseDia, openModal])

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (sessionStatus === 'unauthenticated') {
      setStatus('ready')
      return
    }
    const userRole = (session?.user as { role?: string } | undefined)?.role
    if (!userRole) return

    checkBaseDia()
  }, [sessionStatus, session, checkBaseDia])

  // Allow manual opening from dashboard for ADMIN/ASISTENTE (edit mode).
  useEffect(() => {
    const pendingValue = (window as unknown as { __OPEN_BASE_CAJA_MODAL_VALUE?: string }).__OPEN_BASE_CAJA_MODAL_VALUE
    if (pendingValue !== undefined) {
      openModal(pendingValue)
      ;(window as unknown as { __OPEN_BASE_CAJA_MODAL_VALUE?: string }).__OPEN_BASE_CAJA_MODAL_VALUE = undefined
    }

    const handler = (e: CustomEvent<string | undefined>) => {
      openModal(e.detail)
    }
    window.addEventListener('open-base-caja-modal', handler as EventListener)
    return () => window.removeEventListener('open-base-caja-modal', handler as EventListener)
  }, [openModal])

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
        toast.success('Base de caja guardada')
        closeModal()
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

  if (status === 'checking') {
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
            {baseDiaInput ? 'Actualiza el dinero físico en caja' : 'Contá el dinero físico en caja para iniciar el día'}
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="base-dia-input" className="block text-sm font-medium text-gray-700 mb-2">
              Monto en caja
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                id="base-dia-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={baseDiaInput}
                onChange={(e) => {
                  const digitsOnly = e.target.value.replace(/\D/g, '')
                  setBaseDiaInput(digitsOnly)
                }}
                className="w-full pl-8 pr-4 py-4 text-2xl border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none"
                placeholder="50000"
                autoFocus
              />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Este monto se usará para calcular el cierre de caja al final del día.
              Contá billetes y monedas físicamente.
            </p>
          </div>

          <Button
            type="submit"
            disabled={saving || !baseDiaInput}
            className="w-full mt-6 py-4 text-lg"
            size="lg"
          >
            {saving ? 'Guardando...' : baseDiaInput ? 'Guardar cambios' : 'Continuar →'}
          </Button>
        </form>
      </div>
    </div>
  )
}
