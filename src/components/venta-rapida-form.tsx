'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_PRICES, PRODUCTO_INFO, type ProductoId } from '@/lib/prices'

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
  nombreMostrador?: string
  tipo: 'MOSTRADOR' | 'ENVIO'
  canal: 'PUNTO'
  ventaRapida: true
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
]

const CANAL = 'PUNTO' as const

// Filter products for PUNTO canal
const PRODUCTOS_PUNTO = (Object.keys(PRODUCTO_INFO) as ProductoId[]).filter(
  id => PRODUCTO_INFO[id].canal === 'PUNTO' || PRODUCTO_INFO[id].canal === 'AMBOS'
)

export function VentaRapidaForm({ precios, clientes, onSubmit }: VentaRapidaFormProps) {
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', direccion: '', barrio: '' })
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [submitting, setSubmitting] = useState(false)
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, number>>({})
  const [tablaPrecios, setTablaPrecios] = useState<Record<string, Tier[]>>({})

  // Fetch price tiers on mount
  useEffect(() => {
    fetch(`/api/precios/tabla?canal=${CANAL}`)
      .then(r => r.json())
      .then(d => { if (d.tabla) setTablaPrecios(d.tabla) })
      .catch(() => {})
  }, [])

  const getPrecio = (codigo: string) => preciosResueltos[codigo] || precios[codigo] || DEFAULT_PRICES[codigo] || 0

  const total = PRODUCTOS_PUNTO.reduce((sum, prodId) => {
    const cant = cantidades[prodId] || 0
    return sum + cant * getPrecio(PRODUCTO_INFO[prodId].codigo)
  }, 0)

  const resolverPrecios = useCallback(async (prods: Record<string, number>) => {
    const items = PRODUCTOS_PUNTO
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
        body: JSON.stringify({ items, canal: CANAL }),
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
  }, [])

  const increment = (id: string) => {
    const next = { ...cantidades, [id]: (cantidades[id] || 0) + 1 }
    setCantidades(next)
    resolverPrecios(next)
  }

  const decrement = (id: string) => {
    const next = { ...cantidades, [id]: Math.max(0, (cantidades[id] || 0) - 1) }
    setCantidades(next)
    resolverPrecios(next)
  }

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

  const handleSubmit = async () => {
    if (total <= 0) {
      toast.error('Agrega al menos un producto')
      return
    }

    setSubmitting(true)

    let clienteId = 'CLIENTE_MOSTRADOR'
    let tipo: 'MOSTRADOR' | 'ENVIO' = 'MOSTRADOR'
    let nombreMostrador: string | undefined
    let clienteNuevo: { nombre: string; telefono: string; direccion: string; barrio?: string } | undefined

    if (clienteSeleccionado) {
      clienteId = clienteSeleccionado.id
      tipo = 'ENVIO'
    } else if (mostrarNuevo && nuevoCliente.nombre && nuevoCliente.telefono) {
      clienteNuevo = {
        nombre: nuevoCliente.nombre,
        telefono: nuevoCliente.telefono,
        direccion: nuevoCliente.direccion,
        barrio: nuevoCliente.barrio || undefined,
      }
      tipo = 'ENVIO'
    } else if (searchTerm.trim()) {
      nombreMostrador = searchTerm.trim()
    }

    const data: VentaRapidaData = {
      clienteId,
      clienteNuevo,
      nombreMostrador,
      tipo,
      canal: 'PUNTO',
      ventaRapida: true,
      productos: {
        pacaAgua: cantidades.pacaAgua || 0,
        pacaHielo: cantidades.pacaHielo || 0,
        botellonFab: cantidades.botellonFab || 0,
        botellonDom: cantidades.botellonDom || 0,
        bolsaAgua: cantidades.bolsaAgua || 0,
        bolsaHielo: cantidades.bolsaHielo || 0,
      },
      pagos: [{ metodo: metodoPago, monto: total }],
      obs: clienteSeleccionado
        ? `Cliente: ${clienteSeleccionado.nombre} - ${clienteSeleccionado.telefono}`
        : mostrarNuevo
          ? `Nuevo: ${nuevoCliente.nombre} - ${nuevoCliente.telefono}`
          : searchTerm
            ? `Ref: ${searchTerm}`
            : '',
      total,
    }

    await onSubmit(data)
    setSubmitting(false)
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
      {/* Cliente search */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Cliente</label>
        {!clienteSeleccionado && !mostrarNuevo && (
          <>
            <Input
              placeholder="Buscar por nombre o celular... (vacío = Mostrador)"
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

      {/* Productos con tiers */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm">Productos</h3>
        {PRODUCTOS_PUNTO.map((prodId) => {
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
                    className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition"
                    disabled={cant === 0}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                  </button>
                  <span className="w-8 text-center font-bold text-lg">{cant}</span>
                  <button
                    type="button"
                    onClick={() => increment(prodId)}
                    className="w-9 h-9 rounded-full bg-green-100 hover:bg-green-200 text-green-700 flex items-center justify-center transition"
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
                  <span className="font-semibold">${precio.toLocaleString()}</span>
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
          disabled={total <= 0 || submitting}
          className="w-full py-6 text-lg font-bold bg-green-600 hover:bg-green-700"
          size="lg"
        >
          {submitting ? 'Procesando...' : `Cobrar $${total.toLocaleString()}`}
        </Button>
      </div>
    </div>
  )
}
