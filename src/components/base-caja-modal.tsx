'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  const userRole = (session?.user as { role?: string } | undefined)?.role

  // Ref mirror of showModal so checkBaseDia (re-triggered by every SessionProvider
  // poll, every 60s) can bail out without racing an in-progress edit.
  const showModalRef = useRef(false)
  useEffect(() => {
    showModalRef.current = showModal
  }, [showModal])

  const closeModal = useCallback(() => {
    setShowModal(false)
    setBaseDiaInput('')
  }, [])

  const skipModal = useCallback(() => {
    try {
      sessionStorage.setItem(`baseDiaDismissed_${todayInBogota()}`, '1')
    } catch {
      // sessionStorage puede fallar en modo privado; no es crítico, solo evita el re-prompt.
    }
    closeModal()
  }, [closeModal])

  const openModal = useCallback((initialValue?: string) => {
    setBaseDiaInput(initialValue ?? '')
    setShowModal(true)
    setStatus('ready')
  }, [])

  const checkBaseDia = useCallback(async () => {
    // Bail out if the modal is already open (e.g. the admin is mid-edit) —
    // SessionProvider polls every 60s and hands back a new `session` object
    // reference each time even when nothing changed, which would otherwise
    // re-run this whole check and reset baseDiaInput out from under the user.
    if (showModalRef.current) return

    setStatus('checking')

    if (userRole !== 'ADMIN' && userRole !== 'ASISTENTE') {
      setStatus('ready')
      return
    }

    try {
      const today = todayInBogota()

      try {
        if (sessionStorage.getItem(`baseDiaDismissed_${today}`)) {
          setStatus('ready')
          return
        }
      } catch {
        // sessionStorage inaccesible: continuar sin el flag de descarte.
      }

      // Test mode: if Playwright pre-seeded localStorage, trust it and skip the API round-trip.
      if (typeof window !== 'undefined' && (window as unknown as { __PLAYWRIGHT_TEST__?: boolean }).__PLAYWRIGHT_TEST__) {
        const preseeded = localStorage.getItem(`baseDia_${today}`)
        if (preseeded) {
          persistBaseDia(preseeded)
          setStatus('ready')
          return
        }
      }

      const [cierreRes, configRes, defaultRes] = await Promise.all([
        fetch('/api/cierre/last'),
        fetch(`/api/config?clave=BASE_DIA_${today}`),
        fetch('/api/config?clave=BASE_DIA'),
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
            toast.warning(`Hay cierres pendientes desde ${cierreDate}. Revisá /cierre?fecha=${targetDate}`, {
              duration: 8000,
              action: {
                label: 'Ir →',
                onClick: () => router.push(`/cierre?fecha=${targetDate}`),
              },
            })
            // Continue to base prompt; do not force redirect.
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

      // No base for today yet. Use the global default as the initial value if available.
      let defaultValue = ''
      if (defaultRes.ok) {
        const defaultData = await defaultRes.json()
        if (defaultData.config?.valor) {
          defaultValue = String(defaultData.config.valor)
        }
      }

      openModal(defaultValue)
    } catch (error) {
      console.error('[base-caja] Error checking base:', error)
      toast.error('No se pudo verificar el estado de caja')
      setStatus('error')
    }
  }, [userRole, router, persistBaseDia, openModal])

  useEffect(() => {
    if (sessionStatus === 'loading') return
    if (sessionStatus === 'unauthenticated') {
      setStatus('ready')
      return
    }
    if (!userRole) return

    checkBaseDia()
  }, [sessionStatus, userRole, checkBaseDia])

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
    if (baseDiaInput === '' || isNaN(Number(baseDiaInput)) || Number(baseDiaInput) < 0) {
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
            {baseDiaInput ? 'Actualiza el dinero físico en caja' : 'Contá el dinero físico en caja para iniciar el día (0 es válido)'}
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
                onBeforeInput={(e: React.FormEvent<HTMLInputElement>) => {
                  const inputEvent = e.nativeEvent as InputEvent
                  // Dejar pasar eventos que no insertan texto (borrar, tab, etc.) y composición IME.
                  if (inputEvent.inputType === 'insertCompositionText') return
                  if (inputEvent.data && /[^0-9]/.test(inputEvent.data)) {
                    inputEvent.preventDefault()
                  }
                }}
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
            disabled={saving || baseDiaInput === '' || isNaN(Number(baseDiaInput)) || Number(baseDiaInput) < 0}
            className="w-full mt-6 py-4 text-lg"
            size="lg"
          >
            {saving ? 'Guardando...' : baseDiaInput ? 'Guardar cambios' : 'Continuar →'}
          </Button>

          <button
            type="button"
            onClick={skipModal}
            disabled={saving}
            data-testid="base-caja-modal-skip"
            className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Ahora no
          </button>
        </form>
      </div>
    </div>
  )
}
