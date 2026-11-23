'use client'

import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/modal'
import { Button } from '@/components/ui/button'

interface ConfirmarDescarteProps {
  open: boolean
  onSeguirEditando: () => void
  onDescartar: () => void
}

/**
 * Confirmación propia de Gastos (#979). No usa window.confirm:
 * conserva foco, Escape y apilamiento mediante el Modal del proyecto.
 * «Seguir editando» es la opción segura por defecto.
 */
export function ConfirmarDescarte({ open, onSeguirEditando, onDescartar }: ConfirmarDescarteProps) {
  return (
    <Modal
      open={open}
      onClose={onSeguirEditando}
      title="Descartar cambios"
      description="Esta acción no guardará los cambios en el gasto."
      className="mx-auto w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      data-testid="gastos-confirmar-descarte"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">¿Descartar los cambios?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            Lo que escribiste no se guardará. Puedes seguir editando o salir sin guardar.
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onSeguirEditando} className="min-h-11">
          Seguir editando
        </Button>
        <Button type="button" variant="destructive" onClick={onDescartar} className="min-h-11">
          Descartar cambios
        </Button>
      </div>
    </Modal>
  )
}
