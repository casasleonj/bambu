'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { getCapacidadInfo } from '@/lib/embarque-capacidad'
import type { Cliente, PagoItem, Embarque, EmbarqueAbierto, CuadrePedido, VentaLibre } from './types'
import { calcularMontoPagado, calcularTotalEntregado } from './types'
import { PedidoCuadre } from './pedido-cuadre'
import { VentaLibreRow } from './venta-libre-row'
import { ConfirmModal } from './confirm-modal'

export default function CerrarEmbarqueClient() {
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
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [embarqueRes, clientesRes, embarquesRes] = await Promise.all([
          fetch(`/api/embarques/${embarqueId}`, { credentials: 'include' }),
          fetch('/api/clientes?all=true', { credentials: 'include' }),
          fetch('/api/embarques', { credentials: 'include' }),
        ])
        const embarqueData = await embarqueRes.json()
        const clientesData = await clientesRes.json()
        const embarquesData = await embarquesRes.json()

        if (embarqueData.embarque) {
          const emb = embarqueData.embarque
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
          if (emb.trabajador) {
            emb.trabajador.comPacaAgua = Number(emb.trabajador.comPacaAgua || 0)
            emb.trabajador.comPacaHielo = Number(emb.trabajador.comPacaHielo || 0)
            emb.trabajador.comBotellon = Number(emb.trabajador.comBotellon || 0)
          }
          setEmbarque(emb)

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
              preciosReales: {
                pacaAgua: p.precioPacaAgua,
                pacaHielo: p.precioPacaHielo,
                botellonFab: p.precioBotellonFab,
                botellonDom: p.precioBotellonDom,
                bolsaAgua: p.precioBolsaAgua,
                bolsaHielo: p.precioBolsaHielo,
              },
              pagado: p.totalPagado >= p.total ? 'COMPLETO' : p.totalPagado > 0 ? 'PARCIAL' : 'NO_PAGADO',
              pagos: p.totalPagado > 0 ? [{ metodo: 'EFECTIVO', monto: p.totalPagado }] : [],
            }
          }
          setCuadres(initialCuadres)
        }

        setClientes(clientesData.clientes || [])

        const allEmbarques = embarquesData.embarques || []
        setEmbarquesAbiertos(
          allEmbarques
            .filter((e: EmbarqueAbierto & { estado?: string }) => e.id !== embarqueId && e.estado === 'ABIERTO')
            .slice(0, 10)
        )
      } catch {
        toast.error('Error cargando datos')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [embarqueId])

  function updateCuadre(pedidoId: string, updates: Partial<CuadrePedido>) {
    setCuadres((prev) => ({ ...prev, [pedidoId]: { ...prev[pedidoId], ...updates } }))
  }

  function updateProductoEntregado(pedidoId: string, field: keyof CuadrePedido['productosEntregados'], value: number) {
    setCuadres((prev) => ({
      ...prev,
      [pedidoId]: { ...prev[pedidoId], productosEntregados: { ...prev[pedidoId].productosEntregados, [field]: value } },
    }))
  }

  function updatePrecioReal(pedidoId: string, field: keyof CuadrePedido['preciosReales'], value: number) {
    setCuadres((prev) => ({
      ...prev,
      [pedidoId]: { ...prev[pedidoId], preciosReales: { ...prev[pedidoId].preciosReales, [field]: value } },
    }))
  }

  function agregarPagoPedido(pedidoId: string) {
    setCuadres((prev) => ({
      ...prev,
      [pedidoId]: { ...prev[pedidoId], pagos: [...(prev[pedidoId].pagos || []), { metodo: 'EFECTIVO', monto: 0 }] },
    }))
  }

  function eliminarPagoPedido(pedidoId: string, index: number) {
    setCuadres((prev) => ({
      ...prev,
      [pedidoId]: { ...prev[pedidoId], pagos: prev[pedidoId].pagos.filter((_, i) => i !== index) },
    }))
  }

  function updatePagoPedido(pedidoId: string, index: number, field: keyof PagoItem, value: string | number) {
    setCuadres((prev) => {
      const pagos = [...prev[pedidoId].pagos]
      pagos[index] = { ...pagos[index], [field]: value }
      return { ...prev, [pedidoId]: { ...prev[pedidoId], pagos } }
    })
  }

  function agregarVentaLibre() {
    setVentasLibres((prev) => [
      ...prev,
      { clienteId: '', clienteNombre: '', cPacaAgua: 0, cPacaHielo: 0, cBotellonFab: 0, cBotellonDom: 0, cBolsaAgua: 0, cBolsaHielo: 0, pagos: [{ metodo: 'EFECTIVO', monto: 0 }], obs: '' },
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
      updated[ventaIndex] = { ...updated[ventaIndex], pagos: [...updated[ventaIndex].pagos, { metodo: 'EFECTIVO', monto: 0 }] }
      return updated
    })
  }

  function eliminarPagoVentaLibre(ventaIndex: number, pagoIndex: number) {
    setVentasLibres((prev) => {
      const updated = [...prev]
      updated[ventaIndex] = { ...updated[ventaIndex], pagos: updated[ventaIndex].pagos.filter((_, i) => i !== pagoIndex) }
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
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Embarque cerrado correctamente')
        router.push('/embarques')
      } else {
        toast.error(data.error?.message || 'Error al cerrar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSubmitting(false)
      setShowConfirmModal(false)
    }
  }

  function openConfirmModal() {
    const noEntregados = Object.values(cuadres).filter((c) => c.entregado === 'NO_ENTREGADO').length
    const parciales = Object.values(cuadres).filter((c) => c.entregado === 'PARCIAL').length
    if (noEntregados > 0 || parciales > 0) {
      setShowConfirmModal(true)
    } else {
      handleCerrar()
    }
  }

  function removeVentaLibre(index: number) {
    setVentasLibres((prev) => prev.filter((_, idx) => idx !== index))
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

  const capacidad = embarque.capacidadInfo || getCapacidadInfo(
    embarque.totalPacas || 0,
    embarque.pesoKg || 0,
    embarque.capacidadKg || 500
  )

  const totalCargaInicial = (embarque.pacasAgua || 0) + (embarque.pacasHielo || 0)
  const totalAsignado = embarque.pedidos.reduce((sum, p) =>
    sum + p.cPacaAguaPed + p.cPacaHieloPed + p.cBotellonFabPed + p.cBotellonDomPed + p.cBolsaAguaPed + p.cBolsaHieloPed, 0)
  const totalLibre = totalCargaInicial - totalAsignado
  const capacidadKg = embarque.capacidadKg || 500
  const pesoKg = embarque.pesoKg || capacidad.pesoKg || 0

  let totalCobrado = 0
  let totalEntregado = 0
  let pedidosNoEntregados = 0
  let pedidosParciales = 0
  let totalAguaEnt = 0
  let totalHieloEnt = 0
  let totalBotFabEnt = 0
  let totalBotDomEnt = 0
  let totalBolAguaEnt = 0
  let totalBolHieloEnt = 0

  for (const pedido of embarque.pedidos) {
    const cuadre = cuadres[pedido.id]
    if (!cuadre) continue
    if (cuadre.entregado === 'NO_ENTREGADO') pedidosNoEntregados++
    if (cuadre.entregado === 'PARCIAL') pedidosParciales++
    totalCobrado += calcularMontoPagado(cuadre.pagos)
    totalEntregado += calcularTotalEntregado(cuadre)
    if (cuadre.entregado === 'NO_ENTREGADO') continue
    const p = cuadre.productosEntregados
    totalAguaEnt += p.cPacaAguaEnt
    totalHieloEnt += p.cPacaHieloEnt
    totalBotFabEnt += p.cBotellonFabEnt
    totalBotDomEnt += p.cBotellonDomEnt
    totalBolAguaEnt += p.cBolsaAguaEnt
    totalBolHieloEnt += p.cBolsaHieloEnt
  }

  for (const venta of ventasLibres) {
    if (!venta.clienteId) continue
    totalAguaEnt += venta.cPacaAgua
    totalHieloEnt += venta.cPacaHielo
    totalBotFabEnt += venta.cBotellonFab
    totalBotDomEnt += venta.cBotellonDom
    totalBolAguaEnt += venta.cBolsaAgua
    totalBolHieloEnt += venta.cBolsaHielo
  }

  const totalBotellones = totalBotFabEnt + totalBotDomEnt
  const totalBolsas = totalBolAguaEnt + totalBolHieloEnt

  const comAgua = totalAguaEnt * Number(embarque.trabajador.comRepartAgua || embarque.trabajador.comPacaAgua || 0)
  const comHielo = totalHieloEnt * Number(embarque.trabajador.comRepartHielo || embarque.trabajador.comPacaHielo || 0)
  const comBotellon = totalBotellones * Number(embarque.trabajador.comRepartBotellon || embarque.trabajador.comBotellon || 0)
  const totalComision = comAgua + comHielo + comBotellon

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
          <span className="text-gray-600 ml-2">({pesoKg.toFixed(1)}kg / {capacidadKg}kg)</span>
        </div>
      </div>

      {/* Load Info */}
      {totalCargaInicial > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Carga del Embarque</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-700">{totalCargaInicial}</p>
              <p className="text-xs text-blue-600">Carga inicial</p>
            </div>
            <div className="text-center p-3 bg-amber-50 rounded-lg">
              <p className="text-2xl font-bold text-amber-700">{totalAsignado}</p>
              <p className="text-xs text-amber-600">Asignado a pedidos</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-700">{totalLibre}</p>
              <p className="text-xs text-green-600">Libre para venta</p>
            </div>
          </div>
          {embarque.pacasAgua > 0 && embarque.pacasHielo > 0 && (
            <p className="text-xs text-gray-500 mt-2 text-center">
              Agua: {embarque.pacasAgua} | Hielo: {embarque.pacasHielo}
            </p>
          )}
        </div>
      )}

      {/* Pedidos */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Pedidos Asignados ({embarque.pedidos.length})</h2>
        {embarque.pedidos.map((pedido) => {
          const cuadre = cuadres[pedido.id]
          if (!cuadre) return null
          return (
            <PedidoCuadre
              key={pedido.id}
              pedido={pedido}
              cuadre={cuadre}
              embarquesAbiertos={embarquesAbiertos}
              onUpdateCuadre={updateCuadre}
              onUpdateProductoEntregado={updateProductoEntregado}
              onUpdatePrecioReal={updatePrecioReal}
              onAgregarPago={agregarPagoPedido}
              onEliminarPago={eliminarPagoPedido}
              onUpdatePago={updatePagoPedido}
            />
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
        {ventasLibres.map((venta, i) => (
          <VentaLibreRow
            key={i}
            venta={venta}
            index={i}
            clientes={clientes}
            onUpdate={updateVentaLibre}
            onAgregarPago={agregarPagoVentaLibre}
            onEliminarPago={eliminarPagoVentaLibre}
            onUpdatePago={updatePagoVentaLibre}
            onRemove={removeVentaLibre}
          />
        ))}
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
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalCobrado)}</p>
          </div>
          <div>
            <p className="text-gray-600">Total Entregado</p>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(totalEntregado)}</p>
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
        <div className="mt-3 pt-3 border-t border-blue-200 text-sm text-blue-800 space-y-1">
          <p className="font-medium text-blue-900">Productos entregados</p>
          <div className="flex flex-wrap gap-x-4 text-xs">
            {totalAguaEnt > 0 && <span>🚛 Agua: {totalAguaEnt}</span>}
            {totalHieloEnt > 0 && <span>🧊 Hielo: {totalHieloEnt}</span>}
            {totalBotellones > 0 && <span>🫗 Botellones: {totalBotellones}</span>}
            {totalBolsas > 0 && <span>💧 Bolsas: {totalBolsas}</span>}
          </div>
          {totalComision > 0 && (
            <p className="pt-1 font-semibold text-amber-700">
              Comisión estimada: {formatCurrency(totalComision)}
            </p>
          )}
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
          onClick={openConfirmModal}
          disabled={submitting}
          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
        >
          {submitting ? 'Cerrando...' : 'Cerrar Ruta y Generar Reporte'}
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <ConfirmModal
          cuadres={cuadres}
          submitting={submitting}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleCerrar}
        />
      )}
    </div>
  )
}
