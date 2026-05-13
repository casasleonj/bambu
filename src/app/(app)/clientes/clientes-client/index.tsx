'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
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
        frecuencia: cadaNDiasNum > 0 ? 'CADA_N_DIAS' : 'NINGUNA',
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
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
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : selectedCliente && (
          <>
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  {selectedCliente.nombre} {selectedCliente.apellido}
                </h2>
                <p className="text-sm text-gray-500">{selectedCliente.clienteId}</p>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                x
              </button>
            </div>

            {selectedCliente.saldoPendiente && selectedCliente.saldoPendiente > 0 && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-red-700 font-medium">
                    💰 Cuenta por cobrar
                  </span>
                  <span className="text-lg font-bold text-red-600">
                    {formatCurrency(selectedCliente.saldoPendiente)}
                  </span>
                </div>
              </div>
            )}

            {(selectedCliente.frecuenciaSugerida || selectedCliente.productosSugeridos) && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
                <p className="text-xs font-semibold text-blue-700 uppercase mb-2">Patrón de consumo (guía)</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {selectedCliente.frecuenciaSugerida && (
                    <span className="text-blue-800">
                      📅 Compra {selectedCliente.frecuenciaSugerida.label.toLowerCase()}
                    </span>
                  )}
                  {selectedCliente.productosSugeridos && selectedCliente.productosSugeridos.length > 0 && (
                    <span className="text-blue-800">
                      📦 Suele pedir: {selectedCliente.productosSugeridos.map(p =>
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
                <div className={`px-4 py-3 border-b ${altas.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-bold ${altas.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                      🚨 {alertas.length} alerta{alertas.length !== 1 ? 's' : ''} activa{alertas.length !== 1 ? 's' : ''} {altas.length > 0 && `(${altas.length} crítica${altas.length !== 1 ? 's' : ''})`}
                    </span>
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
                        🔴 {a.detalle}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })()}

            <div className="flex border-b">
              {['info', 'historial', 'stats', 'alertas'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-3 text-sm font-medium capitalize ${
                    activeTab === tab
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'stats' ? 'Estadísticas' : tab === 'alertas' ? 'Alertas' : tab === 'historial' ? 'Historial' : 'Información'}
                  {tab === 'alertas' && (() => {
                    const count = calcularAlertasCliente(selectedCliente, selectedCliente.pedidos || []).length
                    return count > 0 ? (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full">
                        {count}
                      </span>
                    ) : null
                  })()}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Teléfono</p>
                      <p className="font-medium">{selectedCliente.telefono}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Zona</p>
                      <p className="font-medium">{selectedCliente.barrio || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Negocio</p>
                      <p className="font-medium">{selectedCliente.nombreNegocio || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Tipo</p>
                      <p className="font-medium">{selectedCliente.tipoNegocio || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Frecuencia</p>
                      <p className="font-medium">
                        {selectedCliente.cadaNDias && selectedCliente.cadaNDias > 0
                          ? `Cada ${selectedCliente.cadaNDias} días`
                          : 'Sin frecuencia'}
                      </p>
                    </div>
                    {selectedCliente.proxEntrega && (
                      <div>
                        <p className="text-sm text-gray-500">Próxima entrega</p>
                        <p className="font-medium text-blue-600">
                          {new Date(selectedCliente.proxEntrega).toLocaleDateString('es-CO')}
                        </p>
                      </div>
                    )}
                    {selectedCliente.frecuenciaSugerida && (
                      <div>
                        <p className="text-sm text-gray-500">Frecuencia real (promedio)</p>
                        <p className="font-medium text-blue-600">{selectedCliente.frecuenciaSugerida.label}</p>
                      </div>
                    )}
                  </div>
                  {selectedCliente.direccion && (
                    <div>
                      <p className="text-sm text-gray-500">Dirección</p>
                      <p className="font-medium">{selectedCliente.direccion}</p>
                    </div>
                  )}
                  {selectedCliente.notas && (
                    <div>
                      <p className="text-sm text-gray-500">Notas</p>
                      <p className="font-medium">{selectedCliente.notas}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-gray-500 mb-2">Precios Especiales</p>
                    {(() => {
                      const parsed = parsePreciosEspeciales(selectedCliente.preciosEspeciales)
                      const hasAny = Object.values(parsed.DOMICILIO).some(v => v !== undefined) || Object.values(parsed.PUNTO).some(v => v !== undefined)
                      if (!hasAny) return <p className="text-gray-400 text-sm">Sin precios especiales</p>
                      return (
                        <div className="space-y-3">
                          {(['DOMICILIO', 'PUNTO'] as Canal[]).map((canal) => {
                            const items = Object.entries(parsed[canal]).filter(([_, v]) => v !== undefined)
                            if (items.length === 0) return null
                            return (
                              <div key={canal}>
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{canal}</p>
                                <div className="flex flex-wrap gap-2">
                                   {items.map(([codigo, precio]) => {
                                     const info = PRODUCTOS_PRECIO.find(p => p.codigo === codigo)
                                     if (!info) return null
                                     const iconCfg = getProductoIconConfig(codigo)
                                     const Icon = iconCfg.Icon
                                     return (
                                       <span
                                         key={codigo}
                                         className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm"
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
                      <div key={idx} className="bg-white border rounded-lg p-4 hover:shadow-sm transition">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${getBadgeColor(alerta.severidad)}`}>
                                {alerta.severidad}
                              </span>
                              <span className="text-sm font-semibold text-gray-800">{alerta.tipo.replace(/_/g, ' ')}</span>
                            </div>
                            <p className="text-sm text-gray-600">{alerta.detalle}</p>
                            <p className="text-xs text-gray-400 mt-1">{new Date(alerta.fecha).toLocaleDateString('es-CO')}</p>
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <button
                              onClick={() => { setGuiaTipo(alerta.tipo); setGuiaOpen(true) }}
                              className="text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition"
                            >
                              ℹ️ Ver guía
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

            <div className="p-4 border-t flex gap-3">
              <button
                onClick={openEditModal}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Editar
              </button>
              <button
                onClick={() => handleDelete(selectedCliente.id)}
                className="flex-1 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
              >
                Desactivar
              </button>
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
