"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

interface Proveedor {
  id: string;
  nombre: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  activo?: boolean;
}

type ProveedorForm = Omit<Proveedor, "id" | "activo">;

interface ProveedoresClientProps {
  initialProveedores: Proveedor[];
}

export default function ProveedoresClient({
  initialProveedores,
}: ProveedoresClientProps) {
  const [proveedores, setProveedores] =
    useState<Proveedor[]>(initialProveedores);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProveedorForm>({
    nombre: "",
    telefono: "",
    email: "",
    direccion: "",
  });
  const [saving, setSaving] = useState(false);

  async function fetchProveedores() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/proveedores");
      if (!res.ok) throw new Error("Error al cargar proveedores");
      const data = await res.json();
      setProveedores(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({ nombre: "", telefono: "", email: "", direccion: "" });
    setModalOpen(true);
  }

  function openEdit(p: Proveedor) {
    setEditingId(p.id);
    setForm({
      nombre: p.nombre,
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      direccion: p.direccion ?? "",
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm({ nombre: "", telefono: "", email: "", direccion: "" });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;

    try {
      setSaving(true);
      const url = editingId
        ? `/api/proveedores/${editingId}`
        : "/api/proveedores";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Error al guardar el proveedor");

      closeModal();
      await fetchProveedores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("¿Estás seguro de que deseas desactivar este proveedor?"))
      return;

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
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Proveedores
          </h1>
          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Nuevo proveedor
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-50" />
          </div>
        ) : proveedores.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">
              No hay proveedores registrados
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Haz clic en "Nuevo proveedor" para agregar uno.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {proveedores.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md dark:bg-zinc-900"
              >
                <div className="mb-4 flex items-start justify-between">
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {p.nombre}
                  </h2>
                  {p.activo === false && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                      Inactivo
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {p.telefono && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-500 dark:text-zinc-500">
                        Teléfono:
                      </span>
                      <span>{p.telefono}</span>
                    </div>
                  )}
                  {p.email && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-500 dark:text-zinc-500">
                        Email:
                      </span>
                      <span className="break-all">{p.email}</span>
                    </div>
                  )}
                  {p.direccion && (
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-zinc-500 dark:text-zinc-500">
                        Dirección:
                      </span>
                      <span>{p.direccion}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={() => openEdit(p)}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeactivate(p.id)}
                    className="inline-flex flex-1 items-center justify-center rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
                  >
                    Desactivar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={closeModal} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {editingId ? "Editar proveedor" : "Nuevo proveedor"}
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label
              htmlFor="nombre"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="nombre"
              type="text"
              required
              value={form.nombre}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nombre: e.target.value }))
              }
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
              placeholder="Nombre del proveedor"
            />
          </div>

          <div>
            <label
              htmlFor="telefono"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Teléfono
            </label>
            <input
              id="telefono"
              type="text"
              value={form.telefono}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, telefono: e.target.value }))
              }
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
              placeholder="+52 000 000 0000"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
              placeholder="proveedor@ejemplo.com"
            />
          </div>

          <div>
            <label
              htmlFor="direccion"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Dirección
            </label>
            <input
              id="direccion"
              type="text"
              value={form.direccion}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, direccion: e.target.value }))
              }
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50/10"
              placeholder="Calle, número, ciudad"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.nombre.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {saving ? (
                <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-50" />
              ) : null}
              {editingId ? "Guardar cambios" : "Crear proveedor"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
