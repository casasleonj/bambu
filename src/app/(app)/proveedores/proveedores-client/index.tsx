"use client";

import { useState } from "react";
import { useConfirm } from "@/components/confirm-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import type { Proveedor, ProveedorForm, ProveedoresClientProps } from "./types";
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
    const ok = await confirm("¿Estas seguro de que deseas desactivar este proveedor?");
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
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona tus proveedores de insumos</p>
        </div>
        <Button onClick={openCreate}>+ Nuevo proveedor</Button>
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50/50">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-red-700 text-sm">{error}</span>
            <Button size="sm" variant="destructive" onClick={fetchProveedores}>Reintentar</Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : proveedores.length === 0 ? (
        <EmptyState
          icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
          title="No hay proveedores registrados"
          description="Haz clic en &quot;Nuevo proveedor&quot; para agregar uno"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proveedores.map((p) => (
            <Card key={p.id} className={p.activo === false ? 'opacity-60' : ''}>
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <h2 className="text-lg font-semibold">{p.nombre}</h2>
                  {p.activo === false && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                      Inactivo
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-2 text-sm text-muted-foreground">
                  {p.telefono && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">Teléfono:</span>
                      <span>{p.telefono}</span>
                    </div>
                  )}
                  {p.email && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">Email:</span>
                      <span className="break-all">{p.email}</span>
                    </div>
                  )}
                  {p.direccion && (
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-foreground">Dirección:</span>
                      <span>{p.direccion}</span>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(p)}>Editar</Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDeactivate(p.id)}>Desactivar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProveedorFormModal open={modalOpen} onClose={closeModal} onSaved={fetchProveedores}
        editingId={editingId} initialData={form} />
      {modal}
    </div>
  );
}
