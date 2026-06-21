'use client'

import { generateUUID } from '@/lib/uuid'
import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { Modal } from '@/components/modal'
import { offlineDb, queuePedidoOffline } from '@/lib/db/offline'
import { syncWithServer, isOnline } from '@/lib/db/sync'
import { logger } from '@/lib/logger'
import { PRODUCTO_INFO, DEFAULT_PRICES, getProductosForCanal } from '@/lib/prices'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { fetchResilient } from '@/lib/fetch-resilient'
import { MoneyDisplay } from '@/components/money-display'
import { useGpsCapture } from '@/hooks/use-gps-capture'
import { formatGPSError } from '@/lib/gps'

interface RepartidorClientProps {
  trabajador: { id: string; nombre: string }
  embarque: {
    id: string
    numero: number
    ruta?: { nombre: string } | null
    pacasAgua: number
    pacasHielo: number
    codigoVisita?: string | null
    // Bloque 2: orden optimizado por TSP.
    ordenVisita?: {
      pedidoIds: string[]
      distanciaKm: number
      iteraciones: number
      sinCoords: string[]
      generadoEn: string
    } | null
    optimizadoEn?: string | null
    pedidos: Array<{
      id: string
      numero: number
      cliente: {
        id: string
        nombre: string
        telefono: string
        direccion?: string | null
        lat?: number | null
        lng?: number | null
        linkUbicacion?: string | null
      }
      estado: string
      estadoEntrega: string
      estadoPago: string
      origen: string
      total: number
      saldo: number
      totalPagado: number
      items: Array<{ producto: string; cantPedido: number; cantEntrega: number; precio: number; subtotal: number }>
      cPacaAguaPed: number
      cPacaHieloPed: number
      cBotellonFabPed: number
      cBotellonDomPed: number
      cBolsaAguaPed: number
      cBolsaHieloPed: number
    }>
  } | null
  userRole?: string
}

const METODOS_PAGO = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO'] as const

export function RepartidorClient({ trabajador, embarque, userRole }: RepartidorClientProps) {
  const [showVentaLibre, setShowVentaLibre] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [online, setOnline] = useState(isOnline())
  // Bloque 2: optimizando ruta
  const [optimizando, setOptimizando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Venta libre form state
  const [clienteId, setClienteId] = useState('CONSUMIDOR_FINAL')
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [pagos, setPagos] = useState<{ metodo: string; monto: number }[]>([])
  const [fotoBase64, setFotoBase64] = useState<string | null>(null)
  const [obs, setObs] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [productosConfig, setProductosConfig] = useState<Array<{ codigo: string; aplicaDomicilio: boolean }>>([])

  useEffect(() => {
    fetch(`/api/productos/configs`)
      .then(r => r.json())
      .then(d => { if (d.success && d.productos) setProductosConfig(d.productos) })
      .catch(() => {})
  }, [])

  const productosDomicilioIds = getProductosForCanal('DOMICILIO', productosConfig)
  const productosDomicilio = new Set(productosDomicilioIds.map(id => PRODUCTO_INFO[id].codigo))

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    updatePendingCount()
    const interval = setInterval(updatePendingCount, 5000)
    return () => clearInterval(interval)
  }, [])

  const updatePendingCount = useCallback(async () => {
    const count = await offlineDb.pedidos.where('syncStatus').equals('pending').count()
    setPendingCount(count)
  }, [])

  const handleSync = async () => {
    if (!online) {
      toast.error('Sin conexión. Conéctate para sincronizar.')
      return
    }
    setSyncing(true)
    try {
      const result = await syncWithServer()
      toast.success(`Sincronizado: ${result.synced} ok, ${result.conflicts} conflictos, ${result.failed} fallos`)
      updatePendingCount()
    } catch (e) {
      logger.error({ err: e }, 'Sync error')
      toast.error('Error sincronizando')
    } finally {
      setSyncing(false)
    }
  }

  const { coordinates, error: gpsError, loading: gpsLoading, capture: captureGPS, reset: resetGps } = useGpsCapture()

  useEffect(() => {
    if (gpsError) {
      toast.error(formatGPSError(gpsError.code))
    }
  }, [gpsError])

  const handleFotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      if (result) {
        setFotoBase64(result)
        toast.success('Foto capturada')
      }
    }
    reader.readAsDataURL(file)
  }

  const calcularTotal = () => {
    return Object.entries(cantidades).reduce((sum, [prod, cant]) => {
      if (cant <= 0) return sum
      const precio = DEFAULT_PRICES[prod] || 0
      return sum + cant * precio
    }, 0)
  }

  const total = calcularTotal()

  const handleVentaLibreSubmit = async () => {
    if (total <= 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    if (!embarque) {
      toast.error('No tienes un embarque abierto')
      return
    }
    if (!fotoBase64) {
      toast.error('Toma una foto de la entrega')
      return
    }
    if (!coordinates) {
      toast.error('Captura el GPS')
      return
    }

    setSubmitting(true)

    const items = Object.entries(cantidades)
      .filter(([, cant]) => cant > 0)
      .map(([producto, cantidad]) => ({ producto, cantidad }))

    try {
      if (online) {
        // Online: usa fetchResilient para manejar fallos transitorios de red.
        // Si la red cae durante la request, encola automáticamente y retorna status='offline'.
        const result = await fetchResilient<{ success: boolean; error?: { message?: string } }>(
          '/api/pedidos/venta-libre',
          {
            method: 'POST',
            body: {
              clienteId,
              items,
              pagos,
              embarqueId: embarque.id,
              obs,
              fotoEntrega: fotoBase64,
              gpsLat: coordinates.lat,
              gpsLng: coordinates.lng,
              offlineId: generateUUID(),
            },
            localEndpoint: 'venta-libre',
          }
        )

        if (result.status === 'ok') {
          toast.success('Venta libre registrada')
          setShowVentaLibre(false)
          resetForm()
          return
        }

        if (result.status === 'offline') {
          toast.info('Sin conexión. Venta encolada, se enviará al recuperar la red.')
          setShowVentaLibre(false)
          resetForm()
          return
        }

        // status === 'error'
        toast.error(result.error || 'Error registrando venta')
        return
      } else {
        // Offline: queue in Dexie
        await queuePedidoOffline({
          clienteId,
          items: items as { producto: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO'; cantidad: number }[],
          origen: 'VENTA_LIBRE',
          canal: 'DOMICILIO',
          embarqueId: embarque.id,
          pagos: pagos as { metodo: 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'BONO'; monto: number }[],
          total,
          estado: 'ENTREGADO',
          fotoEntrega: fotoBase64,
          gpsLat: coordinates.lat,
          gpsLng: coordinates.lng,
          obs,
        })
        toast.success('Venta guardada offline. Se sincronizará al recuperar conexión.')
        setShowVentaLibre(false)
        resetForm()
        updatePendingCount()
      }
    } catch (e) {
      logger.error({ err: e }, 'Error venta libre')
      toast.error('Error registrando venta')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setClienteId('CONSUMIDOR_FINAL')
    setCantidades({})
    setPagos([])
    setFotoBase64(null)
    setObs('')
    resetGps()
  }

  const addPago = (metodo: string, monto: number) => {
    setPagos(prev => [...prev, { metodo, monto }])
  }

  const removePago = (idx: number) => {
    setPagos(prev => prev.filter((_, i) => i !== idx))
  }

  const getItemsFromPedido = (pedido: NonNullable<RepartidorClientProps['embarque']>['pedidos'][number]) => {
    if (pedido.items && pedido.items.length > 0) {
      return pedido.items.filter(i => i.cantPedido > 0)
    }
    const legacy: { producto: string; cantPedido: number }[] = []
    if (pedido.cPacaAguaPed > 0) legacy.push({ producto: 'PACA_AGUA', cantPedido: pedido.cPacaAguaPed })
    if (pedido.cPacaHieloPed > 0) legacy.push({ producto: 'PACA_HIELO', cantPedido: pedido.cPacaHieloPed })
    const botellonTotal = (pedido.cBotellonFabPed || 0) + (pedido.cBotellonDomPed || 0)
    if (botellonTotal > 0) legacy.push({ producto: 'BOTELLON', cantPedido: botellonTotal })
    if (pedido.cBolsaAguaPed > 0) legacy.push({ producto: 'BOLSA_AGUA', cantPedido: pedido.cBolsaAguaPed })
    if (pedido.cBolsaHieloPed > 0) legacy.push({ producto: 'BOLSA_HIELO', cantPedido: pedido.cBolsaHieloPed })
    return legacy
  }

  // Bloque 2: optimiza el orden de visita del embarque via TSP heurístico.
  // Recarga la página al terminar (Next router.refresh) para que el server
  // component re-fetchee con el nuevo ordenVisita.
  const optimizarOrdenEmbarque = async () => {
    if (!embarque) return
    setOptimizando(true)
    try {
      const r = await fetch(`/api/embarques/${embarque.id}/optimizar-orden`, { method: 'POST' })
      const data = await r.json()
      if (data.success) {
        toast.success(data.mensaje || 'Ruta optimizada')
        // Re-fetch del server component
        window.location.reload()
      } else {
        toast.error(data.error?.message || 'No se pudo optimizar')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setOptimizando(false)
    }
  }

  // Bloque 2: genera la Universal URL de Google Maps Directions con todos
  // los pedidos del embarque en el orden optimizado. Gratis, sin API key.
  // Docs: https://developers.google.com/maps/documentation/urls/get-started
  const openRutaEnGoogleMaps = () => {
    if (!embarque) return
    const pedidoIds = embarque.ordenVisita?.pedidoIds
    const pedidos = pedidoIds
      ? pedidoIds
          .map(id => embarque.pedidos.find(p => p.id === id))
          .filter((p): p is NonNullable<typeof p> => p != null)
      : embarque.pedidos
    const waypoints = pedidos
      .map(p => {
        const lat = p.cliente.lat
        const lng = p.cliente.lng
        if (lat == null || lng == null) return null
        return `${lat.toFixed(6)},${lng.toFixed(6)}`
      })
      .filter((w): w is string => w != null)
    if (waypoints.length === 0) {
      toast.warning('Ningún pedido tiene coordenadas')
      return
    }
    // Universal URL. Android/iOS abre la app de Maps, desktop abre web.
    const url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&waypoints=${waypoints.map(encodeURIComponent).join('%7C')}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  // Bloque 2: si hay orden optimizado, reordenar la lista de pedidos
  // para iterar en el orden TSP. Los pedidos sin coords (no incluidos
  // en el orden) van al final.
  const pedidosOrdenados = (() => {
    if (!embarque) return []
    const ordenIds = embarque.ordenVisita?.pedidoIds
    if (!ordenIds || ordenIds.length === 0) return embarque.pedidos
    const byId = new Map(embarque.pedidos.map(p => [p.id, p]))
    const ordenados: typeof embarque.pedidos = []
    for (const id of ordenIds) {
      const p = byId.get(id)
      if (p) ordenados.push(p)
    }
    // Los que no están en el orden (ej. sin coords) al final
    for (const p of embarque.pedidos) {
      if (!ordenIds.includes(p.id)) ordenados.push(p)
    }
    return ordenados
  })()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Mi Ruta</h1>
          <p className="text-sm text-gray-500">{trabajador.nombre}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`} />
            {online ? 'En línea' : 'Offline'}
          </span>
          {pendingCount > 0 && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Embarque info */}
      {embarque ? (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-sm text-gray-500">Embarque #{embarque.numero}</div>
              <div className="text-lg font-bold text-gray-800">{embarque.ruta?.nombre || 'Sin ruta'}</div>
            </div>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">ABIERTO</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="text-lg font-bold text-blue-700">{embarque.pacasAgua}</div>
              <div className="text-xs text-blue-600">Pacas Agua</div>
            </div>
            <div className="bg-cyan-50 rounded-lg p-2">
              <div className="text-lg font-bold text-cyan-700">{embarque.pacasHielo}</div>
              <div className="text-xs text-cyan-600">Pacas Hielo</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-2">
              <div className="text-lg font-bold text-purple-700">{embarque.pedidos.length}</div>
              <div className="text-xs text-purple-600">Pedidos</div>
            </div>
          </div>
          {embarque.codigoVisita && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
              <span className="text-xs text-yellow-700 font-medium uppercase tracking-wider">Código de visita</span>
              <div className="text-xl font-bold text-yellow-800 tracking-widest">{embarque.codigoVisita}</div>
            </div>
          )}
          {/* Bloque 2: estado de optimización + botones */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
            {embarque.ordenVisita ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Ruta optimizada · {embarque.ordenVisita.distanciaKm.toFixed(1)} km
                </span>
                <button
                  onClick={openRutaEnGoogleMaps}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium hover:bg-emerald-100 transition"
                  data-testid="btn-abrir-ruta-maps"
                >
                  🗺️ Abrir ruta en Maps
                </button>
              </div>
            ) : (
              <button
                onClick={optimizarOrdenEmbarque}
                disabled={optimizando || embarque.pedidos.length < 2}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm font-medium hover:bg-indigo-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="btn-optimizar-orden"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                {optimizando ? 'Optimizando…' : 'Optimizar orden de visita'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow p-6 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m0 0a2 2 0 104 0m0 0a2 2 0 104 0" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900">Sin embarque abierto</h3>
          <p className="text-sm text-gray-500 mt-1">No tienes un embarque abierto actualmente.</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setShowVentaLibre(true)}
          disabled={!embarque}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          Venta Libre
        </button>
        <button
          onClick={handleSync}
          disabled={syncing || !online || pendingCount === 0}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>

      {/* Pedidos list */}
      {embarque && embarque.pedidos && embarque.pedidos.length > 0 && (
        <div className="max-w-7xl mx-auto">
          <div className="px-4 py-3 border-b bg-transparent">
            <h2 className="font-semibold text-gray-800">Pedidos asignados</h2>
          </div>
          <div className="space-y-3">
            {pedidosOrdenados.map((pedido, idx) => {
              const items = getItemsFromPedido(pedido)
              const saldo = Number(pedido.saldo)
              return (
                <div key={pedido.id} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      {/* Bloque 2: badge de orden de visita si está optimizado */}
                      {embarque.ordenVisita && idx < embarque.ordenVisita.pedidoIds.length && (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold mb-1" data-testid={`orden-${idx + 1}`}>
                          {idx + 1}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 font-medium ml-2">#{pedido.numero}</span>
                      <h3 className="font-medium text-gray-800 text-sm">{pedido.cliente.nombre}</h3>
                      <p className="text-xs text-gray-400">{pedido.cliente.telefono}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-gray-800"><MoneyDisplay value={Number(pedido.total)} userRole={userRole} /></span>
                      {saldo > 0 && (
                        <p className="text-xs text-red-500 font-medium">Debe: <MoneyDisplay value={saldo} userRole={userRole} /></p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap mt-2">
                    {items.map((item) => {
                      const meta = getProductoIconConfig(item.producto)
                      const Icon = meta.Icon
                      return (
                        <span key={item.producto} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                          <Icon size={14} /> {item.cantPedido}
                        </span>
                      )
                    })}
                  </div>
                  <div className="flex gap-1 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${pedido.estadoEntrega === 'ENTREGADO' ? 'bg-green-100 text-green-700' : pedido.estadoEntrega === 'EN_RUTA' ? 'bg-sky-100 text-sky-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {pedido.estadoEntrega.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${pedido.estadoPago === 'PAGADO' ? 'bg-green-100 text-green-700' : pedido.estadoPago === 'PARCIAL' ? 'bg-amber-100 text-amber-700' : pedido.estadoPago === 'ANULADO' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-700'}`}>
                      {pedido.estadoPago}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal Venta Libre */}
      <Modal open={showVentaLibre} onClose={() => { setShowVentaLibre(false); resetForm() }} className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center bg-rose-50">
          <h2 className="text-lg font-bold text-rose-800">Venta Libre</h2>
          <button onClick={() => { setShowVentaLibre(false); resetForm() }} className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Productos */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Productos</h3>
            <div className="space-y-2">
              {Object.entries(PRODUCTO_INFO)
                .filter(([, info]) => productosDomicilio.has(info.codigo))
                .map(([id, info]) => {
                  const iconCfg = getProductoIconConfig(info.codigo)
                  const Icon = iconCfg.Icon
                  return (
                    <div key={id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Icon size={20} />
                        <span className="text-sm font-medium text-gray-700">{info.nombre}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCantidades(prev => ({ ...prev, [info.codigo]: Math.max(0, (prev[info.codigo] || 0) - 1) }))}
                          className="w-8 h-8 flex items-center justify-center bg-white border rounded-lg text-gray-600 hover:bg-gray-100"
                        >-</button>
                        <span className="w-8 text-center text-sm font-semibold">{cantidades[info.codigo] || 0}</span>
                        <button
                          onClick={() => setCantidades(prev => ({ ...prev, [info.codigo]: (prev[info.codigo] || 0) + 1 }))}
                          className="w-8 h-8 flex items-center justify-center bg-white border rounded-lg text-gray-600 hover:bg-gray-100"
                        >+</button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Total */}
          <div className="flex justify-between items-center bg-gray-100 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-gray-600">Total</span>
            <span className="text-xl font-bold text-gray-800"><MoneyDisplay value={total} userRole={userRole} /></span>
          </div>

          {/* Pagos */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Pagos</h3>
            {pagos.length > 0 && (
              <div className="space-y-1 mb-2">
                {pagos.map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-green-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-green-700 font-medium">{p.metodo}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-green-800">{formatCurrency(p.monto)}</span>
                      <button onClick={() => removePago(idx)} className="text-red-500 hover:text-red-700 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {METODOS_PAGO.map((metodo) => {
                const usado = pagos.some(p => p.metodo === metodo)
                return (
                  <button
                    key={metodo}
                    onClick={() => {
                      const monto = parseFloat(prompt(`Monto ${metodo}:`) || '0')
                      if (monto > 0) addPago(metodo, monto)
                    }}
                    disabled={usado}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${usado ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    + {metodo}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Foto */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Foto de entrega</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFotoCapture}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`w-full py-3 rounded-lg border-2 border-dashed text-sm font-medium transition ${fotoBase64 ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 bg-gray-50 text-gray-600 hover:border-gray-400'}`}
            >
              {fotoBase64 ? '📷 Foto capturada' : '📷 Toma una foto'}
            </button>
            {fotoBase64 && (
              <img src={fotoBase64} alt="Entrega" className="mt-2 w-full h-32 object-cover rounded-lg" />
            )}
          </div>

          {/* GPS */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Ubicación GPS</h3>
            <button
              onClick={captureGPS}
              disabled={gpsLoading}
              className={`w-full py-3 rounded-lg border-2 border-dashed text-sm font-medium transition ${coordinates ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 bg-gray-50 text-gray-600 hover:border-gray-400'} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {gpsLoading ? 'Obteniendo ubicación...' : coordinates ? `📍 ${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}` : '📍 Capturar GPS'}
            </button>
          </div>

          {/* Observaciones */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Observaciones</h3>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              rows={2}
              placeholder="Notas opcionales..."
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleVentaLibreSubmit}
            disabled={submitting}
            className="w-full py-3 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition disabled:opacity-50"
          >
            {submitting ? 'Guardando...' : online ? 'Registrar Venta' : 'Guardar Offline'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
