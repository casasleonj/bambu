'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useConfirmacionCierre } from '@/components/cierre/cierre-confirmacion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { getTodayString } from '@/lib/dates'
import { calcularNetoCierre } from '@/lib/cierre-totales'
import { CheckCircle2, AlertTriangle, Receipt, Droplets, Snowflake, ArrowRight, Check } from 'lucide-react'
import ArqueoCaja, { type ArqueoData, DENOMINACIONES } from '@/components/arqueo-caja'
import CierreHeader from '@/components/cierre/cierre-header'
import { CierreEstadoConsulta, type ErrorConsultaCierre } from '@/components/cierre/cierre-estado-consulta'
import CierreKpiGrid from '@/components/cierre/cierre-kpi-grid'
import CierreSection from '@/components/cierre/cierre-section'
import CierreStockBlock from '@/components/cierre/cierre-stock-block'
import CierreValidationList from '@/components/cierre/cierre-validation-list'
import type { CierreData } from './types'
import { ComisionesRepartidores } from './comisiones-repartidores'
import { usePollingRefetch } from '@/hooks/use-polling-refetch'

const formatMoney = (val: number) => formatCurrency(val)

export default function CierreClient({ initialFecha }: { initialFecha: string | null }) {
  const router = useRouter()
  const { confirm, modal } = useConfirmacionCierre()
  const [data, setData] = useState<CierreData | null>(null)
  const [statusCierre, setStatusCierre] = useState<'COMPLETO' | 'INCOMPLETO' | null>(null)
  const [embarquesPendientes, setEmbarquesPendientes] = useState<{ id: string; numero: number; repartidor?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [errorConsulta, setErrorConsulta] = useState<ErrorConsultaCierre | null>(null)
  const fetchError = errorConsulta?.message ?? null
  const [cerrando, setCerrando] = useState(false)
  const [yaCerrado, setYaCerrado] = useState(false)
  const [lastCierreDate, setLastCierreDate] = useState<string | null>(null)
  const [fecha, setFecha] = useState(() => {
    const today = getTodayString()
    return initialFecha ?? today
  })
  const [stockIniAgua, setStockIniAgua] = useState(0)
  const [stockIniHielo, setStockIniHielo] = useState(0)
  const [prodAgua, setProdAgua] = useState(0)
  const [prodHielo, setProdHielo] = useState(0)
  const [stockFinAgua, setStockFinAgua] = useState(0)
  const [stockFinHielo, setStockFinHielo] = useState(0)
  const [baseDia, setBaseDia] = useState(0)
  const [salarios, setSalarios] = useState(0)
  const [arqueoData, setArqueoData] = useState<{ arqueo: ArqueoData; totalContado: number; diferencia: number }>({
    arqueo: {},
    totalContado: 0,
    diferencia: 0,
  })
  const arqueoRef = useRef(arqueoData)
  useEffect(() => { arqueoRef.current = arqueoData }, [arqueoData])

  // Gap days between last cierre and selected fecha — derivado durante el
  // render, no requiere estado propio ni efecto.
  const hasGap = (() => {
    if (!lastCierreDate || !fecha) return false
    const last = new Date(lastCierreDate + 'T00:00:00-05:00')
    const selected = new Date(fecha + 'T00:00:00-05:00')
    const diffDays = Math.floor((selected.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
    return diffDays > 1
  })()
  const [netoEnArqueo, setNetoEnArqueo] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cierreSolicitadoRef = useRef(false)

  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string } | undefined)?.role
  const canClose = userRole === 'ADMIN' || userRole === 'ASISTENTE'
  // #499: las comisiones las calcula el servidor; el cierre resta solo lo realmente pagado.
  const comisiones = data?.comisionesAuto?.total ?? 0
  const puedePagarComision = userRole === 'ADMIN' || userRole === 'CONTADOR'
  const diaCerrado = yaCerrado || (statusCierre as string | null) === 'CERRADO'


  const loadBaseDia = useCallback(async (dateStr: string, signal: AbortSignal) => {
    try {
      const [res, defaultRes] = await Promise.all([
        fetch(`/api/config?clave=BASE_DIA_${dateStr}`, { signal }),
        fetch('/api/config?clave=BASE_DIA', { signal }),
      ])
      if (res.ok) {
        const data = await res.json()
        if (signal.aborted) return
        if (data.config) {
          setBaseDia(Number(data.config.valor))
          return
        }
      }
      if (defaultRes.ok) {
        const defaultData = await defaultRes.json()
        if (signal.aborted) return
        if (defaultData.config?.valor) setBaseDia(Number(defaultData.config.valor))
      }
    } catch { /* ignore */ }
  }, [])

  const checkLastCierre = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch('/api/cierre/last', { signal })
      if (res.ok) {
        const json = await res.json()
        if (signal.aborted) return
        if (json.cierre) {
          const cierreDate = new Date(json.cierre.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
          setLastCierreDate(cierreDate)
        } else {
          setLastCierreDate(null)
        }
      }
    } catch { /* ignore */ }
  }, [])

  const fetchCierre = useCallback(async (dateStr: string, signal: AbortSignal) => {
    try {
      const res = await fetch(`/api/cierre?fecha=${dateStr}`, { signal })
      const json = await res.json()
      if (signal.aborted) return
      if (!res.ok || !json.cierre || json.cierre.fecha !== dateStr) {
        const message = json.error?.message || 'No se pudieron cargar los datos del cierre'
        setData(null)
        setErrorConsulta({ message, code: json.error?.code, cobros: json.error?.cobrosPendientes })
        return
      }
      if (json.cierre) {
        setErrorConsulta(null)
        setData(json.cierre)
        setStatusCierre(json.status || 'COMPLETO')
        setYaCerrado(json.status === 'CERRADO')
        setEmbarquesPendientes(json.embarquesPendientes || [])
        if (json.cierre.produccion) {
          setProdAgua(json.cierre.produccion.prodAgua || 0)
          setProdHielo(json.cierre.produccion.prodHielo || 0)
          setStockIniAgua(json.cierre.produccion.stockIniAgua || 0)
          setStockIniHielo(json.cierre.produccion.stockIniHielo || 0)
          setStockFinAgua(json.cierre.produccion.stockFinAgua || 0)
          setStockFinHielo(json.cierre.produccion.stockFinHielo || 0)
        }
      }
    } catch (error) {
      if (signal.aborted) return
      setData(null)
      const message = error instanceof Error ? error.message : 'No se pudieron cargar los datos del cierre'
      setErrorConsulta({ message })
      toast.error(message)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [])

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFecha = e.target.value
    setFecha(newFecha)
    setLoading(true)
    setYaCerrado(false)
    setData(null)
    setErrorConsulta(null)
    setStatusCierre(null)
    setBaseDia(0)
    setSalarios(0)
    setArqueoData({ arqueo: {}, totalContado: 0, diferencia: 0 })
    setStockIniAgua(0); setStockIniHielo(0)
    setProdAgua(0); setProdHielo(0)
    setStockFinAgua(0); setStockFinHielo(0)
  }

  const calcularNetoCaja = useCallback(() => {
    return calcularNetoCierre({
      baseDia, cobroVentasHoy: data?.cobroVentasHoy ?? 0, cobroCartera: data?.cobroCartera ?? 0,
      totalGastos: data?.totalGastos ?? 0, comisiones, salarios,
    })
  }, [data, baseDia, comisiones, salarios])

  const handleArqueoChange = useCallback((d: { arqueo: ArqueoData; totalContado: number; diferencia: number }) => {
    setArqueoData(d)
    setNetoEnArqueo(calcularNetoCaja())
  }, [calcularNetoCaja])

  useEffect(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl
    // La suscripción puede desmontarse en StrictMode antes de iniciar la red.
    void Promise.resolve().then(() => {
      if (ctrl.signal.aborted) return
      void fetchCierre(fecha, ctrl.signal)
      void loadBaseDia(fecha, ctrl.signal)
      void checkLastCierre(ctrl.signal)
    })
    return () => ctrl.abort()
  }, [fecha, fetchCierre, loadBaseDia, checkLastCierre])

  // Polling: refetch base de caja every 60s (replaces config.updated SSE).
  usePollingRefetch(() => {
    const signal = abortControllerRef.current?.signal
    if (signal && !cerrando) void loadBaseDia(fecha, signal)
  }, 60_000)

  const handleCerrar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (cierreSolicitadoRef.current || cerrando) return
    if (!canClose || !data || loading || fetchError || data.fecha !== fecha || diaCerrado) {
      toast.error('Carga y revisa los datos de esta fecha antes de confirmar el cierre.')
      return
    }
    if (statusCierre === 'INCOMPLETO') {
      toast.error(`No se puede cerrar: ${embarquesPendientes.length} embarque(s) abierto(s). Ciérralos primero.`)
      return
    }
    if (baseDia === 0) {
      toast.error('No se puede cerrar: la base de caja es 0. Verifica el monto.')
      return
    }
    // Use ref to avoid race condition with React state batching
    const currentArqueo = arqueoRef.current
    if (currentArqueo.totalContado === 0) {
      toast.error('No se puede cerrar: debes contar el efectivo físico antes de cerrar.')
      return
    }
    const neto = calcularNetoCaja()
    cierreSolicitadoRef.current = true
    setCerrando(true)
    const ok = await confirm({
      fecha, ventas: data.totalVentas, cobros: data.cobroVentasHoy + data.cobroCartera,
      base: baseDia, gastos: data.totalGastos, comisiones, salarios, neto,
    })
    if (!ok) { cierreSolicitadoRef.current = false; setCerrando(false); return }
    setCerrando(true)
    try {
      const cierreData = {
        fecha,
        baseDia,
        salarios,
        stockIniAgua, prodAgua, stockFinAgua,
        stockIniHielo, prodHielo, stockFinHielo,
        reporte: JSON.stringify({
          cobroVentasHoy: data?.cobroVentasHoy,
          cobroCartera: data?.cobroCartera,
          ventasPorOrigen: data?.ventasPorOrigen,
          facturas: data?.facturas,
          gastosPorCategoria: data?.gastosPorCategoria,
          embarques: data?.embarques,
          pedidosCanceladosCount: data?.pedidosCanceladosCount,
          pedidosCanceladosTotal: data?.pedidosCanceladosTotal,
          pedidosNoEntregadosCount: data?.pedidosNoEntregadosCount,
          pedidosNoEntregadosTotal: data?.pedidosNoEntregadosTotal,
          pedidosAnuladosCount: data?.pedidosAnuladosCount,
          pedidosAnuladosTotal: data?.pedidosAnuladosTotal,
          clientesNuevos: data?.clientesNuevos,
          descuentos: data?.descuentos,
          arqueo: currentArqueo.arqueo,
          totalContado: currentArqueo.totalContado,
          diferencia: currentArqueo.diferencia,
        }),
      }
      const res = await fetch('/api/cierre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cierreData),
      })
      const json = await res.json()
      if (res.status === 201 && json.cierre) {
        toast.success(Number(json.cierre.netoCaja) !== neto
          ? 'Cierre registrado con importes actualizados. Revisa el resultado guardado.'
          : 'Día cerrado correctamente')
        const ctrl = new AbortController()
        abortControllerRef.current = ctrl
        await fetchCierre(fecha, ctrl.signal)
      } else if (res.status === 409) {
        toast.error(json.error?.message || 'No se pudo confirmar el cierre. Revisa los datos de esta fecha.')
        const ctrl = new AbortController()
        await fetchCierre(fecha, ctrl.signal)
      } else if (res.status === 400 && json.error?.message?.includes('embarque')) {
        toast.error(json.error.message, {
          description: 'Cierra los embarques pendientes antes de cerrar el día',
          action: { label: 'Ir a Embarques', onClick: () => router.push('/embarques') },
        })
      } else if (res.status === 400 && json.error?.message?.includes('días sin cerrar')) {
        toast.error(json.error.message)
      } else {
        toast.error(json.error?.message || 'Error al cerrar')
      }
    } catch {
      toast.error('No pudimos confirmar el resultado. Consulta el cierre antes de reintentar.')
      const ctrl = new AbortController()
      await fetchCierre(fecha, ctrl.signal)
    } finally {
      cierreSolicitadoRef.current = false
      setCerrando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>
  }

  if (fetchError || !data) {
    return <CierreEstadoConsulta
      error={errorConsulta ?? { message: 'No hay datos disponibles para esta fecha.' }}
      fecha={fecha} maxFecha={getTodayString()} onFechaChange={handleDateChange}
      onRetry={() => {
        setLoading(true)
        abortControllerRef.current?.abort()
        const ctrl = new AbortController()
        abortControllerRef.current = ctrl
        void fetchCierre(fecha, ctrl.signal)
      }}
    />
  }

  const netoTeorico = calcularNetoCaja()

  if (yaCerrado && data) {
    const post = data.postCierre
    const hasPost = post && (post.pedidos.length > 0 || post.embarques.length > 0 || post.gastos.length > 0)
    const postVentas = post?.pedidos.reduce((s, p) => s + p.total, 0) || 0
    const postCobrado = post?.pedidos.reduce((s, p) => s + p.totalPagado, 0) || 0
    const postGastos = post?.gastos.reduce((s, g) => s + g.monto, 0) || 0
    const horaCierreLabel = data.horaCierre
      ? new Date(data.horaCierre).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      : null

    return (
      <div className="p-4 max-w-5xl mx-auto space-y-6 pb-32">
        {modal}
        <div>
          <CierreHeader fecha={fecha} totalVentas={data.totalVentas} status={null} embarquesPendientes={0} paso={3} />
          <p className="text-sm text-muted-foreground mt-1">Resumen y cierre de operaciones del día</p>
        </div>

        <div className="bg-green-50 border border-green-300 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
            <div>
              <h2 className="text-xl font-bold text-green-800">Día cerrado</h2>
              {horaCierreLabel && (
                <p className="text-sm text-green-700">Cierre registrado a las {horaCierreLabel}</p>
              )}
            </div>
          </div>
          <p className="text-green-700 text-sm">El cierre para este día ya fue registrado. No se puede volver a cerrar.</p>
        </div>

        <CierreKpiGrid data={data} netoTeorico={Number(data.netoCaja)} />

        {/* Arqueo */}
        {data.totalContado != null && (
          <div className="bg-white rounded-xl border p-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Arqueo de Caja</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Esperado</div>
                <div className="text-lg font-bold">{formatMoney(Number(data.netoCaja || 0))}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Contado</div>
                <div className="text-lg font-bold">{formatMoney(data.totalContado)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Diferencia</div>
                <div className={`text-lg font-bold ${(data.diferenciaArqueo || 0) === 0 ? 'text-green-600' : (data.diferenciaArqueo || 0) > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {(data.diferenciaArqueo || 0) >= 0 ? '+' : ''}{formatMoney(Math.abs(data.diferenciaArqueo || 0))}
                  {(data.diferenciaArqueo || 0) === 0 ? ' (Cuadrado)' : (data.diferenciaArqueo || 0) > 0 ? ' (Sobrante)' : ' (Faltante)'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Post-cierre */}
        {hasPost && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="text-lg font-bold text-amber-800">Ventas Nocturnas (post-cierre)</h3>
            </div>
            <p className="text-sm text-amber-700 mb-4">
              Se registraron transacciones después del cierre. Este dinero se entregó junto con el cierre.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 border border-amber-200">
                <div className="text-xs text-amber-700">Ventas post-cierre</div>
                <div className="text-lg font-bold text-amber-900">{formatMoney(postVentas)}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-amber-200">
                <div className="text-xs text-amber-700">Cobrado post-cierre</div>
                <div className="text-lg font-bold text-amber-900">{formatMoney(postCobrado)}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-amber-200">
                <div className="text-xs text-amber-700">Gastos post-cierre</div>
                <div className="text-lg font-bold text-amber-900">{formatMoney(postGastos)}</div>
              </div>
            </div>

            {post!.pedidos.length > 0 && (
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-amber-800 mb-2">Pedidos</h4>
                <div className="space-y-1">
                  {post!.pedidos.map(p => (
                    <div key={p.id} className="flex justify-between text-sm bg-white rounded p-2 border border-amber-200">
                      <span>#{p.numero} {p.cliente || '—'} <span className="text-xs text-muted-foreground">({p.origen})</span></span>
                      <span className="font-medium">{formatMoney(p.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {post!.gastos.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-amber-800 mb-2">Gastos</h4>
                <div className="space-y-1">
                  {post!.gastos.map((g, i) => (
                    <div key={i} className="flex justify-between text-sm bg-white rounded p-2 border border-amber-200">
                      <span>{g.categoria}: {g.descripcion}</span>
                      <span className="font-medium">{formatMoney(g.monto)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-amber-300">
              <div className="flex justify-between text-base font-bold text-amber-900">
                <span>Total entregado incluyendo nocturnas</span>
                <span>{formatMoney(Number(data.netoCaja || 0) + postCobrado - postGastos)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => window.open(`/cierre/reporte?fecha=${fecha}`, '_blank', 'noopener,noreferrer')} className="flex-1">
            Ver Reporte para Imprimir
          </Button>
          <Button onClick={() => router.push('/')} className="flex-1">Volver al Dashboard</Button>
        </div>
      </div>
    )
  }

  const todayStr = getTodayString()
  const isBackDate = fecha < todayStr && !yaCerrado

  // Validation items
  const validationItems = [
    {
      label: 'Embarques cerrados',
      ok: statusCierre === 'COMPLETO',
      detail: statusCierre === 'INCOMPLETO'
        ? `${embarquesPendientes.length} embarque(s) abierto(s) — ciérralos en la página de Embarques`
        : 'Todos los embarques del día están cerrados',
    },
    {
      label: 'Base de caja registrada',
      ok: baseDia > 0,
      detail: baseDia > 0 ? `Base: ${formatCurrency(baseDia)}` : 'Ingresa la base de caja en la sección 2',
    },
    {
      label: 'Efectivo físico contado',
      ok: arqueoData.totalContado > 0,
      detail: arqueoData.totalContado > 0
        ? `Contado: ${formatCurrency(arqueoData.totalContado)} — ${arqueoData.diferencia === 0 ? 'Cuadrado' : arqueoData.diferencia > 0 ? `Sobrante ${formatCurrency(arqueoData.diferencia)}` : `Faltante ${formatCurrency(Math.abs(arqueoData.diferencia))}`}`
        : 'Cuenta el efectivo en la sección 3',
    },
    {
      label: 'Stock cuadrado',
      ok: stockIniAgua + prodAgua - (data?.aguaVendida || 0) === stockFinAgua && stockIniHielo + prodHielo - (data?.hieloVendido || 0) === stockFinHielo,
      optional: true,
      detail: (() => {
        const diffAgua = stockIniAgua + prodAgua - (data?.aguaVendida || 0) - stockFinAgua
        const diffHielo = stockIniHielo + prodHielo - (data?.hieloVendido || 0) - stockFinHielo
        if (diffAgua === 0 && diffHielo === 0) return 'Stock de agua e hielo cuadrado'
        const parts: string[] = []
        if (diffAgua !== 0) parts.push(`Agua: ${diffAgua > 0 ? '+' : ''}${diffAgua}`)
        if (diffHielo !== 0) parts.push(`Hielo: ${diffHielo > 0 ? '+' : ''}${diffHielo}`)
        return parts.join(' | ')
      })(),
    },
  ]

  // Next step hint
  const getNextStep = () => {
    if (baseDia === 0) return { label: 'Ingresa la base de caja', section: 2 }
    if (arqueoData.totalContado === 0) return { label: 'Cuenta el efectivo físico', section: 3 }
    if (statusCierre === 'INCOMPLETO') return { label: 'Cierra los embarques pendientes', section: 1 }
    return { label: 'Listo para cerrar el día', section: 4 }
  }

  const nextStep = getNextStep()
  const allReady = baseDia > 0 && arqueoData.totalContado > 0 && statusCierre === 'COMPLETO'

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6 pb-32">
      {modal}

      {/* Gap warning */}
      {hasGap && lastCierreDate && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Días sin cerrar</p>
            <p className="text-sm text-red-800 mt-1">
              Hay días sin cerrar entre el último cierre (<strong>{lastCierreDate}</strong>) y la fecha seleccionada (<strong>{fecha}</strong>). Debes cerrar los días intermedios primero.
            </p>
          </div>
        </div>
      )}

      {/* Backdate warning */}
      {isBackDate && lastCierreDate && !hasGap && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">Cerrando día atrasado</p>
            <p className="text-sm text-amber-800 mt-1">
              Último cierre: <strong>{lastCierreDate}</strong>. Completá los datos y cerrá este día para poder iniciar el siguiente.
            </p>
          </div>
        </div>
      )}

      {/* Date selector */}
      <div className="flex items-center justify-end gap-2">
        <label htmlFor="cierre-fecha" className="text-sm text-muted-foreground">Fecha del cierre:</label>
        <input
          id="cierre-fecha"
          type="date"
          disabled={cerrando}
          max={todayStr}
          value={fecha}
          onChange={handleDateChange}
          className="border rounded-md px-3 py-1.5 text-sm bg-white"
        />
      </div>

      {/* Hero Header */}
      <CierreHeader
        fecha={fecha}
        totalVentas={data?.totalVentas || 0}
        status={statusCierre}
        embarquesPendientes={embarquesPendientes.length}
      />

      {/* Section 1: Resumen Financiero */}
      <CierreSection
        number={1}
        title="Resumen Financiero"
        description="Revisa que los números del día cuadren. Los datos vienen del sistema."
        status={data && !fetchError ? 'completo' : 'pendiente'}
      >
        <CierreKpiGrid data={data} netoTeorico={netoTeorico} baseDia={baseDia} comisiones={comisiones} salarios={salarios} />
      </CierreSection>

      {/* Section 2: Stock y Base de Caja */}
      <CierreSection
        number={2}
        title="Stock y Base de Caja"
        description="Confirma los valores que faltan por registrar. La base es el efectivo con que iniciaste el día."
      >
        <div className="space-y-4">
          {/* Base, Comisiones, Salarios */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cierre-baseDia" className="text-xs text-muted-foreground">Base de Caja</label>
              <Input id="cierre-baseDia" type="number" min="0" value={baseDia} onChange={(e) => setBaseDia(Math.max(0, Number(e.target.value)))} className="mt-1" />
              {baseDia <= 0 && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Requerido para cerrar</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Comisiones (automático)</p>
              <p className="mt-1 flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium" data-testid="cierre-comisiones-auto">{formatMoney(comisiones)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Lo pagado a repartidores hoy y la comisión de sellador.</p>
            </div>
            <div>
              <label htmlFor="cierre-salarios" className="text-xs text-muted-foreground">Salarios</label>
              <Input id="cierre-salarios" type="number" min="0" value={salarios} onChange={(e) => setSalarios(Math.max(0, Number(e.target.value)))} className="mt-1" />
            </div>
          </div>

          {/* Comisiones de repartidores (#499) */}
          <div>
            <p className="mb-2 text-sm font-medium">Comisiones de repartidores</p>
            <ComisionesRepartidores
              fecha={fecha}
              repartidores={data?.comisionesAuto?.repartidores ?? []}
              puedePagar={puedePagarComision}
              diaCerrado={diaCerrado}
              onPagado={() => {
                const signal = abortControllerRef.current?.signal
                if (signal) void fetchCierre(fecha, signal)
              }}
            />
          </div>

          {/* Stock blocks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CierreStockBlock
              label="Stock Agua"
              icon={<Droplets className="w-5 h-5 text-blue-500" />}
              ini={stockIniAgua}
              prod={prodAgua}
              vend={data?.aguaVendida || 0}
              fin={stockFinAgua}
              onIniChange={setStockIniAgua}
              onProdChange={setProdAgua}
              onFinChange={setStockFinAgua}
            />
            <CierreStockBlock
              label="Stock Hielo"
              icon={<Snowflake className="w-5 h-5 text-cyan-500" />}
              ini={stockIniHielo}
              prod={prodHielo}
              vend={data?.hieloVendido || 0}
              fin={stockFinHielo}
              onIniChange={setStockIniHielo}
              onProdChange={setProdHielo}
              onFinChange={setStockFinHielo}
            />
          </div>
        </div>
      </CierreSection>

      {/* Section 3: Arqueo de Caja */}
      <CierreSection
        number={3}
        title="Arqueo de Caja"
        description="Cuenta el efectivo físico y compara con lo que dice el sistema."
      >
        <ArqueoCaja key={fecha} netoTeorico={netoTeorico} onChange={handleArqueoChange} onClose={() => {
          const latest = arqueoRef.current
          if (latest.totalContado > 0) {
            toast.success(`Conteo guardado: ${formatCurrency(latest.totalContado)}`, {
              description: latest.diferencia === 0
                ? 'Cuadrado'
                : latest.diferencia > 0
                  ? `Sobrante: ${formatCurrency(latest.diferencia)}`
                  : `Faltante: ${formatCurrency(Math.abs(latest.diferencia))}`,
            })
          }
        }} />
        {arqueoData.totalContado > 0 && (
          <div className="bg-white border rounded-xl shadow-sm p-6 mt-4">
            {/* Header: Expected / Counted / Difference */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <Receipt className="w-6 h-6 text-muted-foreground" />
              <h4 className="text-base font-bold">Conteo de Efectivo</h4>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center mb-5">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Esperado</div>
                <div className="text-lg font-bold tabular-nums">{formatCurrency(netoEnArqueo)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Contado</div>
                <div className="text-lg font-bold tabular-nums">{formatCurrency(arqueoData.totalContado)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Diferencia</div>
                <div className={`text-lg font-bold tabular-nums ${arqueoData.diferencia === 0 ? 'text-green-600' : arqueoData.diferencia > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {arqueoData.diferencia >= 0 ? '+' : ''}{formatCurrency(arqueoData.diferencia)}
                </div>
              </div>
            </div>

            {/* Difference banner */}
            <div className={`mb-5 p-3 rounded-lg text-center font-semibold text-sm ${
              arqueoData.diferencia === 0 ? 'bg-green-50 text-green-700 border border-green-200' :
              arqueoData.diferencia > 0 ? 'bg-blue-50 text-blue-700 border border-blue-200' :
              'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {arqueoData.diferencia === 0 ? 'Cuadrado — Todo coincide' :
                arqueoData.diferencia > 0 ? `Sobrante de ${formatCurrency(arqueoData.diferencia)}` :
                `Faltante de ${formatCurrency(Math.abs(arqueoData.diferencia))}`}
            </div>

            {/* Billetes */}
            {DENOMINACIONES.some(d => d.tipo === 'BILLETE' && (arqueoData.arqueo[d.valor] || 0) > 0) && (
              <div className="mb-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 border-b pb-1">Billetes</div>
                <div className="space-y-1">
                  {DENOMINACIONES.filter(d => d.tipo === 'BILLETE' && (arqueoData.arqueo[d.valor] || 0) > 0).map(d => (
                    <div key={d.valor} className="flex items-center justify-between text-sm py-1">
                      <span className="w-24 font-medium">{d.label}</span>
                      <span className="w-8 text-center text-muted-foreground">×</span>
                      <span className="w-12 text-right tabular-nums font-bold">{arqueoData.arqueo[d.valor]}</span>
                      <span className="w-8 text-center text-muted-foreground">=</span>
                      <span className="w-32 text-right tabular-nums font-medium">{formatCurrency((arqueoData.arqueo[d.valor] || 0) * d.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monedas */}
            {DENOMINACIONES.some(d => d.tipo === 'MONEDA' && (arqueoData.arqueo[d.valor] || 0) > 0) && (
              <div className="mb-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 border-b pb-1">Monedas</div>
                <div className="space-y-1">
                  {DENOMINACIONES.filter(d => d.tipo === 'MONEDA' && (arqueoData.arqueo[d.valor] || 0) > 0).map(d => (
                    <div key={d.valor} className="flex items-center justify-between text-sm py-1">
                      <span className="w-24 font-medium">{d.label}</span>
                      <span className="w-8 text-center text-muted-foreground">×</span>
                      <span className="w-12 text-right tabular-nums font-bold">{arqueoData.arqueo[d.valor]}</span>
                      <span className="w-8 text-center text-muted-foreground">=</span>
                      <span className="w-32 text-right tabular-nums font-medium">{formatCurrency((arqueoData.arqueo[d.valor] || 0) * d.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t-2 border-gray-200 pt-3 mt-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-base">Total Contado</span>
                <span className="text-xl font-bold tabular-nums">{formatCurrency(arqueoData.totalContado)}</span>
              </div>
            </div>
          </div>
        )}
      </CierreSection>

      {/* Section 4: Cerrar Día */}
      <CierreSection
        number={4}
        title="Cerrar el Día"
        description="Al cerrar, bloqueas el día permanentemente. No podrás editar pedidos ni embarques."
      >
        <div className="space-y-4">
          {/* Validation checklist */}
          <CierreValidationList items={validationItems} />

          {/* Quick action for open embarques */}
          {statusCierre === 'INCOMPLETO' && embarquesPendientes.length > 0 && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg p-3">
              <span className="text-sm text-red-700">{embarquesPendientes.length} embarque(s) abierto(s)</span>
              <Button type="button" size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100" onClick={() => router.push('/embarques')}>
                Ir a Embarques →
              </Button>
            </div>
          )}

          {/* Consequences */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">Al cerrar el día:</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• No podrás editar pedidos, gastos ni embarques de este día</li>
              <li>• No podrás modificar el arqueo de caja</li>
              <li>• El reporte quedará almacenado como evidencia permanente</li>
            </ul>
          </div>

          {/* Action buttons */}
          {canClose ? (
            <form onSubmit={handleCerrar} className="space-y-2">
              <Button
                type="submit"
                disabled={cerrando || statusCierre === 'INCOMPLETO' || baseDia === 0 || arqueoData.totalContado === 0}
                className="w-full py-6 text-lg"
              >
                {cerrando ? 'Cerrando...' : 'Cerrar Día'}
              </Button>
              <Button type="button" variant="outline" onClick={() => window.open(`/cierre/reporte?fecha=${fecha}`, '_blank', 'noopener,noreferrer')} className="w-full">
                Ver Reporte para Imprimir
              </Button>
            </form>
          ) : (
            <div className="bg-muted rounded-lg p-4 text-center text-sm text-muted-foreground">Solo los administradores y asistentes pueden cerrar el día</div>
          )}
        </div>
      </CierreSection>

      {/* Sticky Footer - Next Step */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-3 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold',
              allReady ? 'bg-green-500' : 'bg-blue-500'
            )}>
              {allReady ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Próximo paso</div>
              <div className="text-sm font-semibold">{nextStep.label}</div>
            </div>
          </div>
          {allReady && (
            <Button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} size="sm">
              Ir a Cerrar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}


