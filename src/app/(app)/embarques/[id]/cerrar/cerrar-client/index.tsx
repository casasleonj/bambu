'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { getCapacidadInfo, calcularPesoDesdeCarga, type CargaSnapshot, emptyStock, type StockSnapshot } from '@/lib/embarque-capacidad'
import { useProductosDomicilio, getProductoEmoji } from '@/hooks/use-productos-domicilio'
import type { Cliente, PagoItem, Embarque, EmbarqueAbierto, CuadrePedido, VentaLibre, ProductoRetorno, GastoItem } from './types'
import { calcularMontoPagado, calcularTotalEntregado } from './types'
import { PedidoCuadre } from './pedido-cuadre'
import { VentaLibreRow } from './venta-libre-row'
import { ConfirmModal } from './confirm-modal'

const GASTO_CATEGORIAS = ['Gasolina', 'Alimentación', 'Peajes', 'Parqueadero', 'Mantenimiento', 'Otros']

export default function CerrarEmbarqueClient() {
  const router = useRouter()
  const params = useParams()
  const embarqueId = params.id as string

  const { productos: productosDomicilio } = useProductosDomicilio()
  const PRODUCTOS = productosDomicilio.map(p => ({
    key: p.codigo,
    label: p.nombre,
    emoji: getProductoEmoji(p.codigo),
  }))

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [embarque, setEmbarque] = useState<Embarque | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [embarquesAbiertos, setEmbarquesAbiertos] = useState<EmbarqueAbierto[]>([])
  const [cuadres, setCuadres] = useState<Record<string, CuadrePedido>>({})
  const [ventasLibres, setVentasLibres] = useState<VentaLibre[]>([])
  const [retornos, setRetornos] = useState<Record<string, ProductoRetorno>>({})
  const [gastos, setGastos] = useState<GastoItem[]>([])
  const [dineroEntregado, setDineroEntregado] = useState(0)
  const [justificacion, setJustificacion] = useState('')
  const [obsGeneral, setObsGeneral] = useState('')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [activeSection, setActiveSection] = useState(0)

  useEffect(() => {
    async function fetchData() {
      try {
        const [embarqueRes, clientesRes, embarquesRes, profileRes] = await Promise.all([
          fetch(`/api/embarques/${embarqueId}`, { credentials: 'include' }),
          fetch('/api/clientes?all=true', { credentials: 'include' }),
          fetch('/api/embarques', { credentials: 'include' }),
          fetch('/api/auth/profile', { credentials: 'include' }),
        ])
        const embarqueData = await embarqueRes.json()
        const clientesData = await clientesRes.json()
        const embarquesData = await embarquesRes.json()
        const profileData = await profileRes.json()
        setIsAdmin(profileData.user?.rol === 'ADMIN')

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
          if (emb.productos) {
            const ret: Record<string, ProductoRetorno> = {}
            for (const prod of emb.productos) {
              ret[prod.producto] = { devueltas: prod.devueltas || 0, cambios: prod.cambios || 0, rotas: prod.rotas || 0 }
            }
            setRetornos(ret)
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
              pagos: p.pagos && p.pagos.length > 0
                ? p.pagos.map((pago: { metodo: string; monto: unknown }) => ({ metodo: pago.metodo, monto: Number(pago.monto) }))
                : (p.totalPagado > 0 ? [{ metodo: 'EFECTIVO', monto: p.totalPagado }] : []),
            }
          }
          setCuadres(initialCuadres)
        }

        setClientes(clientesData.clientes || [])

        const allEmbarques = embarquesData.embarques || []
        setEmbarquesAbiertos(
          allEmbarques
            .filter((e: EmbarqueAbierto & { estado?: string }) => e.id !== embarqueId && (e.estado === 'ABIERTO' || e.estado === 'EN_RUTA'))
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

  function removeVentaLibre(index: number) {
    setVentasLibres((prev) => prev.filter((_, idx) => idx !== index))
  }

  function updateRetorno(producto: string, field: keyof ProductoRetorno, value: number) {
    setRetornos((prev) => ({
      ...prev,
      [producto]: { ...prev[producto], [field]: value },
    }))
  }

  function agregarGasto() {
    setGastos((prev) => [...prev, { categoria: 'Gasolina', monto: 0, nota: '' }])
  }

  function updateGasto(index: number, field: keyof GastoItem, value: unknown) {
    setGastos((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  function removeGasto(index: number) {
    setGastos((prev) => prev.filter((_, idx) => idx !== index))
  }

  // ─── Cálculos del preview ───
  const calculos = useMemo(() => {
    if (!embarque) return null

    const carga: StockSnapshot = emptyStock()
    for (const prod of (embarque.productos || [])) {
      const key = prod.producto as keyof StockSnapshot
      if (key in carga) carga[key] = prod.cargadas
    }
    if (!embarque.productos?.length) {
      carga.PACA_AGUA = embarque.pacasAgua || 0
      carga.PACA_HIELO = embarque.pacasHielo || 0
    }
    const totalCargado = Object.values(carga).reduce((s, v) => s + v, 0)
    const pesoKg = calcularPesoDesdeCarga(carga as CargaSnapshot)
    const capacidadKg = embarque.capacidadKg || 500

    const entregado: StockSnapshot = emptyStock()
    let totalFiado = 0
    let totalCobrado = 0
    let noEntregados = 0
    let parciales = 0

    for (const pedido of embarque.pedidos) {
      const cuadre = cuadres[pedido.id]
      if (!cuadre) continue
      if (cuadre.entregado === 'NO_ENTREGADO') { noEntregados++; continue }
      if (cuadre.entregado === 'PARCIAL') parciales++

      const p = cuadre.productosEntregados
      entregado.PACA_AGUA += p.cPacaAguaEnt
      entregado.PACA_HIELO += p.cPacaHieloEnt
      entregado.BOTELLON += p.cBotellonFabEnt + p.cBotellonDomEnt
      entregado.BOLSA_AGUA += p.cBolsaAguaEnt
      entregado.BOLSA_HIELO += p.cBolsaHieloEnt

      const totalReal = calcularTotalEntregado(cuadre)
      const pagado = calcularMontoPagado(cuadre.pagos)
      totalCobrado += pagado
      const saldo = totalReal - pagado
      if (saldo > 0) totalFiado += saldo
    }

    for (const v of ventasLibres) {
      if (!v.clienteId) continue
      entregado.PACA_AGUA += v.cPacaAgua
      entregado.PACA_HIELO += v.cPacaHielo
      entregado.BOTELLON += v.cBotellonFab + v.cBotellonDom
      entregado.BOLSA_AGUA += v.cBolsaAgua
      entregado.BOLSA_HIELO += v.cBolsaHielo
      const totalV = ventasLibreTotal(v)
      const pagadoV = v.pagos.reduce((s, p) => s + p.monto, 0)
      totalCobrado += pagadoV
      if (totalV > pagadoV) totalFiado += totalV - pagadoV
    }

    const devueltas: StockSnapshot = emptyStock()
    const cambios: StockSnapshot = emptyStock()
    const rotas: StockSnapshot = emptyStock()
    for (const [key, val] of Object.entries(retornos)) {
      const k = key as keyof StockSnapshot
      if (k in devueltas) {
        devueltas[k] = val.devueltas
        cambios[k] = val.cambios
        rotas[k] = val.rotas
      }
    }

    const totalDevueltas = Object.values(devueltas).reduce((s, v) => s + v, 0)
    const totalCambios = Object.values(cambios).reduce((s, v) => s + v, 0)
    const totalRotas = Object.values(rotas).reduce((s, v) => s + v, 0)

    const discrepancias: Record<string, number> = {}
    let totalDiscrepancia = 0
    for (const key of Object.keys(carga) as (keyof StockSnapshot)[]) {
      const disc = carga[key] - entregado[key] - devueltas[key] - rotas[key]
      discrepancias[key] = disc
      if (disc > 0) totalDiscrepancia += disc
    }

    const totalGastos = gastos.reduce((s, g) => s + g.monto, 0)
    const totalEfectivoRecibido = calcularEfectivoRecibido()
    const efectivoEsperado = totalCobrado - totalFiado - (totalCobrado - totalEfectivoRecibido)
    const debeEntregar = efectivoEsperado - totalGastos + (embarque.baseDinero || 0)
    const faltanteSobrante = dineroEntregado - debeEntregar

    const totalEntregadoUnidades = Object.values(entregado).reduce((s, v) => s + v, 0)

    const comAgua = entregado.PACA_AGUA * Number(embarque.trabajador.comRepartAgua || embarque.trabajador.comPacaAgua || 0)
    const comHielo = entregado.PACA_HIELO * Number(embarque.trabajador.comRepartHielo || embarque.trabajador.comPacaHielo || 0)
    const comBotellon = entregado.BOTELLON * Number(embarque.trabajador.comRepartBotellon || embarque.trabajador.comBotellon || 0)
    const totalComision = comAgua + comHielo + comBotellon

    const pagosPorMetodo: Record<string, number> = {}
    for (const cuadre of Object.values(cuadres)) {
      for (const pago of cuadre.pagos) {
        if (pago.monto > 0) pagosPorMetodo[pago.metodo] = (pagosPorMetodo[pago.metodo] || 0) + pago.monto
      }
    }
    for (const v of ventasLibres) {
      for (const pago of v.pagos) {
        if (pago.monto > 0 && v.clienteId) pagosPorMetodo[pago.metodo] = (pagosPorMetodo[pago.metodo] || 0) + pago.monto
      }
    }

    return {
      carga, totalCargado, pesoKg, capacidadKg,
      entregado, devueltas, cambios, rotas,
      totalDevueltas, totalCambios, totalRotas,
      discrepancias, totalDiscrepancia,
      totalCobrado, totalFiado, totalGastos,
      totalEfectivoRecibido, efectivoEsperado, debeEntregar, faltanteSobrante,
      totalEntregadoUnidades, totalComision,
      pagosPorMetodo,
      noEntregados, parciales,
    }
  }, [embarque, cuadres, ventasLibres, retornos, gastos, dineroEntregado])

  function ventasLibreTotal(v: VentaLibre): number {
    if (!embarque || embarque.pedidos.length === 0) return 0
    const avgPrices = {
      pacaAgua: embarque.pedidos.reduce((sum, p) => sum + Number(p.precioPacaAgua || 0), 0) / embarque.pedidos.length,
      pacaHielo: embarque.pedidos.reduce((sum, p) => sum + Number(p.precioPacaHielo || 0), 0) / embarque.pedidos.length,
      botellonFab: embarque.pedidos.reduce((sum, p) => sum + Number(p.precioBotellonFab || 0), 0) / embarque.pedidos.length,
      botellonDom: embarque.pedidos.reduce((sum, p) => sum + Number(p.precioBotellonDom || 0), 0) / embarque.pedidos.length,
      bolsaAgua: embarque.pedidos.reduce((sum, p) => sum + Number(p.precioBolsaAgua || 0), 0) / embarque.pedidos.length,
      bolsaHielo: embarque.pedidos.reduce((sum, p) => sum + Number(p.precioBolsaHielo || 0), 0) / embarque.pedidos.length,
    }
    return (
      v.cPacaAgua * avgPrices.pacaAgua +
      v.cPacaHielo * avgPrices.pacaHielo +
      v.cBotellonFab * avgPrices.botellonFab +
      v.cBotellonDom * avgPrices.botellonDom +
      v.cBolsaAgua * avgPrices.bolsaAgua +
      v.cBolsaHielo * avgPrices.bolsaHielo
    )
  }

  function calcularEfectivoRecibido(): number {
    let total = 0
    for (const cuadre of Object.values(cuadres)) {
      for (const pago of cuadre.pagos) {
        if (pago.metodo === 'EFECTIVO' && pago.monto > 0) total += pago.monto
      }
    }
    for (const v of ventasLibres) {
      for (const pago of v.pagos) {
        if (pago.metodo === 'EFECTIVO' && pago.monto > 0 && v.clienteId) total += pago.monto
      }
    }
    return total
  }

  async function handleCerrar() {
    if (!embarque || !calculos) return
    setSubmitting(true)
    try {
      const productosRetorno = Object.entries(retornos).map(([producto, val]) => ({
        producto,
        devueltas: val.devueltas,
        cambios: val.cambios,
        rotas: val.rotas,
      }))

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
        productos: productosRetorno,
        gastos: gastos.filter(g => g.monto > 0).map(g => ({
          categoria: g.categoria,
          monto: g.monto,
          nota: g.nota,
        })),
        dineroEntregado,
        justificacionDiscrepancia: justificacion || undefined,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!embarque || !calculos) {
    return <div className="text-center py-12 text-gray-500">Embarque no encontrado</div>
  }

  const capacidad = embarque.capacidadInfo || getCapacidadInfo(
    calculos.totalCargado,
    calculos.pesoKg,
    calculos.capacidadKg
  )

  const sections = [
    { label: 'Pedidos', count: embarque.pedidos.length },
    { label: 'Ventas Libres', count: ventasLibres.length },
    { label: 'Conciliación', count: null },
    { label: 'Gastos', count: gastos.length },
    { label: 'Preview', count: null },
  ]

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header sticky */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <button onClick={() => router.push('/embarques')} className="text-sm text-blue-600 hover:underline">← Embarques</button>
              <h1 className="text-xl font-bold text-gray-900">
                Cerrar Embarque #{embarque.numeroDia || embarque.numero}
              </h1>
              <p className="text-sm text-gray-500">
                {embarque.trabajador.nombre}
                {embarque.ruta && ` · ${embarque.ruta.nombre}`}
                {embarque.horaSalida && ` · Salió: ${new Date(embarque.horaSalida).toLocaleTimeString()}`}
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-lg border text-sm ${capacidad.color}`}>
              {capacidad.icon} {capacidad.label} · {calculos.pesoKg.toFixed(1)}kg / {calculos.capacidadKg}kg
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex gap-1 overflow-x-auto">
            {sections.map((sec, i) => (
              <button
                key={i}
                onClick={() => setActiveSection(i)}
                className={`px-4 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition ${
                  activeSection === i
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {sec.label}
                {sec.count !== null && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    activeSection === i ? 'bg-blue-500 text-blue-100' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {sec.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Section 0: Pedidos */}
        {activeSection === 0 && (
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
                  isAdmin={isAdmin}
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
        )}

        {/* Section 1: Ventas Libres */}
        {activeSection === 1 && (
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Ventas Libres ({ventasLibres.length})</h2>
              <button
                onClick={agregarVentaLibre}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
                + Agregar venta
              </button>
            </div>
            {ventasLibres.length === 0 && (
              <p className="text-gray-400 text-sm py-4 text-center">No hay ventas libres registradas</p>
            )}
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
        )}

        {/* Section 2: Conciliación de Productos */}
        {activeSection === 2 && (
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h2 className="text-lg font-semibold mb-4">Conciliación de Productos</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Producto</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Cargado</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Entregado</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-green-600">Devueltas</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-amber-600">Cambios</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-red-600">Filtradas</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {PRODUCTOS.map(({ key, label, emoji }) => {
                    const cargado = calculos.carga[key as keyof StockSnapshot] || 0
                    const entregado = calculos.entregado[key as keyof StockSnapshot] || 0
                    const ret = retornos[key] || { devueltas: 0, cambios: 0, rotas: 0 }
                    const disc = calculos.discrepancias[key] || 0
                    return (
                      <tr key={key} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium">{emoji} {label}</td>
                        <td className="px-3 py-2 text-center font-bold">{cargado}</td>
                        <td className="px-3 py-2 text-center">{entregado}</td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} value={ret.devueltas}
                            onChange={(e) => updateRetorno(key, 'devueltas', parseInt(e.target.value) || 0)}
                            className="w-16 text-center px-1 py-0.5 border rounded text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} value={ret.cambios}
                            onChange={(e) => updateRetorno(key, 'cambios', parseInt(e.target.value) || 0)}
                            className="w-16 text-center px-1 py-0.5 border rounded text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} value={ret.rotas}
                            onChange={(e) => updateRetorno(key, 'rotas', parseInt(e.target.value) || 0)}
                            className="w-16 text-center px-1 py-0.5 border rounded text-sm" />
                        </td>
                        <td className={`px-3 py-2 text-center font-bold ${disc > 0 ? 'text-red-600' : disc < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {disc > 0 ? `-${disc}` : disc < 0 ? `+${Math.abs(disc)}` : '0'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="bg-gray-50 font-bold">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-center">{calculos.totalCargado}</td>
                    <td className="px-3 py-2 text-center">{calculos.totalEntregadoUnidades}</td>
                    <td className="px-3 py-2 text-center text-green-600">{calculos.totalDevueltas}</td>
                    <td className="px-3 py-2 text-center text-amber-600">{calculos.totalCambios}</td>
                    <td className="px-3 py-2 text-center text-red-600">{calculos.totalRotas}</td>
                    <td className={`px-3 py-2 text-center ${calculos.totalDiscrepancia > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {calculos.totalDiscrepancia > 0 ? `-${calculos.totalDiscrepancia}` : '0 ✅'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {calculos.totalDiscrepancia > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 font-medium">⚠️ Hay {calculos.totalDiscrepancia} unidades sin conciliar</p>
                <p className="text-xs text-red-600 mt-1">Si no se justifica, se aplicará descuento al repartidor.</p>
                <textarea
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  placeholder="Justificar discrepancia..."
                  className="w-full mt-2 px-3 py-2 border rounded-lg text-sm"
                  rows={2}
                />
              </div>
            )}
            {calculos.totalDiscrepancia === 0 && (
              <p className="mt-3 text-sm text-green-600 font-medium">✅ Conciliación correcta — sin discrepancias</p>
            )}
          </div>
        )}

        {/* Section 3: Gastos */}
        {activeSection === 3 && (
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Gastos del Embarque ({gastos.length})</h2>
              <button
                onClick={agregarGasto}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
              >
                + Agregar gasto
              </button>
            </div>
            {gastos.length === 0 && (
              <p className="text-gray-400 text-sm py-4 text-center">No hay gastos registrados</p>
            )}
            {gastos.map((gasto, i) => (
              <div key={i} className="flex gap-3 items-start mb-3 p-3 bg-gray-50 rounded-lg">
                <select
                  value={gasto.categoria}
                  onChange={(e) => updateGasto(i, 'categoria', e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  {GASTO_CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="number" min={0}
                  value={gasto.monto || ''}
                  onChange={(e) => updateGasto(i, 'monto', parseFloat(e.target.value) || 0)}
                  className="w-32 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Monto"
                />
                <input
                  type="text"
                  value={gasto.nota}
                  onChange={(e) => updateGasto(i, 'nota', e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  placeholder="Nota (opcional)"
                />
                <button
                  onClick={() => removeGasto(i)}
                  className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
            {gastos.length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800">Total gastos: {formatCurrency(calculos.totalGastos)}</p>
              </div>
            )}
          </div>
        )}

        {/* Section 4: Preview */}
        {activeSection === 4 && calculos && (
          <div className="space-y-6">
            {/* Ingresos */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-lg font-semibold mb-3">💰 Ingresos</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-600">Total vendido</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(calculos.totalCobrado + calculos.totalFiado)}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-600">Recibido</p>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(calculos.totalCobrado)}</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg">
                  <p className="text-xs text-amber-600">Fiado pendiente</p>
                  <p className="text-xl font-bold text-amber-700">{formatCurrency(calculos.totalFiado)}</p>
                </div>
              </div>

              {Object.keys(calculos.pagosPorMetodo).length > 0 && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {Object.entries(calculos.pagosPorMetodo).map(([metodo, monto]) => (
                    <div key={metodo} className="flex justify-between p-2 bg-gray-50 rounded">
                      <span className="text-gray-600">{metodo}</span>
                      <span className="font-medium">{formatCurrency(monto)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cuadre de Caja */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-lg font-semibold mb-3">📊 Cuadre de Caja</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1">
                  <span className="text-gray-600">Total vendido (efectivo)</span>
                  <span className="font-medium">{formatCurrency(calculos.efectivoEsperado + calculos.totalGastos)}</span>
                </div>
                <div className="flex justify-between py-1 text-green-600">
                  <span>(-) Fiado</span>
                  <span className="font-medium">- {formatCurrency(calculos.totalFiado)}</span>
                </div>
                <div className="flex justify-between py-1 text-red-600">
                  <span>(-) Gastos del embarque</span>
                  <span className="font-medium">- {formatCurrency(calculos.totalGastos)}</span>
                </div>
                <div className="flex justify-between py-1 text-blue-600">
                  <span>(+) Base para cambio</span>
                  <span className="font-medium">+ {formatCurrency(embarque.baseDinero || 0)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-base">
                  <span>Debió entregar en efectivo</span>
                  <span>{formatCurrency(calculos.debeEntregar)}</span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <label className="text-sm font-medium text-gray-700 block mb-2">💵 Dinero que ENTREGÓ el repartidor</label>
                <input
                  type="number" min={0}
                  value={dineroEntregado || ''}
                  onChange={(e) => setDineroEntregado(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg text-lg font-bold text-center"
                  placeholder="$0"
                />
              </div>

              {dineroEntregado > 0 && (
                <div className={`mt-3 p-4 rounded-lg border-2 ${
                  calculos.faltanteSobrante < 0
                    ? 'bg-red-50 border-red-300'
                    : calculos.faltanteSobrante > 0
                    ? 'bg-green-50 border-green-300'
                    : 'bg-blue-50 border-blue-300'
                }`}>
                  <p className="text-lg font-bold text-center">
                    {calculos.faltanteSobrante < 0
                      ? `⚠️ FALTANTE: ${formatCurrency(calculos.faltanteSobrante)}`
                      : calculos.faltanteSobrante > 0
                      ? `✅ SOBRANTE: ${formatCurrency(calculos.faltanteSobrante)}`
                      : `✅ CUADRE PERFECTO`}
                  </p>
                  {calculos.faltanteSobrante < 0 && (
                    <p className="text-xs text-red-600 text-center mt-1">Se descontará al repartidor en nómina</p>
                  )}
                </div>
              )}
            </div>

            {/* Resumen Final */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold text-blue-900 mb-3">📋 Resumen Final</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-gray-600">Productos</p>
                  <p className="text-lg font-bold text-blue-700">{calculos.totalCargado} cargados</p>
                  <p className="text-xs text-gray-500">{calculos.totalEntregadoUnidades} entregados</p>
                </div>
                <div>
                  <p className="text-gray-600">Pedidos</p>
                  <p className="text-lg font-bold text-blue-700">{embarque.pedidos.length}</p>
                  <p className="text-xs text-gray-500">{calculos.noEntregados} no entregados, {calculos.parciales} parciales</p>
                </div>
                <div>
                  <p className="text-gray-600">Ventas libres</p>
                  <p className="text-lg font-bold text-blue-700">{ventasLibres.filter(v => v.clienteId).length}</p>
                </div>
                <div>
                  <p className="text-gray-600">Comisión est.</p>
                  <p className="text-lg font-bold text-amber-700">{formatCurrency(calculos.totalComision)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-blue-200 text-xs text-blue-800 flex flex-wrap gap-x-4">
                <span>↩️ Devueltas: {calculos.totalDevueltas}</span>
                <span>🔄 Cambios: {calculos.totalCambios}</span>
                <span>💔 Filtradas: {calculos.totalRotas}</span>
                {calculos.totalDiscrepancia > 0 && <span className="text-red-600 font-medium">⚠️ Discrepancia: {calculos.totalDiscrepancia}</span>}
              </div>
            </div>

            {/* Observaciones */}
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-lg font-semibold mb-2">Observaciones</h2>
              <textarea
                value={obsGeneral}
                onChange={(e) => setObsGeneral(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                rows={2}
                placeholder="Notas sobre la ruta..."
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pb-8 sticky bottom-0 bg-white border-t pt-4">
          <button
            onClick={() => router.push('/embarques')}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
          >
            {submitting ? 'Cerrando...' : 'Confirmar Cierre'}
          </button>
        </div>
      </div>

      {showConfirmModal && (
        <ConfirmModal
          cuadres={cuadres}
          submitting={submitting}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleCerrar}
          resumen={{
            totalCobrado: calculos?.totalCobrado || 0,
            totalFiado: calculos?.totalFiado || 0,
            totalGastos: calculos?.totalGastos || 0,
            noEntregados: calculos?.noEntregados || 0,
            parciales: calculos?.parciales || 0,
            faltante: calculos?.faltanteSobrante || 0,
            discrepancia: calculos?.totalDiscrepancia || 0,
          }}
        />
      )}
    </div>
  )
}
