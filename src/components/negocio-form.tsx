'use client'

import { useState } from 'react'
import { Modal } from '@/components/modal'
import { InfoBanner } from '@/components/tooltip'
import { TipoNegocioSelect } from '@/components/tipo-negocio-select'

const TIPOS_NEGOCIO: string[] = [
  'Tienda', 'Restaurante', 'Café', 'Hotel', 'Bar',
  'Panadería', 'Farmacia', 'Peluquería', 'Frutería',
  'Carnicería', 'Lavandería', 'Taller',
]

interface NegocioFormData {
  nombre: string
  tipoNegocio: string
  direccion: string
  barrio: string
  referencia: string
  linkUbicacion: string
  horaApertura: string
  rutaId: string
}

interface NegocioFormProps {
  open: boolean
  onClose: () => void
  clienteId: string
  onSuccess?: () => void
  editData?: {
    id: string
    nombre: string
    tipoNegocio: string | null
    direccion: string | null
    barrio: string | null
    referencia: string | null
    linkUbicacion: string | null
    horaApertura: string | null
    rutaId: string | null
  } | null
}

export function NegocioForm({
  open,
  onClose,
  clienteId,
  onSuccess,
  editData,
}: NegocioFormProps) {
  const isEdit = !!editData
  const [formData, setFormData] = useState<NegocioFormData>({
    nombre: editData?.nombre || '',
    tipoNegocio: editData?.tipoNegocio || '',
    direccion: editData?.direccion || '',
    barrio: editData?.barrio || '',
    referencia: editData?.referencia || '',
    linkUbicacion: editData?.linkUbicacion || '',
    horaApertura: editData?.horaApertura || '',
    rutaId: editData?.rutaId || '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!formData.nombre.trim()) {
      setFormError('El nombre del negocio es requerido')
      return
    }

    setSaving(true)
    try {
      const url = isEdit ? `/api/negocios/${editData!.id}` : '/api/negocios'
      const method = isEdit ? 'PUT' : 'POST'

      const body: Record<string, unknown> = {
        clienteId,
        nombre: formData.nombre.trim(),
        tipoNegocio: formData.tipoNegocio || undefined,
        direccion: formData.direccion.trim() || undefined,
        barrio: formData.barrio.trim() || undefined,
        referencia: formData.referencia.trim() || undefined,
        linkUbicacion: formData.linkUbicacion.trim() || undefined,
        horaApertura: formData.horaApertura || undefined,
        rutaId: formData.rutaId || null,
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setFormError(data.error || data.formErrors?.[0] || 'Error al guardar')
        return
      }

      onSuccess?.()
      onClose()
    } catch {
      setFormError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Editar Negocio' : 'Nuevo Negocio'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <InfoBanner type="info">
          {isEdit
            ? 'Edita la información de este negocio. Los cambios afectan solo a este negocio, no al cliente principal.'
            : 'Agrega un nuevo negocio para este cliente. Cada negocio puede tener su propia dirección, ruta y precios.'}
        </InfoBanner>
      </div>

      {formError && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Nombre del negocio <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            placeholder="Ej: Restaurante El Sabor"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de negocio</label>
          <TipoNegocioSelect
            options={TIPOS_NEGOCIO}
            value={formData.tipoNegocio}
            onChange={(val) => setFormData({ ...formData, tipoNegocio: val })}
            placeholder="Buscar tipo de negocio..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Dirección</label>
          <textarea
            value={formData.direccion}
            onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
            rows={2}
            placeholder="Calle, número, referencias..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Barrio / Zona</label>
            <input
              type="text"
              value={formData.barrio}
              onChange={(e) => setFormData({ ...formData, barrio: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              placeholder="Ej: Centro"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Hora de apertura</label>
            <input
              type="time"
              value={formData.horaApertura}
              onChange={(e) => setFormData({ ...formData, horaApertura: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Link de Google Maps</label>
          <input
            type="url"
            value={formData.linkUbicacion}
            onChange={(e) => setFormData({ ...formData, linkUbicacion: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            placeholder="https://maps.google.com/?q=..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Referencias</label>
          <input
            type="text"
            value={formData.referencia}
            onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            placeholder="Ej: Frente a la iglesia"
          />
        </div>
      </form>

      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white text-sm font-medium transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition shadow-sm"
          >
            {saving ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear negocio'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
