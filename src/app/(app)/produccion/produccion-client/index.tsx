'use client'

import { generateUUID } from '@/lib/uuid'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { useConfirm } from '@/components/confirm-modal'
import { SkeletonPage } from '@/components/skeleton'
import { InfoBanner } from '@/components/tooltip'
import { fetchResilient } from '@/lib/fetch-resilient'
import { ProduccionPendingBadge } from '@/components/produccion/pending-sync-badge'
import type { StockInicial, FormData, TrabajadorOption, PreviewData, RepartidorOption, ProduccionRegistro } from './types'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import { ProduccionEditModal } from './edit-modal'

const EMPTY_FORM: FormData = {
  trabajadorId: '',
  turno: 'MANANA',
  conteoAAgua: 0,
  conteoBAgua: 0,
  conteoAHielo: 0,
  conteoBHielo: 0,
  stockFinFisicoAgua: 0,
  stockFinFisicoHielo: 0,
  filtradasAgua: 0,
  filtradasHielo: 0,
  rotasAgua: 0,
  rotasHielo: 0,
  consumoInternoAgua: 0,
  consumoInternoHielo: 0,
  obs: '',
}

type ConciliationStatus = 'ok' | 'warning' | 'danger'

interface ConciliationResult {
  status: ConciliationStatus
  message: string
  diferenciaAgua: number
  diferenciaHielo: number
}

export default function ProduccionClient() {
  const router = useRouter()
  const { confirm, modal } = useConfirm()
  const [step, setStep] = useState(1)
  const [stockInicial, setStockInicial] = useState<StockInicial>({
    stockIniAgua: 0,
    stockIniHielo: 0,
    ventasAgua: 0,
    ventasHielo: 0,
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [trabajadores, setTrabajadores] = useState<TrabajadorOption[]>([])
  const [loadingTrabajadores, setLoadingTrabajadores] = useState(true)
  const [repartidores, setRepartidores] = useState<RepartidorOption[]>([])
  const [embarquesAbiertos, setEmbarquesAbiertos] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [produccionesHoy, setProduccionesHoy] = useState<ProduccionRegistro[]>([])
  const [loadingProducciones, setLoadingProducciones] = useState(true)
  const [editRegistro, setEditRegistro] = useState<ProduccionRegistro | null>(null)

  const selectedTrabajador = trabajadores.find((t) => t.id === formData.trabajadorId)

  const fetchTrabajadores = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/trabajadores?rol=SELLADOR&activo=true', { signal })
      if (res.status === 401 || res.status === 403) {
        router.push(`/login?callbackUrl=${encodeURIComponent('/produccion')}`)
        return
      }
      const data = await res.json()
      setTrabajadores(data.trabajadores || [])
    } catch {
      if (signal?.aborted) return
      toast.error('Error cargando trabajadores')
    } finally {
      setLoadingTrabajadores(false)
    }
  }

  const fetchProfile = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/auth/profile', { signal })
      if (res.ok) {
        const data = await res.json()
        setUserRole(data.user?.rol ?? null)
      }
    } catch {
      // ignore
    }
  }

  const fetchProducciones = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/produccion', { signal })
      if (res.status === 401 || res.status === 403) {
        router.push(`/login?callbackUrl=${encodeURIComponent('/produccion')}`)
        return
      }
      const data = await res.json()
      setProduccionesHoy(data.produccion || [])
    } catch {
      if (signal?.aborted) return
      toast.error('Error cargando producciones del día')
    } finally {
      setLoadingProducciones(false)
    }
  }

  const fetchPreview = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/produccion/preview', { signal })
      if (res.status === 401 || res.status === 403) {
        router.push(`/login?callbackUrl=${encodeURIComponent('/produccion')}`)
        return
      }
      const data = await res.json()
      const preview: PreviewData = data
      setStockInicial({
        stockIniAgua: preview.stockIniAgua,
        stockIniHielo: preview.stockIniHielo,
        ventasAgua: preview.ventasAgua,
        ventasHielo: preview.ventasHielo,
      })
      setRepartidores(preview.repartidores || [])
      setEmbarquesAbiertos(preview.embarquesAbiertos)
    } catch {
      if (signal?.aborted) return
      toast.error('Error cargando datos del día')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchPreview(controller.signal)
    fetchTrabajadores(controller.signal)
    fetchProfile(controller.signal)
    fetchProducciones(controller.signal)
    return () => controller.abort()
  }, [])

  // Realtime: refresh preview when production is registered elsewhere.
  useRealtimeListener(['produccion.created'], () => {
    fetchPreview()
    fetchProducciones()
  })

  const prodAgua = useMemo(() => Math.round((formData.conteoAAgua + formData.conteoBAgua) / 2), [formData.conteoAAgua, formData.conteoBAgua])
  const prodHielo = useMemo(() => Math.round((formData.conteoAHielo + formData.conteoBHielo) / 2), [formData.conteoAHielo, formData.conteoBHielo])
  const stockFinEsperadoAgua = useMemo(() => stockInicial.stockIniAgua + prodAgua - stockInicial.ventasAgua, [stockInicial.stockIniAgua, prodAgua, stockInicial.ventasAgua])
  const stockFinEsperadoHielo = useMemo(() => stockInicial.stockIniHielo + prodHielo - stockInicial.ventasHielo, [stockInicial.stockIniHielo, prodHielo, stockInicial.ventasHielo])
  const perdidasAgua = useMemo(() => formData.rotasAgua + formData.filtradasAgua + formData.consumoInternoAgua, [formData.rotasAgua, formData.filtradasAgua, formData.consumoInternoAgua])
  const perdidasHielo = useMemo(() => formData.rotasHielo + formData.filtradasHielo + formData.consumoInternoHielo, [formData.rotasHielo, formData.filtradasHielo, formData.consumoInternoHielo])
  const diferenciaAgua = useMemo(() => stockFinEsperadoAgua - formData.stockFinFisicoAgua - perdidasAgua, [stockFinEsperadoAgua, formData.stockFinFisicoAgua, perdidasAgua])
  const diferenciaHielo = useMemo(() => stockFinEsperadoHielo - formData.stockFinFisicoHielo - perdidasHielo, [stockFinEsperadoHielo, formData.stockFinFisicoHielo, perdidasHielo])

  const comAgua = useMemo(() => prodAgua * (selectedTrabajador?.comPacaAgua || 200), [prodAgua, selectedTrabajador?.comPacaAgua])
  const comHielo = useMemo(() => prodHielo * (selectedTrabajador?.comPacaHielo || 200), [prodHielo, selectedTrabajador?.comPacaHielo])
  const comisionTotal = useMemo(() => comAgua + comHielo, [comAgua, comHielo])

  const comRepartAgua = useMemo(() => repartidores.reduce((s, r) => s + r.entregasAgua * r.comPacaAgua, 0), [repartidores])
  const comRepartHielo = useMemo(() => repartidores.reduce((s, r) => s + r.entregasHielo * r.comPacaHielo, 0), [repartidores])
  const comRepartTotal = useMemo(() => comRepartAgua + comRepartHielo, [comRepartAgua, comRepartHielo])

  const conciliation: ConciliationResult = useMemo(() => {
    const totalDiff = Math.abs(diferenciaAgua) + Math.abs(diferenciaHielo)
    if (totalDiff === 0) {
      return { status: 'ok', message: 'Todo cuadra', diferenciaAgua, diferenciaHielo }
    }
    const issues: string[] = []
    if (diferenciaAgua > 0) issues.push(`Faltan ${diferenciaAgua} paca(s) de agua sin explicación`)
    if (diferenciaAgua < 0) issues.push(`Sobran ${Math.abs(diferenciaAgua)} paca(s) de agua`)
    if (diferenciaHielo > 0) issues.push(`Faltan ${diferenciaHielo} paca(s) de hielo sin explicación`)
    if (diferenciaHielo < 0) issues.push(`Sobran ${Math.abs(diferenciaHielo)} paca(s) de hielo`)
    const hasSobrantes = diferenciaAgua < 0 || diferenciaHielo < 0
    return { status: hasSobrantes ? 'danger' : 'warning', message: issues.join('. '), diferenciaAgua, diferenciaHielo }
  }, [diferenciaAgua, diferenciaHielo])

  const handleSubmit = async () => {
    if (!formData.trabajadorId) {
      toast.error('Selecciona un trabajador')
      return
    }
    if (formData.conteoAAgua === 0 && formData.conteoAHielo === 0) {
      toast.error('Ingresá los conteos de producción')
      return
    }
    if (formData.stockFinFisicoAgua === 0 && formData.stockFinFisicoHielo === 0) {
      toast.error('Ingresá el stock físico contado')
      return
    }
    if (conciliation.status !== 'ok') {
      const msg = conciliation.status === 'danger'
        ? `Hay sobrantes de stock. ${conciliation.message}. ¿Estás seguro de guardar?`
        : `${conciliation.message}. ¿Estás seguro de guardar?`
      const ok = await confirm(msg)
      if (!ok) return
    }
    setSubmitting(true)
    try {
      // Bloque 2: enviar ProduccionItem[] (2 items: PACA_AGUA + PACA_HIELO)
      // El stockIni viene de `stockInicial` (preview), no del formData
      // Bloque 5: fetchResilient + offlineId para offline-first.
      const body = {
        trabajadorId: formData.trabajadorId,
        turno: formData.turno,
        obs: formData.obs,
        offlineId: generateUUID(),
        items: [
          {
            producto: 'PACA_AGUA',
            stockIni: stockInicial.stockIniAgua,
            conteoA: formData.conteoAAgua,
            conteoB: formData.conteoBAgua,
            stockFinFisico: formData.stockFinFisicoAgua,
            filtradas: formData.filtradasAgua,
            rotas: formData.rotasAgua,
            consumoInterno: formData.consumoInternoAgua,
          },
          {
            producto: 'PACA_HIELO',
            stockIni: stockInicial.stockIniHielo,
            conteoA: formData.conteoAHielo,
            conteoB: formData.conteoBHielo,
            stockFinFisico: formData.stockFinFisicoHielo,
            filtradas: formData.filtradasHielo,
            rotas: formData.rotasHielo,
            consumoInterno: formData.consumoInternoHielo,
          },
        ],
      }
      const result = await fetchResilient<{
        success: boolean
        produccion?: unknown
        deduped?: boolean
        error?: { message?: string }
      }>('/api/produccion', {
        method: 'POST',
        body,
        localEndpoint: 'produccion',
      })

      if (result.status === 'ok') {
        if (result.data?.deduped) {
          toast.info('Producción ya estaba registrada (sincronizada)')
        } else {
          toast.success('Producción registrada correctamente')
        }
        router.refresh()
        setStep(1)
        setFormData({ ...EMPTY_FORM })
        return
      }

      if (result.status === 'offline') {
        // Encolada en Dexie. Mostrar feedback claro y reset.
        toast.info('Sin conexión. Producción guardada, se enviará al recuperar la red.')
        setStep(1)
        setFormData({ ...EMPTY_FORM })
        return
      }

      // result.status === 'error' — diferenciar 409 vs 5xx vs otros
      const statusCode = result.statusCode
      if (statusCode === 409) {
        toast.error('Ya existe producción para este trabajador y turno hoy. Refrescá la página.')
      } else if (statusCode === 401 || statusCode === 403) {
        router.push(`/login?callbackUrl=${encodeURIComponent('/produccion')}`)
      } else if (statusCode >= 500) {
        toast.error('Error del servidor. Reintentá en unos segundos.')
      } else {
        toast.error(result.error || 'Error al registrar')
      }
    } catch {
      toast.error('Error al registrar')
    } finally {
      setSubmitting(false)
    }
  }

  const renderStepper = () => {
    const labels = ['Stock Inicial', 'Conteos', 'Datos del Turno', 'Conciliar']
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {labels.map((label, idx) => (
            <div key={idx} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    step > idx + 1
                      ? 'bg-green-600 text-white'
                      : step === idx + 1
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {step > idx + 1 ? '✓' : idx + 1}
                </div>
                <span
                  className={`mt-2 text-xs font-medium text-center hidden sm:block ${
                    step >= idx + 1 ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {label}
                </span>
              </div>
              {idx < 3 && (
                <div
                  className={`flex-1 h-1 mx-2 sm:mx-4 rounded transition-colors ${
                    step > idx + 1 ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderBalanceCard = () => (
    <div className="bg-white rounded-xl shadow-sm border p-4">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Balance del día</h4>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-400">
          <span></span>
          <span className="w-10 text-right text-blue-600">💧</span>
          <span className="w-10 text-right text-cyan-600">🧊</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Había</span>
          <span className="w-10 text-right font-bold text-blue-600">{stockInicial.stockIniAgua}</span>
          <span className="w-10 text-right font-bold text-cyan-600">{stockInicial.stockIniHielo}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">+ Hecho</span>
          <span className="w-10 text-right font-bold text-green-600">{prodAgua}</span>
          <span className="w-10 text-right font-bold text-green-600">{prodHielo}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">- Vendido</span>
          <span className="w-10 text-right font-bold text-red-600">{stockInicial.ventasAgua}</span>
          <span className="w-10 text-right font-bold text-red-600">{stockInicial.ventasHielo}</span>
        </div>
        <div className="border-t pt-2 flex items-center justify-between font-semibold">
          <span className="text-gray-800">= Esperado</span>
          <span className="w-10 text-right font-bold text-blue-700">{stockFinEsperadoAgua}</span>
          <span className="w-10 text-right font-bold text-cyan-700">{stockFinEsperadoHielo}</span>
        </div>
        {(perdidasAgua > 0 || perdidasHielo > 0) && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-orange-600">- Pérdidas</span>
              <span className="w-10 text-right font-bold text-orange-600">{perdidasAgua}</span>
              <span className="w-10 text-right font-bold text-orange-600">{perdidasHielo}</span>
            </div>
            <div className="border-t pt-2 flex items-center justify-between font-semibold">
              <span className="text-gray-800">= Debería</span>
              <span className="w-10 text-right font-bold text-blue-700">{stockFinEsperadoAgua - perdidasAgua}</span>
              <span className="w-10 text-right font-bold text-cyan-700">{stockFinEsperadoHielo - perdidasHielo}</span>
            </div>
          </>
        )}
        {(formData.stockFinFisicoAgua >= 0 || formData.stockFinFisicoHielo >= 0) && (
          <div className="border-t pt-2 flex items-center justify-between font-semibold">
            <span className="text-gray-800">Vs. Físico</span>
            <span className={`w-10 text-right font-bold ${diferenciaAgua === 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formData.stockFinFisicoAgua}
            </span>
            <span className={`w-10 text-right font-bold ${diferenciaHielo === 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formData.stockFinFisicoHielo}
            </span>
          </div>
        )}
        <div className="border-t pt-2 flex items-center justify-between font-semibold">
          <span className="text-gray-800">Diferencia</span>
          <span className={`w-10 text-right font-bold ${diferenciaAgua === 0 ? 'text-green-600' : 'text-red-600'}`}>
            {diferenciaAgua === 0 ? '0' : diferenciaAgua > 0 ? `-${diferenciaAgua}` : `+${Math.abs(diferenciaAgua)}`}
          </span>
          <span className={`w-10 text-right font-bold ${diferenciaHielo === 0 ? 'text-green-600' : 'text-red-600'}`}>
            {diferenciaHielo === 0 ? '0' : diferenciaHielo > 0 ? `-${diferenciaHielo}` : `+${Math.abs(diferenciaHielo)}`}
          </span>
        </div>
      </div>
      {embarquesAbiertos && (
        <div className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
          ⚠️ Repartidores en ruta. Ventas parciales.
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        <SkeletonPage hasStats={false} hasFilters={false} cardCount={2} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Registro de Producción</h1>
          <p className="text-gray-500 mt-1">Control de producción diaria</p>
        </div>
        <ProduccionPendingBadge />
      </div>

      {/* Lista de producciones del día */}
      {!loadingProducciones && produccionesHoy.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Producciones de hoy</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Turno</th>
                  <th className="px-4 py-3 text-left font-medium">Sellador</th>
                  <th className="px-4 py-3 text-center font-medium">Agua</th>
                  <th className="px-4 py-3 text-center font-medium">Hielo</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {produccionesHoy.map((p) => {
                  const agua = p.items.find(i => i.producto === 'PACA_AGUA')
                  const hielo = p.items.find(i => i.producto === 'PACA_HIELO')
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{p.turno}</td>
                      <td className="px-4 py-3 text-gray-600">{p.trabajador.nombre}</td>
                      <td className="px-4 py-3 text-center text-blue-600 font-semibold">{agua?.producido ?? 0}</td>
                      <td className="px-4 py-3 text-center text-cyan-600 font-semibold">{hielo?.producido ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        {userRole === 'ADMIN' && (
                          <button
                            onClick={() => setEditRegistro(p)}
                            className="text-xs text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded bg-blue-50 hover:bg-blue-100 transition"
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {renderStepper()}

      {/* Desktop: 2-column layout with sticky sidebar */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-8">
        {/* Main content: 2/3 width */}
        <div className="lg:col-span-2">
          {/* PASO 1: Stock Inicial */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">¿Con cuánto amanecimos hoy?</h2>
                <p className="text-gray-500 text-sm mt-1">Esto es lo que quedó en la bodega al cerrar el día anterior.</p>
              </div>
              <InfoBanner type="tip">
                Este número viene del <strong>cierre del día anterior</strong>. Si no coincide con lo que ves físicamente, registrá el stock físico real en el Paso 3 y explicá la diferencia en el Paso 4.
              </InfoBanner>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-blue-50 border border-blue-100 p-8 rounded-2xl text-center">
                  <p className="text-sm text-blue-600 font-medium mb-3">💧 AGUA</p>
                  <p className="text-5xl lg:text-6xl font-bold text-blue-700">{stockInicial.stockIniAgua}</p>
                  <p className="text-sm text-gray-500 mt-2">pacas</p>
                </div>
                <div className="bg-cyan-50 border border-cyan-100 p-8 rounded-2xl text-center">
                  <p className="text-sm text-cyan-600 font-medium mb-3">🧊 HIELO</p>
                  <p className="text-5xl lg:text-6xl font-bold text-cyan-700">{stockInicial.stockIniHielo}</p>
                  <p className="text-sm text-gray-500 mt-2">pacas</p>
                </div>
              </div>
              <button
                onClick={() => setStep(2)}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors text-lg"
              >
                Siguiente →
              </button>
            </div>
          )}

          {/* PASO 2: Conteos */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">¿Cuánto fabricó el sellador?</h2>
                <p className="text-gray-500 text-sm mt-1">Dos personas cuentan por separado.</p>
              </div>
              <InfoBanner type="info">
                <strong>¿Por qué dos conteos?</strong> Para evitar errores humanos. Si los conteos A y B difieren mucho, se hace un tercero. El sistema usa el promedio.
              </InfoBanner>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="conteos-section">
                <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl" data-testid="conteo-agua">
                  <h3 className="font-semibold text-blue-800 mb-4 flex items-center gap-2">
                    <span>💧</span> Agua
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Conteo A</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.conteoAAgua || ''}
                        onChange={(e) => setFormData({ ...formData, conteoAAgua: Number(e.target.value) })}
                        className="w-full p-3 border rounded-lg text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0"
                        data-testid="conteo-agua-a"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Conteo B</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.conteoBAgua || ''}
                        onChange={(e) => setFormData({ ...formData, conteoBAgua: Number(e.target.value) })}
                        className="w-full p-3 border rounded-lg text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0"
                        data-testid="conteo-agua-b"
                      />
                    </div>
                  </div>
                  <div className="mt-4 bg-white rounded-lg p-3 text-center border border-blue-200">
                    <span className="text-xs text-gray-500">Promedio: </span>
                    <span className="text-2xl font-bold text-blue-600">{prodAgua}</span>
                    <span className="text-xs text-gray-500 ml-1">pacas</span>
                  </div>
                </div>

                <div className="bg-cyan-50 border border-cyan-100 p-5 rounded-2xl" data-testid="conteo-hielo">
                  <h3 className="font-semibold text-cyan-800 mb-4 flex items-center gap-2">
                    <span>🧊</span> Hielo
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Conteo A</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.conteoAHielo || ''}
                        onChange={(e) => setFormData({ ...formData, conteoAHielo: Number(e.target.value) })}
                        className="w-full p-3 border rounded-lg text-lg font-semibold focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        placeholder="0"
                        data-testid="conteo-hielo-a"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Conteo B</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.conteoBHielo || ''}
                        onChange={(e) => setFormData({ ...formData, conteoBHielo: Number(e.target.value) })}
                        className="w-full p-3 border rounded-lg text-lg font-semibold focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                        placeholder="0"
                        data-testid="conteo-hielo-b"
                      />
                    </div>
                  </div>
                  <div className="mt-4 bg-white rounded-lg p-3 text-center border border-cyan-200">
                    <span className="text-xs text-gray-500">Promedio: </span>
                    <span className="text-2xl font-bold text-cyan-600">{prodHielo}</span>
                    <span className="text-xs text-gray-500 ml-1">pacas</span>
                  </div>
                </div>
              </div>

              {/* Alerta si conteos A y B difieren mucho */}
              {formData.conteoAAgua > 0 && formData.conteoBAgua > 0 && Math.abs(formData.conteoAAgua - formData.conteoBAgua) > 5 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  ⚠️ Diferencia de <strong>{Math.abs(formData.conteoAAgua - formData.conteoBAgua)} pacas</strong> en conteos de agua (A={formData.conteoAAgua}, B={formData.conteoBAgua}). Considerá hacer un tercer conteo.
                </div>
              )}
              {formData.conteoAHielo > 0 && formData.conteoBHielo > 0 && Math.abs(formData.conteoAHielo - formData.conteoBHielo) > 5 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                  ⚠️ Diferencia de <strong>{Math.abs(formData.conteoAHielo - formData.conteoBHielo)} pacas</strong> en conteos de hielo (A={formData.conteoAHielo}, B={formData.conteoBHielo}). Considerá hacer un tercer conteo.
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  ← Atrás
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: Datos del Turno */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">¿Cuánto salió y cuánto quedó?</h2>
                <p className="text-gray-500 text-sm mt-1">Complete los datos del turno y verifique el stock.</p>
              </div>
              <InfoBanner type="info">
                <strong>¿Qué estamos calculando?</strong> El sistema ya sabe cuánto vendió (paso 2). Ahora necesita saber cuánto queda <em>físicamente</em> en bodega para detectar pérdidas.
              </InfoBanner>

              {/* Trabajador y Turno */}
              <div className="bg-gray-50 border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Información del turno</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">👤 Sellador</label>
                    <select
                      value={formData.trabajadorId}
                      onChange={(e) => setFormData({ ...formData, trabajadorId: e.target.value })}
                      className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      disabled={loadingTrabajadores}
                    >
                      <option value="">Seleccionar...</option>
                      {loadingTrabajadores ? (
                        <option value="" disabled>Cargando...</option>
                      ) : (
                        trabajadores.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">🕐 Turno</label>
                    <select
                      value={formData.turno}
                      onChange={(e) => setFormData({ ...formData, turno: e.target.value as 'MANANA' | 'TARDE' | 'NOCHE' })}
                      className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="MANANA">Mañana</option>
                      <option value="TARDE">Tarde</option>
                      <option value="NOCHE">Noche</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Ventas + Stock esperado side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Ventas */}
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-semibold text-red-800">Lo que salió hoy</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">💧 Agua vendida</span>
                      <span className="text-2xl font-bold text-red-700">{stockInicial.ventasAgua}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">🧊 Hielo vendido</span>
                      <span className="text-2xl font-bold text-red-700">{stockInicial.ventasHielo}</span>
                    </div>
                  </div>
                </div>

                {/* Stock esperado */}
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-blue-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-semibold text-blue-800">Lo que debería quedar</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-gray-600 text-sm">💧 Agua</span>
                        <p className="text-xs text-gray-400">
                          {stockInicial.stockIniAgua} + {prodAgua} - {stockInicial.ventasAgua}
                        </p>
                      </div>
                      <span className="text-2xl font-bold text-blue-700">{stockFinEsperadoAgua}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-gray-600 text-sm">🧊 Hielo</span>
                        <p className="text-xs text-gray-400">
                          {stockInicial.stockIniHielo} + {prodHielo} - {stockInicial.ventasHielo}
                        </p>
                      </div>
                      <span className="text-2xl font-bold text-cyan-700">{stockFinEsperadoHielo}</span>
                    </div>
                  </div>
                </div>
              </div>

               {/* Stock físico + Pérdidas side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="step3-sections">
                {/* Stock físico */}
                <div className="border rounded-xl overflow-hidden" data-testid="stock-fisico">
                  <div className="bg-green-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-semibold text-green-800">Stock físico (lo que usted cuenta)</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">💧 Agua</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.stockFinFisicoAgua || ''}
                        onChange={(e) => setFormData({ ...formData, stockFinFisicoAgua: Number(e.target.value) })}
                        className="w-full p-3 border rounded-lg text-lg font-semibold focus:ring-2 focus:ring-green-500"
                        placeholder="0"
                        data-testid="stock-fisico-agua"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">🧊 Hielo</label>
                      <input
                        type="number"
                        min="0"
                        value={formData.stockFinFisicoHielo || ''}
                        onChange={(e) => setFormData({ ...formData, stockFinFisicoHielo: Number(e.target.value) })}
                        className="w-full p-3 border rounded-lg text-lg font-semibold focus:ring-2 focus:ring-green-500"
                        placeholder="0"
                        data-testid="stock-fisico-hielo"
                      />
                    </div>
                  </div>
                </div>

                {/* Pérdidas */}
                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-orange-50 px-4 py-2.5 border-b">
                    <h3 className="text-sm font-semibold text-orange-800">Pérdidas del turno</h3>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-gray-400 mb-3">
                      <span></span>
                      <span>💧 Agua</span>
                      <span>🧊 Hielo</span>
                    </div>
                    <div className="space-y-2">
                      {[
                        { label: 'Rotas', keyA: 'rotasAgua', keyH: 'rotasHielo' },
                        { label: 'Filtradas', keyA: 'filtradasAgua', keyH: 'filtradasHielo' },
                        { label: 'Consumo', keyA: 'consumoInternoAgua', keyH: 'consumoInternoHielo' },
                      ].map(({ label, keyA, keyH }) => (
                        <div key={label} className="grid grid-cols-3 gap-2 items-center">
                          <span className="text-sm text-gray-700">{label}</span>
                          <input
                            type="number"
                            min="0"
                            value={formData[keyA as keyof FormData] || ''}
                            onChange={(e) => setFormData({ ...formData, [keyA]: Number(e.target.value) })}
                            className="p-2 border rounded-lg text-center"
                            placeholder="0"
                            data-testid={`perdidas-${keyA}`}
                          />
                          <input
                            type="number"
                            min="0"
                            value={formData[keyH as keyof FormData] || ''}
                            onChange={(e) => setFormData({ ...formData, [keyH]: Number(e.target.value) })}
                            className="p-2 border rounded-lg text-center"
                            placeholder="0"
                            data-testid={`perdidas-${keyH}`}
                          />
                        </div>
                      ))}
                    </div>
                    {(perdidasAgua > 0 || perdidasHielo > 0) && (
                      <div className="border-t mt-3 pt-3 flex justify-between text-sm font-semibold">
                        <span className="text-orange-700">Total pérdidas</span>
                        <span className="text-orange-700">💧 {perdidasAgua} &nbsp; 🧊 {perdidasHielo}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  ← Atrás
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  Ver resumen →
                </button>
              </div>
            </div>
          )}

          {/* PASO 4: Conciliación */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Balance del día</h2>
                <p className="text-gray-500 text-sm mt-1">Verifique que todas las cuentas cuadren antes de guardar.</p>
              </div>
              <InfoBanner type="tip">
                <strong>¿Por qué las cuentas podrían no dar?</strong> Diferencias normales: roturas, filtraciones, conteos incorrectos. Si la diferencia es grande, revise los conteos del paso 2 antes de guardar.
              </InfoBanner>

              {/* Status */}
              <div
                className={`p-5 rounded-xl text-center border-2 ${
                  conciliation.status === 'ok'
                    ? 'bg-green-50 border-green-200'
                    : conciliation.status === 'warning'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-red-50 border-red-200'
                }`}
              >
                <p className="text-4xl mb-2">
                  {conciliation.status === 'ok' ? '✅' : conciliation.status === 'warning' ? '⚠️' : '🚩'}
                </p>
                <p
                  className={`font-bold text-xl ${
                    conciliation.status === 'ok'
                      ? 'text-green-700'
                      : conciliation.status === 'warning'
                        ? 'text-amber-700'
                        : 'text-red-700'
                  }`}
                >
                  {conciliation.message}
                </p>
                {conciliation.status === 'ok' && (
                  <p className="text-sm text-green-600 mt-2">Las cuentas dan exacto. Lo que entró = lo que salió + lo que quedó.</p>
                )}
              </div>

              {/* Reportar diferencia (Paso 4) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {conciliation.status !== 'ok' ? 'Explicar diferencia' : 'Observaciones'}
                </label>
                <textarea
                  value={formData.obs}
                  onChange={(e) => setFormData({ ...formData, obs: e.target.value })}
                  className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    conciliation.status === 'danger' ? 'border-red-300 focus:ring-red-500' :
                    conciliation.status === 'warning' ? 'border-amber-300 focus:ring-amber-500' :
                    ''
                  }`}
                  rows={conciliation.status !== 'ok' ? 3 : 2}
                  placeholder={
                    conciliation.status !== 'ok'
                      ? 'Explicá la causa de la diferencia (roturas, filtraciones, error de conteo, consumo...)'
                      : 'Observaciones opcionales...'
                  }
                />
              </div>

              {/* Balance unificado agua + hielo */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 border-b">
                  <h3 className="font-semibold text-gray-800">Balance del día</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-5 py-3 font-semibold text-gray-600">Concepto</th>
                        <th className="text-right px-5 py-3 font-semibold text-blue-700">💧 Agua</th>
                        <th className="text-right px-5 py-3 font-semibold text-cyan-700">🧊 Hielo</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="px-5 py-3 text-gray-600">Stock inicial</td>
                        <td className="px-5 py-3 text-right font-semibold">{stockInicial.stockIniAgua}</td>
                        <td className="px-5 py-3 text-right font-semibold">{stockInicial.stockIniHielo}</td>
                      </tr>
                      <tr className="border-b bg-green-50">
                        <td className="px-5 py-3 text-green-700">+ Producción</td>
                        <td className="px-5 py-3 text-right font-semibold text-green-700">{prodAgua}</td>
                        <td className="px-5 py-3 text-right font-semibold text-green-700">{prodHielo}</td>
                      </tr>
                      <tr className="border-b bg-red-50">
                        <td className="px-5 py-3 text-red-700">- Ventas</td>
                        <td className="px-5 py-3 text-right font-semibold text-red-700">{stockInicial.ventasAgua}</td>
                        <td className="px-5 py-3 text-right font-semibold text-red-700">{stockInicial.ventasHielo}</td>
                      </tr>
                      <tr className="border-b font-semibold bg-blue-50">
                        <td className="px-5 py-3 text-blue-800">= Stock esperado</td>
                        <td className="px-5 py-3 text-right font-bold text-blue-700 text-lg">{stockFinEsperadoAgua}</td>
                        <td className="px-5 py-3 text-right font-bold text-cyan-700 text-lg">{stockFinEsperadoHielo}</td>
                      </tr>
                      {(perdidasAgua > 0 || perdidasHielo > 0) && (
                        <>
                          <tr className="border-b bg-orange-50">
                            <td className="px-5 py-3 text-orange-700">- Pérdidas</td>
                            <td className="px-5 py-3 text-right font-semibold text-orange-700">{perdidasAgua}</td>
                            <td className="px-5 py-3 text-right font-semibold text-orange-700">{perdidasHielo}</td>
                          </tr>
                          <tr className="border-b font-semibold">
                            <td className="px-5 py-3 text-gray-700">= Debería quedar</td>
                            <td className="px-5 py-3 text-right font-bold">{stockFinEsperadoAgua - perdidasAgua}</td>
                            <td className="px-5 py-3 text-right font-bold">{stockFinEsperadoHielo - perdidasHielo}</td>
                          </tr>
                        </>
                      )}
                      <tr className="border-b bg-green-50">
                        <td className="px-5 py-3 text-green-700">Stock físico contado</td>
                        <td className="px-5 py-3 text-right font-semibold text-green-700">{formData.stockFinFisicoAgua}</td>
                        <td className="px-5 py-3 text-right font-semibold text-green-700">{formData.stockFinFisicoHielo}</td>
                      </tr>
                      <tr className="font-bold text-lg bg-gray-100">
                        <td className="px-5 py-4 text-gray-800">Diferencia</td>
                        <td className={`px-5 py-4 text-right ${diferenciaAgua === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {diferenciaAgua === 0 ? '0 ✅' : `${diferenciaAgua > 0 ? '-' : '+'}${Math.abs(diferenciaAgua)}`}
                        </td>
                        <td className={`px-5 py-4 text-right ${diferenciaHielo === 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {diferenciaHielo === 0 ? '0 ✅' : `${diferenciaHielo > 0 ? '-' : '+'}${Math.abs(diferenciaHielo)}`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Diagnóstico de diferencia */}
              {conciliation.status !== 'ok' && (
                <div className={`p-4 rounded-lg text-sm border ${
                  conciliation.status === 'danger' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}>
                  <p className={`font-semibold mb-2 ${
                    conciliation.status === 'danger' ? 'text-red-700' : 'text-amber-700'
                  }`}>🔍 Posibles causas de la diferencia:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    {diferenciaAgua > 0 && (
                      <li className="text-red-700">Faltan {diferenciaAgua} paca(s) de agua → ¿faltan ventas por registrar? ¿el sellador reportó producción de más?</li>
                    )}
                    {diferenciaAgua < 0 && (
                      <li className="text-red-700">Sobran {Math.abs(diferenciaAgua)} paca(s) de agua → ¿ventas anotadas de más? ¿producción mal contada por el sellador?</li>
                    )}
                    {diferenciaHielo > 0 && (
                      <li className="text-red-700">Faltan {diferenciaHielo} paca(s) de hielo → ¿faltan ventas por registrar? ¿el sellador reportó producción de más?</li>
                    )}
                    {diferenciaHielo < 0 && (
                      <li className="text-red-700">Sobran {Math.abs(diferenciaHielo)} paca(s) de hielo → ¿ventas anotadas de más? ¿producción mal contada por el sellador?</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Comisiones */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 border-b">
                  <h3 className="font-semibold text-gray-800">Comisiones estimadas</h3>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                      <p className="text-sm font-semibold text-purple-700 mb-3">👤 {selectedTrabajador?.nombre || 'Sellador'}</p>
                      {selectedTrabajador?.tipoPago === 'FIJO' ? (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600">💰 Salario fijo</span>
                            <span className="text-2xl font-bold text-purple-700">{formatCurrency(Number(selectedTrabajador.salarioFijo))}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">No aplica comisión por producción (pago fijo por turno)</p>
                        </div>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">💧 {prodAgua} × ${selectedTrabajador?.comPacaAgua || 200}</span>
                            <span className="font-semibold">{formatCurrency(comAgua)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">🧊 {prodHielo} × ${selectedTrabajador?.comPacaHielo || 200}</span>
                            <span className="font-semibold">{formatCurrency(comHielo)}</span>
                          </div>
                          {selectedTrabajador?.tipoPago === 'MIXTO' && (
                            <div className="flex justify-between text-purple-600">
                              <span>➕ Salario base</span>
                              <span className="font-semibold">{formatCurrency(Number(selectedTrabajador.salarioFijo))}</span>
                            </div>
                          )}
                          <div className="border-t pt-2 flex justify-between font-bold text-purple-700 text-lg">
                            <span>Total</span>
                            <span>{formatCurrency(comisionTotal + (selectedTrabajador?.tipoPago === 'MIXTO' ? Number(selectedTrabajador.salarioFijo) : 0))}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                      <p className="text-sm font-semibold text-indigo-700 mb-1">🚚 Repartidor(es)</p>
                      {repartidores.length > 0 ? (
                        <div className="space-y-3 text-sm">
                          {repartidores.map((r) => {
                            const comAgua = r.entregasAgua * r.comPacaAgua
                            const comHielo = r.entregasHielo * r.comPacaHielo
                            return (
                              <div key={r.id} className="bg-white/60 rounded-lg p-2.5">
                                <p className="font-semibold text-indigo-700 text-xs mb-1">{r.nombre} <span className="font-normal text-gray-400">(rate {formatCurrency(r.comPacaAgua)}/{formatCurrency(r.comPacaHielo)})</span></p>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">💧 {r.entregasAgua} × {formatCurrency(r.comPacaAgua)}</span>
                                    <span className="font-semibold">{formatCurrency(comAgua)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-gray-600">🧊 {r.entregasHielo} × {formatCurrency(r.comPacaHielo)}</span>
                                    <span className="font-semibold">{formatCurrency(comHielo)}</span>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                          <div className="border-t pt-2 flex justify-between font-bold text-indigo-700 text-base">
                            <span>Total</span>
                            <span>= {formatCurrency(comRepartTotal)}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">Sin embarques hoy</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  ← Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 text-lg"
                >
                  {submitting ? 'Guardando...' : '✓ Confirmar y Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: 1/3 width, sticky on desktop */}
        <div className="hidden lg:block">
          <div className="sticky top-6">{renderBalanceCard()}</div>
        </div>

        {/* Mobile/Tablet: Balance card at bottom of each step */}
        <div className="lg:hidden mt-6">{renderBalanceCard()}</div>
      </div>
      {modal}
      <ProduccionEditModal
        key={editRegistro?.id}
        open={!!editRegistro}
        onClose={() => setEditRegistro(null)}
        registro={editRegistro}
        onSaved={() => {
          fetchProducciones()
          fetchPreview()
        }}
      />
    </div>
  )
}
