'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import { getCapacidadInfo } from '@/lib/embarque-capacidad'

interface Cliente {
  id: string
  nombre: string
  telefono: string
}

interface Pedido {
  id: string
  numero: number
  cliente: Cliente
  tipo: string
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  precioPacaAgua: number
  precioPacaHielo: number
  precioBotellonFab: number
  precioBotellonDom: number
  precioBolsaAgua: number
  precioBolsaHielo: number
  total: number
  totalPagado: number
  saldo: number
}

interface Embarque {
  id: string
  numero: number
  trabajador: { nombre: string }
  ruta?: { nombre: string } | null
  pedidos: Pedido[]
  totalPacas?: number
}

interface EmbarqueAbierto {
  id: string
  numero: number
  trabajador: { nombre: string }
}

interface PagoItem {
  metodo: string
  monto: number
}

interface CuadrePedido {
  pedidoId: string
  entregado: 'COMPLETO' | 'PARCIAL' | 'NO_ENTREGADO'
  productosEntregados: {
    cPacaAguaEnt: number
    cPacaHieloEnt: number
    cBotellonFabEnt: number
    cBotellonDomEnt: number
    cBolsaAguaEnt: number
    cBolsaHieloEnt: number
  }
  pagado: 'COMPLETO' | 'PARCIAL' | 'NO_PAGADO'
  pagos: PagoItem[]
  nuevoEmbarqueId?: string
}

interface VentaLibre {
  clienteId: string
  clienteNombre: string
  cPacaAgua: number
  cPacaHielo: number
  cBotellonFab: number
  cBotellonDom: number
  cBolsaAgua: number
  cBolsaHielo: number
  pagos: PagoItem[]
  obs: string
}

const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO']

function calcularMontoPagado(pagos: PagoItem[]): number {
  return pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
}

export default function CerrarEmbarquePage() {
  const router = useRouter()
  const params = useParams()
  const embarqueId = params.id as string

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [embarque, setEmbarque] = useState<Embarque | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [embarquesAbiertos, setEmbarquesAbiertos] = useState<EmbarqueAbierto[]>([])
  const [cuadres, setCuadres] = useState<Record<string, CuadrePedido>>({})
  const [ventasLibres, setVentasLibres] = useState<VentaLibre[]>([])
  const [devueltasAgua, setDevueltasAgua] = useState(0)
  const [devueltasHielo, setDevueltasHielo] = useState(0)
  const [rotasAgua, setRotasAgua] = useState(0)
  const [rotasHielo, setRotasHielo] = useState(0)
  const [obsGeneral, setObsGeneral] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        const [embarqueRes, clientesRes, embarquesRes] = await Promise.all([
          fetch(`/api/embarques/${embarqueId}`),
          fetch('/api/clientes?all=true'),
          fetch('/api/embarques'),
        ])
        const embarqueData = await embarqueRes.json()
        const clientesData = await clientesRes.json()
        const embarquesData = await embarquesRes.json()

        if (embarqueData.embarque) {
          const emb = embarqueData.embarque
          // Parse Decimal/Date fields
          emb.pedidos = emb.pedidos.map((p: Record<string, unknown>) => ({
            ...p,
            precioPacaAgua: Number(p.precioPacaAgua || 0),
            precioPacaHielo: Number(p.precioPacaHielo || 0),
            precioBotellonFab: Number(p.precioBotellonFab || 0),
            precioBotellonDom: Number(p.precioBotellonDom || 0),
            precioBolsaAgua: Number(p.precioBolsaAgua || 0),
            precioBolsaHielo: Number(p.precioBolsaHielo || 0),
            total: Number(p.total || 0),
            totalPagado: Number(p.totalPagado || 0),
            saldo: Number(p.saldo || 0),
          }))
          setEmbarque(emb)

          // Initialize cuadres with defaults
          const initialCuadres: Record<string, CuadrePedido> = {}
          for (const p of emb.pedidos) {
            initialCuadres[p.id] = {
              pedidoId: p.id,
              entregado: 'COMPLETO',
              productosEntregados: {
                cPacaAguaEnt: p.cPacaAguaPed,
                cPacaHieloEnt: p.cPacaHieloPed,
                cBotellonFabEnt: p.cBotellonFabPed,
                cBotellonDomEnt: p.cBotellonDomPed,
                cBolsaAguaEnt: p.cBolsaAguaPed,
                cBolsaHieloEnt: p.cBolsaHieloPed,
              },
              pagado: p.totalPagado >= p.total ? 'COMPLETO' : p.totalPagado > 0 ? 'PARCIAL' : 'NO_PAGADO',
              pagos: p.totalPagado > 0 ? [{ metodo: 'EFECTIVO', monto: p.totalPagado }] : [],
            }
          }
          setCuadres(initialCuadres)
        }

        setClientes(clientesData.clientes || [])
        
        // Filter out current embarque from open embarques
        const allEmbarques = embarquesData.embarques || []
        setEmbarquesAbiertos(
          allEmbarques
            .filter((e: EmbarqueAbierto) => e.id !== embarqueId)
            .slice(0, 10)
        )
      } catch (error) {
        console.error('Error:', error)
        toast.error('Error cargando datos')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [embarqueId])

  function updateCuadre(pedidoId: string, updates: Partial<CuadrePedido>) {
    setCuadres((prev) => ({
      ...prev,
      [pedidoId]: { ...prev[pedidoId], ...updates },
    }))
  }

  function updateProductoEntregado(
    pedidoId: string,
    field: keyof CuadrePedido['productosEntregados'],
    value: number
  ) {
    setCuadres((prev) => ({
      ...prev,
      [pedidoId]: {
        ...prev[pedidoId],
        productosEntregados: {
          ...prev[pedidoId].productosEntregados,
          [field]: value,
        },
      },
    }))
  }

  function agregarPagoPedido(pedidoId: string) {
    setCuadres((prev) => ({
      ...prev,
      [pedidoId]: {
        ...prev[pedidoId],
        pagos: [...(prev[pedidoId].pagos || []), { metodo: 'EFECTIVO', monto: 0 }],
      },
    }))
  }

  function eliminarPagoPedido(pedidoId: string, index: number) {
    setCuadres((prev) => ({
      ...prev,
      [pedidoId]: {
        ...prev[pedidoId],
        pagos: prev[pedidoId].pagos.filter((_, i) => i !== index),
      },
    }))
  }

  function updatePagoPedido(pedidoId: string, index: number, field: keyof PagoItem, value: string | number) {
    setCuadres((prev) => {
      const pagos = [...prev[pedidoId].pagos]
      pagos[index] = { ...pagos[index], [field]: value }
      return { ...prev, [pedidoId]: { ...prev[pedidoId], pagos } }
    })
  }

  function calcularTotalEntregado(pedido: Pedido, cuadre: CuadrePedido): number {
    const prod = cuadre.productosEntregados
    return (
      prod.cPacaAguaEnt * pedido.precioPacaAgua +
      prod.cPacaHieloEnt * pedido.precioPacaHielo +
      prod.cBotellonFabEnt * pedido.precioBotellonFab +
      prod.cBotellonDomEnt * pedido.precioBotellonDom +
      prod.cBolsaAguaEnt * pedido.precioBolsaAgua +
      prod.cBolsaHieloEnt * pedido.precioBolsaHielo
    )
  }

  function agregarVentaLibre() {
    setVentasLibres((prev) => [
      ...prev,
      {
        clienteId: '',
        clienteNombre: '',
        cPacaAgua: 0,
        cPacaHielo: 0,
        cBotellonFab: 0,
        cBotellonDom: 0,
        cBolsaAgua: 0,
        cBolsaHielo: 0,
        pagos: [{ metodo: 'EFECTIVO', monto: 0 }],
        obs: '',
      },
    ])
  }

  function updateVentaLibre(index: number, field: keyof VentaLibre, value: unknown) {
    setVentasLibres((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  function agregarPagoVentaLibre(ventaIndex: number) {
    setVentasLibres((prev) => {
      const updated = [...prev]
      updated[ventaIndex] = {
        ...updated[ventaIndex],
        pagos: [...updated[ventaIndex].pagos, { metodo: 'EFECTIVO', monto: 0 }],
      }
      return updated
    })
  }

  function eliminarPagoVentaLibre(ventaIndex: number, pagoIndex: number) {
    setVentasLibres((prev) => {
      const updated = [...prev]
      updated[ventaIndex] = {
        ...updated[ventaIndex],
        pagos: updated[ventaIndex].pagos.filter((_, i) => i !== pagoIndex),
      }
      return updated
    })
  }

  function updatePagoVentaLibre(ventaIndex: number, pagoIndex: number, field: keyof PagoItem, value: string | number) {
    setVentasLibres((prev) => {
      const updated = [...prev]
      const pagos = [...updated[ventaIndex].pagos]
      pagos[pagoIndex] = { ...pagos[pagoIndex], [field]: value }
      updated[ventaIndex] = { ...updated[ventaIndex], pagos }
      return updated
    })
  }

  async function handleCerrar() {
    if (!embarque) return
    setSubmitting(true)

    try {
      const payload = {
        pedidos: Object.values(cuadres).map((c) => ({
          ...c,
          pagos: c.pagos.filter((p) => p.monto > 0),
        })),
        ventasLibres: ventasLibres
          .filter((v) => v.clienteId)
          .map((v) => ({
            clienteId: v.clienteId,
            cPacaAgua: v.cPacaAgua,
            cPacaHielo: v.cPacaHielo,
            cBotellonFab: v.cBotellonFab,
            cBotellonDom: v.cBotellonDom,
            cBolsaAgua: v.cBolsaAgua,
            cBolsaHielo: v.cBolsaHielo,
            pagos: v.pagos.filter((p) => p.monto > 0),
            obs: v.obs,
          })),
        devueltasAgua,
        devueltasHielo,
        rotasAgua,
        rotasHielo,
        obs: obsGeneral,
      }

      const res = await fetch(`/api/embarques/${embarqueId}/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Embarque cerrado correctamente')
        router.push('/embarques')
      } else {
        toast.error(data.error || 'Error al cerrar')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!embarque) {
    return <div className="text-center py-12 text-gray-500">Embarque no encontrado</div>
  }

  const capacidad = getCapacidadInfo(embarque.totalPacas || 0)

  // Calculate summary
  let totalCobrado = 0
  let totalEntregado = 0
  let pedidosNoEntregados = 0
  let pedidosParciales = 0

  for (const pedido of embarque.pedidos) {
    const cuadre = cuadres[pedido.id]
    if (!cuadre) continue
    if (cuadre.entregado === 'NO_ENTREGADO') pedidosNoEntregados++
    if (cuadre.entregado === 'PARCIAL') pedidosParciales++
    const montoPagado = calcularMontoPagado(cuadre.pagos)
    totalCobrado += montoPagado
    totalEntregado += calcularTotalEntregado(pedido, cuadre)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Cerrar Ruta #{embarque.numero}
          </h1>
          <p className="text-gray-600">
            {embarque.trabajador.nombre}
            {embarque.ruta && ` - ${embarque.ruta.nombre}`}
          </p>
        </div>
        <div className={`px-4 py-2 rounded-lg border ${capacidad.color}`}>
          <span className="text-lg mr-2">{capacidad.icon}</span>
          <span className="font-medium">{capacidad.label}</span>
          <span className="text-gray-600 ml-2">({capacidad.total} pacas)</span>
        </div>
      </div>

      {/* Pedidos */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Pedidos Asignados ({embarque.pedidos.length})</h2>
        {embarque.pedidos.map((pedido) => {
          const cuadre = cuadres[pedido.id]
          if (!cuadre) return null

          const totalReal = calcularTotalEntregado(pedido, cuadre)
          const montoPagado = calcularMontoPagado(cuadre.pagos)

          return (
            <div key={pedido.id} className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">#{pedido.numero}</span>
                    <span>{pedido.cliente.nombre}</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Pedido: {pedido.cPacaAguaPed > 0 && `${pedido.cPacaAguaPed} agua `}
                    {pedido.cPacaHieloPed > 0 && `${pedido.cPacaHieloPed} hielo `}
                    {pedido.cBotellonFabPed > 0 && `${pedido.cBotellonFabPed} bot.fab `}
                    {pedido.cBotellonDomPed > 0 && `${pedido.cBotellonDomPed} bot.dom `}
                    {pedido.cBolsaAguaPed > 0 && `${pedido.cBolsaAguaPed} bol.agua `}
                    {pedido.cBolsaHieloPed > 0 && `${pedido.cBolsaHieloPed} bol.hielo `}
                    = ${pedido.total.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Entrega */}
              <div className="mb-3">
                <label className="text-sm font-medium text-gray-700 mb-1 block">Entrega</label>
                <div className="flex gap-2">
                  {(['COMPLETO', 'PARCIAL', 'NO_ENTREGADO'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        updateCuadre(pedido.id, { entregado: opt })
                        if (opt === 'COMPLETO') {
                          updateCuadre(pedido.id, {
                            productosEntregados: {
                              cPacaAguaEnt: pedido.cPacaAguaPed,
                              cPacaHieloEnt: pedido.cPacaHieloPed,
                              cBotellonFabEnt: pedido.cBotellonFabPed,
                              cBotellonDomEnt: pedido.cBotellonDomPed,
                              cBolsaAguaEnt: pedido.cBolsaAguaPed,
                              cBolsaHieloEnt: pedido.cBolsaHieloPed,
                            },
                          })
                        }
                        if (opt === 'NO_ENTREGADO') {
                          updateCuadre(pedido.id, {
                            productosEntregados: {
                              cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0,
                              cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
                            },
                          })
                        }
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        cuadre.entregado === opt
                          ? opt === 'COMPLETO' ? 'bg-green-600 text-white'
                            : opt === 'PARCIAL' ? 'bg-yellow-500 text-white'
                            : 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {opt === 'COMPLETO' ? '✅ Completo' : opt === 'PARCIAL' ? '⚠️ Parcial' : '❌ No entregado'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reasignar si no entregado */}
              {cuadre.entregado === 'NO_ENTREGADO' && embarquesAbiertos.length > 0 && (
                <div className="mb-3">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Reasignar a otro embarque</label>
                  <select
                    value={cuadre.nuevoEmbarqueId || ''}
                    onChange={(e) => updateCuadre(pedido.id, { nuevoEmbarqueId: e.target.value || undefined })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Sin reasignar (queda pendiente)</option>
                    {embarquesAbiertos.map((e) => (
                      <option key={e.id} value={e.id}>
                        #{e.numero} - {e.trabajador.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Productos entregados (solo si parcial) */}
              {cuadre.entregado === 'PARCIAL' && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {pedido.cPacaAguaPed > 0 && (
                    <div>
                      <label className="text-xs text-gray-500">Paca Agua</label>
                      <input type="number" min={0} max={pedido.cPacaAguaPed}
                        value={cuadre.productosEntregados.cPacaAguaEnt}
                        onChange={(e) => updateProductoEntregado(pedido.id, 'cPacaAguaEnt', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                      <span className="text-xs text-gray-400">/ {pedido.cPacaAguaPed}</span>
                    </div>
                  )}
                  {pedido.cPacaHieloPed > 0 && (
                    <div>
                      <label className="text-xs text-gray-500">Paca Hielo</label>
                      <input type="number" min={0} max={pedido.cPacaHieloPed}
                        value={cuadre.productosEntregados.cPacaHieloEnt}
                        onChange={(e) => updateProductoEntregado(pedido.id, 'cPacaHieloEnt', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                      <span className="text-xs text-gray-400">/ {pedido.cPacaHieloPed}</span>
                    </div>
                  )}
                  {pedido.cBotellonFabPed > 0 && (
                    <div>
                      <label className="text-xs text-gray-500">Bot. Fab</label>
                      <input type="number" min={0} max={pedido.cBotellonFabPed}
                        value={cuadre.productosEntregados.cBotellonFabEnt}
                        onChange={(e) => updateProductoEntregado(pedido.id, 'cBotellonFabEnt', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                      <span className="text-xs text-gray-400">/ {pedido.cBotellonFabPed}</span>
                    </div>
                  )}
                  {pedido.cBotellonDomPed > 0 && (
                    <div>
                      <label className="text-xs text-gray-500">Bot. Dom</label>
                      <input type="number" min={0} max={pedido.cBotellonDomPed}
                        value={cuadre.productosEntregados.cBotellonDomEnt}
                        onChange={(e) => updateProductoEntregado(pedido.id, 'cBotellonDomEnt', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                      <span className="text-xs text-gray-400">/ {pedido.cBotellonDomPed}</span>
                    </div>
                  )}
                  {pedido.cBolsaAguaPed > 0 && (
                    <div>
                      <label className="text-xs text-gray-500">Bolsa Agua</label>
                      <input type="number" min={0} max={pedido.cBolsaAguaPed}
                        value={cuadre.productosEntregados.cBolsaAguaEnt}
                        onChange={(e) => updateProductoEntregado(pedido.id, 'cBolsaAguaEnt', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                      <span className="text-xs text-gray-400">/ {pedido.cBolsaAguaPed}</span>
                    </div>
                  )}
                  {pedido.cBolsaHieloPed > 0 && (
                    <div>
                      <label className="text-xs text-gray-500">Bolsa Hielo</label>
                      <input type="number" min={0} max={pedido.cBolsaHieloPed}
                        value={cuadre.productosEntregados.cBolsaHieloEnt}
                        onChange={(e) => updateProductoEntregado(pedido.id, 'cBolsaHieloEnt', parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1 border rounded text-sm" />
                      <span className="text-xs text-gray-400">/ {pedido.cBolsaHieloPed}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Pago - Multi metodo */}
              {cuadre.entregado !== 'NO_ENTREGADO' && (
                <div className="mb-3">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Pago</label>
                  <div className="space-y-2">
                    {cuadre.pagos.map((pago, idx) => (
                      <div key={idx} className="flex gap-2">
                        <select
                          value={pago.metodo}
                          onChange={(e) => updatePagoPedido(pedido.id, idx, 'metodo', e.target.value)}
                          className="px-3 py-2 border rounded-lg text-sm"
                        >
                          {METODOS_PAGO.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={pago.monto}
                          onChange={(e) => updatePagoPedido(pedido.id, idx, 'monto', parseFloat(e.target.value) || 0)}
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          placeholder="Monto"
                        />
                        <button
                          onClick={() => eliminarPagoPedido(pedido.id, idx)}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => agregarPagoPedido(pedido.id)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Agregar pago
                    </button>
                  </div>
                  <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    Total entregado: ${totalReal.toLocaleString()} | 
                    Cobrado: ${montoPagado.toLocaleString()} | 
                    Saldo: ${(totalReal - montoPagado).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Ventas Libres */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Ventas Libres ({ventasLibres.length})</h2>
          <button
            onClick={agregarVentaLibre}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
          >
            + Agregar venta
          </button>
        </div>
        {ventasLibres.map((venta, i) => {
          const totalPagado = calcularMontoPagado(venta.pagos)
          return (
            <div key={i} className="border rounded-lg p-3 mb-2 space-y-2">
              <div className="flex gap-2">
                <select
                  value={venta.clienteId}
                  onChange={(e) => {
                    const cliente = clientes.find((c) => c.id === e.target.value)
                    updateVentaLibre(i, 'clienteId', e.target.value)
                    updateVentaLibre(i, 'clienteNombre', cliente?.nombre || '')
                  }}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
                <button
                  onClick={() => setVentasLibres((prev) => prev.filter((_, idx) => idx !== i))}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                >
                  Eliminar
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'cPacaAgua', label: 'Paca Agua' },
                  { key: 'cPacaHielo', label: 'Paca Hielo' },
                  { key: 'cBotellonFab', label: 'Bot. Fab' },
                  { key: 'cBotellonDom', label: 'Bot. Dom' },
                  { key: 'cBolsaAgua', label: 'Bolsa Agua' },
                  { key: 'cBolsaHielo', label: 'Bolsa Hielo' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500">{label}</label>
                    <input
                      type="number"
                      min={0}
                      value={(venta as unknown as Record<string, number>)[key]}
                      onChange={(e) => updateVentaLibre(i, key as keyof VentaLibre, parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                ))}
              </div>
              {/* Pagos multi metodo */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Pagos</label>
                {venta.pagos.map((pago, pIdx) => (
                  <div key={pIdx} className="flex gap-2">
                    <select
                      value={pago.metodo}
                      onChange={(e) => updatePagoVentaLibre(i, pIdx, 'metodo', e.target.value)}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      {METODOS_PAGO.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={pago.monto}
                      onChange={(e) => updatePagoVentaLibre(i, pIdx, 'monto', parseFloat(e.target.value) || 0)}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                      placeholder="Monto"
                    />
                    <button
                      onClick={() => eliminarPagoVentaLibre(i, pIdx)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => agregarPagoVentaLibre(i)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Agregar pago
                </button>
              </div>
              <div className="text-sm text-gray-600">
                Total pagado: ${totalPagado.toLocaleString()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Retornos */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h2 className="text-lg font-semibold mb-3">Pacas que Retornan</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Devueltas (en buen estado)</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500">Pacas Agua</label>
                <input type="number" min={0} value={devueltasAgua}
                  onChange={(e) => setDevueltasAgua(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Pacas Hielo</label>
                <input type="number" min={0} value={devueltasHielo}
                  onChange={(e) => setDevueltasHielo(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Filtradas/Dañadas</h3>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500">Pacas Agua</label>
                <input type="number" min={0} value={rotasAgua}
                  onChange={(e) => setRotasAgua(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Pacas Hielo</label>
                <input type="number" min={0} value={rotasHielo}
                  onChange={(e) => setRotasHielo(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Observaciones */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <h2 className="text-lg font-semibold mb-2">Observaciones</h2>
        <textarea
          value={obsGeneral}
          onChange={(e) => setObsGeneral(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
          rows={3}
          placeholder="Notas sobre la ruta..."
        />
      </div>

      {/* Resumen */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">Resumen del Cuadre</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-600">Total Cobrado</p>
            <p className="text-xl font-bold text-green-600">${totalCobrado.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-600">Total Entregado</p>
            <p className="text-xl font-bold text-blue-600">${totalEntregado.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-600">No Entregados</p>
            <p className="text-xl font-bold text-red-600">{pedidosNoEntregados}</p>
          </div>
          <div>
            <p className="text-gray-600">Parciales</p>
            <p className="text-xl font-bold text-yellow-600">{pedidosParciales}</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-blue-200 text-sm text-blue-800">
          <p>Devueltas: {devueltasAgua + devueltasHielo} pacas | Filtradas: {rotasAgua + rotasHielo} pacas</p>
          <p>Ventas libres: {ventasLibres.filter((v) => v.clienteId).length}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pb-8">
        <button
          onClick={() => router.push('/embarques')}
          className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
        >
          Cancelar
        </button>
        <button
          onClick={handleCerrar}
          disabled={submitting}
          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
        >
          {submitting ? 'Cerrando...' : 'Cerrar Ruta y Generar Reporte'}
        </button>
      </div>
    </div>
  )
}
