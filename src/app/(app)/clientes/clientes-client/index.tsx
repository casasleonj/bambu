'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { ErrorState } from '@/components/error-state'
import { SkeletonPage } from '@/components/skeleton'
import { Tooltip } from '@/components/tooltip'
import type { Cliente, Canal, ClientesClientProps, FormData } from './types'
import { PRODUCTOS_PRECIO } from './types'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { ClienteTable } from './cliente-table'
import { ClienteForm } from './cliente-form'
import { ClienteHistorial } from './cliente-historial'
import { ClienteStats } from './cliente-stats'
import { calcularAlertasCliente } from '@/app/(app)/pedidos/pedidos-client/alertas-utils'
import { GuiaAlertaModal } from '@/components/guia-alerta-modal'
import { CasoGuiaModal } from '@/components/caso-guia-modal'
import type { AlertaTipo } from '@/lib/alertas-config'
import { getBadgeColor, ignorarAlerta } from '@/lib/alertas-config'

export default function ClientesClient({ initialClientes }: ClientesClientProps) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes)
  const { confirm, modal } = useConfirm()
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('info')
  const [isEdit, setIsEdit] = useState(false)
  const [formError, setFormError] = useState('')
  const [formData, setFormData] = useState<FormData>({
    nombre: '',
    apellido: '',
    telefono: '',
    nombreNegocio: '',
    tipoNegocio: '',
    barrio: '',
    direccion: '',
    cadaNDias: '' as number | '',
    proxEntrega: '',
    preciosEspeciales: '',
    notas: '',
  })

  const [guiaTipo, setGuiaTipo] = useState<AlertaTipo | null>(null)
  const [guiaOpen, setGuiaOpen] = useState(false)
  const [casoCreado, setCasoCreado] = useState<any>(null)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; username: string; rol: string }>>([])

  useEffect(() => {
    fetch('/api/trabajadores')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const users = d.trabajadores
            .filter((t: any) => t.userId)
            .map((t: any) => ({ id: t.userId, username: t.nombre, rol: t.rol }))
          setUsuarios(users)
        }
      })
  }, [])

  const [canalActivo, setCanalActivo] = useState<Canal>('DOMICILIO')
  const [preciosEspecialesMap, setPreciosEspecialesMap] = useState<Record<Canal, Record<string, number | undefined>>>({
    DOMICILIO: {},
    PUNTO: {},
  })
  const [preciosBase, setPreciosBase] = useState<Record<Canal, Record<string, number>>>({
    DOMICILIO: {},
    PUNTO: {},
  })

  async function fetchClientes() {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/clientes')
      if (!res.ok) throw new Error('Error al cargar clientes')
      const data = await res.json()
      setClientes(data.clientes || [])
    } catch (error) {
      setFetchError('No se pudieron cargar los clientes')
      toast.error('Error cargando clientes')
    } finally {
      setLoading(false)
    }
  }

  const loadPreciosBase = useCallback(async () => {
    for (const canal of ['DOMICILIO', 'PUNTO'] as Canal[]) {
      try {
        const res = await fetch(`/api/precios/tabla?canal=${canal}`)
        const data = await res.json()
        const tabla = data.tabla || {}
        const baseMap: Record<string, number> = {}
        for (const prod of PRODUCTOS_PRECIO) {
          const tiers = tabla[prod.codigo] || []
          if (tiers.length > 0) {
            const baseTier = tiers.reduce((min: any, t: any) => t.cantMin < min.cantMin ? t : min, tiers[0])
            baseMap[prod.codigo] = Number(baseTier.precio)
          }
        }
        setPreciosBase(prev => ({ ...prev, [canal]: baseMap }))
      } catch { /* ignore */ }
    }
  }, [])

  function parsePreciosEspeciales(json: string | undefined): Record<Canal, Record<string, number | undefined>> {
    const empty: Record<Canal, Record<string, number | undefined>> = { DOMICILIO: {}, PUNTO: {} }
    if (!json) return empty
    try {
      const parsed = JSON.parse(json)
      if (parsed.DOMICILIO || parsed.PUNTO) {
        return {
          DOMICILIO: parsed.DOMICILIO || {},
          PUNTO: parsed.PUNTO || {},
        }
      }
      return { DOMICILIO: { ...parsed }, PUNTO: { ...parsed } }
    } catch {
      return empty
    }
  }

  function buildPreciosJson(): string {
    const result: Record<Canal, Record<string, number>> = { DOMICILIO: {}, PUNTO: {} }
    for (const canal of ['DOMICILIO', 'PUNTO'] as Canal[]) {
      for (const prod of PRODUCTOS_PRECIO) {
        const val = preciosEspecialesMap[canal][prod.codigo]
        if (val !== undefined && val > 0 && val !== preciosBase[canal][prod.codigo]) {
          result[canal][prod.codigo] = val
        }
      }
    }
    const hasAny = Object.values(result.DOMICILIO).length > 0 || Object.values(result.PUNTO).length > 0
    return hasAny ? JSON.stringify(result) : ''
  }

  const clientesFiltrados = clientes.filter((c) => {
    const term = search.toLowerCase()
    return (
      c.nombre.toLowerCase().includes(term) ||
      c.apellido?.toLowerCase().includes(term) ||
      c.telefono.includes(term) ||
      c.nombreNegocio?.toLowerCase().includes(term) ||
      c.barrio?.toLowerCase().includes(term) ||
      c.clienteId.toLowerCase().includes(term)
    )
  })

  function openCreateModal() {
    setFormData({
      nombre: '',
      apellido: '',
      telefono: '',
      nombreNegocio: '',
      tipoNegocio: '',
      barrio: '',
      direccion: '',
      cadaNDias: '',
      proxEntrega: '',
      preciosEspeciales: '',
      notas: '',
    })
    setPreciosEspecialesMap({ DOMICILIO: {}, PUNTO: {} })
    setCanalActivo('DOMICILIO')
    setFormError('')
    setIsEdit(false)
    setShowModal(true)
    loadPreciosBase()
  }

  function openEditModal() {
    if (!selectedCliente) return
    setShowDetail(false)
    setFormData({
      nombre: selectedCliente.nombre,
      apellido: selectedCliente.apellido || '',
      telefono: selectedCliente.telefono,
      nombreNegocio: selectedCliente.nombreNegocio || '',
      tipoNegocio: selectedCliente.tipoNegocio || '',
      barrio: selectedCliente.barrio || '',
      direccion: selectedCliente.direccion || '',
      cadaNDias: selectedCliente.cadaNDias || '',
      proxEntrega: selectedCliente.proxEntrega ? new Date(selectedCliente.proxEntrega).toISOString().split('T')[0] : '',
      preciosEspeciales: selectedCliente.preciosEspeciales || '',
      notas: selectedCliente.notas || '',
    })
    setPreciosEspecialesMap(parsePreciosEspeciales(selectedCliente.preciosEspeciales))
    setCanalActivo('DOMICILIO')
    setIsEdit(true)
    setShowModal(true)
    loadPreciosBase()
  }

  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (saving) return
    setSaving(true)
    try {
      const preciosJson = buildPreciosJson()
      const cadaNDiasNum = formData.cadaNDias === '' ? 0 : formData.cadaNDias
      const body = {
        ...formData,
        cadaNDias: cadaNDiasNum,
        frecuencia: 'NINGUNA',
        proxEntrega: formData.proxEntrega || undefined,
        preciosEspeciales: preciosJson || undefined,
      }
      if (isEdit && selectedCliente) {
        const res = await fetch(`/api/clientes/${selectedCliente.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          fetchClientes()
          setShowModal(false)
          toast.success('Cliente actualizado')
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error?.message || 'Error al guardar cliente')
          toast.error(data.error?.formErrors?.[0] || data.error?.message || 'Error al guardar cliente')
        }
      } else {
        const res = await fetch('/api/clientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          fetchClientes()
          setShowModal(false)
          toast.success('Cliente creado exitosamente')
        } else {
          const data = await res.json().catch(() => ({}))
          setFormError(data.error?.formErrors?.[0] || data.error?.message || 'Error al guardar cliente')
          toast.error(data.error?.formErrors?.[0] || data.error?.message || 'Error al guardar cliente')
        }
      }
    } catch (error) {
      setFormError('Error de conexión al guardar')
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function viewCliente(id: string) {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/clientes/${id}`)
      const data = await res.json()
      if (data.cliente) {
        setSelectedCliente(data.cliente)
        setShowDetail(true)
        setActiveTab('info')
      }
    } catch (error) {
      toast.error('Error cargando cliente')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm('Desactivar este cliente?')
    if (!ok) return
    try {
      const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchClientes()
        setShowDetail(false)
        setSelectedCliente(null)
        toast.success('Cliente desactivado')
      } else {
        toast.error('Error desactivando cliente')
      }
    } catch (error) {
      toast.error('Error desactivando cliente')
    }
  }

  const handlePrecioEspecialChange = useCallback((canal: Canal, codigo: string, valor: number | undefined) => {
    setPreciosEspecialesMap(prev => ({
      ...prev,
      [canal]: { ...prev[canal], [codigo]: valor },
    }))
  }, [])

  if (loading && clientes.length === 0) {
    return <SkeletonPage hasStats={false} hasFilters cardCount={5} />
  }

  if (fetchError && clientes.length === 0) {
    return (
      <ErrorState
        title="No se pudieron cargar los clientes"
        message={fetchError}
        errorCode="FETCH_CLIENTES_ERROR"
        onRetry={fetchClientes}
      />
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Nuevo Cliente
        </button>
      </div>

      <ClienteTable
        clientes={clientesFiltrados}
        search={search}
        onSearchChange={setSearch}
        fetchError={fetchError}
        onRetry={fetchClientes}
        onCreateClick={openCreateModal}
        onViewCliente={viewCliente}
      />

      <ClienteForm
        open={showModal}
        onClose={() => setShowModal(false)}
        isEdit={isEdit}
        formData={formData}
        onFormDataChange={setFormData}
        formError={formError}
        saving={saving}
        onSubmit={handleSubmit}
        canalActivo={canalActivo}
        onCanalActivoChange={setCanalActivo}
        preciosEspecialesMap={preciosEspecialesMap}
        onPrecioEspecialChange={handlePrecioEspecialChange}
        preciosBase={preciosBase}
      />

      <Modal open={showDetail && !!selectedCliente} onClose={() => setShowDetail(false)} className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {detailLoading ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-gray-200 rounded w-48 animate-pulse" />
                <div className="h-3 bg-gray-200 rounded w-24 animate-pulse" />
              </div>
            </div>
            <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
            <div className="h-48 bg-gray-200 rounded-xl animate-pulse" />
          </div>
        ) : selectedCliente && (
          <>
            {/* Header with avatar, name, and quick actions */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white ${
                    selectedCliente.saldoPendiente && selectedCliente.saldoPendiente > 0
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                  }`}>
                    {selectedCliente.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">
                      {selectedCliente.nombre} {selectedCliente.apellido}
                    </h2>
                    <p className="text-xs text-gray-500">{selectedCliente.clienteId}</p>
                    {selectedCliente.nombreNegocio && (
                      <p className="text-xs text-gray-500">{selectedCliente.nombreNegocio}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowDetail(false)}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-1 transition"
                  aria-label="Cerrar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Quick action bar */}
              <div className="flex gap-2 mt-3">
                <Tooltip content="Crear un pedido para este cliente" position="bottom">
                  <a
                    href={`/pedidos?cliente=${selectedCliente.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Crear Pedido
                  </a>
                </Tooltip>
                <Tooltip content="Llamar al cliente" position="bottom">
                  <a
                    href={`tel:${selectedCliente.telefono}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Llamar
                  </a>
                </Tooltip>
                <Tooltip content="Editar información del cliente" position="bottom">
                  <button
                    onClick={openEditModal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Status banners */}
            {selectedCliente.saldoPendiente && selectedCliente.saldoPendiente > 0 && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-red-700 font-medium">Cuenta por cobrar</span>
                  </div>
                  <span className="text-lg font-bold text-red-600">
                    {formatCurrency(selectedCliente.saldoPendiente)}
                  </span>
                </div>
              </div>
            )}

            {(selectedCliente.frecuenciaSugerida || selectedCliente.productosSugeridos) && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-semibold text-blue-700 uppercase mb-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Patrón de consumo (guía)
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {selectedCliente.frecuenciaSugerida && (
                    <span className="text-blue-800 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Compra {selectedCliente.frecuenciaSugerida.label.toLowerCase()}
                    </span>
                  )}
                  {selectedCliente.productosSugeridos && selectedCliente.productosSugeridos.length > 0 && (
                    <span className="text-blue-800 flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      Suele pedir: {selectedCliente.productosSugeridos.map(p =>
                        `${p.cantidadPromedio} ${p.nombre} (${p.frecuencia}%)`
                      ).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Alertas del cliente */}
            {(() => {
              const alertas = calcularAlertasCliente(selectedCliente, selectedCliente.pedidos || [])
              const altas = alertas.filter((a) => a.severidad === 'ALTA')
              if (alertas.length === 0) return null
              return (
                <div className={`px-4 py-3 border-b ${altas.length > 0 ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <svg className={`w-4 h-4 ${altas.length > 0 ? 'text-red-500' : 'text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <span className={`text-sm font-bold ${altas.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                        {alertas.length} alerta{alertas.length !== 1 ? 's' : ''} activa{alertas.length !== 1 ? 's' : ''}
                        {altas.length > 0 && ` (${altas.length} crítica${altas.length !== 1 ? 's' : ''})`}
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab('alertas')}
                      className={`text-xs font-medium underline ${altas.length > 0 ? 'text-red-600' : 'text-amber-600'}`}
                    >
                      Ver todas →
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {altas.slice(0, 3).map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-medium border border-red-200">
                        {a.detalle}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Tabs */}
            <div className="flex border-b border-gray-100">
              {[
                { key: 'info', label: 'Información', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )},
                { key: 'historial', label: 'Historial', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )},
                { key: 'stats', label: 'Estadísticas', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                )},
                { key: 'alertas', label: 'Alertas', icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )},
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs sm:text-sm font-medium transition ${
                    activeTab === tab.key
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                  {tab.key === 'alertas' && (() => {
                    const count = calcularAlertasCliente(selectedCliente, selectedCliente.pedidos || []).length
                    return count > 0 ? (
                      <span className="ml-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full font-bold">
                        {count}
                      </span>
                    ) : null
                  })()}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'info' && (
                <div className="space-y-5">
                  {/* Contact section */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Contacto
                    </h3>
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="text-sm text-gray-500">Teléfono</span>
                        </div>
                        <a href={`tel:${selectedCliente.telefono}`} className="font-medium text-blue-600 hover:underline">
                          {selectedCliente.telefono}
                        </a>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-sm text-gray-500">Zona</span>
                        </div>
                        <span className="font-medium">{selectedCliente.barrio || '-'}</span>
                      </div>
                      {selectedCliente.direccion && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            <span className="text-sm text-gray-500">Dirección</span>
                          </div>
                          <span className="font-medium text-right max-w-[60%]">{selectedCliente.direccion}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Business section */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      Negocio
                    </h3>
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Nombre</span>
                        <span className="font-medium">{selectedCliente.nombreNegocio || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Tipo</span>
                        <span className="font-medium">{selectedCliente.tipoNegocio || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Frecuencia</span>
                        <span className="font-medium">
                          {selectedCliente.cadaNDias && selectedCliente.cadaNDias > 0
                            ? <span className="text-green-600">Cada {selectedCliente.cadaNDias} días</span>
                            : <span className="text-gray-400">Sin frecuencia</span>
                          }
                        </span>
                      </div>
                      {selectedCliente.proxEntrega && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Próxima entrega</span>
                          <span className="font-medium text-blue-600">
                            {new Date(selectedCliente.proxEntrega).toLocaleDateString('es-CO')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Special prices section */}
                  <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Precios Especiales
                    </h3>
                    {(() => {
                      const parsed = parsePreciosEspeciales(selectedCliente.preciosEspeciales)
                      const hasAny = Object.values(parsed.DOMICILIO).some(v => v !== undefined) || Object.values(parsed.PUNTO).some(v => v !== undefined)
                      if (!hasAny) return (
                        <div className="bg-gray-50 rounded-xl p-4 text-center">
                          <p className="text-sm text-gray-400">Sin precios especiales configurados</p>
                          <p className="text-xs text-gray-400 mt-1">Este cliente paga los precios de lista estándar</p>
                        </div>
                      )
                      return (
                        <div className="space-y-3">
                          {(['DOMICILIO', 'PUNTO'] as Canal[]).map((canal) => {
                            const items = Object.entries(parsed[canal]).filter(([_, v]) => v !== undefined)
                            if (items.length === 0) return null
                            return (
                              <div key={canal} className="bg-gray-50 rounded-xl p-4">
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{canal === 'DOMICILIO' ? 'A domicilio' : 'En punto'}</p>
                                <div className="flex flex-wrap gap-2">
                                  {items.map(([codigo, precio]) => {
                                    const info = PRODUCTOS_PRECIO.find(p => p.codigo === codigo)
                                    if (!info) return null
                                    const iconCfg = getProductoIconConfig(codigo)
                                    const Icon = iconCfg.Icon
                                    return (
                                      <span
                                        key={codigo}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-sm shadow-sm"
                                      >
                                        <Icon size={16} />
                                        <span className="text-gray-600">{info.nombre}</span>
                                        <span className="font-semibold text-blue-700">{formatCurrency(Number(precio))}</span>
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Notes */}
                  {selectedCliente.notas && (
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Notas
                      </h3>
                      <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedCliente.notas}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'historial' && <ClienteHistorial clienteId={selectedCliente.id} />}
              {activeTab === 'stats' && <ClienteStats clienteId={selectedCliente.id} />}

              {activeTab === 'alertas' && (
                <div className="space-y-3">
                  {(() => {
                    const alertas = calcularAlertasCliente(selectedCliente, selectedCliente.pedidos || [])
                    if (alertas.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-gray-500 font-medium">Sin alertas activas</p>
                          <p className="text-sm text-gray-400 mt-1">Este cliente no tiene comportamientos inusuales detectados.</p>
                        </div>
                      )
                    }
                    return alertas.map((alerta, idx) => (
                      <div key={idx} className="bg-white border rounded-xl p-4 hover:shadow-sm transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getBadgeColor(alerta.severidad)}`}>
                                {alerta.severidad === 'ALTA' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                                {alerta.severidad === 'MEDIA' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                {alerta.severidad === 'BAJA' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                {alerta.severidad}
                              </span>
                              <span className="text-sm font-semibold text-gray-800">{alerta.tipo.replace(/_/g, ' ')}</span>
                            </div>
                            <p className="text-sm text-gray-600">{alerta.detalle}</p>
                            <p className="text-xs text-gray-400 mt-1">{new Date(alerta.fecha).toLocaleDateString('es-CO')}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => { setGuiaTipo(alerta.tipo); setGuiaOpen(true) }}
                              className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition"
                            >
                              Ver guía
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch('/api/casos', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      alertaTipo: alerta.tipo,
                                      severidad: alerta.severidad,
                                      titulo: alerta.tipo.replace(/_/g, ' '),
                                      descripcion: alerta.detalle,
                                      clienteId: selectedCliente.id,
                                      pedidoId: alerta.pedidoId || null,
                                    }),
                                  })
                                  const data = await res.json()
                                  if (data.success) {
                                    setCasoCreado({
                                      ...data.caso,
                                      cliente: { id: selectedCliente.id, nombre: selectedCliente.nombre, telefono: selectedCliente.telefono },
                                      pedido: alerta.pedidoId ? { id: alerta.pedidoId, numero: 0, total: '0' } : null,
                                    })
                                  }
                                } catch {
                                  toast.error('Error creando caso')
                                }
                              }}
                              className="text-xs text-green-600 hover:bg-green-50 px-2 py-1 rounded transition"
                            >
                              Crear caso
                            </button>
                            {alerta.severidad !== 'ALTA' && (
                              <button
                                onClick={() => { ignorarAlerta(selectedCliente.id, alerta.tipo); toast.success('Alerta ignorada 24h'); setActiveTab('info'); setActiveTab('alertas') }}
                                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded transition"
                              >
                                Ignorar 24h
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <div className="flex gap-2">
                <button
                  onClick={openEditModal}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition shadow-sm"
                >
                  Editar Cliente
                </button>
                <Tooltip content="Desactivar cliente (no se podrán crear pedidos)" position="top">
                  <button
                    onClick={() => handleDelete(selectedCliente.id)}
                    className="px-4 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm font-medium transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
          </>
        )}
      </Modal>
      <GuiaAlertaModal
        tipo={guiaTipo}
        open={guiaOpen}
        onClose={() => setGuiaOpen(false)}
        contexto={selectedCliente ? { clienteId: selectedCliente.id } : undefined}
      />
      {casoCreado && (
        <CasoGuiaModal
          caso={casoCreado}
          contextData={{
            clienteVerificado: selectedCliente?.verificado,
            pedidoDisputa: selectedCliente?.pedidos?.some((p: any) => p.disputaAbierta),
            clienteConSaldo: selectedCliente?.pedidos?.some((p: any) => Number(p.saldo) > 0),
          }}
          usuarios={usuarios}
          onClose={() => setCasoCreado(null)}
        />
      )}
      {modal}
    </div>
  )
}
