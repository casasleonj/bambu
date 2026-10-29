'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import { getTodayString } from '@/lib/dates'
import type { DashboardData } from './types'
import {
  CobrosDashboard,
  pendienteMedio,
  IconoEfectivo,
} from './cobros-dashboard'
import { ShoppingBag, ClipboardList, Receipt } from 'lucide-react'
import { MoneyDisplay } from '@/components/money-display'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { PRODUCT_LABELS } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'

const PRODUCTO_COLOR: Record<ProductCode, { bg: string; text: string }> = {
  PACA_AGUA: { bg: 'bg-blue-50', text: 'text-blue-600' },
  BOLSA_AGUA: { bg: 'bg-blue-50', text: 'text-blue-600' },
  PACA_HIELO: { bg: 'bg-cyan-50', text: 'text-cyan-600' },
  BOLSA_HIELO: { bg: 'bg-cyan-50', text: 'text-cyan-600' },
  BOTELLON: { bg: 'bg-amber-50', text: 'text-amber-600' },
}

function IconDisputa() {
  return (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2M6 7l-3-1m0 0l3-1m-3 1l6 2m0 0l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0 0l-3 1m3-1l3 9a5.002 5.002 0 006.001 0M12 7l3 1" /></svg>
  )
}
function IconBloqueado() {
  return (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
  )
}
function IconConflicto() {
  return (
    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
  )
}
function IconPromesa() {
  return (
    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )
}
function IconVerificar() {
  return (
    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )
}
function IconSinAsignar() {
  return (
    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
  )
}
function IconEnRiesgo() {
  return (
    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
  )
}
function IconCaso() {
  return (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
  )
}
function IconCritico() {
  return (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
  )
}
function IconEspera() {
  return (
    <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )
}

export function DashboardClient({
  data: initialData,
  userRole,
}: {
  data: DashboardData | null
  userRole?: string | null
}) {
  const [lecturaLocal, setData] = useState<DashboardData | null>(null)
  // Una nueva respuesta SSR también puede traer una base más reciente.
  const data = !lecturaLocal
    ? initialData
    : initialData &&
        Date.parse(initialData.consultadoAt ?? '') >
          Date.parse(lecturaLocal.consultadoAt ?? '')
      ? initialData
      : lecturaLocal
  const temporizadorBase = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vivo = useRef(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [detalleCobros, setDetalleCobros] = useState<string | null>(null)
  const solicitud = useRef<{ seq: number; controller: AbortController | null }>(
    { seq: 0, controller: null },
  )
  useEffect(() => {
    vivo.current = true
    const actualizarConexion = () => setOffline(!navigator.onLine)
    actualizarConexion()
    window.addEventListener('online', actualizarConexion)
    window.addEventListener('offline', actualizarConexion)
    const ref = solicitud.current
    return () => {
      window.removeEventListener('online', actualizarConexion)
      window.removeEventListener('offline', actualizarConexion)
      vivo.current = false
      ref.seq++
      if (temporizadorBase.current) clearTimeout(temporizadorBase.current)
      ref.controller?.abort()
    }
  }, [])
  const actualizar = useCallback(async () => {
    if (!navigator.onLine) {
      setOffline(true)
      return
    }
    solicitud.current.controller?.abort()
    const controller = new AbortController(),
      seq = ++solicitud.current.seq
    solicitud.current.controller = controller
    setRefreshing(true)
    setRefreshError(null)
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch('/api/dashboard', {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('No se pudo actualizar')
      const resultado = await res.json()
      if (
        !resultado.success ||
        !resultado.dashboard?.consultadoAt ||
        !Number.isFinite(Date.parse(resultado.dashboard.consultadoAt)) ||
        !Array.isArray(resultado.dashboard?.cobros?.medios) ||
        !Array.isArray(resultado.dashboard?.cobros?.movimientos) ||
        !Array.isArray(resultado.dashboard?.cobros?.porConciliar) ||
        !Array.isArray(resultado.dashboard?.ventasPorPrecio) ||
        !Array.isArray(resultado.dashboard?.franjas) ||
        !resultado.dashboard?.alertasRiesgo ||
        !resultado.dashboard?.casosActivos ||
        typeof resultado.dashboard?.ventas !== 'number' ||
        typeof resultado.dashboard?.baseDia !== 'number' ||
        typeof resultado.dashboard?.totalGastos !== 'number'
      )
        throw new Error('Lectura incompleta')
      if (seq === solicitud.current.seq) {
        setData(resultado.dashboard)
        setDetalleCobros(null)
      }
    } catch {
      if (seq === solicitud.current.seq)
        setRefreshError(
          'No se pudo actualizar. Conservamos la última consulta disponible; no significa que las ventas o los cobros sean cero.',
        )
    } finally {
      clearTimeout(timer)
      if (seq === solicitud.current.seq) setRefreshing(false)
    }
  }, [])
  const programarActualizacionBase = useCallback(() => {
    if (!vivo.current) return
    if (temporizadorBase.current) clearTimeout(temporizadorBase.current)
    temporizadorBase.current = setTimeout(() => {
      if (vivo.current) void actualizar()
    }, 300)
  }, [actualizar])
  useRealtimeListener(['config.updated'], programarActualizacionBase, {
    debounceMs: 0,
  })
  useEffect(() => {
    const cambio = (event: StorageEvent) => {
      if (event.key === `baseDia_${getTodayString()}`)
        programarActualizacionBase()
    }
    window.addEventListener('storage', cambio)
    return () => window.removeEventListener('storage', cambio)
  }, [programarActualizacionBase])
  const botonActualizar = (
    <button
      onClick={actualizar}
      disabled={refreshing || offline}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-white px-3 text-xs font-medium text-gray-700 disabled:opacity-60"
      aria-label="Actualizar dashboard"
    >
      {refreshing ? 'Consultando…' : '↻ Actualizar'}
      {data?.consultadoAt && (
        <time dateTime={data.consultadoAt}>
          {' '}
          · Consulta{' '}
          {new Date(data.consultadoAt).toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </time>
      )}
    </button>
  )
  if (!data)
    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          {botonActualizar}
        </header>
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          <h2 className="font-semibold">
            {offline
              ? 'Sin conexión'
              : refreshing
                ? 'Consultando información'
                : 'No hay una lectura disponible'}
          </h2>
          <p className="mt-2 text-sm">
            {refreshError ??
              'Las cifras pendientes de consulta no equivalen a cero. Reintenta cuando tengas conexión.'}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            'Pedidos del Día',
            'Ventas del Día',
            'Efectivo Cobrado',
            'Gastos del Día',
          ].map((t) => (
            <div key={t} className="rounded-xl border bg-white p-5">
              <h2 className="text-sm text-gray-600">{t}</h2>
              <p className="mt-3 text-3xl text-gray-400">—</p>
              <p className="text-xs text-gray-500">Por consultar</p>
            </div>
          ))}
        </div>
      </div>
    )
  const baseDia = data.baseDia
  const cobros = data.cobros
  const efectivo = cobros?.medios.find((m) => m.metodo === 'EFECTIVO')
  const efectivoPendiente = !cobros || pendienteMedio(cobros, 'EFECTIVO')
  const importeEfectivo = efectivo?.neto ?? 0
  const {
    pedidosHoy,
    ventas,
    fiadosTotal,
    clientesConFiado,
    pedidosPendientes,
    pedidosEntregados,
    totalGastos,
    ventasTrend,
    pedidosTrend,
    franjas,
    maxFranja,
    ventasPorPrecio,
    stockAgua,
    stockHielo,
    // stockBotellon eliminado — botellones son passthrough (sin ciclo de stock).
    embarquesAbiertos,
    stockAlertas,
    fechaHoy,
    alertasRiesgo,
    casosActivos,
    prodPiezasHoy,
    prodPerdidasHoy,
    prodEficienciaHoy,
    prodPiezasTrend,
    prodEficienciaTrend,
    prodAguaHoy,
    prodHieloHoy,
  } = data

  const fiadosHoy = data.fiadosHoy

  const totalAlertasRiesgo =
    alertasRiesgo.disputasAbiertas +
    alertasRiesgo.clientesBloqueados +
    alertasRiesgo.clientesConflictivos +
    alertasRiesgo.promesasProximasVencer +
    alertasRiesgo.clientesNoVerificados +
    alertasRiesgo.pedidosAtrasadosSinAsignar +
    alertasRiesgo.pedidosHoyEnRiesgo

  const trendArrow = (val: number) => (val > 0 ? '↑' : val < 0 ? '↓' : '→')
  const trendClass = (val: number) =>
    val > 0 ? 'text-green-600' : val < 0 ? 'text-red-600' : 'text-gray-400'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-500 capitalize">{fechaHoy}</p>
        </div>
        {botonActualizar}
      </div>

      {offline && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          Sin conexión · Conservamos la consulta indicada arriba. Pueden faltar
          cobros recientes.
        </div>
      )}
      {refreshError && !offline && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {refreshError}
        </div>
      )}
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
          <p className="flex items-center justify-between gap-2 text-sm text-gray-500">
            Pedidos del Día
            <ClipboardList
              aria-hidden="true"
              className="h-6 w-6 text-blue-600"
            />
          </p>
          <p className="text-3xl font-bold text-gray-800">{pedidosHoy}</p>
          <p className="text-xs text-gray-400 mt-1">
            {pedidosPendientes} pendientes · {pedidosEntregados} entregados
          </p>
          <p className={`text-xs mt-1 font-medium ${trendClass(pedidosTrend)}`}>
            {trendArrow(pedidosTrend)} {Math.abs(pedidosTrend).toFixed(0)}% vs
            ayer
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
          <p className="flex items-center justify-between gap-2 text-sm text-gray-500">
            Ventas del Día
            <ShoppingBag
              aria-hidden="true"
              className="h-6 w-6 text-green-600"
            />
          </p>
          <p className="text-3xl font-bold text-green-600">
            <MoneyDisplay value={ventas} userRole={userRole} />
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Pedidos con fecha de hoy y entregados · incluye fiados
          </p>
          <p className={`text-xs mt-1 font-medium ${trendClass(ventasTrend)}`}>
            {data.ventasAyer > 0
              ? `${trendArrow(ventasTrend)} ${Math.abs(ventasTrend).toFixed(0)}% vs ayer`
              : 'Sin ventas ayer'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-emerald-500">
          <p className="flex items-center justify-between gap-2 text-sm text-gray-500">
            Efectivo Cobrado
            <IconoEfectivo />
          </p>
          <p className="text-3xl font-bold text-emerald-600">
            {efectivoPendiente ? (
              'Por conciliar'
            ) : (
              <MoneyDisplay value={importeEfectivo} userRole={userRole} />
            )}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Billetes registrados hoy · no incluye digitales
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Incluye abonos de pedidos anteriores
          </p>
          {efectivo && efectivo.ajustes > 0 && (
            <p className="mt-2 text-xs text-amber-900">
              Bruto <MoneyDisplay value={efectivo.bruto} userRole={userRole} />{' '}
              − ajuste{' '}
              <MoneyDisplay value={efectivo.ajustes} userRole={userRole} /> ·
              neto contable
            </p>
          )}
          {efectivoPendiente && cobros && (
            <p className="mt-2 text-xs text-amber-800">
              Subtotal identificado:{' '}
              <MoneyDisplay value={importeEfectivo} userRole={userRole} />
            </p>
          )}
          <button
            className="mt-2 min-h-11 text-sm font-semibold text-emerald-700 underline"
            disabled={!cobros}
            onClick={() => setDetalleCobros('EFECTIVO')}
          >
            Ver cobros
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-500">
          <p className="flex items-center justify-between gap-2 text-sm text-gray-500">
            Gastos del Día
            <Receipt aria-hidden="true" className="h-6 w-6 text-orange-600" />
          </p>
          <p className="text-3xl font-bold text-orange-600">
            <MoneyDisplay value={totalGastos} userRole={userRole} />
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Gastos registrados · no todos identifican su medio de salida
          </p>
        </div>
      </div>

      <CobrosDashboard
        cobros={cobros}
        deuda={fiadosTotal}
        deudaHoy={fiadosHoy}
        userRole={userRole}
        detalle={detalleCobros}
        onDetalle={setDetalleCobros}
      />

      {/* KPIs de Producción */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-purple-500">
          <p className="text-sm text-gray-500">Piezas Producidas</p>
          <p className="text-3xl font-bold text-purple-600">{prodPiezasHoy}</p>
          <p className="text-xs text-gray-400 mt-1">Agua {prodAguaHoy} · Hielo {prodHieloHoy}</p>
          <p className={`text-xs mt-1 font-medium ${trendClass(prodPiezasTrend)}`}>
            {trendArrow(prodPiezasTrend)} {Math.abs(prodPiezasTrend).toFixed(0)}% vs ayer
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-rose-500">
          <p className="text-sm text-gray-500">Pérdidas</p>
          <p className="text-3xl font-bold text-rose-600">{prodPerdidasHoy}</p>
          <p className="text-xs text-gray-400 mt-1">Rotas + filtradas + consumo</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-teal-500">
          <p className="text-sm text-gray-500">Eficiencia</p>
          <p className="text-3xl font-bold text-teal-600">{prodEficienciaHoy.toFixed(0)}%</p>
          <p className="text-xs text-gray-400 mt-1">Producción - pérdidas</p>
          <p className={`text-xs mt-1 font-medium ${trendClass(prodEficienciaTrend)}`}>
            {trendArrow(prodEficienciaTrend)} {Math.abs(prodEficienciaTrend).toFixed(0)}% vs ayer
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-indigo-500">
          <p className="text-sm text-gray-500">Producción</p>
          <p className="text-lg font-bold text-indigo-600">{prodAguaHoy} agua · {prodHieloHoy} hielo</p>
          <p className="text-xs text-gray-400 mt-1">Piezas por producto</p>
          <Link href="/produccion" className="text-xs text-indigo-600 hover:underline mt-1 inline-block">Registrar →</Link>
        </div>
      </div>

      {/* Alertas de Riesgo — siempre visible */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Alertas de Riesgo</h2>
        {totalAlertasRiesgo === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <p className="text-sm text-green-800 font-medium">Todo en orden. No hay alertas activas.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {alertasRiesgo.disputasAbiertas > 0 && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconDisputa />
                  <div>
                    <p className="text-sm font-medium text-red-800">Disputas abiertas</p>
                    <p className="text-xs text-red-600">{alertasRiesgo.disputasAbiertas} sin resolver</p>
                  </div>
                </div>
                <Link href="/pedidos" className="text-xs text-red-700 hover:underline mt-2 inline-block">Ver pedidos →</Link>
              </div>
            )}
            {alertasRiesgo.clientesBloqueados > 0 && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconBloqueado />
                  <div>
                    <p className="text-sm font-medium text-red-800">Clientes bloqueados</p>
                    <p className="text-xs text-red-600">{alertasRiesgo.clientesBloqueados} bloqueados</p>
                  </div>
                </div>
                <Link href="/clientes?bloqueado=true" className="text-xs text-red-700 hover:underline mt-2 inline-block">Ver clientes →</Link>
              </div>
            )}
            {alertasRiesgo.clientesConflictivos > 0 && (
              <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconConflicto />
                  <div>
                    <p className="text-sm font-medium text-orange-800">Clientes conflictivos</p>
                    <p className="text-xs text-orange-600">{alertasRiesgo.clientesConflictivos} con 3+ reclamaciones</p>
                  </div>
                </div>
                <Link href="/clientes?reclamaciones=gte3" className="text-xs text-orange-700 hover:underline mt-2 inline-block">Ver clientes →</Link>
              </div>
            )}
            {alertasRiesgo.promesasProximasVencer > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconPromesa />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Promesas por vencer</p>
                    <p className="text-xs text-amber-600">{alertasRiesgo.promesasProximasVencer} en 2 días</p>
                  </div>
                </div>
                <Link href="/pedidos?tab=fiados" className="text-xs text-amber-700 hover:underline mt-2 inline-block">Ver fiados →</Link>
              </div>
            )}
            {alertasRiesgo.clientesNoVerificados > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconVerificar />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Sin verificar</p>
                    <p className="text-xs text-yellow-600">{alertasRiesgo.clientesNoVerificados} +30 días</p>
                  </div>
                </div>
                <Link href="/clientes?noVerificado=true" className="text-xs text-yellow-700 hover:underline mt-2 inline-block">Ver clientes →</Link>
              </div>
            )}
            {alertasRiesgo.pedidosAtrasadosSinAsignar > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconSinAsignar />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Pedidos sin asignar</p>
                    <p className="text-xs text-amber-600">{alertasRiesgo.pedidosAtrasadosSinAsignar} de días anteriores sin viaje</p>
                  </div>
                </div>
                <Link href="/pedidos?atrasados=true" className="text-xs text-amber-700 hover:underline mt-2 inline-block">Ver y asignar →</Link>
              </div>
            )}
            {alertasRiesgo.pedidosHoyEnRiesgo > 0 && (
              <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconEnRiesgo />
                  <div>
                    <p className="text-sm font-medium text-orange-800">Pedidos en riesgo</p>
                    <p className="text-xs text-orange-600">{alertasRiesgo.pedidosHoyEnRiesgo} llevan demasiado tiempo sin gestionar</p>
                  </div>
                </div>
                <Link href="/pedidos?enRiesgo=true" className="text-xs text-orange-700 hover:underline mt-2 inline-block">Ver y asignar →</Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Casos Activos — siempre visible */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Casos Activos</h2>
          <Link href="/casos" className="text-sm text-blue-600 hover:underline">Ver todos →</Link>
        </div>
        {casosActivos.total === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <p className="text-sm text-gray-600 font-medium">No hay casos activos.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
              <div className="flex items-center gap-2">
                <IconCaso />
                <div>
                  <p className="text-sm font-medium text-red-800">Total abiertos</p>
                  <p className="text-2xl font-bold text-red-600">{casosActivos.total}</p>
                </div>
              </div>
            </div>
            {casosActivos.criticos > 0 && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconCritico />
                  <div>
                    <p className="text-sm font-medium text-red-800">Críticos</p>
                    <p className="text-2xl font-bold text-red-600">{casosActivos.criticos}</p>
                  </div>
                </div>
              </div>
            )}
            {casosActivos.sinResolver48h > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                <div className="flex items-center gap-2">
                  <IconEspera />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Sin resolver +48h</p>
                    <p className="text-2xl font-bold text-amber-600">{casosActivos.sinResolver48h}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Ventas por precio: canal y precio conservan representación visible en móvil. */}
      <section
        className="min-w-0 rounded-xl bg-white p-3 shadow-sm sm:p-5"
        aria-labelledby="ventas-precio-title"
      >
        <h2
          id="ventas-precio-title"
          className="mb-2 text-lg font-semibold text-gray-800"
        >
          Ventas por Precio
        </h2>
        <p className="mb-4 text-xs text-gray-600">
          Canal del pedido · Punto / mostrador o Domicilio · pedidos de hoy
          entregados
        </p>
        {ventasPorPrecio.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            {ventas > 0
              ? 'Hay ventas entregadas sin desglose de producto disponible. Consulta los pedidos para revisarlo.'
              : 'No hay ventas entregadas de pedidos de hoy.'}
            <Link
              href="/pedidos"
              className="mt-3 flex min-h-11 items-center justify-center text-blue-700 underline"
            >
              Ver pedidos
            </Link>
          </div>
        ) : (
          <>
            <table className="w-full table-fixed text-xs sm:table-auto sm:text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="w-[45%] px-1 py-3 text-left sm:w-auto sm:px-3">
                    Producto
                  </th>
                  <th className="hidden px-3 py-3 sm:table-cell">Canal</th>
                  <th className="hidden px-3 py-3 md:table-cell">Precio</th>
                  <th className="px-1 py-3 text-center sm:px-3">Cantidad</th>
                  <th className="px-1 py-3 text-right sm:px-3">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventasPorPrecio.map((item) => {
                  const { Icon } = getProductoIconConfig(item.producto)
                  const badge = (
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${item.canal === 'PUNTO' ? 'bg-amber-100 text-amber-900' : 'bg-violet-100 text-violet-800'}`}
                    >
                      {item.canal === 'PUNTO' ? 'Punto' : 'Domicilio'}
                    </span>
                  )
                  return (
                    <tr
                      key={`${item.producto}-${item.precio}-${item.canal}`}
                      data-testid="venta-precio-fila"
                    >
                      <td className="px-1 py-3 sm:px-3">
                        <span className="flex items-center gap-1 font-medium text-gray-800">
                          <Icon
                            size={18}
                            aria-hidden="true"
                            className="shrink-0"
                          />
                          {PRODUCT_LABELS[item.producto as ProductCode] ??
                            item.producto}
                        </span>
                        <span className="mt-1 block sm:hidden">{badge}</span>
                        <span className="mt-1 block text-[11px] text-gray-600 md:hidden">
                          Unidad:{' '}
                          <MoneyDisplay
                            value={item.precio}
                            userRole={userRole}
                          />
                        </span>
                      </td>
                      <td className="hidden px-3 py-3 text-center sm:table-cell">
                        {badge}
                      </td>
                      <td className="hidden px-3 py-3 text-center md:table-cell">
                        <MoneyDisplay value={item.precio} userRole={userRole} />
                      </td>
                      <td className="px-1 py-3 text-center text-base font-bold text-gray-800 sm:px-3 sm:text-xl">
                        {item.cantidad}
                        <span className="block text-[10px] font-normal text-gray-500">
                          unidades
                        </span>
                      </td>
                      <td className="break-words px-1 py-3 text-right font-semibold text-green-700 sm:px-3">
                        <MoneyDisplay
                          value={item.subtotal}
                          userRole={userRole}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <dl className="mt-2 flex flex-wrap justify-between gap-3 rounded-lg bg-gray-50 p-3 font-semibold">
              <dt>Total de ventas entregadas</dt>
              <dd className="text-green-700">
                <MoneyDisplay value={ventas} userRole={userRole} />
              </dd>
            </dl>
            {Math.round(
              ventasPorPrecio.reduce(
                (n, v) => n + Math.round(v.subtotal * 100),
                0,
              ),
            ) !== Math.round(ventas * 100) && (
              <p
                role="status"
                className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
              >
                El desglose por productos no coincide con el total de ventas.{' '}
                <Link href="/pedidos" className="underline">
                  Revisar pedidos
                </Link>
              </p>
            )}
          </>
        )}
      </section>
      {ventasPorPrecio.length > 0 && (
        <section
          aria-label="Resumen por producto"
          className="grid grid-cols-2 gap-3 md:grid-cols-3"
        >
          {(Object.keys(PRODUCT_LABELS) as ProductCode[]).map((code) => {
            const items = ventasPorPrecio.filter((v) => v.producto === code),
              cantidad = items.reduce((n, v) => n + v.cantidad, 0)
            if (!cantidad) return null
            const { Icon } = getProductoIconConfig(code),
              color = PRODUCTO_COLOR[code]
            return (
              <article
                key={code}
                data-testid={`producto-${code}`}
                className="min-w-0 rounded-xl bg-white p-4 text-center shadow-sm"
              >
                <div
                  className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full ${color.bg}`}
                >
                  <Icon size={32} aria-hidden="true" className={color.text} />
                </div>
                <h2 className="text-sm text-gray-600">
                  {PRODUCT_LABELS[code]}
                </h2>
                <p className={`text-2xl font-bold ${color.text}`}>{cantidad}</p>
                <div className="mt-3 space-y-2 text-xs">
                  {(['PUNTO', 'DOMICILIO'] as const).map((canal) => {
                    const grupo = items.filter((v) => v.canal === canal),
                      cant = grupo.reduce((n, v) => n + v.cantidad, 0),
                      subtotal =
                        grupo.reduce(
                          (n, v) => n + Math.round(v.subtotal * 100),
                          0,
                        ) / 100
                    return cant > 0 ? (
                      <p
                        key={canal}
                        className={`rounded-lg p-2 ${canal === 'PUNTO' ? 'bg-amber-50 text-amber-900' : 'bg-violet-50 text-violet-800'}`}
                      >
                        {canal === 'PUNTO' ? '🏪 Punto' : '🚚 Domicilio'}:{' '}
                        <strong>{cant}</strong> ·{' '}
                        <MoneyDisplay value={subtotal} userRole={userRole} />
                      </p>
                    ) : null
                  })}
                </div>
              </article>
            )
          })}
        </section>
      )}

      {/* Pedidos por Franja Horaria */}
      <div className="bg-white p-5 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Pedidos por Franja Horaria</h2>
        {franjas.every(f => f.count === 0) ? (
          <div className="text-center py-8 text-gray-400"><p>No hay pedidos registrados hoy</p></div>
        ) : (
          <div className="flex items-end gap-3 h-44">
            {franjas.map((f) => {
              const heightPct = f.count > 0 ? Math.max((f.count / maxFranja) * 100, 10) : 0
              return (
                <div key={f.label} className="flex-1 h-full flex flex-col justify-end items-center">
                  <span className="text-sm font-semibold text-gray-700 leading-none mb-1">{f.count}</span>
                  <div
                    className={`w-full rounded-t transition-all ${f.count > 0 ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-200'}`}
                    style={{ height: f.count > 0 ? `${heightPct}%` : '4px', minHeight: f.count > 0 ? '10px' : '4px' }}
                  />
                  <span className="text-xs text-gray-500 mt-2 text-center">{f.label}</span>
                  <span className="text-[10px] text-gray-400">{String(f.range[0]).padStart(2, '0')}-{String(f.range[1]).padStart(2, '0')}h</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Acciones Rápidas — honestas */}
      <div className="bg-white p-5 rounded-xl shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Acciones Rápidas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(userRole === 'ADMIN' || userRole === 'ASISTENTE') && (
            <Link href="/dashboard/importar" className="flex items-center gap-3 p-4 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              <span className="text-sm font-medium">Importar histórico</span>
            </Link>
          )}
          <Link href="/pedidos" className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg hover:bg-blue-100 transition">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
            <span className="text-sm font-medium">Ir a Pedidos</span>
          </Link>
          <Link href="/clientes" className="flex items-center gap-3 p-4 bg-green-50 rounded-lg hover:bg-green-100 transition">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <span className="text-sm font-medium">Ir a Clientes</span>
          </Link>
          <Link href="/embarques" className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg hover:bg-orange-100 transition">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m0 0a2 2 0 104 0m0 0a2 2 0 104 0" /></svg>
            <span className="text-sm font-medium">Ir a Embarques</span>
          </Link>
          <Link href="/produccion" className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg hover:bg-purple-100 transition">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
            <span className="text-sm font-medium">Ir a Producción</span>
          </Link>
        </div>
      </div>

      {/* Inventario y Caja + Cartera */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock */}
        <div className="bg-white p-5 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Inventario</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 mb-1">Agua</p>
              <p className="text-3xl font-bold text-blue-600">{stockAgua}</p>
              <p className="text-xs text-gray-400">pacas</p>
            </div>
            <div className="bg-cyan-50 p-4 rounded-xl text-center">
              <p className="text-sm text-gray-500 mb-1">Hielo</p>
              <p className="text-3xl font-bold text-cyan-600">{stockHielo}</p>
              <p className="text-xs text-gray-400">pacas</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">Stock inicial + Producción - Ventas entregadas</p>
          <Link href="/produccion" className="block mt-3 text-center text-sm text-blue-600 hover:underline">Registrar producción</Link>
        </div>

        {/* Caja */}
        <div className="bg-white p-5 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Resumen de Caja
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Base del día</span>
              <span className="font-medium">
                {baseDia === 0 ? (
                  'Sin base registrada'
                ) : (
                  <MoneyDisplay value={baseDia} userRole={userRole} />
                )}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Efectivo registrado hoy</span>
              <span className="font-medium text-green-600">
                {efectivoPendiente ? (
                  'Por conciliar'
                ) : (
                  <MoneyDisplay value={importeEfectivo} userRole={userRole} />
                )}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">- Gastos</span>
              <span className="font-medium text-red-600">
                <MoneyDisplay value={totalGastos} userRole={userRole} />
              </span>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                Disponible en oficina: por conciliar
              </p>
              <p className="mt-1 text-xs">
                Falta distinguir medios de salida y recepción de repartidores.
                No se calcula con ventas menos fiados.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="bg-yellow-50 p-3 rounded-lg text-center">
              <p className="text-gray-500">Fiados hoy</p>
              <p className="font-bold text-yellow-600">
                <MoneyDisplay value={fiadosHoy} userRole={userRole} />
              </p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <p className="text-gray-500">Total ventas</p>
              <p className="font-bold text-blue-600">
                <MoneyDisplay value={ventas} userRole={userRole} />
              </p>
            </div>
          </div>
          <Link
            href="/cierre"
            className="block mt-4 text-center text-sm text-blue-600 hover:underline"
          >
            Ver cierre completo
          </Link>
        </div>

        {/* Cartera */}
        <div className="bg-white p-5 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Cartera</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Cuentas por cobrar</span>
              <span className="text-xl font-bold text-red-600"><MoneyDisplay value={fiadosTotal} userRole={userRole} /></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Clientes con deuda</span>
              <span className="text-xl font-bold text-gray-800">{String(clientesConFiado)}</span>
            </div>
            {embarquesAbiertos > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Embarques activos</span>
                <span className="text-xl font-bold text-orange-600">{embarquesAbiertos}</span>
              </div>
            )}
            {stockAlertas.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium text-orange-700 mb-2">Stock bajo</p>
                <div className="space-y-1.5">
                  {stockAlertas.map((insumo) => (
                    <div key={insumo.id} className="flex justify-between text-sm">
                      <span className="text-gray-600">{insumo.nombre}</span>
                      <span className="font-medium text-orange-600">{Number(insumo.stock)} {insumo.unidad}</span>
                    </div>
                  ))}
                </div>
                <Link href="/insumos" className="text-xs text-orange-600 hover:underline mt-2 inline-block">Reponer →</Link>
              </div>
            )}
            <Link
              href="/pedidos?tab=fiados"
              className="block w-full text-center px-4 py-2 bg-red-50 text-red-700 text-sm font-medium rounded-lg hover:bg-red-100 transition"
            >
              Ver fiados y cobros
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
