"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { SkeletonPage } from "@/components/skeleton";
import type { Proveedor, ProveedorForm, ProveedoresClientProps, SortDir } from "./types";
import { ProveedorFormModal } from "./proveedor-form-modal";
import { ProveedorDetailModal } from "./proveedor-detail-modal";

const EMPTY_FORM: ProveedorForm = { nombre: "", telefono: "", email: "", direccion: "", tipoProducto: "", observaciones: "" };

function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
    "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-teal-500",
    "bg-orange-500", "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function ProveedoresClient({ initialProveedores }: ProveedoresClientProps) {
  const [proveedores, setProveedores] = useState<Proveedor[]>(initialProveedores);
  const { confirm, modal } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProveedorForm>(EMPTY_FORM);

  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClick = () => setOpenMenuId(null);
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openMenuId]);

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
      toast.error("Error cargando proveedores");
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
    setForm({
      nombre: p.nombre,
      telefono: p.telefono ?? "",
      email: p.email ?? "",
      direccion: p.direccion ?? "",
      tipoProducto: p.tipoProducto ?? "",
      observaciones: p.observaciones ?? "",
    });
    setModalOpen(true);
    setOpenMenuId(null);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  async function handleDeactivate(id: string) {
    const ok = await confirm("¿Estas seguro de que deseas desactivar este proveedor?");
    if (!ok) return;
    setDeactivatingId(id);
    try {
      const res = await fetch(`/api/proveedores/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al desactivar el proveedor");
      await fetchProveedores();
      toast.success("Proveedor desactivado");
      setOpenMenuId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    } finally {
      setDeactivatingId(null);
    }
  }

  function openDetail(p: Proveedor) {
    setSelectedProveedor(p);
    setShowDetail(true);
  }

  function closeDetail() {
    setShowDetail(false);
    setSelectedProveedor(null);
  }

  const filtered = proveedores.filter((p) => {
    const term = search.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(term) ||
      p.telefono?.toLowerCase().includes(term) ||
      p.email?.toLowerCase().includes(term) ||
      p.tipoProducto?.toLowerCase().includes(term) ||
      p.direccion?.toLowerCase().includes(term)
    );
  }).sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    return dir * a.nombre.localeCompare(b.nombre);
  });

  const totalActivos = proveedores.length;
  const tiposUnicos = new Set(proveedores.map((p) => p.tipoProducto).filter(Boolean)).size;

  if (loading && proveedores.length === 0) {
    return <SkeletonPage hasStats hasFilters cardCount={5} />;
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{totalActivos}</div>
            <div className="text-sm text-muted-foreground">Proveedores</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{tiposUnicos}</div>
            <div className="text-sm text-muted-foreground">Categorías</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono, tipo..."
            className="w-full h-10 rounded-lg border bg-background pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="shrink-0 gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          Nombre {sortDir === "asc" ? "A-Z" : "Z-A"}
        </Button>
      </div>

      {search && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} para &quot;{search}&quot;
        </p>
      )}

      {filtered.length === 0 ? (
        search ? (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
            title="Sin resultados"
            description="No se encontraron proveedores con ese criterio de búsqueda"
          />
        ) : (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
            title="No hay proveedores registrados"
            description="Haz clic en &quot;Nuevo proveedor&quot; para agregar uno"
          />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className={`cursor-pointer transition hover:shadow-md ${p.activo === false ? "opacity-60" : ""}`}
              onClick={() => openDetail(p)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${getAvatarColor(p.nombre)}`}>
                    {p.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold truncate">{p.nombre}</h2>
                      <div className="relative shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === p.id ? null : p.id);
                          }}
                          disabled={deactivatingId === p.id}
                          className="p-1 rounded-md hover:bg-muted transition disabled:opacity-50"
                        >
                          <svg className="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>
                        {openMenuId === p.id && (
                          <div className="absolute right-0 top-8 w-40 bg-popover border rounded-lg shadow-lg py-1 z-50">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-muted flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Editar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeactivate(p.id); }}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-muted text-red-600 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              Desactivar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {p.tipoProducto && (
                      <Badge variant="outline" className="mt-1 text-[10px]">
                        {p.tipoProducto}
                      </Badge>
                    )}

                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {p.telefono && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="truncate">{p.telefono}</span>
                        </div>
                      )}
                      {p.email && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{p.email}</span>
                        </div>
                      )}
                      {p.direccion && (
                        <div className="flex items-start gap-1.5">
                          <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="line-clamp-2">{p.direccion}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProveedorDetailModal open={showDetail} onClose={closeDetail} proveedor={selectedProveedor} onEdit={openEdit} />
      <ProveedorFormModal open={modalOpen} onClose={closeModal} onSaved={fetchProveedores}
        editingId={editingId} initialData={form} />
      {modal}
    </div>
  );
}
