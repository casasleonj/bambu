'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { DEFAULT_PRICES, PRODUCTO_INFO, getProductosForCanal } from '@/lib/prices'
import { METODOS_PAGO, METODO_PAGO_ICONS } from '@/lib/metodos-pago'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { Cliente, Tier } from './types'

// ==================== TYPES ====================

export interface PedidoFormUnifiedProps {
  contexto: 'PUNTO' | 'DOMICILIO'
  precios: Record<string, number>
  clientes: Cliente[]
  onSubmit: (data: PedidoUnifiedData) => void
  onClose?: () => void
}

export interface PedidoUnifiedData {
  clienteId?: string
  canal: 'PUNTO' | 'DOMICILIO'
  items: Array<{ producto: string; cantidad: number; precioManual?: number }>
  preciosManuales: Record<string, number>
  pagos: Array<{ metodo: string; monto: number }>
  obs?: string
  clienteNuevo?: { nombre: string; telefono: string; direccion: string; barrio?: string }
  ventaRapida: boolean
}

// ==================== COMPONENTE ====================

export function PedidoFormUnified({ contexto, precios, clientes, onSubmit }: PedidoFormUnifiedProps) {
  const [canal, setCanal] = useState<'PUNTO' | 'DOMICILIO'>(contexto)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', direccion: '', barrio: '' })
  const [pagos, setPagos] = useState<{ metodo: string; monto: number }[]>([])
  const [modoPagoActivo, setModoPagoActivo] = useState<string | null>(null)
  const [montoInput, setMontoInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, number>>({})
  const [tablaPrecios, setTablaPrecios] = useState<Record<string, Tier[]>>({})
  const [preciosManuales, setPreciosManuales] = useState<Record<string, number>>({})
  const [observaciones, setObservaciones] = useState('')

  const productosActuales = getProductosForCanal(canal)

  useEffect(() => {
    fetch(`/api/precios/tabla`)
      .then(r => r.json())
      .then(d => { if (d.tabla) setTablaPrecios(d.tabla) })
      .catch(() => {})
  }, [])

  const getPrecioBase = (codigo: string): number => {
    if (preciosResueltos[codigo]) return preciosResueltos[codigo]
    if (precios[codigo]) return precios[codigo]
    const tiers = tablaPrecios[codigo]
    if (tiers && tiers.length > 0) return tiers[0].precio
    return DEFAULT_PRICES[codigo] || 0
  }

  const getPrecio = (codigo: string) => {
    if (preciosManuales[codigo] !== undefined) return preciosManuales[codigo]
    return getPrecioBase(codigo)
  }



  const calcularTotal = () => {
    return productosActuales.reduce((sum, prodId) => {
      const cant = cantidades[prodId] || 0
      if (cant <= 0) return sum
      const info = PRODUCTO_INFO[prodId]
      return sum + cant * getPrecio(info.codigo)
    }, 0)
  }

  const total = calcularTotal()
  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
  const saldoPendiente = total - totalPagado
  const requiereCliente = canal === 'DOMICILIO' || saldoPendiente > 0

  const resolverPrecios = useCallback(async (prods: Record<string, number>, canalVal: 'PUNTO' | 'DOMICILIO') => {
    const items = productosActuales
      .filter(id => (prods[id] || 0) > 0)
      .map(id => ({ codigo: PRODUCTO_INFO[id].codigo, cantidad: prods[id] || 0 }))

    if (items.length === 0) {
      setPreciosResueltos({})
      return
    }
    try {
      const res = await fetch('/api/precios/resolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, canal: canalVal }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.precios) {
          const nuevos: Record<string, number> = {}
          for (const [codigo, info] of Object.entries(data.precios)) {
            nuevos[codigo] = (info as any).precio
          }
          setPreciosResueltos(nuevos)
        }
      }
    } catch { /* fallback */ }
  }, [productosActuales])

  const handleCantidadChange = (id: string, value: string) => {
    const cant = parseInt(value) || 0
    const next = { ...cantidades, [id]: cant }
    setCantidades(next)
    resolverPrecios(next, canal)
  }

  const increment = (id: string) => handleCantidadChange(id, String((cantidades[id] || 0) + 1))
  const decrement = (id: string) => handleCantidadChange(id, String(Math.max(0, (cantidades[id] || 0) - 1)))

  const metodosUsados = new Set(pagos.map(p => p.metodo))

  const seleccionarChip = (metodoId: string) => {
    if (metodosUsados.has(metodoId)) return
    setModoPagoActivo(metodoId)
    setMontoInput('')
  }

  const confirmarMonto = () => {
    if (!modoPagoActivo) return
    const monto = parseFloat(montoInput) || 0
    if (monto <= 0) { setModoPagoActivo(null); setMontoInput(''); return }
    setPagos(prev => [...prev, { metodo: modoPagoActivo, monto }])
    setModoPagoActivo(null)
    setMontoInput('')
  }

  const cancelarMonto = () => { setModoPagoActivo(null); setMontoInput('') }
  const eliminarPago = (idx: number) => { setPagos(prev => prev.filter((_, i) => i !== idx)) }
  const pagarCompleto = () => { if (total > 0) setPagos([{ metodo: 'EFECTIVO', monto: total }]) }

  const filteredClientes = searchTerm
    ? clientes.filter((c) => c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || c.telefono.includes(searchTerm))
    : []

  const handleSelectCliente = (cliente: Cliente) => { setClienteSeleccionado(cliente); setSearchTerm(''); setMostrarNuevo(false) }
  const handleCrearNuevo = () => { setMostrarNuevo(true); setClienteSeleccionado(null); setNuevoCliente(prev => ({ ...prev, nombre: searchTerm })) }

  const handleToggleCanal = (nuevoCanal: 'PUNTO' | 'DOMICILIO') => {
    if (nuevoCanal === canal) return
    const productosNuevoCanal = getProductosForCanal(nuevoCanal)
    const nuevasCantidades: Record<string, number> = {}
    for (const id of productosNuevoCanal) {
      if (cantidades[id] > 0) nuevasCantidades[id] = cantidades[id]
    }
    setCantidades(nuevasCantidades)
    setCanal(nuevoCanal)
    setPreciosResueltos({})
    setPreciosManuales({})
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (total <= 0) { toast.error('Agrega al menos un producto'); return }
    if (requiereCliente && !clienteSeleccionado && !mostrarNuevo) {
      toast.error(canal === 'DOMICILIO' ? 'Selecciona un cliente para el envío' : 'Selecciona un cliente para registrar el fiado')
      return
    }
    if (mostrarNuevo && (!nuevoCliente.nombre || !nuevoCliente.telefono)) {
      toast.error('Nombre y teléfono son obligatorios')
      return
    }

    setSubmitting(true)

    let clienteId = 'CONSUMIDOR_FINAL'
    let clienteNuevoData: { nombre: string; telefono: string; direccion: string; barrio?: string } | undefined

    if (clienteSeleccionado) {
      clienteId = clienteSeleccionado.id
    } else if (mostrarNuevo) {
      clienteNuevoData = { nombre: nuevoCliente.nombre, telefono: nuevoCliente.telefono, direccion: nuevoCliente.direccion, barrio: nuevoCliente.barrio || undefined }
    }

    const items = productosActuales
      .filter(id => (cantidades[id] || 0) > 0)
      .map(id => ({
        producto: PRODUCTO_INFO[id].codigo,
        cantidad: cantidades[id] || 0,
        precioManual: preciosManuales[PRODUCTO_INFO[id].codigo],
      }))

    const data: PedidoUnifiedData = {
      clienteId,
      canal,
      items,
      preciosManuales,
      pagos: pagos.filter(p => p.monto > 0),
      obs: observaciones || undefined,
      clienteNuevo: clienteNuevoData,
      ventaRapida: canal === 'PUNTO',
    }

    await onSubmit(data)
    setSubmitting(false)
  }

  // ==================== RENDER ====================

  return (
    <form onSubmit={handleSubmit} className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 h-full">
      {/* COLUMNA IZQUIERDA */}
      <div className="space-y-4 overflow-y-auto lg:max-h-[calc(90vh-2rem)] pr-1">
        {/* Canal toggle (solo si contexto lo permite) */}
        {contexto === 'PUNTO' && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleToggleCanal('PUNTO')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${canal === 'PUNTO' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              🏪 Punto de Venta
            </button>
            <button
              type="button"
              onClick={() => handleToggleCanal('DOMICILIO')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${canal === 'DOMICILIO' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              🚚 Domicilio
            </button>
          </div>
        )}

        {/* Cliente */}
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">{canal === 'DOMICILIO' ? 'Cliente *' : 'Cliente (opcional)'}</h3>
          {clienteSeleccionado ? (
            <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
              <div>
                <span className="font-medium text-sm">{clienteSeleccionado.nombre}</span>
                <span className="text-xs text-gray-500 ml-2">{clienteSeleccionado.telefono}</span>
              </div>
              <button type="button" onClick={() => setClienteSeleccionado(null)} className="text-gray-400 hover:text-red-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Buscar cliente por nombre o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              {searchTerm && filteredClientes.length > 0 && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {filteredClientes.map(c => (
                    <button key={c.id} type="button" onClick={() => handleSelectCliente(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 text-sm">
                      <span className="font-medium">{c.nombre}</span>
                      <span className="text-gray-400 ml-2">{c.telefono}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchTerm && filteredClientes.length === 0 && (
                <button type="button" onClick={handleCrearNuevo} className="text-sm text-blue-600 hover:text-blue-700">+ Crear nuevo cliente "{searchTerm}"</button>
              )}
              {mostrarNuevo && (
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({ ...p, nombre: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                  <input placeholder="Teléfono *" value={nuevoCliente.telefono} onChange={e => setNuevoCliente(p => ({ ...p, telefono: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                  <input placeholder="Dirección" value={nuevoCliente.direccion} onChange={e => setNuevoCliente(p => ({ ...p, direccion: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
                  <input placeholder="Barrio" value={nuevoCliente.barrio} onChange={e => setNuevoCliente(p => ({ ...p, barrio: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Productos - Grid 2 cols en desktop */}
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">Productos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {productosActuales.map((prodId) => {
              const info = PRODUCTO_INFO[prodId]
              const cant = cantidades[prodId] || 0
              const precio = getPrecio(info.codigo)
              const tiers = tablaPrecios[info.codigo] || []
              const Icon = getProductoIconConfig(info.codigo).Icon

              return (
                <div key={prodId} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon size={24} />
                      <span className="font-medium text-sm">{info.nombre}</span>
                    </div>
                    <span className="text-xs text-gray-500">${precio.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => decrement(prodId)} className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-gray-600" disabled={cant === 0}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                      </button>
                      <Input type="number" min="0" value={cant || ''} onChange={(e) => handleCantidadChange(prodId, e.target.value)} className="w-14 text-center p-1 h-8 text-sm bg-white" placeholder="0" />
                      <button type="button" onClick={() => increment(prodId)} className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                    {cant > 0 && <span className="text-sm font-bold">${(cant * precio).toLocaleString()}</span>}
                  </div>
                  {tiers.length > 0 && cant > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tiers.map((t, i) => (
                        <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${cant >= t.cantMin && (t.cantMax === null || cant <= t.cantMax) ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                          {t.cantMax ? `${t.cantMin}-${t.cantMax}` : `${t.cantMin}+`}: ${t.precio.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Observaciones */}
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-700 text-sm mb-2">Observaciones</h3>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas adicionales..."
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
          />
        </div>
      </div>

      {/* COLUMNA DERECHA - STICKY */}
      <div className="lg:sticky lg:top-0 lg:h-fit space-y-4 mt-4 lg:mt-0">
        {/* Ticket / Resumen */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">🧾 Resumen</h3>
          <div className="space-y-1.5 mb-3">
            {productosActuales.filter(id => (cantidades[id] || 0) > 0).map(id => {
              const info = PRODUCTO_INFO[id]
              const cant = cantidades[id] || 0
              const precio = getPrecio(info.codigo)
              const Icon = getProductoIconConfig(info.codigo).Icon
              return (
                <div key={id} className="flex justify-between text-sm">
                  <span className="text-gray-600"><Icon size={16} className="inline-block align-text-bottom" /> {cant} x {info.nombre}</span>
                  <span className="font-medium">${(cant * precio).toLocaleString()}</span>
                </div>
              )
            })}
            {productosActuales.filter(id => (cantidades[id] || 0) > 0).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">Sin productos seleccionados</p>
            )}
          </div>
          <div className="border-t pt-2 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total:</span>
              <span className="font-bold text-lg">${total.toLocaleString()}</span>
            </div>
            {totalPagado > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pagado:</span>
                <span className="font-medium text-green-600">${totalPagado.toLocaleString()}</span>
              </div>
            )}
            {saldoPendiente > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Saldo:</span>
                <span className="font-medium text-red-600">${saldoPendiente.toLocaleString()}</span>
              </div>
            )}
            {saldoPendiente < 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cambio:</span>
                <span className="font-medium text-blue-600">${Math.abs(saldoPendiente).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Pagos */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-700 text-sm">💳 Pagos</h3>
            {total > 0 && (
              <button type="button" onClick={pagarCompleto} className="text-xs text-green-600 hover:text-green-700">
                Pagar completo
              </button>
            )}
          </div>

          {modoPagoActivo ? (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
              <span className="text-lg">{METODO_PAGO_ICONS[modoPagoActivo]}</span>
              <span className="text-sm font-medium">{METODOS_PAGO.find(m => m.id === modoPagoActivo)?.nombre}</span>
              <div className="flex-1 flex items-center gap-1 ml-2">
                <span className="text-xs text-gray-400">$</span>
                <input
                  type="number"
                  min="0"
                  autoFocus
                  value={montoInput}
                  onChange={(e) => setMontoInput(e.target.value)}
                  onBlur={confirmarMonto}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmarMonto(); if (e.key === 'Escape') cancelarMonto() }}
                  className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm text-right"
                  placeholder="0"
                />
              </div>
              <button type="button" onClick={cancelarMonto} className="text-gray-400 hover:text-red-500 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {METODOS_PAGO.map(m => {
                const usado = metodosUsados.has(m.id)
                const pagoExistente = pagos.find(p => p.metodo === m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => seleccionarChip(m.id)}
                    disabled={usado}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition ${usado ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white hover:bg-gray-50 cursor-pointer'}`}
                  >
                    <span>{m.emoji}</span>
                    <span>{m.nombre}</span>
                    {usado && pagoExistente && <span className="text-xs ml-1">✅ ${pagoExistente.monto.toLocaleString()}</span>}
                  </button>
                )
              })}
            </div>
          )}

          {pagos.length > 0 && (
            <div className="space-y-1.5 mt-3">
              {pagos.map((pago, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{METODO_PAGO_ICONS[pago.metodo] || '💳'}</span>
                    <span className="text-sm text-gray-600">{METODOS_PAGO.find(m => m.id === pago.metodo)?.nombre}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">${pago.monto.toLocaleString()}</span>
                    <button type="button" onClick={() => eliminarPago(idx)} className="text-gray-400 hover:text-red-500 p-0.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Botón Submit */}
        <button
          type="submit"
          disabled={submitting || total <= 0}
          className={`w-full py-3 rounded-xl text-white font-bold text-lg shadow-lg transition ${
            canal === 'PUNTO'
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-blue-600 hover:bg-blue-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {submitting ? 'Procesando...' : canal === 'PUNTO' ? `💰 Cobrar $${total.toLocaleString()}` : `📦 Crear Pedido $${total.toLocaleString()}`}
        </button>
      </div>
    </form>
  )
}


