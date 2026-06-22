'use client'

import { useState, useRef } from 'react'
import { Modal } from './modal'
import { toast } from 'sonner'
import { compressImage } from '@/lib/image-compress'

interface FotoEntregaModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (fotoBase64: string) => void | Promise<void>
  title?: string
  description?: string
  confirmLabel?: string
}

const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.8

/**
 * Modal for capturing a delivery photo (or selecting from gallery).
 * Returns a base64-encoded JPEG (data URL) — no upload happens here.
 *
 * The parent is responsible for passing it to the API which will upload to Supabase.
 */
export function FotoEntregaModal({
  open,
  onClose,
  onConfirm,
  title = 'Foto de entrega',
  description = 'Toma una foto clara del producto entregado como evidencia.',
  confirmLabel = 'Confirmar entrega',
}: FotoEntregaModalProps) {
  const [fotoBase64, setFotoBase64] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setFotoBase64(null)
    setSubmitting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('La imagen no puede pesar más de 10MB')
      return
    }

    compressImage(file, { maxDimension: MAX_DIMENSION, quality: JPEG_QUALITY })
      .then((resized) => {
        setFotoBase64(resized)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo leer la imagen')
      })
  }

  const handleConfirm = async () => {
    if (!fotoBase64) {
      toast.error('Toma una foto de la entrega')
      return
    }
    setSubmitting(true)
    try {
      await onConfirm(fotoBase64)
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error confirmando')
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
    >
      <div className="space-y-4">
        {/* Hidden file input triggered by buttons below */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
          aria-label="Capturar foto de entrega"
        />

        {/* Preview or placeholder */}
        {fotoBase64 ? (
          <div className="relative">
            <img
              src={fotoBase64}
              alt="Preview de foto de entrega"
              className="w-full max-h-72 object-contain rounded-lg border bg-gray-50"
            />
            <button
              type="button"
              onClick={() => { setFotoBase64(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
              className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/90 hover:bg-white rounded shadow text-gray-700"
              disabled={submitting}
            >
              Retirar
            </button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50">
            <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm text-gray-500 mt-2">Sin foto seleccionada</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
            disabled={submitting}
          >
            {fotoBase64 ? 'Tomar otra foto' : 'Tomar foto'}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!fotoBase64 || submitting}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando…' : confirmLabel}
          </button>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="w-full text-sm text-gray-500 hover:text-gray-700"
          disabled={submitting}
        >
          Cancelar
        </button>
      </div>
    </Modal>
  )
}
