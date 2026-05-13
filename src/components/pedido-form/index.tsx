'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_PRICES, PRODUCTO_INFO, getProductosForCanal, type ProductoId } from '@/lib/prices'
import type { Cliente, Tier, PedidoFormData, PedidoFormProps, PedidoItemInput } from './types'
import { ClienteSection } from './cliente-section'
import { ProductosSection } from './productos-section'
import { PagoSection } from './pago-section'
import { FormSubmit } from './form-submit'

export type { PedidoFormData, PedidoFormProps } from './types'

const CANAL = 'DOMICILIO' as const

const PRODUCTOS_DOM = getProductosForCanal('DOMICILIO')

export function PedidoForm({ onSubmit, clientes = [], precios = {} }: PedidoFormProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', direccion: '', barrio: '' })
  const [productos, setProductos] = useState<Record<ProductoId, number>>({
    pacaAgua: 0,
    pacaHielo: 0,
    botellon: 0,
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

  useEffect(() => {
    fetch(`/api/precios/tabla`)
      .then(r => r.json())
      .then(d => { if (d.tabla) setTablaPrecios(d.tabla) })
      .catch(() => {})
  }, [])

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

    const items: PedidoFormData['items'] = PRODUCTOS_DOM
      .filter(id => productos[id] > 0)
      .map(id => {
        const info = PRODUCTO_INFO[id]
        return {
          producto: info.codigo as PedidoItemInput['producto'],
          cantidad: productos[id],
          precioManual: preciosManuales[info.codigo],
        }
      })

    const pedido: PedidoFormData = {
      clienteId,
      clienteNuevo: clienteNuevoData,
      canal: CANAL,
      items,
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
      <ClienteSection
        clienteSeleccionado={clienteSeleccionado}
        setClienteSeleccionado={setClienteSeleccionado}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        mostrarNuevo={mostrarNuevo}
        setMostrarNuevo={setMostrarNuevo}
        nuevoCliente={nuevoCliente}
        setNuevoCliente={setNuevoCliente}
        clientes={clientes}
        onClienteSelected={(cliente) => resolverPrecios(productos, CANAL, cliente.id)}
      />

      <ProductosSection
        productos={productos}
        preciosResueltos={preciosResueltos}
        preciosManuales={preciosManuales}
        setPreciosManuales={setPreciosManuales}
        preciosEditando={preciosEditando}
        setPreciosEditando={setPreciosEditando}
        tablaPrecios={tablaPrecios}
        precios={precios}
        onCantidadChange={handleCantidadChange}
        total={total}
        getPrecio={getPrecio}
        getEffectivePrice={getEffectivePrice}
        formatTier={formatTier}
        getActiveTier={getActiveTier}
        productosVisibles={PRODUCTOS_DOM}
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
        metodosUsados={metodosUsados}
        seleccionarChip={seleccionarChip}
        confirmarMonto={confirmarMonto}
        cancelarMonto={cancelarMonto}
        eliminarPago={eliminarPago}
        pagarCompleto={pagarCompleto}
      />

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

      <FormSubmit submitting={submitting} total={total} />
    </form>
  )
}
