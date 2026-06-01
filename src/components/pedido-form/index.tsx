'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PRODUCTO_INFO, type ProductoId } from '@/lib/prices'
import type { Cliente, PedidoFormData, PedidoFormProps, PedidoItemInput } from './types'
import { ClienteSection } from './cliente-section'
import { ProductosSection } from './productos-section'
import { PagoSection } from './pago-section'
import { FormSubmit } from './form-submit'
import { useResolverPrecios } from '@/hooks/use-resolver-precios'

export type { PedidoFormData, PedidoFormProps } from './types'

const CANAL = 'DOMICILIO' as const

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
  const [preciosManuales, setPreciosManuales] = useState<Record<string, number>>({})
  const [pagos, setPagos] = useState<{ metodo: string; monto: number }[]>([])
  const [modoPagoActivo, setModoPagoActivo] = useState<string | null>(null)
  const [montoInput, setMontoInput] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [preciosEditando, setPreciosEditando] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)

  const {
    tablaPrecios,
    preciosResueltos,
    productosVisibles,
    preciosStale,
    resolverPrecios,
    refreshPrecios,
    updateRefs,
    getPrecio,
    getEffectivePrice,
    calcularTotal,
    formatTier,
    getActiveTier,
  } = useResolverPrecios({ canal: CANAL, preciosBase: precios })

  // Sync refs for price refresh
  useEffect(() => {
    updateRefs(productos, clienteSeleccionado?.id)
  }, [productos, clienteSeleccionado?.id, updateRefs])

  const handleCantidadChange = (productoId: ProductoId, value: string) => {
    const cant = parseInt(value) || 0
    const newProds = { ...productos, [productoId]: cant }
    setProductos(newProds)
    resolverPrecios(newProds, clienteSeleccionado?.id)
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
    const total = calcularTotal(productos, preciosManuales)
    if (total <= 0) return
    setPagos([{ metodo: 'EFECTIVO', monto: total }])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const total = calcularTotal(productos, preciosManuales)
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

    const items: PedidoFormData['items'] = productosVisibles
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

  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
  const total = calcularTotal(productos, preciosManuales)

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
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
        onClienteSelected={() => resolverPrecios(productos, clienteSeleccionado?.id)}
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
        getEffectivePrice={(codigo: string) => getEffectivePrice(codigo, preciosManuales)}
        formatTier={formatTier}
        getActiveTier={getActiveTier}
        productosVisibles={productosVisibles}
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
