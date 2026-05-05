"use client";

import { useState } from "react";
import { useConfirm } from "@/components/confirm-modal";
import type { Proveedor, ProveedorForm, ProveedoresClientProps } from "./types";
import { ProveedorCard } from "./proveedor-card";
import { ProveedorFormModal } from "./proveedor-form-modal";

const EMPTY_FORM: ProveedorForm = { nombre: "", telefono: "", email: "", direccion: "" };

export default function ProveedoresClient({ initialProveedores }: ProveedoresClientProps) {
  const [proveedores, setProveedores] = useState<Proveedor[]>(initialProveedores);
  const { confirm, modal } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProveedorForm>(EMPTY_FORM);

  async function fetchProveedores() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/proveedores");
      if (!res.ok) throw new Error("Error al cargar proveedores");
      const data = await res.json();
      setProveedores(Array.isArray(data) ? data : data.proveedores || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(p: Proveedor) {
    setEditingId(p.id);
    setForm({ nombre: p.nombre, telefono: p.telefono ?? "", email: p.email ?? "", direccion: p.direccion ?? "" });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  async function handleDeactivate(id: string) {
    const ok = await confirm("Estas seguro de que deseas desactivar este proveedor?")
    if (!ok) return;
    try {
      const res = await fetch(`/api/proveedores/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al desactivar el proveedor");
      await fetchProveedores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 dark:bg-zinc-950">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Proveedores</h1>
          <button onClick={openCreate}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200">
            Nuevo proveedor
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchProveedores}
              className="ml-4 inline-flex items-center justify-center rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700">
              Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : proveedores.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">No hay proveedores registrados</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Haz clic en "Nuevo proveedor" para agregar uno.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {proveedores.map((p) => (
              <ProveedorCard key={p.id} proveedor={p} onEdit={openEdit} onDeactivate={handleDeactivate} />
            ))}
          </div>
        )}
      </div>

      <ProveedorFormModal open={modalOpen} onClose={closeModal} onSaved={fetchProveedores}
        editingId={editingId} initialData={form} />
      {modal}
    </div>
  );
}
