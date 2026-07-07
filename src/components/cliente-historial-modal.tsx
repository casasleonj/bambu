'use client'

import { Modal } from '@/components/modal'
import { ClienteHistorial } from '@/app/(app)/clientes/clientes-client/cliente-historial'

interface ClienteHistorialModalProps {
  open: boolean
  onClose: () => void
  clienteId: string
  clienteNombre?: string
}

export function ClienteHistorialModal({ open, onClose, clienteId, clienteNombre }: ClienteHistorialModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Historial de ${clienteNombre || 'cliente'}`}
      data-testid="cliente-historial-modal"
      className="bg-white rounded-xl p-0 w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-auto mt-10 md:mt-0 shadow-2xl"
    >
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Historial de {clienteNombre || 'cliente'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <ClienteHistorial clienteId={clienteId} />
      </div>
    </Modal>
  )
}
