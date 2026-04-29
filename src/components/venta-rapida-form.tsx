'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_PRICES, PRODUCTO_INFO, getProductosForCanal, type ProductoId } from '@/lib/prices'

interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  barrio?: string
}

interface Tier {
  cantMin: number
  cantMax: number | null
  precio: number
}

interface VentaRapidaFormProps {
  precios: Record<string, number>
  clientes: Cliente[]
  onSubmit: (data: VentaRapidaData) => void | Promise<void>
}

interface VentaRapidaData {
  clienteId?: string
  clienteNuevo?: { nombre: string; telefono: string; direccion: string; barrio?: string }
  tipo: 'PUNTO' | 'ENVIO'
  canal: 'PUNTO' | 'DOMICILIO'
  ventaRapida: true
  preciosManuales?: Record<string, number>
  productos: {
    pacaAgua: number
    pacaHielo: number
    botellonFab: number
    botellonDom: number
    bolsaAgua: number
    bolsaHielo: number
  }
  pagos: { metodo: string; monto: number }[]
  obs: string
  total: number
}

const METODOS_PAGO = [
  { id: 'EFECTIVO', nombre: 'Efectivo' },
  { id: 'TRANSFERENCIA', nombre: 'Transferencia' },
  { id: 'NEQUI', nombre: 'Nequi' },
  { id: 'DAVIPLATA', nombre: 'Daviplata' },
  { id: 'BONO', nombre: 'Bono' },
  { id: 'FIADO', nombre: 'Pagar después' },
]

export function VentaRapidaForm({ precios, clientes, onSubmit }: VentaRapidaFormProps) {
  const [quiereEnvio, setQuiereEnvio] = useState(false)
  const [canal, setCanal] = useState<'PUNTO' | 'DOMICILIO'>('PUNTO')
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', direccion: '', barrio: '' })
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [submitting, setSubmitting] = useState(false)
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, number>>({})
  const [tablaPrecios, setTablaPrecios] = useState<Record<string, Tier[]>>({})
  const [preciosManuales, setPreciosManuales] = useState<Record<string, number>>({})
  const [preciosEditando, setPreciosEditando] = useState<Record<string, boolean>>({})

  const productosActuales = getProductosForCanal(canal)

  // Fetch price tiers when canal changes
  useEffect(() => {
    fetch(`/api/precios/tabla?canal=${canal}`)
      .then(r => r.json())
      .then(d => { if (d.tabla) setTablaPrecios(d.tabla) })
      .catch(() => {})
  }, [canal])

  // Reset quantities when switching modes
  const handleToggleEnvio = (envio: boolean) => {
    setQuiereEnvio(envio)
    setCanal(envio ? 'DOMICILIO' : 'PUNTO')
    setCantidades({})
    setPreciosResueltos({})
    setPreciosManuales({})
    setPreciosEditando({})
    setClienteSeleccionado(null)
    setSearchTerm('')
    setMostrarNuevo(false)
    // Reset payment method when toggling envio
    if (envio) setMetodoPago('EFECTIVO')
  }

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

  const total = productosActuales.reduce((sum, prodId) => {
    const cant = cantidades[prodId] || 0
    return sum + cant * getPrecio(PRODUCTO_INFO[prodId].codigo)
  }, 0)

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
    } catch {
      // fallback to defaults
    }
  }, [productosActuales])

  const handleCantidadChange = (id: string, value: string) => {
    const cant = parseInt(value) || 0
    const next = { ...cantidades, [id]: cant }
    setCantidades(next)
    resolverPrecios(next, canal)
  }

  const increment = (id: string) => handleCantidadChange(id, String((cantidades[id] || 0) + 1))

  const decrement = (id: string) => handleCantidadChange(id, String(Math.max(0, (cantidades[id] || 0) - 1)))

  const filteredClientes = searchTerm
    ? clientes.filter((c) =>
        c.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.telefono.includes(searchTerm)
      )
    : []

  const handleSelectCliente = (cliente: Cliente) => {
    setClienteSeleccionado(cliente)
    setSearchTerm('')
    setMostrarNuevo(false)
  }

  const handleCrearNuevo = () => {
    setMostrarNuevo(true)
    setClienteSeleccionado(null)
    setNuevoCliente(prev => ({ ...prev, nombre: searchTerm }))
  }

  const esFiado = metodoPago === 'FIADO'
  const requiereCliente = quiereEnvio || esFiado

  const handleSubmit = async () => {
    if (total <= 0) {
      toast.error('Agrega al menos un producto')
      return
    }

    // Validación de cliente: solo si es envío o fiado
    if (requiereCliente) {
      if (!clienteSeleccionado && !mostrarNuevo) {
        toast.error('Busca o crea un cliente para registrar la venta')
        return
      }
      if (mostrarNuevo && (!nuevoCliente.nombre || !nuevoCliente.telefono)) {
        toast.error('Nombre y celular son obligatorios')
        return
      }
      // Validación adicional para envío: requiere dirección
      if (quiereEnvio) {
        if (mostrarNuevo && !nuevoCliente.direccion) {
          toast.error('La dirección es obligatoria para envío')
          return
        }
        if (clienteSeleccionado && !clienteSeleccionado.direccion) {
          toast.error('El cliente seleccionado no tiene dirección. Crea uno nuevo o actualiza el cliente.')
          return
        }
      }
    }

    setSubmitting(true)

    let clienteId = 'CLIENTE_MOSTRADOR'
    let tipo: 'PUNTO' | 'ENVIO' = 'PUNTO'
    let clienteNuevo: { nombre: string; telefono: string; direccion: string; barrio?: string } | undefined

    if (quiereEnvio) {
      if (clienteSeleccionado) {
        clienteId = clienteSeleccionado.id
        tipo = 'ENVIO'
      } else if (mostrarNuevo) {
        clienteNuevo = {
          nombre: nuevoCliente.nombre,
          telefono: nuevoCliente.telefono,
          direccion: nuevoCliente.direccion,
          barrio: nuevoCliente.barrio || undefined,
        }
        tipo = 'ENVIO'
      }
    } else if (requiereCliente) {
      // Punto fiado: necesita cliente real
      if (clienteSeleccionado) {
        clienteId = clienteSeleccionado.id
      } else if (mostrarNuevo) {
        clienteNuevo = {
          nombre: nuevoCliente.nombre,
          telefono: nuevoCliente.telefono,
          direccion: nuevoCliente.direccion,
          barrio: nuevoCliente.barrio || undefined,
        }
      }
    }

    const data: VentaRapidaData = {
      clienteId,
      clienteNuevo,
      tipo,
      canal,
      ventaRapida: true,
      preciosManuales: Object.keys(preciosManuales).length > 0 ? preciosManuales : undefined,
      productos: {
        pacaAgua: cantidades.pacaAgua || 0,
        pacaHielo: cantidades.pacaHielo || 0,
        botellonFab: cantidades.botellonFab || 0,
        botellonDom: cantidades.botellonDom || 0,
        bolsaAgua: cantidades.bolsaAgua || 0,
        bolsaHielo: cantidades.bolsaHielo || 0,
      },
      pagos: esFiado ? [] : [{ metodo: metodoPago, monto: total }],
      obs: clienteSeleccionado
        ? `Cliente: ${clienteSeleccionado.nombre} - ${clienteSeleccionado.telefono}`
        : mostrarNuevo
          ? `Nuevo: ${nuevoCliente.nombre} - ${nuevoCliente.telefono}`
          : '',
      total,
    }

    try {
      await onSubmit(data)
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
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
      {/* Toggle envío */}
      <div className="bg-gray-50 rounded-lg p-3 border">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={quiereEnvio}
            onChange={(e) => handleToggleEnvio(e.target.checked)}
            className="w-5 h-5 rounded border-gray-300"
          />
          <div>
            <span className="font-medium text-gray-700">¿Quiere envío a domicilio?</span>
            <p className="text-xs text-gray-400">
              {quiereEnvio ? 'Precios y productos de envío' : 'Venta en punto de venta'}
            </p>
          </div>
        </label>
      </div>

      {/* Cliente search - solo si es envío o fiado */}
      {requiereCliente && (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          {quiereEnvio ? 'Cliente para envío' : 'Cliente (obligatorio para fiado)'}
        </label>
        {!clienteSeleccionado && !mostrarNuevo && (
          <>
            <Input
              placeholder="Buscar por nombre o celular..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setMostrarNuevo(false)
              }}
            />
            {searchTerm && (
              <div className="border rounded-md max-h-40 overflow-y-auto bg-white shadow-sm">
                {filteredClientes.length > 0 ? (
                  filteredClientes.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => handleSelectCliente(cliente)}
                      className="w-full text-left px-3 py-2.5 hover:bg-green-50 flex justify-between items-center border-b last:border-b-0"
                    >
                      <span className="font-medium text-sm">{cliente.nombre}</span>
                      <span className="text-xs text-gray-400">{cliente.telefono}</span>
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={handleCrearNuevo}
                    className="w-full text-left px-3 py-2.5 hover:bg-green-50 text-green-700 text-sm font-medium"
                  >
                    + Crear nuevo cliente: "{searchTerm}"
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {clienteSeleccionado && (
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
            <div>
              <p className="font-medium text-sm">{clienteSeleccionado.nombre}</p>
              <p className="text-xs text-gray-500">{clienteSeleccionado.telefono}</p>
              {quiereEnvio && clienteSeleccionado.direccion && (
                <p className="text-xs text-gray-400">{clienteSeleccionado.direccion}</p>
              )}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setClienteSeleccionado(null); setSearchTerm('') }}>
              Cambiar
            </Button>
          </div>
        )}

        {mostrarNuevo && (
          <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Nuevo cliente</span>
              <button type="button" onClick={() => { setMostrarNuevo(false); setSearchTerm('') }} className="text-xs text-gray-400 hover:text-gray-600">
                Cancelar
              </button>
            </div>
            <Input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({ ...p, nombre: e.target.value }))} />
            <Input placeholder="Celular *" value={nuevoCliente.telefono} onChange={e => setNuevoCliente(p => ({ ...p, telefono: e.target.value }))} />
            <Input placeholder="Dirección *" value={nuevoCliente.direccion} onChange={e => setNuevoCliente(p => ({ ...p, direccion: e.target.value }))} />
            <Input placeholder="Barrio" value={nuevoCliente.barrio} onChange={e => setNuevoCliente(p => ({ ...p, barrio: e.target.value }))} />
          </div>
        )}
      </div>
      )}

      {/* Productos con tiers */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm">Productos</h3>
        {productosActuales.map((prodId) => {
          const info = PRODUCTO_INFO[prodId]
          const cant = cantidades[prodId] || 0
          const precio = getPrecio(info.codigo)
          const tiers = tablaPrecios[info.codigo] || []
          const activeTier = getActiveTier(info.codigo, cant)
          return (
            <div key={prodId} className="border rounded-lg p-3 bg-white">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{info.emoji}</span>
                  <div>
                    <span className="font-medium text-sm">{info.nombre}</span>
                    <span className="text-xs text-gray-400 ml-1">({info.unidad})</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decrement(prodId)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                    disabled={cant === 0}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                  </button>
                  <Input
                    type="number"
                    min="0"
                    value={cant || ''}
                    onChange={(e) => handleCantidadChange(prodId, e.target.value)}
                    className="w-16 text-center p-1 h-8 text-sm"
                    placeholder="0"
                  />
                  <button
                    type="button"
                    onClick={() => increment(prodId)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-green-100 hover:bg-green-200 text-green-700 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              </div>
              {/* Price tiers */}
              {tiers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {tiers.map((t, i) => {
                    const isActive = activeTier?.cantMin === t.cantMin
                    return (
                      <span
                        key={i}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${
                          isActive
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {formatTier(t)}
                      </span>
                    )
                  })}
                </div>
              )}
              {cant > 0 && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Precio unitario:</span>
                  {preciosEditando[info.codigo] ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="number"
                        min="0"
                        autoFocus
                        defaultValue={precio}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          const base = getPrecioBase(info.codigo)
                          if (val !== base) {
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
                      <span className="font-semibold">${precio.toLocaleString()}</span>
                      <button
                        type="button"
                        onClick={() => setPreciosEditando(prev => ({ ...prev, [info.codigo]: true }))}
                        className="text-gray-400 hover:text-green-600 transition p-0.5"
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
              {cant > 0 && (
                <div className="flex justify-between items-center text-sm font-bold text-gray-800 mt-0.5">
                  <span>Subtotal:</span>
                  <span>${(cant * precio).toLocaleString()}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Método de pago */}
      <div>
        <label className="text-sm text-gray-500 mb-1 block">Método de pago</label>
        <select
          value={metodoPago}
          onChange={(e) => setMetodoPago(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          {METODOS_PAGO.map(m => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>
      </div>

      {/* Total y botón cobrar */}
      <div className="border-t pt-4 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Total:</span>
          <span className="text-xl font-bold text-gray-800">${total.toLocaleString()}</span>
        </div>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={total <= 0 || submitting || (requiereCliente && !clienteSeleccionado && !mostrarNuevo)}
          className={`w-full py-6 text-lg font-bold ${metodoPago === 'FIADO' ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'}`}
          size="lg"
        >
          {submitting ? 'Procesando...' : metodoPago === 'FIADO' ? `Registrar $${total.toLocaleString()}` : `Cobrar $${total.toLocaleString()}`}
        </Button>
      </div>
    </div>
  )
}
