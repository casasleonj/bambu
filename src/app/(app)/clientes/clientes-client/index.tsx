'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Modal } from '@/components/modal'
import type { Cliente, Pedido, Factura, Canal, ClientesClientProps, FormData } from './types'
import { PRODUCTOS_PRECIO, PRODUCTO_NOMBRES } from './types'
import { ClienteTable } from './cliente-table'
import { ClienteForm } from './cliente-form'

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

  const [expandedPedido, setExpandedPedido] = useState<string | null>(null)
  const [expandedFactura, setExpandedFactura] = useState<string | null>(null)
  const [pedidoDetail, setPedidoDetail] = useState<Pedido | null>(null)
  const [_facturaDetail, setFacturaDetail] = useState<Factura | null>(null)

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
          setFormError(data.error?.formErrors?.[0] || data.error || 'Error al guardar cliente')
          toast.error(data.error?.formErrors?.[0] || data.error || 'Error al guardar cliente')
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
          setFormError(data.error?.formErrors?.[0] || data.error || 'Error al guardar cliente')
          toast.error(data.error?.formErrors?.[0] || data.error || 'Error al guardar cliente')
        }
      }
    } catch (error) {
      setFormError('Error de conexion al guardar')
      toast.error('Error de conexion al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function viewCliente(id: string) {
    setDetailLoading(true)
    setExpandedPedido(null)
    setExpandedFactura(null)
    setPedidoDetail(null)
    setFacturaDetail(null)
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

  async function viewPedidoDetail(pedido: Pedido) {
    if (expandedPedido === pedido.id) {
      setExpandedPedido(null)
      setPedidoDetail(null)
      return
    }
    setExpandedPedido(pedido.id)
    setExpandedFactura(null)
    setFacturaDetail(null)
    setPedidoDetail(pedido)
  }

  async function viewFacturaDetail(factura: Factura) {
    if (expandedFactura === factura.id) {
      setExpandedFactura(null)
      setFacturaDetail(null)
      return
    }
    setExpandedFactura(factura.id)
    setExpandedPedido(null)
    setPedidoDetail(null)
    setFacturaDetail(factura)
  }

  function renderPedidoProductos(p: Pedido) {
    const items: string[] = []
    if (p.cPacaAguaPed > 0) items.push(`${p.cPacaAguaPed} Paca Agua`)
    if (p.cPacaHieloPed > 0) items.push(`${p.cPacaHieloPed} Paca Hielo`)
    if (p.cBotellonFabPed > 0) items.push(`${p.cBotellonFabPed} Botellón Fab`)
    if (p.cBotellonDomPed > 0) items.push(`${p.cBotellonDomPed} Botellón Dom`)
    if (p.cBolsaAguaPed > 0) items.push(`${p.cBolsaAguaPed} Bolsa Agua`)
    if (p.cBolsaHieloPed > 0) items.push(`${p.cBolsaHieloPed} Bolsa Hielo`)
    return items.join(', ')
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

            <div className="flex border-b">
              {['info', 'pedidos', 'facturas', 'cuentas'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-3 text-sm font-medium capitalize ${
                    activeTab === tab
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'cuentas' ? 'Cuentas' : tab}
                  {tab === 'cuentas' && selectedCliente.pedidos?.some((p) => Number(p.saldo) > 0) && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded-full">
                      {selectedCliente.pedidos.filter((p) => Number(p.saldo) > 0).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Telefono</p>
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
                      <p className="text-sm text-gray-500">Direccion</p>
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
                                    return (
                                      <span
                                        key={codigo}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm"
                                      >
                                        <span>{info.emoji}</span>
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

              {activeTab === 'pedidos' && (
                <div>
                  {selectedCliente.pedidos?.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Sin pedidos</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedCliente.pedidos?.map((pedido) => (
                        <div key={pedido.id}>
                          <div
                            className="flex justify-between items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                            onClick={() => viewPedidoDetail(pedido)}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">#{pedido.numero}</p>
                                <a
                                  href={`/pedidos?search=${pedido.numero}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  → Ver en pedidos
                                </a>
                              </div>
                              <p className="text-sm text-gray-500">{formatDate(pedido.fecha)}</p>
                              <p className="text-xs text-gray-400">{renderPedidoProductos(pedido)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{formatCurrency(pedido.total)}</p>
                              <span
                                className={`text-xs px-2 py-1 rounded ${
                                  pedido.estado === 'ENTREGADO'
                                    ? 'bg-green-100 text-green-800'
                                    : pedido.estado === 'PENDIENTE'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {pedido.estado}
                              </span>
                            </div>
                          </div>
                          {expandedPedido === pedido.id && pedidoDetail && (
                            <div className="ml-4 mt-1 p-3 bg-white border border-gray-200 rounded-lg text-sm">
                              <p className="font-semibold mb-2">Detalle del Pedido #{pedido.numero}</p>
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                {Object.entries(PRODUCTO_NOMBRES).map(([key, label]) => {
                                  const ped = (pedidoDetail as any)[key] || 0
                                  const precio = (pedidoDetail as any)[key.replace('Ped', '').replace('c', 'precio')] || 0
                                  if (ped === 0) return null
                                  return (
                                    <div key={key} className="flex justify-between">
                                      <span>{label}</span>
                                      <span>{ped} × ${Number(precio).toLocaleString()} = ${formatCurrency(ped * Number(precio))}</span>
                                    </div>
                                  )
                                })}
                              </div>
                              <div className="border-t pt-2 space-y-1">
                                <div className="flex justify-between font-semibold">
                                  <span>Total</span>
                                  <span>{formatCurrency(pedidoDetail.total)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Pagado</span>
                                  <span className="text-green-600">{formatCurrency(pedidoDetail.totalPagado)}</span>
                                </div>
                                {Number(pedidoDetail.saldo) > 0 && (
                                  <div className="flex justify-between">
                                    <span>Saldo</span>
                                    <span className="text-red-600 font-bold">{formatCurrency(pedidoDetail.saldo)}</span>
                                  </div>
                                )}
                              </div>
                              {pedidoDetail.pagos && pedidoDetail.pagos.length > 0 && (
                                <div className="border-t mt-2 pt-2">
                                  <p className="font-semibold mb-1">Pagos:</p>
                                  {pedidoDetail.pagos.map((pago, i) => (
                                    <div key={i} className="flex justify-between text-gray-600">
                                      <span>{pago.metodo}</span>
                                      <span>{formatCurrency(pago.monto)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'facturas' && (
                <div>
                  {selectedCliente.facturas?.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Sin facturas</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedCliente.facturas?.map((factura) => (
                        <div key={factura.id}>
                          <div
                            className="flex justify-between items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                            onClick={() => viewFacturaDetail(factura)}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">#{factura.numero}</p>
                                <a
                                  href={`/facturas?search=${factura.numero}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  → Ver en facturas
                                </a>
                              </div>
                              <p className="text-sm text-gray-500">{formatDate(factura.fecha)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">{formatCurrency(factura.total)}</p>
                              <span
                                className={`text-xs px-2 py-1 rounded ${
                                  factura.estado === 'PAGADA'
                                    ? 'bg-green-100 text-green-800'
                                    : factura.estado === 'ANULADA'
                                    ? 'bg-gray-100 text-gray-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {factura.estado}
                              </span>
                            </div>
                          </div>
                          {expandedFactura === factura.id && (
                            <div className="ml-4 mt-1 p-3 bg-white border border-gray-200 rounded-lg text-sm">
                              <p className="font-semibold mb-2">Detalle Factura #{factura.numero}</p>
                              <div className="space-y-1">
                                <div className="flex justify-between">
                                  <span>Subtotal</span>
                                  <span>{formatCurrency(factura.total)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Pagado</span>
                                  <span className="text-green-600">{formatCurrency(factura.montoPagado)}</span>
                                </div>
                                {Number(factura.saldo) > 0 && (
                                  <div className="flex justify-between">
                                    <span>Saldo</span>
                                    <span className="text-red-600 font-bold">{formatCurrency(factura.saldo)}</span>
                                  </div>
                                )}
                              </div>
                              {factura.abonos && factura.abonos.length > 0 && (
                                <div className="border-t mt-2 pt-2">
                                  <p className="font-semibold mb-1">Abonos:</p>
                                  {factura.abonos.map((abono, i) => (
                                    <div key={i} className="flex justify-between text-gray-600">
                                      <span>{abono.metodoPago} - {formatDate(abono.fecha)}</span>
                                      <span>{formatCurrency(abono.monto)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'cuentas' && (
                <div>
                  {(() => {
                    const pedidosConFiado = selectedCliente.pedidos?.filter((p) => Number(p.saldo) > 0 && p.estado !== 'CANCELADO' && p.estado !== 'ANULADO') || []
                    const totalFiado = pedidosConFiado.reduce((acc, p) => acc + Number(p.saldo), 0)

                    if (pedidosConFiado.length === 0) {
                      return <p className="text-gray-500 text-center py-8">Sin cuentas por cobrar</p>
                    }

                    return (
                      <div className="space-y-3">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <p className="text-sm text-red-600">Total por cobrar</p>
                          <p className="text-2xl font-bold text-red-700">{formatCurrency(totalFiado)}</p>
                          <p className="text-xs text-red-500">{pedidosConFiado.length} pedidos pendientes de pago</p>
                        </div>
                        <div className="space-y-2">
                          {pedidosConFiado.map((pedido) => (
                            <div key={pedido.id}>
                              <div
                                className="flex justify-between items-center p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                                onClick={() => viewPedidoDetail(pedido)}
                              >
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium">#{pedido.numero}</p>
                                    <a
                                      href={`/pedidos?search=${pedido.numero}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                      → Ver en pedidos
                                    </a>
                                  </div>
                                  <p className="text-sm text-gray-500">{formatDate(pedido.fecha)}</p>
                                  <p className="text-xs text-gray-400">{pedido.estado}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-medium">{formatCurrency(pedido.total)}</p>
                                  <p className="text-sm text-red-600 font-medium">
                                    Saldo: {formatCurrency(Number(pedido.saldo))}
                                  </p>
                                </div>
                              </div>
                              {expandedPedido === pedido.id && pedidoDetail && (
                                <div className="ml-4 mt-1 p-3 bg-white border border-gray-200 rounded-lg text-sm">
                                  <p className="font-semibold mb-2">Detalle del Pedido #{pedido.numero}</p>
                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    {Object.entries(PRODUCTO_NOMBRES).map(([key, label]) => {
                                      const ped = (pedidoDetail as any)[key] || 0
                                      const precio = (pedidoDetail as any)[key.replace('Ped', '').replace('c', 'precio')] || 0
                                      if (ped === 0) return null
                                      return (
                                        <div key={key} className="flex justify-between">
                                          <span>{label}</span>
                                          <span>{ped} × ${Number(precio).toLocaleString()}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                  <div className="border-t pt-2 space-y-1">
                                    <div className="flex justify-between font-semibold">
                                      <span>Total</span>
                                      <span>{formatCurrency(pedidoDetail.total)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Pagado</span>
                                      <span className="text-green-600">{formatCurrency(pedidoDetail.totalPagado)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span>Saldo</span>
                                      <span className="text-red-600 font-bold">{formatCurrency(pedidoDetail.saldo)}</span>
                                    </div>
                                  </div>
                                  {pedidoDetail.pagos && pedidoDetail.pagos.length > 0 && (
                                    <div className="border-t mt-2 pt-2">
                                      <p className="font-semibold mb-1">Pagos:</p>
                                      {pedidoDetail.pagos.map((pago, i) => (
                                        <div key={i} className="flex justify-between text-gray-600">
                                          <span>{pago.metodo}</span>
                                          <span>{formatCurrency(pago.monto)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
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
      {modal}
    </div>
  )
}
