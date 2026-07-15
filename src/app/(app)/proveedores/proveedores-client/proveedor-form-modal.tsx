import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/modal'
import type { ProveedorForm } from './types'
import { TelefonoInput } from '@/components/telefono-input'
import { normalizarTelefono } from '@/lib/telefono'

export function ProveedorFormModal({
  open,
  onClose,
  onSaved,
  editingId,
  initialData,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editingId: string | null
  initialData: ProveedorForm
}) {
  const [form, setForm] = useState<ProveedorForm>(initialData)
  const [saving, setSaving] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    try {
      setSaving(true)
      const url = editingId ? `/api/proveedores/${editingId}` : '/api/proveedores'
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          telefono: form.telefono ? normalizarTelefono(form.telefono) : undefined,
          email: form.email?.trim() || undefined,
          direccion: form.direccion?.trim() || undefined,
          tipoProducto: form.tipoProducto?.trim() || undefined,
          observaciones: form.observaciones?.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error?.message || data.error?.formErrors?.[0] || 'Error al guardar el proveedor')
      }
      onClose()
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
      <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        {editingId ? 'Editar proveedor' : 'Nuevo proveedor'}
      </h2>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="nombre" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input id="nombre" type="text" required value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
            placeholder="Nombre del proveedor" />
        </div>
        <div>
          <TelefonoInput
            id="telefono"
            name="telefono"
            label="Teléfono"
            value={form.telefono ?? ''}
            onChange={(v) => setForm((prev) => ({ ...prev, telefono: v }))}
            inputClassName="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
            placeholder="310 292 1234"
            helpText="Se agrega automáticamente +57"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Email</label>
          <input id="email" type="email" value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
            placeholder="proveedor@ejemplo.com" />
        </div>
        <div>
          <label htmlFor="direccion" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Dirección</label>
          <input id="direccion" type="text" value={form.direccion}
            onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
            placeholder="Calle, numero, ciudad" />
        </div>
        <div>
          <label htmlFor="tipoProducto" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Tipo de productos o servicios</label>
          <input id="tipoProducto" type="text" value={form.tipoProducto}
            onChange={(e) => setForm((prev) => ({ ...prev, tipoProducto: e.target.value }))}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
            placeholder="Ej. Agua purificada, hielo, insumos" />
        </div>
        <div>
          <label htmlFor="observaciones" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Observaciones</label>
          <textarea id="observaciones" rows={3} value={form.observaciones}
            onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
            placeholder="Notas adicionales sobre el proveedor" />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !form.nombre.trim()}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving && <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-50" />}
            {editingId ? 'Guardar cambios' : 'Crear proveedor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
