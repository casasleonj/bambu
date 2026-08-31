'use client'

import { EmbarqueFormModal } from './embarque-form-modal'
import type { Trabajador, Ruta, EmbarqueEditable } from './types'

interface EditarEmbarqueModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  trabajadores: Trabajador[]
  rutas: Ruta[]
  embarque: EmbarqueEditable | null
}

/**
 * Edición de un embarque ABIERTO (repartidor, ruta, moto, base, carga, obs).
 *
 * Separa el camino de edición del de creación (plan de "Nuevo Embarque", §18):
 * la creación ahora es `NuevoEmbarqueWizard` (flujo pedidos-primero). Este
 * componente envuelve el `EmbarqueFormModal` legacy fijando `mode="edit"`;
 * el form legacy se irá recortando a solo-edición en la fase de wiring.
 */
export function EditarEmbarqueModal(props: EditarEmbarqueModalProps) {
  return <EmbarqueFormModal {...props} mode="edit" />
}
