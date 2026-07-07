'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/modal'
import { useConfirm } from '@/components/confirm-modal'
import { toast } from 'sonner'

export interface NegocioDetail {
  id: string
  nombre: string
  tipoNegocio: string | null
  direccion: string | null
  barrio: string | null
  referencia: string | null
  linkUbicacion: string | null
  horaApertura: string | null
  ruta: { id: string; nombre: string } | null
  _count: { pedidos: number }
}

interface NegocioDetailModalProps {
  open: boolean
  onClose: () => void
  negocio: NegocioDetail | null
  canEdit: boolean
  canDelete: boolean
  clienteId: string
  onEdit: () => void
  onDeleted: () => void
}

export function NegocioDetailModal({
  open,
  onClose,
  negocio,
  canEdit,
  canDelete,
  clienteId,
  onEdit,
  onDeleted,
}: NegocioDetailModalProps) {
  const { confirm, modal } = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const neg = negocio
  if (!neg) return null

  async function handleDelete() {
    if (!neg) return
    setError(null)
    const ok = await confirm({
      title: 'Eliminar negocio',
      message: `¿Eliminar "${neg.nombre}"?`,
      description: 'Esta acción no se puede deshacer.',
      consequences: ['El negocio se eliminará permanentemente.'],
      confirmLabel: 'Sí, eliminar',
      cancelLabel: 'No, mantener',
      variant: 'destructive',
    })
    if (!ok) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/negocios/${neg.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Negocio eliminado')
        onDeleted()
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      setError(data.error?.message || `Error al eliminar (HTTP ${res.status})`)
    } catch {
      setError('Error de red. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        title={`Detalle de ${neg.nombre}`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-start bg-gray-50">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
              {neg.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 truncate">{neg.nombre}</h2>
              {neg.tipoNegocio && (
                <span className="inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  {neg.tipoNegocio}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-200 transition shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2" role="alert">
              <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.732-3l-7-12a2 2 0 00-3.464 0l-7 12A2 2 0 005 19z" />
              </svg>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            {neg.direccion && (
              <div className="flex items-start gap-3 text-sm">
                <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <span className="text-gray-500">Dirección: </span>
                  <span className="font-medium">{neg.direccion}</span>
                  {neg.barrio && <span className="text-gray-500"> · {neg.barrio}</span>}
                </div>
              </div>
            )}
            {!neg.direccion && neg.barrio && (
              <div className="flex items-start gap-3 text-sm">
                <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div>
                  <span className="text-gray-500">Barrio: </span>
                  <span className="font-medium">{neg.barrio}</span>
                </div>
              </div>
            )}
            {neg.horaApertura && (
              <div className="flex items-start gap-3 text-sm">
                <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <span className="text-gray-500">Hora de apertura: </span>
                  <span className="font-medium">{neg.horaApertura}</span>
                </div>
              </div>
            )}
            {neg.linkUbicacion && (
              <div className="flex items-start gap-3 text-sm">
                <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.1 1.1" />
                </svg>
                <a
                  href={neg.linkUbicacion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  Ver en Google Maps
                </a>
              </div>
            )}
            {neg.referencia && (
              <div className="flex items-start gap-3 text-sm">
                <svg className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <span className="text-gray-500">Referencia: </span>
                  <span>{neg.referencia}</span>
                </div>
              </div>
            )}
            {neg.ruta && (
              <div className="flex items-start gap-3 text-sm">
                <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                </svg>
                <div>
                  <span className="text-gray-500">Ruta: </span>
                  <span className="font-medium text-blue-600">{neg.ruta.nombre}</span>
                </div>
              </div>
            )}
          </div>

          {neg._count?.pedidos > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                {neg._count.pedidos} pedido{neg._count.pedidos !== 1 ? 's' : ''} asociado
                {neg._count.pedidos !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end bg-gray-50">
          <Link
            href={`/pedidos?clienteId=${clienteId}`}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            Ver pedidos
          </Link>
          {canEdit && (
            <button
              onClick={onEdit}
              className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
            >
              Editar
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </button>
          )}
        </div>
      </Modal>
      {modal}
    </>
  )
}
