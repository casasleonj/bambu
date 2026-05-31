'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { ClienteSelect } from './cliente-select'
import { ProductGrid } from './product-grid'
import { PagoSection } from './pago-section'
import { ResumenSection } from './resumen-section'
import { DEFAULT_PRICES, PRODUCTO_INFO, getProductosForCanal } from '@/lib/prices'
import { matchCliente } from '@/lib/cliente-search'
import { usePriceSync } from '@/hooks/use-price-sync'
import type { Cliente, Tier, VentaRapidaFormProps, VentaRapidaData, VentaRapidaItem } from './types'

export type { VentaRapidaFormProps, VentaRapidaData, Cliente }

export function VentaRapidaForm({ clientes, onSubmit }: VentaRapidaFormProps) {
  const [quiereEnvio, setQuiereEnvio] = useState(false)
  const [canal, setCanal] = useState<'PUNTO' | 'DOMICILIO'>('PUNTO')
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', apellido: '', telefono: '', direccion: '', barrio: '' })
  const [pagos, setPagos] = useState<{ metodo: string; monto: number }[]>([])
  const [modoPagoActivo, setModoPagoActivo] = useState<string | null>(null)
  const [montoInput, setMontoInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, number>>({})
  const [tablaPrecios, setTablaPrecios] = useState<Record<string, Tier[]>>({})
  const [preciosManuales, setPreciosManuales] = useState<Record<string, number>>({})
  const [preciosEditando, setPreciosEditando] = useState<Record<string, boolean>>({})
  const [productosConfig, setProductosConfig] = useState<Array<{ codigo: string; aplicaDomicilio: boolean; sobreCostoDomicilio: number }>>([])

  useEffect(() => {
    fetch(`/api/productos/configs`)
      .then(r => r.json())
      .then(d => { if (d.success && d.productos) setProductosConfig(d.productos) })
      .catch(() => {})
  }, [])

  const productosActuales = getProductosForCanal(canal, productosConfig)

  useEffect(() => {
    fetch(`/api/precios/tabla`)
      .then(r => r.json())
      .then(d => { if (d.tabla) setTablaPrecios(d.tabla) })
      .catch(() => {})
  }, [])

  // Refs para acceder a valores actuales en el callback
  const cantidadesRef = useRef(cantidades)
  const canalRef = useRef(canal)
  const clienteIdRef = useRef(clienteSeleccionado?.id)

  useEffect(() => { cantidadesRef.current = cantidades }, [cantidades])
  useEffect(() => { canalRef.current = canal }, [canal])
  useEffect(() => { clienteIdRef.current = clienteSeleccionado?.id }, [clienteSeleccionado?.id])

  const handleToggleEnvio = (envio: boolean) => {
    const nuevoCanal = envio ? 'DOMICILIO' : 'PUNTO'
    const productosNuevoCanal = getProductosForCanal(nuevoCanal, productosConfig)
    const productosViejoCanal = getProductosForCanal(canal, productosConfig)

    const nuevasCantidades: Record<string, number> = {}
    let eliminados = 0
    for (const id of productosNuevoCanal) {
      if (cantidades[id] > 0) {
        nuevasCantidades[id] = cantidades[id]
      }
    }
    for (const id of productosViejoCanal) {
      if (cantidades[id] > 0 && !productosNuevoCanal.includes(id)) {
        eliminados++
      }
    }

    setCantidades(nuevasCantidades)
    setQuiereEnvio(envio)
    setCanal(nuevoCanal)
    setPreciosResueltos({})
    setPreciosManuales({})
    setPreciosEditando({})

    if (eliminados > 0) {
      toast.info(`${eliminados} producto(s) no disponible(s) para ${nuevoCanal === 'DOMICILIO' ? 'envío' : 'punto'}`)
    }
  }

  const getPrecioBase = (codigo: string): number => {
    if (preciosResueltos[codigo]) return preciosResueltos[codigo]
    const tiers = tablaPrecios[codigo]
    let precio = tiers && tiers.length > 0 ? tiers[0].precio : (DEFAULT_PRICES[codigo] || 0)
    if (canal === 'DOMICILIO') {
      const prod = productosConfig.find(p => p.codigo === codigo)
      if (prod?.aplicaDomicilio) {
        precio += Number(prod.sobreCostoDomicilio)
      }
    }
    return precio
  }

  const getPrecio = (codigo: string) => {
    if (preciosManuales[codigo] !== undefined) return preciosManuales[codigo]
    return getPrecioBase(codigo)
  }

  const total = productosActuales.reduce((sum, prodId) => {
    const cant = cantidades[prodId] || 0
    return sum + cant * getPrecio(PRODUCTO_INFO[prodId].codigo)
  }, 0)

  const resolverPrecios = useCallback(async (prods: Record<string, number>, canalVal: 'PUNTO' | 'DOMICILIO', cid?: string) => {
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
        body: JSON.stringify({ items, canal: canalVal, clienteId: cid }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.precios) {
          const nuevos: Record<string, number> = {}
          for (const [codigo, info] of Object.entries(data.precios)) {
            nuevos[codigo] = (info as { precio: number }).precio
          }
          setPreciosResueltos(nuevos)
        }
      }
    } catch {
      // fallback to defaults
    }
  }, [productosActuales, clienteSeleccionado?.id])

  // Price sync: detectar cambios de precios via polling
  const handlePriceRefresh = useCallback(async () => {
    try {
      const res = await fetch('/api/precios/tabla')
      const data = await res.json()
      if (data.tabla) {
        setTablaPrecios(data.tabla)
        // Re-resolver precios si hay cantidades cargadas
        if (Object.values(cantidadesRef.current).some(c => c > 0)) {
          resolverPrecios(cantidadesRef.current, canalRef.current, clienteIdRef.current)
        }
      }
    } catch (error) {
      console.error('Error refreshing prices:', error)
    }
  }, [resolverPrecios])

  const { stale: preciosStale, refresh: refreshPrecios } = usePriceSync(handlePriceRefresh)

  // Re-resolver precios cuando cambia la selección de cliente
  useEffect(() => {
    if (!clienteSeleccionado?.id) return
    const allProducts: Record<string, number> = {}
    for (const id of productosActuales) {
      allProducts[id] = cantidades[id] || 1
    }
    resolverPrecios(allProducts, canal, clienteSeleccionado.id)
  }, [clienteSeleccionado?.id, productosActuales])

  const handleCantidadChange = (id: string, value: string) => {
    const cant = parseInt(value) || 0
    const next = { ...cantidades, [id]: cant }
    setCantidades(next)
    resolverPrecios(next, canal, clienteSeleccionado?.id)
  }

  const increment = (id: string) => handleCantidadChange(id, String((cantidades[id] || 0) + 1))

  const decrement = (id: string) => handleCantidadChange(id, String(Math.max(0, (cantidades[id] || 0) - 1)))

  const filteredClientes = searchTerm
    ? clientes.filter((c) => matchCliente(c, searchTerm))
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

  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
  const saldoPendiente = total - totalPagado
  const requiereCliente = quiereEnvio || saldoPendiente > 0

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

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (total <= 0) {
      toast.error('Agrega al menos un producto')
      return
    }

    if (requiereCliente) {
      if (!clienteSeleccionado && !mostrarNuevo) {
        toast.error(saldoPendiente > 0
          ? 'Selecciona un cliente para registrar el saldo pendiente'
          : 'Busca o crea un cliente para registrar la venta'
        )
        return
      }
      if (mostrarNuevo && (!nuevoCliente.nombre || !nuevoCliente.telefono)) {
        toast.error('Nombre y celular son obligatorios')
        return
      }
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

    let clienteId = 'CONSUMIDOR_FINAL'
    let tipo: 'PUNTO' | 'ENVIO' = 'PUNTO'
    let clienteNuevo: { nombre: string; apellido?: string; telefono: string; direccion: string; barrio?: string } | undefined

    if (quiereEnvio) {
      if (clienteSeleccionado) {
        clienteId = clienteSeleccionado.id
        tipo = 'ENVIO'
      } else if (mostrarNuevo) {
        clienteNuevo = {
          nombre: nuevoCliente.nombre,
          apellido: nuevoCliente.apellido || undefined,
          telefono: nuevoCliente.telefono,
          direccion: nuevoCliente.direccion,
          barrio: nuevoCliente.barrio || undefined,
        }
        tipo = 'ENVIO'
      }
    } else if (clienteSeleccionado) {
      clienteId = clienteSeleccionado.id
    } else if (mostrarNuevo) {
      clienteNuevo = {
        nombre: nuevoCliente.nombre,
        telefono: nuevoCliente.telefono,
        direccion: nuevoCliente.direccion,
        barrio: nuevoCliente.barrio || undefined,
      }
    }

    const pagosNormalizados = (() => {
      const pagosValidos = pagos.filter((p) => p.monto > 0)
      if (totalPagado <= total) return pagosValidos
      let remaining = total
      return pagosValidos.map(p => {
        if (remaining <= 0) return null
        const monto = Math.min(p.monto, remaining)
        remaining -= monto
        return { metodo: p.metodo, monto }
      }).filter((p): p is { metodo: string; monto: number } => p !== null)
    })()

    const items: VentaRapidaItem[] = productosActuales
      .filter(id => (cantidades[id] || 0) > 0)
      .map(id => {
        const codigo = PRODUCTO_INFO[id].codigo as VentaRapidaItem['producto']
        return {
          producto: codigo,
          cantidad: cantidades[id] || 0,
          precioManual: preciosManuales[codigo],
        }
      })

    const data: VentaRapidaData = {
      clienteId,
      clienteNuevo,
      tipo,
      canal,
      ventaRapida: true,
      preciosManuales: Object.keys(preciosManuales).length > 0 ? preciosManuales : undefined,
      items,
      pagos: pagosNormalizados,
      obs: clienteSeleccionado
        ? `Cliente: ${clienteSeleccionado.nombre} - ${clienteSeleccionado.telefono}`
        : mostrarNuevo
          ? `Cliente nuevo: ${nuevoCliente.nombre} - ${nuevoCliente.telefono}`
          : '',
      total,
    }

    try {
      await onSubmit(data)
    } finally {
      setSubmitting(false)
    }
  }

  const requiereClienteSinResolver = requiereCliente && !clienteSeleccionado && !mostrarNuevo

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
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

      {/* Banner de precios desactualizados */}
      {preciosStale && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">Precios actualizados disponibles</span>
          </div>
          <button
            type="button"
            onClick={refreshPrecios}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition"
          >
            Actualizar
          </button>
        </div>
      )}

      <ClienteSelect
        requiereCliente={requiereCliente}
        quiereEnvio={quiereEnvio}
        saldoPendiente={saldoPendiente}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filteredClientes={filteredClientes}
        clienteSeleccionado={clienteSeleccionado}
        setClienteSeleccionado={setClienteSeleccionado}
        mostrarNuevo={mostrarNuevo}
        setMostrarNuevo={setMostrarNuevo}
        nuevoCliente={nuevoCliente}
        setNuevoCliente={setNuevoCliente}
        onSelectCliente={handleSelectCliente}
        onCreateNuevo={handleCrearNuevo}
      />

      <ProductGrid
        productosVisibles={productosActuales}
        cantidades={cantidades}
        handleCantidadChange={handleCantidadChange}
        increment={increment}
        decrement={decrement}
        getPrecio={getPrecio}
        getPrecioBase={getPrecioBase}
        tablaPrecios={tablaPrecios}
        preciosEditando={preciosEditando}
        setPreciosEditando={setPreciosEditando}
        preciosManuales={preciosManuales}
        setPreciosManuales={setPreciosManuales}
      />

      <PagoSection
        pagos={pagos}
        setPagos={setPagos}
        modoPagoActivo={modoPagoActivo}
        setModoPagoActivo={setModoPagoActivo}
        montoInput={montoInput}
        setMontoInput={setMontoInput}
        total={total}
        totalPagado={totalPagado}
        saldoPendiente={saldoPendiente}
        metodosUsados={metodosUsados}
        seleccionarChip={seleccionarChip}
        confirmarMonto={confirmarMonto}
        cancelarMonto={cancelarMonto}
        eliminarPago={eliminarPago}
        pagarCompleto={pagarCompleto}
      />

      <ResumenSection
        total={total}
        submitting={submitting}
        requiereClienteSinResolver={requiereClienteSinResolver}
      />
    </form>
  )
}
