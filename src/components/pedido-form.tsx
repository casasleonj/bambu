'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_PRICES, PRODUCTO_INFO, getProductosForCanal, type ProductoId } from '@/lib/prices'

interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  preciosEspeciales?: string
}

interface Tier {
  cantMin: number
  cantMax: number | null
  precio: number
}

interface PagoPedido {
  metodo: string
  monto: number
}

interface PedidoFormData {
  clienteId: string
  clienteNuevo?: { nombre: string; telefono: string; direccion: string; barrio?: string }
  canal: string
  productos: {
    pacaAgua: number
    pacaHielo: number
    botellonFab: number
    botellonDom: number
    bolsaAgua: number
    bolsaHielo: number
  }
  preciosManuales: Record<string, number>
  pagos: PagoPedido[]
  obs: string
  total: number
}

interface PedidoFormProps {
  onSubmit?: (pedido: PedidoFormData) => void
  clientes?: Cliente[]
  precios?: Record<string, number>
}

const METODOS_PAGO = [
  { id: 'EFECTIVO', nombre: 'Efectivo', emoji: '💵' },
  { id: 'TRANSFERENCIA', nombre: 'Transferencia', emoji: '🏦' },
  { id: 'NEQUI', nombre: 'Nequi', emoji: '📱' },
  { id: 'DAVIPLATA', nombre: 'Daviplata', emoji: '📲' },
  { id: 'BONO', nombre: 'Bono', emoji: '🎫' },
]

const METODO_PAGO_ICONS: Record<string, string> = {
  EFECTIVO: '💵',
  TRANSFERENCIA: '🏦',
  NEQUI: '📱',
  DAVIPLATA: '📲',
  BONO: '🎫',
}

const CANAL = 'DOMICILIO' as const

// Filter products for DOMICILIO canal (excludes soloPunto like bolsas)
const PRODUCTOS_DOM = getProductosForCanal('DOMICILIO')

export function PedidoForm({ onSubmit, clientes = [], precios = {} }: PedidoFormProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', direccion: '', barrio: '' })
  const [productos, setProductos] = useState<Record<ProductoId, number>>({
    pacaAgua: 0,
    pacaHielo: 0,
    botellonFab: 0,
    botellonDom: 0,
    bolsaAgua: 0,
    bolsaHielo: 0,
  })
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, number>>({})
  const [preciosManuales, setPreciosManuales] = useState<Record<string, number>>({})
  const [pagos, setPagos] = useState<{ metodo: string; monto: number }[]>([])
  const [modoPagoActivo, setModoPagoActivo] = useState<string | null>(null)
  const [montoInput, setMontoInput] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [tablaPrecios, setTablaPrecios] = useState<Record<string, Tier[]>>({})
  const [preciosEditando, setPreciosEditando] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)

  // Fetch price tiers on mount
  useEffect(() => {
    fetch(`/api/precios/tabla?canal=${CANAL}`)
      .then(r => r.json())
      .then(d => { if (d.tabla) setTablaPrecios(d.tabla) })
      .catch(() => {})
  }, [])

  const filteredClientes = searchTerm
    ? clientes.filter((c) =>
        c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.telefono.includes(searchTerm)
      )
    : clientes.slice(0, 5)

  const resolverPrecios = useCallback(async (
    prods: Record<ProductoId, number>,
    canalVal: string,
    clienteId?: string,
  ) => {
    const items = PRODUCTOS_DOM
      .filter(id => prods[id] > 0)
      .map(id => ({
        codigo: PRODUCTO_INFO[id].codigo,
        cantidad: prods[id],
      }))

    if (items.length === 0) {
      setPreciosResueltos({})
      return
    }

    try {
      const res = await fetch('/api/precios/resolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, canal: canalVal, clienteId }),
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
    } catch {
      // fallback
    }
  }, [])

  const getPrecio = (productoId: ProductoId): number => {
    const info = PRODUCTO_INFO[productoId]
    if (preciosResueltos[info.codigo] && preciosResueltos[info.codigo] > 0) {
      return preciosResueltos[info.codigo]
    }
    // Use first tier from price table as fallback (shows correct DOMICILIO prices)
    const tiers = tablaPrecios[info.codigo]
    if (tiers && tiers.length > 0) {
      return tiers[0].precio
    }
    return precios[info.precioKey] || DEFAULT_PRICES[info.precioKey] || 0
  }

  function getEffectivePrice(codigo: string): number {
    if (preciosManuales[codigo] !== undefined) return preciosManuales[codigo]
    if (preciosResueltos[codigo]) return preciosResueltos[codigo]
    const pid = PRODUCTOS_DOM.find(id => PRODUCTO_INFO[id].codigo === codigo)
    return pid ? getPrecio(pid) : 0
  }

  const calcularTotal = (): number => {
    return PRODUCTOS_DOM.reduce((total, prodId) => {
      const cant = productos[prodId] || 0
      if (cant <= 0) return total
      const info = PRODUCTO_INFO[prodId]
      return total + cant * getEffectivePrice(info.codigo)
    }, 0)
  }

  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
  const total = calcularTotal()

  const handleCantidadChange = (productoId: ProductoId, value: string) => {
    const cant = parseInt(value) || 0
    const newProds = { ...productos, [productoId]: cant }
    setProductos(newProds)
    resolverPrecios(newProds, CANAL, clienteSeleccionado?.id)
  }

  const metodosUsados = new Set(pagos.map(p => p.metodo))

  const seleccionarChip = (metodoId: string) => {
    if (metodosUsados.has(metodoId)) return
    setModoPagoActivo(metodoId)
    setMontoInput('')
  }

  const confirmarMonto = () => {
    if (!modoPagoActivo) return
    const monto = parseFloat(montoInput) || 0
    if (monto <= 0) {
      setModoPagoActivo(null)
      setMontoInput('')
      return
    }
    setPagos(prev => [...prev, { metodo: modoPagoActivo, monto }])
    setModoPagoActivo(null)
    setMontoInput('')
  }

  const cancelarMonto = () => {
    setModoPagoActivo(null)
    setMontoInput('')
  }

  const eliminarPago = (idx: number) => {
    setPagos(prev => prev.filter((_, i) => i !== idx))
  }

  const pagarCompleto = () => {
    if (total <= 0) return
    setPagos([{ metodo: 'EFECTIVO', monto: total }])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (total <= 0) {
      toast.error('El pedido debe tener al menos un producto')
      return
    }
    if (submitting) return

    // Validación de cliente
    if (!clienteSeleccionado && !mostrarNuevo) {
      toast.error('Selecciona un cliente')
      return
    }
    if (mostrarNuevo && (!nuevoCliente.nombre || !nuevoCliente.telefono)) {
      toast.error('Nombre y celular son obligatorios')
      return
    }

    setSubmitting(true)

    let clienteId = ''
    let clienteNuevoData: { nombre: string; telefono: string; direccion: string; barrio?: string } | undefined

    if (clienteSeleccionado) {
      clienteId = clienteSeleccionado.id
    } else if (mostrarNuevo) {
      clienteNuevoData = {
        nombre: nuevoCliente.nombre,
        telefono: nuevoCliente.telefono,
        direccion: nuevoCliente.direccion,
        barrio: nuevoCliente.barrio || undefined,
      }
    }

    // Cap payments to total (change is handled by cashier, not recorded)
    const totalPagadoActual = pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
    const pagosNormalizados = (() => {
      const pagosValidos = pagos.filter((p) => p.monto > 0)
      if (totalPagadoActual <= total) return pagosValidos
      let remaining = total
      return pagosValidos.map(p => {
        if (remaining <= 0) return null
        const monto = Math.min(p.monto, remaining)
        remaining -= monto
        return { metodo: p.metodo, monto }
      }).filter((p): p is { metodo: string; monto: number } => p !== null)
    })()

    const pedido: PedidoFormData = {
      clienteId,
      clienteNuevo: clienteNuevoData,
      canal: CANAL,
      productos: {
        pacaAgua: productos.pacaAgua,
        pacaHielo: productos.pacaHielo,
        botellonFab: productos.botellonFab,
        botellonDom: productos.botellonDom,
        bolsaAgua: productos.bolsaAgua,
        bolsaHielo: productos.bolsaHielo,
      },
      preciosManuales,
      pagos: pagosNormalizados,
      obs: observaciones,
      total,
    }
    try {
      await onSubmit?.(pedido)
    } finally {
      setSubmitting(false)
    }
  }

  function formatTier(t: Tier): string {
    if (t.cantMax) return `${t.cantMin}-${t.cantMax}: $${t.precio.toLocaleString()}`
    return `${t.cantMin}+: $${t.precio.toLocaleString()}`
  }

  function getActiveTier(codigo: string, cant: number): Tier | undefined {
    const tiers = tablaPrecios[codigo]
    if (!tiers) return undefined
    return tiers.find(t => cant >= t.cantMin && (t.cantMax === null || cant <= t.cantMax))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Cliente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!clienteSeleccionado && !mostrarNuevo ? (
            <>
              <div>
                <Label>Buscar Cliente</Label>
                <Input
                  placeholder="Buscar por nombre o telefono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchTerm && (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {filteredClientes.length > 0 ? (
                    filteredClientes.map((cliente) => (
                      <button
                        key={cliente.id}
                        type="button"
                        onClick={() => {
                          setClienteSeleccionado(cliente)
                          setSearchTerm('')
                          resolverPrecios(productos, CANAL, cliente.id)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between items-center border-b last:border-b-0"
                      >
                        <span>{cliente.nombre}</span>
                        <span className="text-sm text-muted-foreground">
                          {cliente.telefono}
                        </span>
                      </button>
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarNuevo(true)
                        setNuevoCliente(prev => ({ ...prev, nombre: searchTerm }))
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-primary font-medium"
                    >
                      + Crear nuevo cliente: "{searchTerm}"
                    </button>
                  )}
                </div>
              )}
            </>
          ) : mostrarNuevo ? (
            <div className="space-y-2 border rounded-lg p-3 bg-muted">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Nuevo cliente</span>
                <button type="button" onClick={() => { setMostrarNuevo(false); setSearchTerm('') }} className="text-xs text-muted-foreground hover:text-foreground">
                  Cancelar
                </button>
              </div>
              <Input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({ ...p, nombre: e.target.value }))} />
              <Input placeholder="Celular *" value={nuevoCliente.telefono} onChange={e => setNuevoCliente(p => ({ ...p, telefono: e.target.value }))} />
              <Input placeholder="Dirección" value={nuevoCliente.direccion} onChange={e => setNuevoCliente(p => ({ ...p, direccion: e.target.value }))} />
              <Input placeholder="Barrio" value={nuevoCliente.barrio} onChange={e => setNuevoCliente(p => ({ ...p, barrio: e.target.value }))} />
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <div>
                <p className="font-medium">{clienteSeleccionado?.nombre}</p>
                <p className="text-sm text-muted-foreground">
                  {clienteSeleccionado?.telefono}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setClienteSeleccionado(null)}
              >
                X
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm">Productos</h3>
        {PRODUCTOS_DOM.map((prodId) => {
          const info = PRODUCTO_INFO[prodId]
          const precioBase = getPrecio(prodId)
          const precioActual = getEffectivePrice(info.codigo)
          const estaEditando = preciosEditando[info.codigo]
          const cantidad = productos[prodId] || 0
          const tiers = tablaPrecios[info.codigo] || []
          const activeTier = getActiveTier(info.codigo, cantidad)
          return (
            <div key={prodId} className="border rounded-lg p-3 bg-white">
              {/* Header: info + controls */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{info.emoji}</span>
                  <div>
                    <span className="font-medium text-sm">{info.nombre}</span>
                    <span className="text-xs text-gray-400 ml-1">({info.unidad})</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCantidadChange(prodId, String(Math.max(0, cantidad - 1)))}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                    disabled={cantidad <= 0}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                  </button>
                  <Input
                    type="number"
                    min="0"
                    value={cantidad || ''}
                    onChange={(e) => handleCantidadChange(prodId, e.target.value)}
                    className="w-16 text-center p-1 h-8 text-sm"
                    placeholder="0"
                  />
                  <button
                    type="button"
                    onClick={() => handleCantidadChange(prodId, String(cantidad + 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              </div>
              {/* Tiers */}
              {tiers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {tiers.map((t, i) => {
                    const isActive = activeTier?.cantMin === t.cantMin
                    return (
                      <span
                        key={i}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {formatTier(t)}
                      </span>
                    )
                  })}
                </div>
              )}
              {/* Precio editable + subtotal */}
              {cantidad > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Precio unitario:</span>
                  {estaEditando ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        autoFocus
                        defaultValue={precioActual}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          if (val !== precioBase) {
                            setPreciosManuales(prev => ({ ...prev, [info.codigo]: val }))
                          } else {
                            setPreciosManuales(prev => {
                              const next = { ...prev }
                              delete next[info.codigo]
                              return next
                            })
                          }
                          setPreciosEditando(prev => ({ ...prev, [info.codigo]: false }))
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur()
                          }
                        }}
                        className="w-20 border rounded px-2 py-1 text-sm text-right"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">${precioActual.toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={() => setPreciosEditando(prev => ({ ...prev, [info.codigo]: true }))}
                        className="text-gray-400 hover:text-blue-600 transition p-0.5"
                        title="Editar precio"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
              {cantidad > 0 && (
                <div className="flex justify-between items-center text-sm font-bold text-gray-800 mt-0.5">
                  <span>Subtotal:</span>
                  <span>${(cantidad * precioActual).toLocaleString()}</span>
                </div>
              )}
            </div>
          )
        })}

        <div className="flex justify-between items-center pt-3 border-t">
          <span className="font-medium">Total Pedido:</span>
          <span className="text-xl font-bold">${total.toLocaleString()}</span>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pagos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-700">Método de pago</label>
            <button
              type="button"
              onClick={pagarCompleto}
              disabled={total <= 0}
              className="text-xs text-green-600 hover:text-green-700 disabled:text-gray-300 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-green-50 transition"
            >
              Pagar completo
            </button>
          </div>

          {modoPagoActivo ? (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
              <span className="text-lg">{METODO_PAGO_ICONS[modoPagoActivo]}</span>
              <span className="text-sm font-medium text-gray-700">
                {METODOS_PAGO.find(m => m.id === modoPagoActivo)?.nombre}
              </span>
              <div className="flex-1 flex items-center gap-1 ml-2">
                <span className="text-xs text-gray-400">$</span>
                <input
                  type="number"
                  min="0"
                  autoFocus
                  value={montoInput}
                  onChange={(e) => setMontoInput(e.target.value)}
                  onBlur={confirmarMonto}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmarMonto()
                    else if (e.key === 'Escape') cancelarMonto()
                  }}
                  className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="0"
                />
              </div>
              <button
                type="button"
                onClick={cancelarMonto}
                className="text-gray-400 hover:text-red-500 p-1 transition"
                title="Cancelar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
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
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition ${
                      usado
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'bg-white hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <span>{m.emoji}</span>
                    <span>{m.nombre}</span>
                    {usado && pagoExistente && (
                      <span className="text-xs ml-1">✅ ${pagoExistente.monto.toLocaleString()}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {pagos.length > 0 && (
            <div className="space-y-1.5">
              {pagos.map((pago, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{METODO_PAGO_ICONS[pago.metodo] || '💳'}</span>
                    <span className="text-sm text-gray-600">
                      {METODOS_PAGO.find(m => m.id === pago.metodo)?.nombre}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">${pago.monto.toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => eliminarPago(idx)}
                      className="text-gray-400 hover:text-red-500 p-0.5 transition"
                      title="Eliminar pago"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > 0 && (
            <div className="space-y-1 pt-2 border-t">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Total pagado:</span>
                <span className="font-bold text-green-600">${totalPagado.toLocaleString()}</span>
              </div>
              {totalPagado > total && (
                <div className="flex justify-between items-center text-sm text-blue-600">
                  <span>Cambio:</span>
                  <span className="font-bold">${(totalPagado - total).toLocaleString()}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Observaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas adicionales..."
          />
        </CardContent>
      </Card>

      <Button type="submit" className="w-full" size="lg" disabled={submitting || total <= 0}>
        {submitting ? 'Creando...' : `Crear Pedido (${total.toLocaleString()})`}
      </Button>
    </form>
  )
}
