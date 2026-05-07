import { useState } from 'react'
import { Modal } from '@/components/modal'
import type { ProveedorForm } from './types'

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
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Error al guardar el proveedor')
      onClose()
      onSaved()
    } catch {
      // error handled by parent
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
          <label htmlFor="telefono" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Teléfono</label>
          <input id="telefono" type="text" value={form.telefono}
            onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
            placeholder="+52 000 000 0000" />
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
        <div className="flex items-center justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
            Cancelar
          </button>
          <button type="submit" disabled={saving || !form.nombre.trim()}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200">
            {saving && <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-50" />}
            {editingId ? 'Guardar cambios' : 'Crear proveedor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
