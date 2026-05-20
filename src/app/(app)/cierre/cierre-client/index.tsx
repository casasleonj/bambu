'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useConfirm } from '@/components/confirm-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { CheckCircle2, AlertTriangle, Receipt, Droplets, Snowflake, ArrowRight, Check } from 'lucide-react'
import ArqueoCaja, { type ArqueoData, DENOMINACIONES } from '@/components/arqueo-caja'
import CierreHeader from '@/components/cierre/cierre-header'
import CierreKpiGrid from '@/components/cierre/cierre-kpi-grid'
import CierreSection from '@/components/cierre/cierre-section'
import CierreStockBlock from '@/components/cierre/cierre-stock-block'
import CierreValidationList from '@/components/cierre/cierre-validation-list'
import type { CierreData } from './types'

const formatMoney = (val: number) => formatCurrency(val)

export default function CierreClient({ initialFecha }: { initialFecha: string | null }) {
  const router = useRouter()
  const { confirm, modal } = useConfirm()
  const [data, setData] = useState<CierreData | null>(null)
  const [statusCierre, setStatusCierre] = useState<'COMPLETO' | 'INCOMPLETO' | null>(null)
  const [embarquesPendientes, setEmbarquesPendientes] = useState<{ id: string; numero: number; repartidor?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState(false)
  const [yaCerrado, setYaCerrado] = useState(false)
  const [lastCierreDate, setLastCierreDate] = useState<string | null>(null)
  const [fecha, setFecha] = useState(() => {
    const today = new Date().toISOString().split('T')[0]
    return initialFecha ?? today
  })
  const [stockIniAgua, setStockIniAgua] = useState(0)
  const [stockIniHielo, setStockIniHielo] = useState(0)
  const [prodAgua, setProdAgua] = useState(0)
  const [prodHielo, setProdHielo] = useState(0)
  const [stockFinAgua, setStockFinAgua] = useState(0)
  const [stockFinHielo, setStockFinHielo] = useState(0)
  const [baseDia, setBaseDia] = useState(0)
  const [comisiones, setComisiones] = useState(0)
  const [salarios, setSalarios] = useState(0)
  const [arqueoData, setArqueoData] = useState<{ arqueo: ArqueoData; totalContado: number; diferencia: number }>({
    arqueo: {},
    totalContado: 0,
    diferencia: 0,
  })
  const arqueoRef = useRef(arqueoData)
  useEffect(() => { arqueoRef.current = arqueoData }, [arqueoData])
  const [netoEnArqueo, setNetoEnArqueo] = useState(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const fetchedDateRef = useRef<string | null>(null)

  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string } | undefined)?.role
  const canClose = userRole === 'ADMIN' || userRole === 'ASISTENTE'


  const loadBaseDia = useCallback(async (dateStr: string, signal: AbortSignal) => {
    try {
      const res = await fetch(`/api/config?clave=BASE_DIA_${dateStr}`, { signal })
      if (res.ok) {
        const data = await res.json()
        if (data.config) setBaseDia(Number(data.config.valor))
      }
    } catch { /* ignore */ }
  }, [])

  const checkLastCierre = useCallback(async (dateStr: string, signal: AbortSignal) => {
    try {
      const res = await fetch('/api/cierre/last', { signal })
      if (res.ok) {
        const json = await res.json()
        if (json.cierre) {
          const cierreDate = new Date(json.cierre.fecha).toISOString().split('T')[0]
          if (cierreDate === dateStr) setYaCerrado(true)
          setLastCierreDate(cierreDate)
        } else {
          setLastCierreDate(null)
        }
      }
    } catch { /* ignore */ }
  }, [])

  const fetchCierre = useCallback(async (dateStr: string, signal: AbortSignal) => {
    setFetchError(null)
    try {
      const res = await fetch(`/api/cierre?fecha=${dateStr}`, { signal })
      const json = await res.json()
      if (json.cierre) {
        setData(json.cierre)
        setStatusCierre(json.status || 'COMPLETO')
        setEmbarquesPendientes(json.embarquesPendientes || [])
        if (json.cierre.produccion) {
          setProdAgua(json.cierre.produccion.prodAgua || 0)
          setProdHielo(json.cierre.produccion.prodHielo || 0)
          setStockIniAgua(json.cierre.produccion.stockIniAgua || 0)
          setStockIniHielo(json.cierre.produccion.stockIniHielo || 0)
          setStockFinAgua(json.cierre.produccion.stockFinAgua || 0)
          setStockFinHielo(json.cierre.produccion.stockFinHielo || 0)
          const comSell = Number(json.cierre.produccion.comSellTotal) || 0
          const comRepart = Number(json.cierre.produccion.comRepartTotal) || 0
          const comisionesCalculadas = comSell + comRepart
          if (comisionesCalculadas > 0) {
            setComisiones(prev => prev === 0 ? comisionesCalculadas : prev)
          }
        }
      }
    } catch {
      if (signal.aborted) return
      setFetchError('No se pudieron cargar los datos del cierre')
      toast.error('Error cargando datos del cierre')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFecha = e.target.value
    setFecha(newFecha)
    setLoading(true)
    setYaCerrado(false)
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl
    fetchCierre(newFecha, ctrl.signal)
    loadBaseDia(newFecha, ctrl.signal)
    checkLastCierre(newFecha, ctrl.signal)
  }

  const calcularNetoCaja = useCallback(() => {
    const totalCobros = (data?.efectivo || 0) + (data?.transferencia || 0) + (data?.nequi || 0) + (data?.daviplata || 0) + (data?.bono || 0)
    return baseDia + totalCobros - (data?.totalGastos || 0) - comisiones - salarios
  }, [data, baseDia, comisiones, salarios])

  const handleArqueoChange = useCallback((d: { arqueo: ArqueoData; totalContado: number; diferencia: number }) => {
    setArqueoData(d)
    setNetoEnArqueo(calcularNetoCaja())
  }, [calcularNetoCaja])

  useEffect(() => {
    if (fetchedDateRef.current === fecha) return
    fetchedDateRef.current = fecha
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl
    /* eslint-disable react-hooks/set-state-in-effect */
    fetchCierre(fecha, ctrl.signal)
    loadBaseDia(fecha, ctrl.signal)
    checkLastCierre(fecha, ctrl.signal)
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => ctrl.abort()
  }, [fecha, fetchCierre, loadBaseDia, checkLastCierre])

  const handleCerrar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (statusCierre === 'INCOMPLETO') {
      toast.error(`No se puede cerrar: ${embarquesPendientes.length} embarque(s) abierto(s). Ciérralos primero.`)
      return
    }
    if (baseDia === 0) {
      toast.error('No se puede cerrar: la base de caja es 0. Verifica el monto.')
      return
    }
    if (arqueoData.totalContado === 0) {
      toast.error('No se puede cerrar: debes contar el efectivo físico antes de cerrar.')
      return
    }
    const neto = calcularNetoCaja()
    const ok = await confirm({
      message: '¿Confirmar cierre del día?',
      description: 'Esta acción es irreversible. Verifica que todos los datos sean correctos antes de continuar.',
      variant: 'destructive',
      requireTyping: 'CERRAR',
      confirmLabel: 'Cerrar Día',
      details: (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Ventas</span><span className="font-medium">{formatMoney(data?.totalVentas || 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Base</span><span className="font-medium">{formatMoney(baseDia)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Gastos</span><span className="font-medium text-red-600">-{formatMoney(data?.totalGastos || 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Comisiones</span><span className="font-medium text-red-600">-{formatMoney(comisiones)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Salarios</span><span className="font-medium text-red-600">-{formatMoney(salarios)}</span></div>
          <div className="border-t pt-1 mt-1 flex justify-between font-bold text-base">
            <span>Neto Caja</span>
            <span>{formatMoney(neto)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Contado físico</span>
            <span className={arqueoData.diferencia === 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
              {formatMoney(arqueoData.totalContado)} {arqueoData.diferencia === 0 ? '(Cuadrado)' : arqueoData.diferencia > 0 ? `(Sobrante ${formatMoney(arqueoData.diferencia)})` : `(Faltante ${formatMoney(Math.abs(arqueoData.diferencia))})`}
            </span>
          </div>
        </div>
      ),
      consequences: [
        'No podrás editar pedidos, gastos ni embarques de este día',
        'No podrás modificar el arqueo de caja',
        'El reporte quedará almacenado como evidencia permanente',
      ],
    })
    if (!ok) return
    setCerrando(true)
    try {
      const cierreData = {
        fecha,
        numPedidos: data?.numPedidos || 0,
        totalVentas: data?.totalVentas || 0,
        cobrado: data?.cobrado || 0,
        fiado: data?.fiado || 0,
        efectivo: data?.efectivo || 0,
        transferencia: data?.transferencia || 0,
        nequi: data?.nequi || 0,
        daviplata: data?.daviplata || 0,
        bono: data?.bono || 0,
        baseDia,
        comisiones,
        salarios,
        gastos: data?.totalGastos || 0,
        stockIniAgua, prodAgua, stockFinAgua,
        stockIniHielo, prodHielo, stockFinHielo,
        netoCaja: calcularNetoCaja(),
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
          arqueo: arqueoData.arqueo,
          totalContado: arqueoData.totalContado,
          diferencia: arqueoData.diferencia,
        }),
      }
      const res = await fetch('/api/cierre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cierreData),
      })
      const json = await res.json()
      if (res.status === 201 && json.cierre) {
        toast.success('Día cerrado correctamente')
        router.push('/')
      } else {
        toast.error(json.error || 'Error al cerrar')
      }
    } catch {
      toast.error('Error al cerrar')
    } finally {
      setCerrando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>
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
          <h1 className="text-2xl font-bold tracking-tight">Cierre del Día</h1>
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

        {/* Resumen del cierre */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-xs text-emerald-700 font-medium">Total Ventas</div>
            <div className="text-xl font-bold text-emerald-900">{formatMoney(data.totalVentas)}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="text-xs text-blue-700 font-medium">Total Cobrado</div>
            <div className="text-xl font-bold text-blue-900">{formatMoney(data.cobrado)}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="text-xs text-red-700 font-medium">Total Gastos</div>
            <div className="text-xl font-bold text-red-900">{formatMoney(data.totalGastos)}</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="text-xs text-purple-700 font-medium">Neto Caja</div>
            <div className="text-xl font-bold text-purple-900">{formatMoney(Number(data.netoCaja || 0))}</div>
          </div>
        </div>

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

  const todayStr = new Date().toISOString().split('T')[0]
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

      {/* Backdate warning */}
      {isBackDate && lastCierreDate && (
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

      {/* Fetch error */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-red-700 text-sm">{fetchError}</p>
          <Button size="sm" variant="destructive" onClick={() => { setLoading(true); const ctrl = new AbortController(); abortControllerRef.current = ctrl; fetchCierre(fecha, ctrl.signal) }}>Reintentar</Button>
        </div>
      )}

      {/* Date selector */}
      <div className="flex items-center justify-end gap-2">
        <label className="text-sm text-muted-foreground">Fecha:</label>
        <input
          type="date"
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
        status="completo"
      >
        <CierreKpiGrid data={data} netoTeorico={netoTeorico} />
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
              <label htmlFor="cierre-comisiones" className="text-xs text-muted-foreground">Comisiones</label>
              <Input id="cierre-comisiones" type="number" min="0" value={comisiones} onChange={(e) => setComisiones(Math.max(0, Number(e.target.value)))} className="mt-1" />
            </div>
            <div>
              <label htmlFor="cierre-salarios" className="text-xs text-muted-foreground">Salarios</label>
              <Input id="cierre-salarios" type="number" min="0" value={salarios} onChange={(e) => setSalarios(Math.max(0, Number(e.target.value)))} className="mt-1" />
            </div>
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
        <ArqueoCaja netoTeorico={netoTeorico} onChange={handleArqueoChange} onClose={() => {
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


