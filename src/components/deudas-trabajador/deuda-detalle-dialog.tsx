'use client'

import { Modal } from '@/components/modal'
import { DeudaLista } from './deuda-lista'
import { useDeudasTrabajador } from './use-deudas'

/** Detalle de la deuda de un trabajador: ventana en escritorio, hoja desde abajo en móvil. Solo lectura. */
export function DeudaDetalleDialog({
  trabajadorId,
  nombre,
  rol,
  onClose,
}: {
  trabajadorId: string
  nombre: string
  rol: string
  onClose: () => void
}) {
  const { estado, datos, reintentar } = useDeudasTrabajador(trabajadorId)
  return (
    <Modal
      open
      onClose={onClose}
      title={`Deudas de ${nombre}`}
      data-testid="deuda-detalle"
      overlayClassName="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center md:p-4"
      className="bg-white w-full md:max-w-2xl rounded-t-2xl md:rounded-xl max-h-[88vh] overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-3 p-4 border-b">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Deudas de {nombre}</h2>
          <p className="text-xs text-gray-500">{rol} · solo lectura</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="min-w-[40px] min-h-[40px] rounded-lg border text-gray-600 hover:bg-gray-50"
        >
          ✕
        </button>
      </div>
      <DeudaLista estado={estado} datos={datos} onReintentar={reintentar} />
    </Modal>
  )
}
