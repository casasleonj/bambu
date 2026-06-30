'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Canal, FormData } from './types'
import { PRODUCTOS_PRECIO } from './types'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { formatCurrency, formatLocalDate } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { FeedbackField } from '@/components/feedback-field'
import { InfoBanner } from '@/components/tooltip'

import { TipoNegocioSelect } from '@/components/tipo-negocio-select'
import { CoordsPreview } from '@/components/coords-preview'

const FUENTES: string[] = [
  'Página web', 'Instagram', 'Facebook', 'Referido', 'WhatsApp',
]

interface PlantillaInfo {
  id: string
  activo: boolean
  cadaNDias: number
  horaPreferida: string | null
  productos: string
  ultimaGeneracion: string | null
  proxGeneracion: string | null
  tipo: string
  canal: string
  notas: string | null
}

interface ClienteFormProps {
  open?: boolean
  onClose?: () => void
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
  plantillaRecurrente?: PlantillaInfo | null
  inline?: boolean
  formId?: string
}

export function ClienteForm({
  open,
  onClose,
  isEdit: _isEdit,
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
  plantillaRecurrente,
  inline,
  formId = 'cliente-form',
}: ClienteFormProps) {
  const [activeSection, setActiveSection] = useState<'basico' | 'ubicacion' | 'contactos' | 'frecuencia' | 'precios'>('basico')
  const [productosConfig, setProductosConfig] = useState<Array<{ codigo: string; aplicaDomicilio: boolean }>>([])

  useEffect(() => {
    fetch(`/api/productos/configs`)
      .then(r => r.json())
      .then(d => { if (d.success && d.productos) setProductosConfig(d.productos) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (open) setActiveSection('basico')
  }, [open])

  const productosFiltrados = canalActivo === 'DOMICILIO'
    ? PRODUCTOS_PRECIO.filter(prod => {
        const cfg = productosConfig.find(c => c.codigo === prod.codigo)
        return cfg ? cfg.aplicaDomicilio : true
      })
    : PRODUCTOS_PRECIO

  const sections = [
    { key: 'basico', label: 'Básico', icon: <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>, description: 'Nombre y contacto' },
    { key: 'ubicacion', label: 'Ubicación', icon: <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>, description: 'Barrio y dirección' },
    { key: 'contactos', label: 'Contactos', icon: <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-2.83-2.83A4.99 4.99 0 0017 13V9a4 4 0 00-8 0v4c0 1.1-.9 2-2 2a3 3 0 00-2.83 2.83A4.99 4.99 0 007 20h5m0 0v2h2v-2m-2-2h2m-6-4h.01M12 12h.01" /></svg>, description: 'Personas de contacto' },
    { key: 'frecuencia', label: 'Recurrentes', icon: <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>, description: 'Plantilla recurrente' },
    { key: 'precios', label: 'Precios', icon: <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>, description: 'Precios especiales' },
  ] as const

  const tabs = (
    <div className="flex gap-1" role="tablist" aria-label="Secciones del formulario">
      {sections.map((section) => (
        <button
          key={section.key}
          role="tab"
          aria-selected={activeSection === section.key}
          aria-label={section.description}
          onClick={() => setActiveSection(section.key)}
          className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition text-center ${
            activeSection === section.key
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          <span className="block mb-0.5">{section.icon}</span>
          <span className="hidden sm:inline">{section.label}</span>
        </button>
      ))}
    </div>
  )

  const body = (
    <>
      {!inline && (
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold text-gray-900">Nuevo Cliente</h2>
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
          {tabs}
        </div>
      )}
      {inline && (
        <div className="px-4 pt-2 pb-1 border-b border-gray-100">
          {tabs}
        </div>
      )}

      {/* Form error */}
      {formError && (
        <div className={`${inline ? 'px-4 pt-3' : 'mx-4 mt-4'} p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2`}>
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{formError}</span>
        </div>
      )}

      <form id={formId} onSubmit={onSubmit} className="flex-1 overflow-y-auto p-4 space-y-5">
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">¿Cómo nos conoció?</label>
              <TipoNegocioSelect
                options={FUENTES}
                value={formData.fuente}
                onChange={(val) => onFormDataChange({ ...formData, fuente: val })}
                placeholder="Buscar fuente..."
                apiUrl="/api/clientes/fuentes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Límite de pedidos fiados</label>
              <input
                type="number"
                min={1}
                max={20}
                value={formData.limitePedidosFiados || ''}
                onChange={(e) => onFormDataChange({ ...formData, limitePedidosFiados: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                placeholder="Ej: 3"
              />
              <p className="text-xs text-gray-400 mt-1">Máximo de pedidos con saldo pendiente antes de bloquear nuevos pedidos. Deja vacío para usar el límite global.</p>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Link de Google Maps</label>
              <input
                type="url"
                value={formData.linkUbicacion}
                onChange={(e) => onFormDataChange({ ...formData, linkUbicacion: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                placeholder="https://maps.google.com/?q=..."
              />
              <p className="text-xs text-gray-400 mt-1">Opcional. Pega el enlace de Google Maps de la ubicación del cliente.</p>
              {/* Bloque 1: feedback client-side de si el link es parseable. */}
              <CoordsPreview url={formData.linkUbicacion} />
            </div>
          </div>
        )}

        {/* Section 3: Contactos */}
        {activeSection === 'contactos' && (
          <div className="space-y-4">
            <InfoBanner type="tip">
              Agrega personas de contacto adicionales para el mismo negocio. Útil cuando esposo y esposa tienen teléfonos distintos.
            </InfoBanner>

            {/* Existing contacts list */}
            {formData.contactos.length > 0 && (
              <div className="space-y-2">
                {formData.contactos.map((contacto, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={contacto.nombre}
                        onChange={(e) => {
                          const updated = [...formData.contactos]
                          updated[idx] = { ...updated[idx], nombre: e.target.value }
                          onFormDataChange({ ...formData, contactos: updated })
                        }}
                        className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Nombre"
                      />
                      <input
                        type="tel"
                        value={contacto.telefono}
                        onChange={(e) => {
                          const updated = [...formData.contactos]
                          updated[idx] = { ...updated[idx], telefono: e.target.value }
                          onFormDataChange({ ...formData, contactos: updated })
                        }}
                        className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Teléfono"
                      />
                      <input
                        type="text"
                        value={contacto.relacion || ''}
                        onChange={(e) => {
                          const updated = [...formData.contactos]
                          updated[idx] = { ...updated[idx], relacion: e.target.value }
                          onFormDataChange({ ...formData, contactos: updated })
                        }}
                        className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Relación (ej: esposa)"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = formData.contactos.filter((_, i) => i !== idx)
                        onFormDataChange({ ...formData, contactos: updated })
                      }}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition shrink-0"
                      aria-label="Eliminar contacto"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add contact button */}
            <button
              type="button"
              onClick={() => {
                onFormDataChange({
                  ...formData,
                  contactos: [...formData.contactos, { nombre: '', telefono: '', relacion: '' }],
                })
              }}
              className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:text-blue-600 hover:border-blue-300 transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Agregar contacto
            </button>
          </div>
        )}

        {/* Section 4: Frequency */}
        {activeSection === 'frecuencia' && (
          <div className="space-y-4">
            {plantillaRecurrente?.activo ? (
              <InfoBanner type="info">
                La frecuencia está controlada por <strong>pedidos recurrentes</strong>. Edita la plantilla para cambiarla.
              </InfoBanner>
            ) : (
              <InfoBanner type="tip">
                Configura la frecuencia desde <strong>Pedidos Recurrentes</strong> para automatizar las entregas de este cliente.
              </InfoBanner>
            )}

            {plantillaRecurrente?.activo ? (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded font-semibold">Plantilla Recurrente Activa</span>
                  <Link href={`/recurrentes/${plantillaRecurrente.id}`}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline">
                    Gestionar →
                  </Link>
                </div>
                <div className="text-sm text-indigo-900 space-y-1">
                  <p><span className="font-medium">Cada:</span> {plantillaRecurrente.cadaNDias} días</p>
                  {plantillaRecurrente.horaPreferida && <p><span className="font-medium">Horario:</span> {plantillaRecurrente.horaPreferida}</p>}
                  {plantillaRecurrente.proxGeneracion && <p><span className="font-medium">Próxima generación:</span> {formatLocalDate(plantillaRecurrente.proxGeneracion)}</p>}
                  {(() => {
                    // FASE 3: productos ahora es array de PlantillaProducto[].
                    // FIX AGENTS.md nota 11: antes el form mostraba los
                    // productos como un string read-only ("PACA_AGUA=1,
                    // HIELO=2") sin accion visible para editarlos. El
                    // user tenia que descubrir el "Gestionar →" del header
                    // o probar el form y notar que no persistia. Ahora
                    // mostramos la lista de productos + un link prominente
                    // "Editar productos" que va a /recurrentes/[id] donde
                    // SI persisten via PUT.
                    //
                    // === DECISION DE DISENO FINAL (no es un workaround) ===
                    // La edicion de productos desde el form del cliente
                    // NO se implementa. Los productos viven en
                    // PlantillaProducto con @unique([plantillaId, producto])
                    // — 1FN storage, separados de la entidad Cliente — y
                    // se editan EXCLUSIVAMENTE en /recurrentes/[id]. Esta
                    // es la decision de diseno explicita (no un follow-up
                    // pendiente): el form del cliente solo muestra el
                    // estado actual + un CTA al editor canonico. No crear
                    // sub-endpoints /api/clientes/[id]/plantilla-productos
                    // ni duplicar el editor aca.
                    const items = Array.isArray(plantillaRecurrente.productos)
                      ? plantillaRecurrente.productos
                      : []
                    const entries = items.filter(p => p.cantidad > 0)
                    if (entries.length === 0) return null
                    return (
                      <div className="mt-3 pt-3 border-t border-indigo-200" data-testid="plantilla-productos-display">
                        <p className="font-medium mb-1">Productos:</p>
                        <ul className="text-sm space-y-0.5 mb-2">
                          {entries.map((p) => (
                            <li key={p.producto}>
                              <span className="font-mono">{p.producto}</span>
                              <span className="text-indigo-700"> = {p.cantidad}</span>
                            </li>
                          ))}
                        </ul>
                        <Link
                          href={`/recurrentes/${plantillaRecurrente.id}`}
                          data-testid="editar-productos-link"
                          className="inline-flex items-center gap-1 text-xs text-indigo-700 hover:text-indigo-900 font-semibold underline"
                        >
                          Editar productos en Pedidos Recurrentes →
                        </Link>
                      </div>
                    )
                  })()}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">Sin plantilla recurrente activa.</p>
                <Link href="/recurrentes" className="text-xs text-blue-600 hover:underline font-medium mt-1 inline-block">
                  Ir a Pedidos Recurrentes →
                </Link>
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
                for (const prod of productosFiltrados) {
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
                          <span className="font-bold">{formatCurrency(item.precio)}</span>
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
              {productosFiltrados.map((prod) => {
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

      {!inline && (
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
              form={formId}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition shadow-sm"
            >
              {saving ? 'Guardando...' : 'Crear cliente'}
            </button>
          </div>
        </div>
      )}
    </>
  )

  if (inline) {
    return <div className="flex flex-col h-full min-h-0">{body}</div>
  }
  return (
    <Modal open={open!} onClose={onClose!} className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
      {body}
    </Modal>
  )
}
