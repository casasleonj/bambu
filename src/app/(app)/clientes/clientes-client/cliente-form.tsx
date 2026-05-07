'use client'

import type { Canal, FormData } from './types'
import { PRODUCTOS_PRECIO } from './types'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'

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
  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">
        {isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}
      </h2>
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
          {formError}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="cliente-nombre" className="block text-sm font-medium mb-1">Nombre *</label>
            <input
              id="cliente-nombre"
              type="text"
              required
              value={formData.nombre}
              onChange={(e) => onFormDataChange({ ...formData, nombre: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="cliente-apellido" className="block text-sm font-medium mb-1">Apellido</label>
            <input
              id="cliente-apellido"
              type="text"
              value={formData.apellido}
              onChange={(e) => onFormDataChange({ ...formData, apellido: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
        <div>
          <label htmlFor="cliente-telefono" className="block text-sm font-medium mb-1">Teléfono *</label>
          <input
            id="cliente-telefono"
            type="tel"
            required
            value={formData.telefono}
            onChange={(e) => onFormDataChange({ ...formData, telefono: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="cliente-negocio" className="block text-sm font-medium mb-1">Negocio</label>
            <input
              id="cliente-negocio"
              type="text"
              value={formData.nombreNegocio}
              onChange={(e) => onFormDataChange({ ...formData, nombreNegocio: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label htmlFor="cliente-tipo" className="block text-sm font-medium mb-1">Tipo</label>
            <input
              id="cliente-tipo"
              type="text"
              value={formData.tipoNegocio}
              onChange={(e) => onFormDataChange({ ...formData, tipoNegocio: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
        <div>
          <label htmlFor="cliente-barrio" className="block text-sm font-medium mb-1">Barrio</label>
          <input
            id="cliente-barrio"
            type="text"
            value={formData.barrio}
            onChange={(e) => onFormDataChange({ ...formData, barrio: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <div>
          <label htmlFor="cliente-direccion" className="block text-sm font-medium mb-1">Dirección</label>
          <input
            id="cliente-direccion"
            type="text"
            value={formData.direccion}
            onChange={(e) => onFormDataChange({ ...formData, direccion: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="cliente-cadaNDias" className="block text-sm font-medium mb-1">Repetir pedido cada ___ días</label>
            <input
              id="cliente-cadaNDias"
              type="number"
              min={0}
              value={formData.cadaNDias}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : parseInt(e.target.value)
                onFormDataChange({ ...formData, cadaNDias: isNaN(val as number) ? '' : val })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="0 o vacío"
            />
          </div>
          <div>
            <label htmlFor="cliente-proxEntrega" className="block text-sm font-medium mb-1">Primera entrega</label>
            <input
              id="cliente-proxEntrega"
              type="date"
              value={formData.proxEntrega}
              onChange={(e) => onFormDataChange({ ...formData, proxEntrega: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Precios Especiales</label>

          {(() => {
            const allOverrides: Array<{ canal: Canal; codigo: string; nombre: string; emoji: string; precio: number }> = []
            for (const canal of ['DOMICILIO', 'PUNTO'] as Canal[]) {
              for (const prod of PRODUCTOS_PRECIO) {
                const val = preciosEspecialesMap[canal][prod.codigo]
                if (val !== undefined && val > 0 && val !== preciosBase[canal][prod.codigo]) {
                  allOverrides.push({ canal, codigo: prod.codigo, nombre: prod.nombre, emoji: prod.emoji, precio: val })
                }
              }
            }
            if (allOverrides.length === 0) return null
            return (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {allOverrides.map((item) => (
                  <span
                    key={`${item.canal}-${item.codigo}`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                      item.canal === 'DOMICILIO'
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-purple-50 border-purple-200 text-purple-700'
                    }`}
                  >
                    <span>{item.emoji}</span>
                    <span>{item.nombre}</span>
                    <span className="font-bold">${item.precio.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            )
          })()}

          <div className="flex gap-2 mb-3">
            {(['DOMICILIO', 'PUNTO'] as Canal[]).map((canal) => (
              <button
                key={canal}
                type="button"
                onClick={() => onCanalActivoChange(canal)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
                  canalActivo === canal
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {canal}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRODUCTOS_PRECIO.map((prod) => {
              const base = preciosBase[canalActivo][prod.codigo]
              const especial = preciosEspecialesMap[canalActivo][prod.codigo]
              const hasOverride = especial !== undefined && especial > 0 && especial !== base
              return (
                <div
                  key={prod.codigo}
                  className={`rounded-lg p-2.5 border transition ${
                    hasOverride
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-base">{prod.emoji}</span>
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

        <div>
          <label htmlFor="cliente-notas" className="block text-sm font-medium mb-1">Notas</label>
          <textarea
            id="cliente-notas"
            value={formData.notas}
            onChange={(e) => onFormDataChange({ ...formData, notas: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            rows={3}
          />
        </div>
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
