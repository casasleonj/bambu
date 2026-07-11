import { useState, useEffect } from 'react'
import { Modal } from '@/components/modal'
import type { TrabajadorFormData } from './types'
import { rolOptions, rolLabels, tipoPagoOptions, tipoPagoLabels } from './types'

export function TrabajadorFormModal({
  open,
  onClose,
  onSaved,
  isEdit,
  editingId,
  initialData,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  isEdit: boolean
  editingId: string | null
  initialData: TrabajadorFormData
}) {
  const [formData, setFormData] = useState<TrabajadorFormData>(initialData)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setFormData(initialData)
    setFormError('')
  }, [initialData, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)
    try {
      if (isEdit && editingId) {
        const res = await fetch(`/api/trabajadores/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (res.ok) {
          onSaved()
          onClose()
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error?.message || 'Error al actualizar trabajador')
        }
      } else {
        const res = await fetch('/api/trabajadores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (res.ok) {
          onSaved()
          onClose()
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error?.message || 'Error al crear trabajador')
        }
      }
    } catch {
      setFormError('Error de conexión al guardar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold mb-4">
        {isEdit ? 'Editar Trabajador' : 'Nuevo Trabajador'}
      </h2>
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
          {formError}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="trabajador-nombre" className="block text-sm font-medium mb-1">Nombre *</label>
          <input
            id="trabajador-nombre"
            type="text"
            required
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="trabajador-rol" className="block text-sm font-medium mb-1">Rol *</label>
            <select
              id="trabajador-rol"
              required
              value={formData.rol}
              onChange={(e) => {
                const newRol = e.target.value
                const prevRol = formData.rol
                const isAdminOrContador = newRol === 'ADMIN' || newRol === 'CONTADOR'
                setFormData((prev) => {
                  let next: TrabajadorFormData = {
                    ...prev,
                    rol: newRol,
                    tipoPago: isAdminOrContador ? 'FIJO' : prev.tipoPago,
                    usaMoto: isAdminOrContador ? false : prev.usaMoto,
                    capacidadKg: isAdminOrContador ? 0 : prev.capacidadKg,
                  }
                  if (prevRol === 'SELLADOR' && newRol === 'REPARTIDOR') {
                    next = {
                      ...next,
                      comRepartAgua: prev.comPacaAgua,
                      comRepartHielo: prev.comPacaHielo,
                      comRepartBotellon: prev.comBotellon,
                      comPacaAgua: 0,
                      comPacaHielo: 0,
                      comBotellon: 0,
                    }
                  } else if (prevRol === 'REPARTIDOR' && newRol === 'SELLADOR') {
                    next = {
                      ...next,
                      comPacaAgua: prev.comPacaAgua === 0 ? prev.comRepartAgua : prev.comPacaAgua,
                      comPacaHielo: prev.comPacaHielo === 0 ? prev.comRepartHielo : prev.comPacaHielo,
                      comBotellon: prev.comBotellon === 0 ? prev.comRepartBotellon : prev.comBotellon,
                    }
                  }
                  return next
                })
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {rolOptions.map((r) => (
                <option key={r} value={r}>{rolLabels[r]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="trabajador-tipoPago" className="block text-sm font-medium mb-1">Tipo de pago</label>
            <select
              id="trabajador-tipoPago"
              value={formData.tipoPago}
              onChange={(e) => setFormData({ ...formData, tipoPago: e.target.value })}
              disabled={formData.rol === 'ADMIN' || formData.rol === 'CONTADOR'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              {(formData.rol === 'ADMIN' || formData.rol === 'CONTADOR') ? (
                <option value="FIJO">Fijo</option>
              ) : (
                tipoPagoOptions.map((tp) => (
                  <option key={tp} value={tp}>{tipoPagoLabels[tp]}</option>
                ))
              )}
            </select>
            {(formData.rol === 'ADMIN' || formData.rol === 'CONTADOR') && (
              <p className="text-xs text-gray-500 mt-1">Solo salario fijo para este rol</p>
            )}
          </div>
        </div>

        {isEdit && initialData.rol !== formData.rol && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            {(() => {
              if (initialData.rol === 'SELLADOR' && formData.rol === 'REPARTIDOR') {
                return <>Al cambiar a <strong>Repartidor</strong>, las comisiones de producción se pasaron a comisiones de reparto.</>
              }
              if (initialData.rol === 'REPARTIDOR' && formData.rol === 'SELLADOR') {
                return <>Al cambiar a <strong>Sellador</strong>, las comisiones de reparto se pasaron a comisiones de producción.</>
              }
              if (formData.rol === 'ADMIN' || formData.rol === 'CONTADOR') {
                return <>Al cambiar a <strong>{rolLabels[formData.rol]}</strong>, el trabajador pasará a salario fijo y sin comisiones.</>
              }
              return <>Al cambiar el rol, las comisiones se ajustarán automáticamente.</>
            })()}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            id="usaMoto"
            type="checkbox"
            checked={formData.usaMoto}
            onChange={(e) => {
              const checked = e.target.checked
              setFormData({
                ...formData,
                usaMoto: checked,
                capacidadKg: checked ? (formData.capacidadKg || 500) : 0,
                tipoPago: checked ? formData.tipoPago : 'FIJO',
              })
            }}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <label htmlFor="usaMoto" className="text-sm font-medium text-gray-700">
            Usa moto
          </label>
          {!formData.usaMoto && (
            <span className="text-xs text-gray-500 italic">Sin moto → no comisiona reparto</span>
          )}
        </div>

        {formData.usaMoto && (
          <div>
            <label htmlFor="trabajador-capacidadKg" className="block text-sm font-medium mb-1">Capacidad moto (kg)</label>
            <input
              id="trabajador-capacidadKg"
              type="number"
              min={100}
              max={2000}
              value={formData.capacidadKg || ''}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') {
                  setFormData({ ...formData, capacidadKg: 0 })
                } else {
                  const v = parseInt(raw)
                  if (!isNaN(v)) {
                    setFormData({ ...formData, capacidadKg: v })
                  }
                }
              }}
              onBlur={() => {
                if (formData.capacidadKg === 0) {
                  setFormData({ ...formData, capacidadKg: 500 })
                } else {
                  setFormData({ ...formData, capacidadKg: Math.min(2000, Math.max(100, formData.capacidadKg)) })
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Peso maximo que puede cargar la motocarga</p>
          </div>
        )}

        {formData.rol === 'SELLADOR' && (formData.tipoPago === 'COMISION' || formData.tipoPago === 'MIXTO') && (
          <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comisiones producción</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="trabajador-comPacaAgua" className="block text-sm font-medium mb-1">Com. paca agua</label>
                <input
                  id="trabajador-comPacaAgua"
                  type="number"
                  min={0}
                  value={formData.comPacaAgua}
                  onChange={(e) => setFormData({ ...formData, comPacaAgua: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="trabajador-comPacaHielo" className="block text-sm font-medium mb-1">Com. paca hielo</label>
                <input
                  id="trabajador-comPacaHielo"
                  type="number"
                  min={0}
                  value={formData.comPacaHielo}
                  onChange={(e) => setFormData({ ...formData, comPacaHielo: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="trabajador-comBotellon" className="block text-sm font-medium mb-1">Com. botellón</label>
                <input
                  id="trabajador-comBotellon"
                  type="number"
                  min={0}
                  value={formData.comBotellon}
                  onChange={(e) => setFormData({ ...formData, comBotellon: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {(formData.rol === 'REPARTIDOR' || formData.rol === 'SELLADOR') && formData.usaMoto && (formData.tipoPago === 'COMISION' || formData.tipoPago === 'MIXTO') && (
          <div className="border rounded-lg p-3 bg-blue-50 space-y-3">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Comisiones reparto</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="trabajador-comRepartAgua" className="block text-sm font-medium mb-1">Com. reparto agua</label>
                <input
                  id="trabajador-comRepartAgua"
                  type="number"
                  min={0}
                  value={formData.comRepartAgua}
                  onChange={(e) => setFormData({ ...formData, comRepartAgua: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="trabajador-comRepartHielo" className="block text-sm font-medium mb-1">Com. reparto hielo</label>
                <input
                  id="trabajador-comRepartHielo"
                  type="number"
                  min={0}
                  value={formData.comRepartHielo}
                  onChange={(e) => setFormData({ ...formData, comRepartHielo: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="trabajador-comRepartBotellon" className="block text-sm font-medium mb-1">Com. reparto botellón</label>
                <input
                  id="trabajador-comRepartBotellon"
                  type="number"
                  min={0}
                  value={formData.comRepartBotellon}
                  onChange={(e) => setFormData({ ...formData, comRepartBotellon: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {(formData.tipoPago === 'FIJO' || formData.tipoPago === 'MIXTO') && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="trabajador-salarioFijo" className="block text-sm font-medium mb-1">Salario fijo</label>
              <input
                id="trabajador-salarioFijo"
                type="number"
                min={0}
                value={formData.salarioFijo}
                onChange={(e) => setFormData({ ...formData, salarioFijo: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label htmlFor="trabajador-telefono" className="block text-sm font-medium mb-1">Teléfono</label>
              <input
                id="trabajador-telefono"
                type="tel"
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        )}

        {formData.tipoPago === 'COMISION' && (
          <div>
            <label htmlFor="trabajador-telefono" className="block text-sm font-medium mb-1">Teléfono</label>
            <input
              id="trabajador-telefono"
              type="tel"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        )}

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
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
