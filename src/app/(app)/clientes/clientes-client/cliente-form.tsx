'use client'

import { useState } from 'react'
import type { Canal, FormData } from './types'
import { PRODUCTOS_PRECIO } from './types'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { FeedbackField } from '@/components/feedback-field'
import { Tooltip, InfoBanner } from '@/components/tooltip'

const TIPOS_NEGOCIO: string[] = [
  'Tienda', 'Restaurante', 'Café', 'Hotel', 'Bar',
  'Ferretería', 'Panadería', 'Carnicería', 'Frutería', 'Peluquería',
  'Farmacia', 'Papelería', 'Lavandería', 'Taller', 'Consultorio',
  'Gimnasio', 'Salón de eventos', 'Guardería', 'Veterinaria', 'Estación de servicio',
]

interface ClienteFormProps {
  open: boolean
  onClose: () => void
  isEdit: boolean
  formData: FormData
  onFormDataChange: (data: FormData) => void
  formError: string
  saving: boolean
  onSubmit: (e: React.FormEvent) => void
  canalActivo: Canal
  onCanalActivoChange: (canal: Canal) => void
  preciosEspecialesMap: Record<Canal, Record<string, number | undefined>>
  onPrecioEspecialChange: (canal: Canal, codigo: string, valor: number | undefined) => void
  preciosBase: Record<Canal, Record<string, number>>
}

export function ClienteForm({
  open,
  onClose,
  isEdit,
  formData,
  onFormDataChange,
  formError,
  saving,
  onSubmit,
  canalActivo,
  onCanalActivoChange,
  preciosEspecialesMap,
  onPrecioEspecialChange,
  preciosBase,
}: ClienteFormProps) {
  const [activeSection, setActiveSection] = useState<'basico' | 'ubicacion' | 'frecuencia' | 'precios'>('basico')

  const sections = [
    { key: 'basico', label: 'Básico', icon: '👤', description: 'Nombre y contacto' },
    { key: 'ubicacion', label: 'Ubicación', icon: '📍', description: 'Barrio y dirección' },
    { key: 'frecuencia', label: 'Frecuencia', icon: '📅', description: 'Periodicidad de compra' },
    { key: 'precios', label: 'Precios', icon: '💰', description: 'Precios especiales' },
  ] as const

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}
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

        {/* Section navigation */}
        <div className="flex gap-1">
          {sections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition text-center ${
                activeSection === section.key
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className="block text-base mb-0.5">{section.icon}</span>
              <span className="hidden sm:inline">{section.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Form error */}
      {formError && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      <form id="cliente-form" onSubmit={onSubmit} className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Section 1: Basic Info */}
        {activeSection === 'basico' && (
          <div className="space-y-4">
            <InfoBanner type="info">
              Los campos con <span className="text-red-500">*</span> son obligatorios. El teléfono es lo más importante para contactar al cliente.
            </InfoBanner>

            <div className="grid grid-cols-2 gap-4">
              <FeedbackField
                label="Nombre"
                required
                value={formData.nombre}
                onChange={(v) => onFormDataChange({ ...formData, nombre: v })}
                placeholder="Ej: Juan"
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
              />
              <FeedbackField
                label="Apellido"
                value={formData.apellido}
                onChange={(v) => onFormDataChange({ ...formData, apellido: v })}
                placeholder="Ej: Pérez"
              />
            </div>

            <FeedbackField
              label="Teléfono"
              required
              type="tel"
              value={formData.telefono}
              onChange={(v) => onFormDataChange({ ...formData, telefono: v })}
              placeholder="Ej: 3111234567"
              helpText="Número de WhatsApp o celular para contactar"
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              }
              rules={[
                { test: (v) => v.length >= 7, message: 'El teléfono debe tener al menos 7 dígitos', type: 'error' },
                { test: (v) => /^[0-9]+$/.test(v), message: 'Solo números permitidos', type: 'error' },
              ]}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Negocio</label>
                <input
                  type="text"
                  value={formData.nombreNegocio}
                  onChange={(e) => onFormDataChange({ ...formData, nombreNegocio: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                  placeholder="Nombre del negocio"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de negocio</label>
                <select
                  value={TIPOS_NEGOCIO.includes(formData.tipoNegocio) ? formData.tipoNegocio : ''}
                  onChange={(e) => onFormDataChange({ ...formData, tipoNegocio: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
                >
                  <option value="">Seleccionar tipo...</option>
                  {TIPOS_NEGOCIO.map((tipo) => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
                {formData.tipoNegocio && !TIPOS_NEGOCIO.includes(formData.tipoNegocio) && (
                  <p className="text-xs text-amber-600 mt-1">
                    Valor anterior "{formData.tipoNegocio}" no está en la lista. Selecciona uno de la lista o déjalo en blanco.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section 2: Location */}
        {activeSection === 'ubicacion' && (
          <div className="space-y-4">
            <InfoBanner type="tip">
              La dirección completa ayuda al repartidor a encontrar el lugar más rápido. Incluye referencias conocidas.
            </InfoBanner>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Barrio / Zona</label>
              <input
                type="text"
                value={formData.barrio}
                onChange={(e) => onFormDataChange({ ...formData, barrio: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                placeholder="Ej: Centro, Las Flores"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Dirección completa</label>
              <textarea
                value={formData.direccion}
                onChange={(e) => onFormDataChange({ ...formData, direccion: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
                rows={3}
                placeholder="Calle, número, apartamento, referencias..."
              />
            </div>
          </div>
        )}

        {/* Section 3: Frequency */}
        {activeSection === 'frecuencia' && (
          <div className="space-y-4">
            <InfoBanner type="tip">
              Configura la frecuencia para que el sistema te recuerde cuándo este cliente debería volver a comprar.
            </InfoBanner>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Repetir cada
                  <Tooltip content="Días entre cada compra. Déjalo en 0 si no es recurrente." position="top">
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold cursor-help">?</span>
                  </Tooltip>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    value={formData.cadaNDias}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : parseInt(e.target.value)
                      onFormDataChange({ ...formData, cadaNDias: isNaN(val as number) ? '' : val })
                    }}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">días</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Primera entrega</label>
                <input
                  type="date"
                  value={formData.proxEntrega}
                  onChange={(e) => onFormDataChange({ ...formData, proxEntrega: e.target.value })}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                />
              </div>
            </div>

            {formData.cadaNDias && formData.cadaNDias > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700">
                  Este cliente compra cada <strong>{formData.cadaNDias} días</strong>.
                  {formData.proxEntrega && (
                    <> La próxima entrega sugerida es el <strong>{new Date(formData.proxEntrega).toLocaleDateString('es-CO')}</strong>.</>
                  )}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas adicionales</label>
              <textarea
                value={formData.notas}
                onChange={(e) => onFormDataChange({ ...formData, notas: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
                rows={3}
                placeholder="Horario de atención, referencias, preferencias..."
              />
            </div>
          </div>
        )}

        {/* Section 4: Prices */}
        {activeSection === 'precios' && (
          <div className="space-y-4">
            <InfoBanner type="info">
              Los precios especiales aplican <strong>solo a este cliente</strong>. Déjalos en blanco para usar los precios de lista.
            </InfoBanner>

            {/* Active overrides summary */}
            {(() => {
              const allOverrides: Array<{ canal: Canal; codigo: string; nombre: string; precio: number }> = []
              for (const canal of ['DOMICILIO', 'PUNTO'] as Canal[]) {
                for (const prod of PRODUCTOS_PRECIO) {
                  const val = preciosEspecialesMap[canal][prod.codigo]
                  if (val !== undefined && val > 0 && val !== preciosBase[canal][prod.codigo]) {
                    allOverrides.push({ canal, codigo: prod.codigo, nombre: prod.nombre, precio: val })
                  }
                }
              }
              if (allOverrides.length === 0) return null
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-2">Precios personalizados activos:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allOverrides.map((item) => {
                      const iconCfg = getProductoIconConfig(item.codigo)
                      const Icon = iconCfg.Icon
                      return (
                        <span
                          key={`${item.canal}-${item.codigo}`}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                            item.canal === 'DOMICILIO'
                              ? 'bg-blue-100 border-blue-200 text-blue-700'
                              : 'bg-purple-100 border-purple-200 text-purple-700'
                          }`}
                        >
                          <Icon size={14} />
                          <span>{item.nombre}</span>
                          <span className="font-bold">${item.precio.toLocaleString()}</span>
                          <span className="text-[10px] opacity-70">({item.canal === 'DOMICILIO' ? 'Dom' : 'Punto'})</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Canal selector */}
            <div className="flex gap-2">
              {(['DOMICILIO', 'PUNTO'] as Canal[]).map((canal) => (
                <button
                  key={canal}
                  type="button"
                  onClick={() => onCanalActivoChange(canal)}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition ${
                    canalActivo === canal
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {canal === 'DOMICILIO' ? 'A domicilio' : 'En punto'}
                </button>
              ))}
            </div>

            {/* Price grid */}
            <div className="grid grid-cols-2 gap-2">
              {PRODUCTOS_PRECIO.map((prod) => {
                const base = preciosBase[canalActivo][prod.codigo]
                const especial = preciosEspecialesMap[canalActivo][prod.codigo]
                const hasOverride = especial !== undefined && especial > 0 && especial !== base
                const iconCfg = getProductoIconConfig(prod.codigo)
                const Icon = iconCfg.Icon
                return (
                  <div
                    key={prod.codigo}
                    className={`rounded-lg p-3 border transition ${
                      hasOverride
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon size={16} />
                      <span className="text-xs font-medium text-gray-700 truncate">{prod.nombre}</span>
                    </div>
                    {base > 0 && (
                      <p className="text-[10px] text-gray-400 mb-1">Base: {formatCurrency(base)}</p>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        value={especial ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseFloat(e.target.value)
                          onPrecioEspecialChange(canalActivo, prod.codigo, val)
                        }}
                        placeholder="Precio especial"
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </form>

      {/* Footer */}
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
            form="cliente-form"
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition shadow-sm"
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
