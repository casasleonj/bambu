'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { fetchRequiereFotoEntrega } from '@/lib/client/config-client'
import { Modal } from '@/components/modal'
import { PedidoClienteDisplay } from '@/components/pedido-cliente-display'
import { FotoEntregaModal } from '@/components/foto-entrega-modal'
import { ErrorState } from '@/components/error-state'
import { SkeletonPage, SkeletonCard } from '@/components/skeleton'
import { Tooltip, InfoBanner } from '@/components/tooltip'
import { useConfirm } from '@/components/confirm-modal'
import { SmartDateFilter } from '@/components/smart-date-filter'
import { PedidoFilters } from './pedido-filters'
import { PedidoTable } from './pedido-table'
import { FiadosTable } from './fiados-table'
import { AlertasTable } from './alertas-table'
import { calcularAlertas } from './alertas-utils'

import type { Pedido, Embarque, Cliente } from './types'
import { getPresetDate, getTodayString } from '@/lib/dates'
import { usePedidos } from '@/hooks/use-pedidos'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { useCrearPedido } from '@/hooks/use-crear-pedido'
import { useAnularPedido } from '@/hooks/use-anular-pedido'
import { useCancelarPedido } from '@/hooks/use-cancelar-pedido'
import { useAsignarEmbarque } from '@/hooks/use-asignar-embarque'
import { useEntregarPedido } from '@/hooks/use-entregar-pedido'
import { useReconnectHandler } from '@/hooks/use-reconnect-handler'
import { usePollingRefetch } from '@/hooks/use-polling-refetch'
import { GpsCaptureModal } from '@/components/gps-capture-modal'

const PedidoFormUnified = dynamic(() => import('@/components/pedido-form-unified').then(m => m.PedidoFormUnified), { ssr: false })
import type { PedidoInicial, PedidoUnifiedData } from '@/components/pedido-form-unified'

export function PedidosClient() {
  const params = useShallowSearchParams()
  const { confirm, modal: confirmModal } = useConfirm()
  const { data: session } = useSession()
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? null
  const router = useRouter()

  const [showModal, setShowModal] = useState(false)
  const [showVentaRapida, setShowVentaRapida] = useState(false)
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [preciosActuales, setPreciosActuales] = useState<Record<string, { precio: number; origen: string }>>({})
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [embarques, setEmbarques] = useState<Embarque[]>([])
  const [showEmbarqueModal, setShowEmbarqueModal] = useState(false)
  const [selectedPedidoForEmbarque, setSelectedPedidoForEmbarque] = useState<string | null>(null)
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null)
  const [selectedEmbarqueId, setSelectedEmbarqueId] = useState('')
  const tabFromUrl = params.get('tab')
  const initialTab = tabFromUrl === 'fiados' || tabFromUrl === 'alertas' ? tabFromUrl : 'hoy'
  const [activeTab, setActiveTab] = useState<'hoy' | 'fiados' | 'alertas'>(initialTab)
  const [fabOpen, setFabOpen] = useState(false)
  const [fabHoverable, setFabHoverable] = useState(false)
  const [modalKey, setModalKey] = useState(0)

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    setFabHoverable(mq.matches)
    const handler = (e: MediaQueryListEvent) => setFabHoverable(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const [pedidoInicial, setPedidoInicial] = useState<PedidoInicial | undefined>(undefined)
  const anularMotivoRef = useRef<string>('')
  const anularDevolverStockRef = useRef<boolean>(false)
  // Foto entrega (admin) — when REQUIERE_FOTO_ENTREGA is on, ENTREGADO flow shows the modal first.
  const [showFotoEntrega, setShowFotoEntrega] = useState(false)
  const [showGpsCapture, setShowGpsCapture] = useState(false)
  const [pedidoParaEntregar, setPedidoParaEntregar] = useState<Pedido | null>(null)
  const [fotoParaEntregar, setFotoParaEntregar] = useState<string | null>(null)
  const [requiereFotoEntrega, setRequiereFotoEntrega] = useState(false)
  const [gpsConfig, setGpsConfig] = useState({
    radiusMeters: 30,
    requerirGps: false,
    permitirSinGpsConJustificacion: true,
  })
  const [limiteGlobalFiados, setLimiteGlobalFiados] = useState<number>(LIMITE_FIADOS_DEFAULT)
  // Safety net: on slow networks the initial fetch may hang. After 15s we stop
  // showing the skeleton and surface a retry UI so the user is never stuck.
  const [loadTimeoutReached, setLoadTimeoutReached] = useState(false)

  // Fechas desde URL (fuente de verdad)
  const desdeUrl = params.get('desde')
  const hastaUrl = params.get('hasta')

  const filtroTipo = params.getAll('tipo')
  const filtroOrigen = params.getAll('origen')
  const filtroEstadoEntrega = params.getAll('estadoEntrega')
  const filtroEstadoPago = params.getAll('estadoPago')
  const search = params.get('search') || ''
  const clienteIdFromUrl = params.get('clienteId')
  const openPedidoParam = params.get('openPedido')
  const allFromUrl = params.get('all') === 'true'

  // Filtros derivados de la URL (fuente de verdad)
  const pedidoFilterParams = useMemo(() => ({
    desde: desdeUrl || undefined,
    hasta: hastaUrl || undefined,
    tipo: filtroTipo.length > 0 ? filtroTipo : undefined,
    origen: filtroOrigen.length > 0 ? filtroOrigen : undefined,
    estadoEntrega: filtroEstadoEntrega.length > 0 ? filtroEstadoEntrega : undefined,
    estadoPago: filtroEstadoPago.length > 0 ? filtroEstadoPago : undefined,
    search: search || undefined,
    clienteId: clienteIdFromUrl || undefined,
  }), [desdeUrl, hastaUrl, filtroTipo, filtroOrigen, filtroEstadoEntrega, filtroEstadoPago, search, clienteIdFromUrl])

  // Use pedidos hook for data fetching. `all` disables the server's
  // default-to-today fallback so "Limpiar" really muestra todo el histórico.
  // Tabs 'fiados' and 'alertas' must always show the full historical dataset
  // (their own local period filters refine the result). Tab 'hoy' respects the
  // URL date filter for the daily operation view.
  const fetchAllForTab = activeTab !== 'hoy'
  const {
    pedidos: pedidosRaw,
    loading,
    error: fetchError,
    refetch,
    hasLoadedOnce,
  } = usePedidos(pedidoFilterParams, { autoFetch: false, all: allFromUrl || fetchAllForTab })
  const pedidos = pedidosRaw as Pedido[]

  // Independent datasets for Fiados and Alertas tabs. They always fetch the
  // full historical dataset scoped server-side so that their badges stay live
  // regardless of which tab is active or which filters are applied in Pedidos.
  const {
    pedidos: pedidosFiadosRaw,
    loading: loadingFiados,
    error: errorFiados,
    refetch: refetchFiados,
  } = usePedidos({ scope: 'fiados' }, { all: true, autoFetch: true })
  const pedidosFiados = pedidosFiadosRaw as Pedido[]

  const {
    pedidos: pedidosAlertasRaw,
    loading: loadingAlertas,
    error: errorAlertas,
    refetch: refetchAlertas,
  } = usePedidos({ scope: 'alertas' }, { all: true, autoFetch: true })
  const pedidosAlertas = pedidosAlertasRaw as Pedido[]

  // Badges reflect the total unfiltered counts, derived from the live datasets.
  const fiadosCount = useMemo(
    () => new Set(pedidosFiados.map((p) => p.clienteId)).size,
    [pedidosFiados]
  )
  const alertasCount = useMemo(() => calcularAlertas(pedidosAlertas).length, [pedidosAlertas])

  // Polling: refetch all three datasets every 30s (replaces SSE to cut Vercel cost).
  // Critical screen for the repartidor; faster than the 60s default.
  // Each dataset refetches unconditionally because we no longer filter by
  // event type; this is a trade-off for simpler infrastructure.
  usePollingRefetch(() => {
    refetch()
    refetchFiados()
    refetchAlertas()
    fetchClientes()
    fetchEmbarques()
  }, 30_000)

  // Refetch all datasets on SSE reconnect (Vercel Hobby 60s cycle). The client
  // may have missed realtime events while disconnected.
  useReconnectHandler(() => {
    refetch()
    refetchFiados()
    refetchAlertas()
    fetchClientes()
    fetchEmbarques()
  })

  // Auto-open pedido from URL param
  useEffect(() => {
    if (!openPedidoParam || pedidos.length === 0) return
    const pedido = pedidos.find(p => p.id === openPedidoParam || p.numero.toString() === openPedidoParam)
    if (pedido) {
      handleDetail(pedido)
      params.set({ openPedido: undefined }, { history: 'replace' })
    }
  }, [openPedidoParam, pedidos, params])

  const updateFilter = useCallback((key: string, value: string) => {
    const current = params.getAll(key)
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    params.set({ [key]: next.length > 0 ? next : undefined }, { history: 'push' })
  }, [params])

  const setSingleFilter = useCallback((key: string, value: string) => {
    params.set({ [key]: value }, { history: 'push' })
  }, [params])

  const setHoyFilter = useCallback((key: string, value: string) => {
    const today = getTodayString()
    params.set({ [key]: value, desde: today, hasta: today }, { history: 'push' })
  }, [params])

  const updateSearch = useCallback((value: string) => {
    params.set({ search: value || undefined }, { history: 'replace' })
  }, [params])

  const updateClienteId = useCallback((value: string | null) => {
    params.set({ clienteId: value || undefined }, { history: 'push' })
  }, [params])

  const clearAllFilters = useCallback(() => {
    setSearchInput('')
    params.set({
      search: undefined,
      clienteId: undefined,
      origen: undefined,
      estadoEntrega: undefined,
      estadoPago: undefined,
      tipo: undefined,
      desde: undefined,
      hasta: undefined,
      all: 'true',
    }, { history: 'push' })
  }, [params])

  const [searchInput, setSearchInput] = useState(search)

  // Wrap refetch to handle initial load
  const fetchPedidos = useCallback(async () => {
    await refetch()
  }, [refetch])

  function redirectIfAuthError(res: Response): boolean {
    if (res.status === 401 || res.status === 403) {
      router.push('/login?reason=expired')
      return true
    }
    return false
  }

  async function fetchClientes(): Promise<Cliente[]> {
    try {
      const res = await fetch('/api/clientes?all=true', { credentials: 'include' })
      if (redirectIfAuthError(res)) return []
      const data = await res.json()
      const list = data.clientes || data.data || []
      setClientes(list)
      return list
    } catch (error) {
      console.error('Error fetching clientes:', error)
      toast.error('Error cargando clientes')
      return []
    }
  }

  async function fetchEmbarques() {
    try {
      const res = await fetch('/api/embarques', { credentials: 'include' })
      if (redirectIfAuthError(res)) return
      const data = await res.json()
      setEmbarques((data.embarques || data.data || []).filter((e: Embarque) => e.estado === 'ABIERTO' || e.estado === 'EN_RUTA'))
    } catch (error) {
      console.error('Error fetching embarques:', error)
    }
  }

  useEffect(() => {
    setSearchInput(search)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        updateSearch(searchInput)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, search, updateSearch])

  // Safety net: force a non-skeleton UI after 15s even if the hook has not
  // reported completion (e.g. hanging fetch on a flaky mobile connection).
  useEffect(() => {
    const id = setTimeout(() => setLoadTimeoutReached(true), 15_000)
    return () => clearTimeout(id)
  }, [])

  // Carga inicial
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await fetchPedidos()
      if (cancelled) return
      const [clientesList] = await Promise.all([fetchClientes(), fetchEmbarques()])
      if (cancelled) return

      const clienteId = params.get('clienteId')
      const negocioId = params.get('negocioId')
      const openNew = params.get('new') === '1'

      if (openNew && clienteId) {
        const cliente = clientesList.find((c: Cliente) => c.id === clienteId)
        if (cliente) {
          setPedidoInicial({
            id: '',
            canal: 'DOMICILIO',
            cliente: {
              id: cliente.id,
              nombre: cliente.nombre,
              telefono: cliente.telefono,
              direccion: cliente.direccion || null,
              barrio: cliente.barrio || null,
            },
            negocioId: negocioId || null,
            items: [],
          })
          setShowModal(true)
          setModalKey(k => k + 1)
        } else {
          toast.error('El cliente seleccionado no está disponible')
        }
        params.set({ new: undefined, clienteId: undefined, negocioId: undefined }, { history: 'replace' })
      } else if (openNew) {
        // new=1 sin clienteId no es un estado válido para abrir el formulario.
        params.set({ new: undefined, negocioId: undefined }, { history: 'replace' })
      }
      // Si solo hay clienteId (sin new=1), se aplica como filtro de lista
      // mediante pedidoFilterParams; no se limpia para que el usuario vea
      // el filtro activo.
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Fetch REQUIERE_FOTO_ENTREGA config (best-effort, default false on error).
    ;(async () => {
      const required = await fetchRequiereFotoEntrega()
      setRequiereFotoEntrega(required)
    })()
  }, [])

  useEffect(() => {
    // Fetch GPS delivery config (best-effort, defaults applied on error).
    ;(async () => {
      try {
        const res = await fetch('/api/config?keys=umbralGpsEntregaMetros,requerirGpsParaEntrega,permitirEntregaSinGpsConJustificacion', { cache: 'no-store' })
        if (!res.ok) return
        const json: unknown = await res.json()
        const data = (json as { data?: Record<string, string> } | null)?.data ?? (json as Record<string, string> | null)
        if (!data || typeof data !== 'object') return
        const parseNumber = (raw: unknown, fallback: number) => {
          const n = Number(raw)
          return Number.isFinite(n) && n > 0 ? n : fallback
        }
        const parseBool = (raw: unknown, fallback: boolean) => {
          if (raw === undefined || raw === null) return fallback
          return String(raw).trim().toLowerCase() === 'true'
        }
        setGpsConfig({
          radiusMeters: parseNumber((data as Record<string, string>)['umbralGpsEntregaMetros'], 30),
          requerirGps: parseBool((data as Record<string, string>)['requerirGpsParaEntrega'], false),
          permitirSinGpsConJustificacion: parseBool((data as Record<string, string>)['permitirEntregaSinGpsConJustificacion'], true),
        })
      } catch {
        // defaults already set
      }
    })()
  }, [])

  useEffect(() => {
    // Fetch global fiado limit (best-effort, default 3 on error).
    ;(async () => {
      try {
        const res = await fetch('/api/config?clave=LIMITE_PEDIDOS_FIADOS_DEFAULT', { cache: 'no-store' })
        if (!res.ok) return
        const json: unknown = await res.json()
        const valor = (json as { data?: { valor?: string } | null } | null)?.data?.valor ?? (json as { valor?: string } | null)?.valor
        const n = Number(valor)
        if (Number.isFinite(n) && n > 0) setLimiteGlobalFiados(n)
      } catch {
        // default already set
      }
    })()
  }, [])

  useEffect(() => {
    let isFetching = false
    const getPollInterval = () => {
      const conn = (navigator as any).connection
      if (!conn) return 60000
      const et = conn.effectiveType // '4g' | '3g' | '2g' | 'slow-2g'
      if (et === '4g') return 60000
      if (et === '3g') return 120000
      // 2g or slow-2g: disable polling, rely on visibilitychange + manual refresh
      return 0
    }

    const intervalMs = getPollInterval()
    if (intervalMs === 0) return // No polling on slow connections

    const interval = setInterval(() => {
      if (!isFetching) {
        isFetching = true
        fetchPedidos().finally(() => { isFetching = false })
      }
    }, intervalMs)
    return () => clearInterval(interval)
  }, [fetchPedidos])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchPedidos()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchPedidos])

  // Sync activeTab with URL query param
  useEffect(() => {
    const currentTab = params.get('tab')
    if (activeTab === 'hoy') {
      if (currentTab) {
        params.set({ tab: undefined }, { history: 'replace' })
      }
    } else if (currentTab !== activeTab) {
      params.set({ tab: activeTab }, { history: 'replace' })
    }
  }, [activeTab, params])

  const { create: crearPedido } = useCrearPedido({
    onSuccess: () => {
      setShowModal(false)
      setShowVentaRapida(false)
      setPedidoInicial(undefined)
      setPedidoEditando(null)
      setShowDetailModal(false)
      fetchPedidos()
      refetchFiados()
      refetchAlertas()
      fetchClientes()
    },
  })

  const { anular: anularPedido } = useAnularPedido({
    onSuccess: () => {
      fetchPedidos()
      refetchFiados()
      refetchAlertas()
    },
  })

  const { cancelar: cancelarPedido } = useCancelarPedido({
    onSuccess: () => {
      setShowDetailModal(false)
      fetchPedidos()
      refetchFiados()
      refetchAlertas()
    },
  })

  const { asignar: asignarEmbarque } = useAsignarEmbarque({
    onSuccess: () => {
      fetchPedidos()
      fetchEmbarques()
    },
  })

  const { entregar } = useEntregarPedido({
    onSuccess: () => {
      setShowDetailModal(false)
      setShowGpsCapture(false)
      setPedidoParaEntregar(null)
      setFotoParaEntregar(null)
      fetchPedidos()
      refetchFiados()
      refetchAlertas()
      toast.success('Pedido entregado con foto')
    },
    onError: (error) => {
      toast.error(error || 'Error registrando entrega')
    },
  })

  async function handlePedidoSubmit(data: PedidoUnifiedData) {
    try {
      const isEdit = data.isEdit && data.pedidoId
      if (isEdit) {
        // Edit uses PUT endpoint directly (not yet migrated to hook)
        const res = await fetch(`/api/pedidos/${data.pedidoId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ items: data.items, obs: data.obs, actualizarCliente: data.actualizarCliente }),
        })
        if (res.ok) {
          setShowModal(false)
          setShowVentaRapida(false)
          setPedidoInicial(undefined)
          setPedidoEditando(null)
          setShowDetailModal(false)
          fetchPedidos()
          fetchClientes()
          toast.success('Pedido actualizado')
        } else {
          const err = await res.json()
          toast.error(err.error?.message || err.error?.formErrors?.[0] || 'Error al guardar')
        }
      } else {
        // Create uses the hook
        const result = await crearPedido(data as any)
        if (!result) return
        setShowModal(false)
        setShowVentaRapida(false)
        setPedidoInicial(undefined)
        setPedidoEditando(null)
        fetchPedidos()
        fetchClientes()
        const msg = data.ventaRapida
          ? (data.pagos?.length === 0 ? 'Venta registrada (pendiente)' : 'Venta cobrada')
          : 'Pedido creado exitosamente'
        toast.success(msg)
      }
    } catch (error) {
      console.error('Error saving pedido:', error)
      toast.error('Error al guardar')
    }
  }

  const pedidosFiltrados = useMemo(() => pedidos.filter((p) => {
    const matchTipo = filtroTipo.length === 0 || filtroTipo.includes(p.tipo)
    const matchOrigen = filtroOrigen.length === 0 || filtroOrigen.includes(p.origen)
    const matchEstadoEntrega = filtroEstadoEntrega.length === 0 || filtroEstadoEntrega.includes(p.estadoEntrega)
    const matchEstadoPago = filtroEstadoPago.length === 0 || filtroEstadoPago.includes(p.estadoPago)
    const matchCliente = !clienteIdFromUrl || p.clienteId === clienteIdFromUrl
    const matchSearch =
      !search ||
      p.nombreCli.toLowerCase().includes(search.toLowerCase()) ||
      p.telefonoCli?.includes(search) ||
      p.numero.toString().includes(search)
    const fechaColombia = p.fecha
      ? new Date(p.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
      : ''
    const matchFecha = !desdeUrl || !hastaUrl || (fechaColombia >= desdeUrl && fechaColombia <= hastaUrl)
    return matchTipo && matchOrigen && matchEstadoEntrega && matchEstadoPago && matchCliente && matchSearch && matchFecha
  }), [pedidos, filtroTipo, filtroOrigen, filtroEstadoEntrega, filtroEstadoPago, clienteIdFromUrl, search, desdeUrl, hastaUrl])

  const hoyStr = useMemo(() => getTodayString(), [])
  const stats = useMemo(() => {
    const fechaEsHoy = (p: Pedido) => {
      if (!p.fecha) return false
      return new Date(p.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) === hoyStr
    }
    const entregadosHoyArr = pedidos.filter(p => p.estadoEntrega === 'ENTREGADO' && fechaEsHoy(p))
    return {
      totalPedidos: pedidos.length,
      pendientes: pedidos.filter(p => p.estadoEntrega === 'PENDIENTE').length,
      enRuta: pedidos.filter(p => p.estadoEntrega === 'EN_RUTA').length,
      entregadosHoy: entregadosHoyArr.length,
      pacasVendidas: pedidos
        .filter(p => p.estadoEntrega === 'ENTREGADO')
        .reduce(
          (acc, p) => acc
            + Number(p.cPacaAguaEnt || 0)
            + Number(p.cPacaHieloEnt || 0)
            + Number(p.cBotellonFabEnt || 0)
            + Number(p.cBotellonDomEnt || 0),
          0
        ),
      fiadoTotal: pedidos
        .filter(p => p.estadoEntrega === 'ENTREGADO' && Number(p.saldo) > 0)
        .reduce((acc, p) => acc + Number(p.saldo), 0),
    }
  }, [pedidos, hoyStr])

  const hasActiveFilters = !!(search || clienteIdFromUrl || filtroTipo.length > 0 || filtroOrigen.length > 0 || filtroEstadoEntrega.length > 0 || filtroEstadoPago.length > 0 || desdeUrl || hastaUrl)

  function getOrigenBadge(origen: string) {
    const styles: Record<string, string> = {
      PEDIDO: 'bg-violet-100 text-violet-700',
      VENTA_RAPIDA: 'bg-fuchsia-100 text-fuchsia-700',
      VENTA_LIBRE: 'bg-rose-100 text-rose-700',
    }
    const labels: Record<string, string> = {
      PEDIDO: 'Pedido',
      VENTA_RAPIDA: 'Venta Rápida',
      VENTA_LIBRE: 'Venta Libre',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[origen] || 'bg-gray-100 text-gray-500'}`}>
        {labels[origen] || origen}
      </span>
    )
  }

  function getEstadoEntregaBadge(estado: string) {
    const styles: Record<string, string> = {
      PENDIENTE: 'bg-yellow-100 text-yellow-800',
      EN_RUTA: 'bg-sky-100 text-sky-800',
      ENTREGADO: 'bg-green-100 text-green-800',
      NO_ENTREGADO: 'bg-orange-100 text-orange-800',
      CANCELADO: 'bg-gray-100 text-gray-600',
      ANULADO: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[estado] || 'bg-gray-100 text-gray-500'}`}>
        {estado.replace('_', ' ')}
      </span>
    )
  }

  function getEstadoPagoBadge(estado: string) {
    const styles: Record<string, string> = {
      PENDIENTE: 'bg-red-100 text-red-800',
      PARCIAL: 'bg-amber-100 text-amber-800',
      PAGADO: 'bg-green-100 text-green-800',
      ANTICIPADO: 'bg-teal-100 text-teal-800',
      VENCIDO: 'bg-rose-100 text-rose-800',
      ANULADO: 'bg-gray-100 text-gray-500',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[estado] || 'bg-gray-100 text-gray-500'}`}>
        {estado}
      </span>
    )
  }

  function getTipoBadge(tipo: string) {
    const styles: Record<string, string> = {
      ENVIO: 'bg-indigo-100 text-indigo-700',
      PUNTO: 'bg-emerald-100 text-emerald-700',
    }
    const labels: Record<string, string> = { ENVIO: 'Envío', PUNTO: 'Punto' }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[tipo] || 'bg-gray-100 text-gray-500'}`}>
        {labels[tipo] || tipo}
      </span>
    )
  }

  function tieneFiado(pedido: Pedido): boolean {
    return pedido.estadoEntrega === 'ENTREGADO' && Number(pedido.saldo) > 0
  }

  function getAlertasPedido(pedido: Pedido): Array<{ tipo: string; label: string; severidad: string }> {
    // Ventas rápidas anónimas no generan alertas (son transacciones de mostrador, no pedidos con cliente)
    if (pedido.origen === 'VENTA_RAPIDA' && pedido.clienteId === 'CONSUMIDOR_FINAL') return []

    const alertas: Array<{ tipo: string; label: string; severidad: string }> = []
    const hoy = new Date().toISOString().slice(0, 10)
    const pedidoFecha = pedido.fecha?.slice(0, 10)

    // 2do / 3ro pedido hoy
    if (pedidoFecha === hoy) {
      const pedidosHoyCliente = pedidos
        .filter(p => p.clienteId === pedido.clienteId && p.fecha?.slice(0, 10) === hoy)
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
      const orden = pedidosHoyCliente.findIndex(p => p.id === pedido.id) + 1

      if (pedidosHoyCliente.length >= 2) {
        if (orden >= 3) {
          alertas.push({ tipo: '3RO_PEDIDO', label: '3ro+ pedido hoy', severidad: 'MEDIA' })
        } else if (orden === 2) {
          alertas.push({ tipo: '2DO_PEDIDO', label: '2do pedido hoy', severidad: 'BAJA' })
        } else if (orden === 1) {
          alertas.push({ tipo: '1ER_PEDIDO', label: '1er pedido hoy', severidad: 'BAJA' })
        }
      }
    }

    // Disputa abierta
    if (pedido.disputaAbierta) {
      alertas.push({ tipo: 'DISPUTA_ABIERTA', label: 'Disputa abierta', severidad: 'ALTA' })
    }

    // Cliente bloqueado (VENCIDO)
    if (pedido.estadoPago === 'VENCIDO') {
      alertas.push({ tipo: 'CLIENTE_BLOQUEADO', label: 'Pago vencido', severidad: 'ALTA' })
    }

    // Monto anómalo
    const promedio = calcularPromedioCliente(pedido.clienteId)
    if (promedio > 0 && Number(pedido.total) > promedio * 2) {
      alertas.push({ tipo: 'MONTO_ANOMALO', label: 'Monto anómalo', severidad: 'ALTA' })
    }

    return alertas
  }

  function calcularPromedioCliente(clienteId: string): number {
    const validos = pedidos.filter(
      (p) => p.clienteId === clienteId && p.estadoEntrega !== 'ANULADO' && p.estadoEntrega !== 'CANCELADO'
    )
    if (validos.length === 0) return 0
    const total = validos.reduce((acc, p) => acc + Number(p.total), 0)
    return total / validos.length
  }

  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function cambiarEstado(id: string, nuevoEstado: string) {
    if (updatingId) return

    if (nuevoEstado === 'EN_RUTA') {
      setShowDetailModal(false)
      setSelectedPedidoForEmbarque(id)
      setSelectedEmbarqueId('')
      setShowEmbarqueModal(true)
      return
    }

    // Confirmaciones con contexto para acciones destructivas
    if (nuevoEstado === 'CANCELADO') {
      const ok = await confirm({
        title: 'Cancelar pedido',
        message: '¿Estás seguro de cancelar este pedido?',
        description: 'El pedido se marcará como cancelado y no se podrá revertir.',
        consequences: [
          'El pedido no se enviará',
          'Se liberará el stock reservado',
          'No se generará factura',
        ],
        variant: 'warning',
        confirmLabel: 'Sí, cancelar',
        cancelLabel: 'No, mantener',
      })
      if (!ok) return
    }

    if (nuevoEstado === 'ANULADO') {
      anularMotivoRef.current = ''
      anularDevolverStockRef.current = false
      const ok = await confirm({
        title: 'Anular pedido entregado',
        message: '¿Estás seguro de anular este pedido?',
        description: 'Esta acción es irreversible y afectará el historial de ventas.',
        details: (
          <div className="space-y-3 w-full">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de anulación *</label>
              <input
                type="text"
                placeholder="Ej: error en facturación, cliente devolvió..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition"
                onChange={(e) => { anularMotivoRef.current = e.target.value }}
                autoFocus
              />
            </div>
          </div>
        ),
        consequences: [
          'Se creará una nota de crédito',
          'Se anulará la factura asociada',
          'El saldo se marcará como cero',
          'Afectará los reportes de ventas',
        ],
        variant: 'destructive',
        confirmLabel: 'Sí, anular',
        cancelLabel: 'No, mantener',
      })
      if (!ok) return
      if (!anularMotivoRef.current.trim()) {
        toast.error('Debes indicar el motivo de anulación')
        return
      }
    }

    setUpdatingId(id)
    try {
      let success = false
      if (nuevoEstado === 'ANULADO') {
        success = await anularPedido({
          pedidoId: id,
          motivo: anularMotivoRef.current.trim(),
          devolverStock: anularDevolverStockRef.current,
        })
      } else if (nuevoEstado === 'CANCELADO') {
        // FIX: cancelar ahora usa su propio POST /cancelar con dedup por
        // estado CANCELADO bajo lock NC (paridad con anular). Antes se
        // reutilizaba PUT /api/pedidos/:id con { estado: 'CANCELADO' },
        // lo que no generaba NC automática y permitía inconsistencias.
        success = await cancelarPedido({ pedidoId: id })
      } else {
        // Other state transitions still use PUT directly (not yet migrated)
        const res = await fetch(`/api/pedidos/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: nuevoEstado }),
        })
        success = res.ok
      }
      if (success) {
        setShowDetailModal(false)
        fetchPedidos()
        if (nuevoEstado !== 'CANCELADO') {
          // El hook useCancelarPedido ya muestra su propio toast.success.
          toast.success(`Estado actualizado a ${nuevoEstado}`)
        }
      } else {
        toast.error('Error actualizando estado')
      }
    } catch (error) {
      console.error('Error cambiando estado:', error)
      toast.error('Error de conexión. Verifica tu internet e intenta de nuevo.')
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleAsignarEmbarque() {
    if (!selectedPedidoForEmbarque || !selectedEmbarqueId) return
    setUpdatingId(selectedPedidoForEmbarque)
    try {
      const success = await asignarEmbarque(selectedPedidoForEmbarque, selectedEmbarqueId)
      if (success) {
        toast.success('Pedido enviado y asignado a embarque')
      }
    } catch (error) {
      console.error('Error asignando embarque:', error)
      toast.error('Error asignando embarque')
    } finally {
      setUpdatingId(null)
      setShowEmbarqueModal(false)
      setSelectedPedidoForEmbarque(null)
      setSelectedEmbarqueId('')
    }
  }

  async function handleDetail(pedido: Pedido) {
    setSelectedPedido(pedido)
    setShowDetailModal(true)

    // Lazy-load factura for the detail modal (issue 3). The list does not
    // eagerly fetch it, so we fetch it when the user opens a pedido.
    try {
      const res = await fetch(`/api/pedidos/${pedido.id}`)
      if (res.ok) {
        const data = await res.json()
        const pedidoConFactura = data.pedido as Pedido | undefined
        if (pedidoConFactura && Array.isArray(pedidoConFactura.items)) {
          setSelectedPedido(prev => {
            if (!prev) return pedidoConFactura
            // Merge detail fields, preserving legacy client fields (nombreCli,
            // telefonoCli, etc.) when the response omits them. This prevents
            // the name from disappearing while the factura loads.
            const merged = { ...prev }
            Object.entries(pedidoConFactura).forEach(([key, value]) => {
              if (value === undefined) return
              // FIX A-5: no pisar items/pagos con arrays vacíos del detalle;
              // el listado ya trae el resumen completo.
              if ((key === 'items' || key === 'pagos') && Array.isArray(value) && value.length === 0) {
                return
              }
              ;(merged as Record<string, unknown>)[key] = value
            })
            return merged
          })
        }
      }
    } catch {
      // Keep showing the list copy if the detail fetch fails.
    }

    // Fetch current prices for comparison
    const items = pedido.items && pedido.items.length > 0
      ? pedido.items.filter(i => i.cantPedido > 0).map(i => ({ codigo: i.producto, cantidad: i.cantPedido }))
      : [
          ...(pedido.cPacaAguaPed > 0 ? [{ codigo: 'PACA_AGUA', cantidad: pedido.cPacaAguaPed }] : []),
          ...(pedido.cPacaHieloPed > 0 ? [{ codigo: 'PACA_HIELO', cantidad: pedido.cPacaHieloPed }] : []),
          ...((pedido.cBotellonFabPed || 0) + (pedido.cBotellonDomPed || 0) > 0 ? [{ codigo: 'BOTELLON', cantidad: (pedido.cBotellonFabPed || 0) + (pedido.cBotellonDomPed || 0) }] : []),
          ...(pedido.cBolsaAguaPed > 0 ? [{ codigo: 'BOLSA_AGUA', cantidad: pedido.cBolsaAguaPed }] : []),
          ...(pedido.cBolsaHieloPed > 0 ? [{ codigo: 'BOLSA_HIELO', cantidad: pedido.cBolsaHieloPed }] : []),
        ]

    if (items.length > 0) {
      try {
        const res = await fetch('/api/precios/resolver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items, canal: pedido.canal }),
        })
        if (res.ok) {
          const data = await res.json()
          setPreciosActuales(data.precios || {})
        }
      } catch {
        setPreciosActuales({})
      }
    }
  }

  /**
   * After the user confirms a delivery photo, proceed to the GPS capture step.
   */
  async function handleFotoConfirm(fotoBase64: string) {
    if (!pedidoParaEntregar) {
      throw new Error('No hay pedido seleccionado')
    }
    setFotoParaEntregar(fotoBase64)
    setShowFotoEntrega(false)
    setShowGpsCapture(true)
  }

  /**
   * After GPS capture/justification, mark the pedido as ENTREGADO via the hook.
   */
  async function handleGpsConfirm(coords: { lat: number; lng: number; accuracy?: number } | null, justificacion?: string) {
    if (!pedidoParaEntregar || !fotoParaEntregar) {
      toast.error('No hay pedido o foto seleccionados')
      return
    }
    const id = pedidoParaEntregar.id
    setUpdatingId(id)
    try {
      const itemsEntregados = (pedidoParaEntregar.items || []).flatMap((i) => {
        const entries: Array<{ producto: string; cantidad: number }> = []
        if (i.cantPedido > 0) entries.push({ producto: i.producto, cantidad: i.cantPedido })
        return entries
      })

      await entregar({
        pedidoId: id,
        tipo: 'COMPLETO',
        itemsEntregados,
        pagos: [],
        fotoEntrega: fotoParaEntregar,
        gpsLat: coords?.lat,
        gpsLng: coords?.lng,
        gpsAccuracy: coords?.accuracy,
        gpsJustificacion: justificacion,
        entregadoConGps: coords !== null,
      })
    } finally {
      setUpdatingId(null)
    }
  }

  if (fetchError) {
    return (
      <ErrorState
        title="Error cargando pedidos"
        message={fetchError || 'No se pudieron cargar los pedidos'}
        errorCode="FETCH_PEDIDOS_ERROR"
        onRetry={() => { fetchPedidos(); fetchClientes(); fetchEmbarques(); }}
        recoveryActions={[
          {
            label: 'Verificar conexión',
            onClick: () => window.location.reload(),
            variant: 'outline',
          },
        ]}
      />
    )
  }

  if (!hasLoadedOnce && loadTimeoutReached) {
    return (
      <ErrorState
        title="La conexión está muy lenta"
        message="Los pedidos están tardando más de lo normal en cargar. Reintentá ahora o verificá tu conexión."
        errorCode="LOAD_TIMEOUT"
        onRetry={() => { setLoadTimeoutReached(false); fetchPedidos(); fetchClientes(); fetchEmbarques(); }}
        recoveryActions={[
          {
            label: 'Verificar conexión',
            onClick: () => window.location.reload(),
            variant: 'outline',
          },
        ]}
      />
    )
  }

  if (!hasLoadedOnce) {
    return <SkeletonPage hasStats hasFilters cardCount={4} />
  }

  if (!hasLoadedOnce) {
    return <SkeletonPage hasStats hasFilters cardCount={4} />
  }

  return (
    <div>
      {/* Header con tabs */}
      <div className="mb-6">
        {/* Banner explicativo para nuevos usuarios */}
        {pedidos.length === 0 && !hasActiveFilters && (
          <InfoBanner type="tip" title="¿Cómo funciona el flujo de pedidos?" className="mb-4">
            <ol className="list-decimal list-inside space-y-1 mt-1">
              <li><strong>Crea un pedido</strong> con los productos y cliente</li>
              <li><strong>Envía el pedido</strong> a un embarque para entrega</li>
              <li><strong>Marca como entregado</strong> cuando el cliente reciba</li>
              <li><strong>Registra el pago</strong> si queda saldo pendiente</li>
            </ol>
          </InfoBanner>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h1 className="text-2xl font-bold text-gray-800">
            {activeTab === 'fiados'
              ? 'Fiados'
              : activeTab === 'alertas'
                ? 'Alertas'
                : getTituloFecha(desdeUrl, hastaUrl, allFromUrl)}
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {[
            { key: 'hoy', label: 'Pedidos', count: pedidosFiltrados.length },
            { key: 'fiados', label: 'Fiados', count: fiadosCount },
            { key: 'alertas', label: 'Alertas', count: alertasCount },
          ].map((tab) => (
            <button
              key={tab.key}
              data-testid={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold text-white bg-gray-400 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Stats - solo en Hoy (siempre sobre todos los pedidos, ignoran filtros activos) */}
      {activeTab === 'hoy' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <button
            onClick={() => setSingleFilter('estadoEntrega', 'PENDIENTE')}
            className="bg-white p-3 rounded-xl shadow text-left hover:shadow-md transition"
          >
            <p className="text-xs text-gray-500">Pendientes</p>
            <p className="text-xl font-bold text-amber-600">{stats.pendientes}</p>
          </button>
          <button
            onClick={() => setSingleFilter('estadoEntrega', 'EN_RUTA')}
            className="bg-white p-3 rounded-xl shadow text-left hover:shadow-md transition"
          >
            <p className="text-xs text-gray-500">En Ruta</p>
            <p className="text-xl font-bold text-sky-600">{stats.enRuta}</p>
          </button>
          <button
            onClick={() => setHoyFilter('estadoEntrega', 'ENTREGADO')}
            className="bg-white p-3 rounded-xl shadow text-left hover:shadow-md transition"
          >
            <p className="text-xs text-gray-500">Entregados Hoy</p>
            <p className="text-xl font-bold text-green-600">{stats.entregadosHoy}</p>
          </button>
          <button
            onClick={() => setHoyFilter('estadoEntrega', 'ENTREGADO')}
            className="bg-white p-3 rounded-xl shadow text-left hover:shadow-md transition"
          >
            <p className="text-xs text-gray-500">Ventas Hoy</p>
            <p className="text-xl font-bold text-emerald-600">{stats.pacasVendidas}</p>
          </button>
          <button
            onClick={() => setSingleFilter('estadoEntrega', 'ENTREGADO')}
            className="bg-white p-3 rounded-xl shadow text-left hover:shadow-md transition"
          >
            <p className="text-xs text-gray-500">Fiado Total</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(stats.fiadoTotal)}</p>
          </button>
          <button
            onClick={() => params.set({ estadoEntrega: undefined }, { history: 'push' })}
            className="bg-white p-3 rounded-xl shadow text-left hover:shadow-md transition"
          >
            <p className="text-xs text-gray-500">Total Pedidos</p>
            <p className="text-xl font-bold text-gray-800">{stats.totalPedidos}</p>
          </button>
        </div>
      )}

      {/* Filtros - solo en Hoy (fuente de verdad URL) */}
      {activeTab === 'hoy' && (
        <div className="bg-white p-4 rounded-xl shadow mb-6 space-y-4">
          <SmartDateFilter />
          <PedidoFilters
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            clientes={clientes.map(c => ({ ...c, direccion: c.direccion ?? null, barrio: c.barrio ?? null }))}
            selectedClienteId={clienteIdFromUrl}
            onClienteSelect={updateClienteId}
            filtroTipo={filtroTipo}
            filtroOrigen={filtroOrigen}
            filtroEstadoEntrega={filtroEstadoEntrega}
            filtroEstadoPago={filtroEstadoPago}
            onUpdateFilter={updateFilter}
            onClearAll={clearAllFilters}
            hideDateFilter={true}
          />
          {clienteIdFromUrl && (() => {
            const cliente = clientes.find(c => c.id === clienteIdFromUrl)
            if (!cliente) return null
            const countCliente = pedidosFiltrados.length
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    <span className="font-bold">{cliente.nombre}</span> — {countCliente} pedido{countCliente !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    {cliente.telefono}{cliente.barrio && ` · ${cliente.barrio}`}
                  </p>
                </div>
                <button
                  onClick={() => updateClienteId(null)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-blue-100 transition"
                >
                  Limpiar
                </button>
              </div>
            )
          })()}
        </div>
      )}

      {/* Contenido por tab */}
      {activeTab === 'hoy' && (
        loading && pedidos.length === 0 ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <PedidoTable
            pedidos={pedidosFiltrados}
            updatingId={updatingId}
            hasActiveFilters={hasActiveFilters}
            userRole={userRole}
            renderOrigenBadge={getOrigenBadge}
            renderEstadoEntregaBadge={getEstadoEntregaBadge}
            renderEstadoPagoBadge={getEstadoPagoBadge}
            getAlertasPedido={getAlertasPedido}
            tieneFiado={tieneFiado}
            onDetail={handleDetail}
            onCambiarEstado={cambiarEstado}
            onCreateClick={() => setShowModal(true)}
          />
        )
      )}
      {activeTab === 'fiados' && (
        <FiadosTable
          clientes={clientes}
          limiteGlobal={limiteGlobalFiados}
          pedidos={pedidosFiados}
          loading={loadingFiados}
          error={errorFiados}
          activeTab={activeTab}
          onPedidosChange={refetchFiados}
          userRole={userRole}
        />
      )}
      {activeTab === 'alertas' && (
        <AlertasTable
          pedidos={pedidosAlertas}
          loading={loadingAlertas}
          error={errorAlertas}
          activeTab={activeTab}
        />
      )}

      {/* Modal Formulario Unificado */}
      <Modal open={showModal || showVentaRapida} onClose={() => { setShowModal(false); setShowVentaRapida(false); setPedidoInicial(undefined) }} className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className={`p-4 border-b flex justify-between items-center ${showVentaRapida ? 'bg-green-50' : 'bg-blue-50'}`}>
          <div>
            <h2 className={`text-xl font-bold ${showVentaRapida ? 'text-green-800' : 'text-blue-800'}`}>
              {showVentaRapida ? '💰 Venta Rápida' : '📦 Nuevo Pedido'}
            </h2>
            <InfoBanner type="info" className="mt-2 text-xs">
              <strong>Venta Rápida</strong> = cliente conocido, paga en el momento.
              <strong> Venta Libre</strong> = consumidor final sin registro (mostrador).
            </InfoBanner>
          </div>
          <button
            onClick={() => { setShowModal(false); setShowVentaRapida(false); setPedidoInicial(undefined) }}
            className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <PedidoFormUnified
            key={`${pedidoInicial?.id || 'new'}-${modalKey}`}
            contexto={showVentaRapida ? 'PUNTO' : 'DOMICILIO'}
            clientes={clientes}
            onSubmit={handlePedidoSubmit}
            onClose={() => { setShowModal(false); setShowVentaRapida(false); setPedidoInicial(undefined) }}
            pedidoInicial={pedidoInicial}
          />
        </div>
      </Modal>

      {/* Modal Asignar Embarque */}
      <Modal open={showEmbarqueModal} onClose={() => { setShowEmbarqueModal(false); setSelectedPedidoForEmbarque(null); setSelectedEmbarqueId('') }} className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold mb-4">Asignar a Embarque</h2>
        <p className="text-sm text-gray-500 mb-2">Selecciona un embarque abierto o en ruta para este pedido:</p>
        {(() => {
          const pedidoPacas = selectedPedidoForEmbarque ? pedidos.find((p) => p.id === selectedPedidoForEmbarque) : null
          const pedidoPacaCount = pedidoPacas ? (pedidoPacas.cPacaAguaPed || 0) + (pedidoPacas.cPacaHieloPed || 0) + (pedidoPacas.cBotellonFabPed || 0) + (pedidoPacas.cBotellonDomPed || 0) + (pedidoPacas.cBolsaAguaPed || 0) + (pedidoPacas.cBolsaHieloPed || 0) : 0
          const embarquesDisponibles = embarques.filter((e) => (e.estado === 'ABIERTO' || e.estado === 'EN_RUTA') && (e.totalPacas || 0) + pedidoPacaCount <= 70)
          const embarquesLlenos = embarques.filter((e) => (e.estado === 'ABIERTO' || e.estado === 'EN_RUTA') && (e.totalPacas || 0) + pedidoPacaCount > 70)

          const sortFn = (a: Embarque, b: Embarque) => {
            if (a.estado === 'EN_RUTA' && b.estado !== 'EN_RUTA') return -1
            if (a.estado !== 'EN_RUTA' && b.estado === 'EN_RUTA') return 1
            const ha = a.horaSalida ? new Date(a.horaSalida).getTime() : Infinity
            const hb = b.horaSalida ? new Date(b.horaSalida).getTime() : Infinity
            return ha - hb
          }
          const embarquesOrdenados = [...embarquesDisponibles].sort(sortFn)

          if (embarquesDisponibles.length === 0 && embarquesLlenos.length === 0) {
            return (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-2">No hay embarques abiertos o en ruta</p>
                <p className="text-xs text-gray-400">Crea un embarque primero para poder enviar este pedido</p>
              </div>
            )
          }

          const embarquesLlenosOrdenados = [...embarquesLlenos].sort(sortFn)

          const renderCard = (e: Embarque, isFull: boolean) => {
            const isSelected = selectedEmbarqueId === e.id
            const horaStr = e.horaSalida
              ? new Date(e.horaSalida).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
              : 'Sin hora'
            const displayNumero = e.numeroDia > 0 ? e.numeroDia : e.numero
            return (
              <button
                key={e.id}
                role="listitem"
                onClick={() => { if (!isFull) setSelectedEmbarqueId(e.id) }}
                aria-pressed={!isFull ? isSelected : undefined}
                disabled={isFull}
                className={`w-full text-left rounded-xl border-2 transition p-4 ${
                  isFull
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    : isSelected
                      ? 'bg-blue-50 border-blue-500 shadow-sm'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-gray-800">Embarque #{displayNumero}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      e.estado === 'EN_RUTA' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {e.estado === 'EN_RUTA' ? 'En Ruta' : 'Abierto'}
                    </span>
                    {isFull && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        Sin cupo
                      </span>
                    )}
                  </div>
                  {e.capacidadInfo && (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${e.capacidadInfo.color}`}>
                      <span aria-hidden="true">{e.capacidadInfo.icon}</span> {e.capacidadInfo.label}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span><span aria-hidden="true">🕒</span> {horaStr}</span>
                    {e.tipoMoto && <span><span aria-hidden="true">· 🛵</span> {e.tipoMoto}</span>}
                    <span><span aria-hidden="true">· 👤</span> {e.trabajador.nombre}</span>
                  </div>
                  {e.ruta && <div className="text-blue-600 text-xs"><span aria-hidden="true">📍</span> {e.ruta.nombre}</div>}
                  {/* Carga inicial: iconos de productos */}
                  {e.productos && e.productos.length > 0 && e.productos.some(p => p.cargadas > 0) && (
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="text-gray-400">Carga:</span>
                      {e.productos
                        .filter(p => p.cargadas > 0)
                        .map(p => {
                          const meta = getProductoIconConfig(p.producto)
                          const Icon = meta.Icon
                          return (
                            <span key={p.producto} className="inline-flex items-center gap-1">
                              <Icon size={14} />
                              <span className="font-medium">{p.cargadas}</span>
                            </span>
                          )
                        })}
                    </div>
                  )}
                  {/* Pedidos asignados + capacidad */}
                  <div className="text-xs text-gray-500">
                    <span aria-hidden="true">📦</span> {e._count?.pedidos || 0} pedidos asignados · Capacidad: {e.totalPacas || 0}/70 unidades
                  </div>
                </div>
                {e.capacidadInfo && (
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        e.capacidadInfo.nivel === 'ideal' ? 'bg-green-500' :
                        e.capacidadInfo.nivel === 'pesado' ? 'bg-yellow-500' :
                        e.capacidadInfo.nivel === 'maximo' ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(e.capacidadInfo.porcentaje, 100)}%` }}
                    />
                  </div>
                )}
              </button>
            )
          }

          return (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                {embarquesDisponibles.length} con cupo · {embarquesLlenos.length} sin cupo
              </p>
              {embarquesDisponibles.length === 0 && embarquesLlenos.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  Todos los embarques están llenos (70 pacas). Crea un nuevo embarque.
                </div>
              )}
              <div role="list" className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {embarquesOrdenados.map((e) => renderCard(e, false))}
                {embarquesLlenosOrdenados.length > 0 && (
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500 mb-2 px-1">Embarques sin cupo:</p>
                    <div className="space-y-2">
                      {embarquesLlenosOrdenados.map((e) => renderCard(e, true))}
                    </div>
                  </div>
                )}
              </div>
              {selectedEmbarqueId && (() => {
                const e = embarques.find((em) => em.id === selectedEmbarqueId)
                if (!e) return null
                const totalProyectado = (e.totalPacas || 0) + pedidoPacaCount
                if (totalProyectado >= 70) {
                  return <p className="text-xs text-red-600"><span aria-hidden="true">⚠️</span> Este pedido excederá la capacidad (70 pacas)</p>
                }
                return null
              })()}
              {!selectedEmbarqueId && embarquesDisponibles.length > 0 && (
                <p className="text-xs text-amber-600">Selecciona un embarque para continuar</p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setShowEmbarqueModal(false); setSelectedPedidoForEmbarque(null); setSelectedEmbarqueId('') }}
                  className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAsignarEmbarque}
                  disabled={updatingId === selectedPedidoForEmbarque || !selectedEmbarqueId}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updatingId === selectedPedidoForEmbarque ? 'Enviando...' : 'Confirmar Envío'}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* Modal Detalle */}
      <Modal open={showDetailModal && !!selectedPedido} onClose={() => setShowDetailModal(false)} className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {selectedPedido && (
          <>
            <div className="p-4 border-b flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-400">#{selectedPedido.numero}</span>
                  {getEstadoEntregaBadge(selectedPedido.estadoEntrega)}
                  {getTipoBadge(selectedPedido.tipo)}
                </div>
                <PedidoClienteDisplay
                  clienteId={selectedPedido.clienteId}
                  nombreCli={selectedPedido.nombreCli}
                  apellidoCli={selectedPedido.apellidoCli}
                  negocioId={selectedPedido.negocioId}
                  nombreNegocioCli={selectedPedido.nombreNegocioCli}
                  variant="heading"
                  showBadge
                />
                <p className="text-sm text-gray-500">{selectedPedido.telefonoCli}</p>
                {(selectedPedido.zonaCli || selectedPedido.barrioCli) && (
                  <p className="text-sm text-gray-500">
                    {selectedPedido.zonaCli}
                    {selectedPedido.zonaCli && selectedPedido.barrioCli ? ' · ' : ''}
                    {selectedPedido.barrioCli}
                  </p>
                )}
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition" aria-label="Cerrar">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">Total Pedido</span>
                  <span className="text-2xl font-bold text-gray-800">{formatCurrency(Number(selectedPedido.total))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Pagado:</span>
                  <span className="font-medium text-green-600">{formatCurrency(Number(selectedPedido.totalPagado))}</span>
                </div>
                {selectedPedido.estadoEntrega === 'ENTREGADO' && Number(selectedPedido.saldo) > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Pendiente:</span>
                    <span className="font-medium text-red-600">{formatCurrency(Number(selectedPedido.saldo))}</span>
                  </div>
                )}
                {selectedPedido.estadoEntrega === 'ENTREGADO' && Number(selectedPedido.saldo) <= 0 && Number(selectedPedido.totalPagado) > 0 && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-gray-500">Estado:</span>
                    <span className="font-medium text-green-600">Pagado completo</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Tipo</div>
                  <div className="font-medium text-gray-700">{selectedPedido.tipo}</div>
                </div>
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Fecha</div>
                  <div className="font-medium text-gray-700">{new Date(selectedPedido.fecha).toLocaleDateString('es-CO')}</div>
                </div>
                <div className="bg-white border rounded-lg p-2.5">
                  <div className="text-xs text-gray-400 mb-0.5">Hora</div>
                  <div className="font-medium text-gray-700">{new Date(selectedPedido.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                {selectedPedido.embarqueId && (
                  <div className="bg-white border rounded-lg p-2.5">
                    <div className="text-xs text-gray-400 mb-0.5">Embarque</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-700">#{embarques.find(e => e.id === selectedPedido.embarqueId)?.numeroDia || selectedPedido.embarqueId}</span>
                      <Link
                        href={`/embarques/${selectedPedido.embarqueId}`}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Ver →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Productos</h3>
                <div className="space-y-2">
                  {(() => {
                    const ITEM_BG: Record<string, string> = {
                      PACA_AGUA: 'bg-blue-50',
                      PACA_HIELO: 'bg-cyan-50',
                      BOTELLON: 'bg-indigo-50',
                      BOLSA_AGUA: 'bg-sky-50',
                      BOLSA_HIELO: 'bg-teal-50',
                    }
                    const legacyMap: Record<string, { cant: number; precio: number }> = {
                      PACA_AGUA: { cant: selectedPedido.cPacaAguaPed, precio: Number(selectedPedido.precioPacaAgua) },
                      PACA_HIELO: { cant: selectedPedido.cPacaHieloPed, precio: Number(selectedPedido.precioPacaHielo) },
                      BOTELLON: { cant: (selectedPedido.cBotellonFabPed || 0) + (selectedPedido.cBotellonDomPed || 0), precio: Number(selectedPedido.precioBotellonFab) || Number(selectedPedido.precioBotellonDom) || 0 },
                      BOLSA_AGUA: { cant: selectedPedido.cBolsaAguaPed, precio: Number(selectedPedido.precioBolsaAgua) },
                      BOLSA_HIELO: { cant: selectedPedido.cBolsaHieloPed, precio: Number(selectedPedido.precioBolsaHielo) },
                    }
                    const items = selectedPedido.items && selectedPedido.items.length > 0
                      ? selectedPedido.items
                      : Object.entries(legacyMap)
                          .filter(([, v]) => v.cant > 0)
                          .map(([producto, v]) => ({ producto, cantPedido: v.cant, precio: v.precio }))
                    if (items.length === 0) {
                      return <div className="text-sm text-gray-400 text-center py-2">Sin productos</div>
                    }
                    return items.map((item) => {
                      const meta = getProductoIconConfig(item.producto)
                      const Icon = meta.Icon
                      const bg = ITEM_BG[item.producto] || 'bg-gray-50'
                      const snapshotPrice = Number(item.precio)
                      const currentData = preciosActuales[item.producto]
                      const currentPrice = currentData?.precio ?? 0
                      const diff = currentPrice > 0 && snapshotPrice > 0
                        ? ((currentPrice - snapshotPrice) / snapshotPrice) * 100
                        : 0
                      const showDiff = Math.abs(diff) > 5 && currentPrice > 0

                      return (
                        <div key={item.producto} className={`flex justify-between items-center ${bg} rounded-lg px-3 py-2`}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Icon size={20} />
                            <span className="text-sm font-medium">{meta.label}</span>
                            {(item as any).precioOrigen === 'manual' && (
                              <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">manual</span>
                            )}
                            {showDiff && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${diff > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {diff > 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(0)}%
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold">{item.cantPedido} und</div>
                            <div className="text-xs text-gray-500">${formatCurrency(snapshotPrice)} c/u</div>
                            {showDiff && (
                              <div className="text-[10px] text-gray-400">Actual: ${formatCurrency(currentPrice)}</div>
                            )}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Stepper Visual de Estado */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado de Entrega</h3>
                <div className="relative">
                  {/* Línea de progreso */}
                  <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200">
                    <div
                      className={`h-full transition-all duration-500 ${
                        selectedPedido.estadoEntrega === 'PENDIENTE' ? 'w-0' :
                        selectedPedido.estadoEntrega === 'EN_RUTA' ? 'w-1/2' :
                        selectedPedido.estadoEntrega === 'ENTREGADO' ? 'w-full' :
                        selectedPedido.estadoEntrega === 'CANCELADO' ? 'w-full bg-gray-400' :
                        'w-full bg-red-400'
                      }`}
                      style={{
                        backgroundColor: selectedPedido.estadoEntrega === 'CANCELADO' ? '#9ca3af' :
                                         selectedPedido.estadoEntrega === 'ANULADO' ? '#f87171' : undefined
                      }}
                    />
                  </div>
                  {/* Pasos */}
                  <div className="relative flex justify-between">
                    {[
                      { key: 'PENDIENTE', label: 'Pendiente', icon: '📋' },
                      { key: 'EN_RUTA', label: 'En Ruta', icon: '🚚' },
                      { key: 'ENTREGADO', label: 'Entregado', icon: '✅' },
                    ].map((step, idx) => {
                      const isActive = selectedPedido.estadoEntrega === step.key
                      const isPast = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO'].indexOf(selectedPedido.estadoEntrega) > idx
                      const isCurrent = isActive
                      const isCancelled = selectedPedido.estadoEntrega === 'CANCELADO'
                      const isAnulled = selectedPedido.estadoEntrega === 'ANULADO'

                      let circleClass = 'bg-gray-200 text-gray-400 border-gray-300'
                      if (isCancelled || isAnulled) {
                        circleClass = 'bg-gray-300 text-gray-500 border-gray-400'
                      } else if (isCurrent) {
                        circleClass = step.key === 'PENDIENTE' ? 'bg-yellow-500 text-white border-yellow-500' :
                                      step.key === 'EN_RUTA' ? 'bg-blue-500 text-white border-blue-500' :
                                      'bg-green-500 text-white border-green-500'
                      } else if (isPast) {
                        circleClass = 'bg-green-100 text-green-700 border-green-300'
                      }

                      return (
                        <div key={step.key} className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm z-10 transition-all ${circleClass}`}>
                            {isPast && !isCancelled && !isAnulled ? '✓' : isCancelled && idx === 0 ? '✕' : isAnulled && idx === 2 ? '✕' : step.icon}
                          </div>
                          <span className={`text-[10px] mt-1 font-medium ${isCurrent ? 'text-gray-800' : 'text-gray-400'}`}>
                            {step.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Acciones según estado */}
                <div className="mt-4 flex gap-2">
                  {selectedPedido.estadoEntrega === 'PENDIENTE' && (
                    <>
                      <button
                        onClick={() => {
                          setPedidoEditando(selectedPedido)
                          setShowDetailModal(false)
                        }}
                        className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => cambiarEstado(selectedPedido.id, 'EN_RUTA')}
                        disabled={updatingId === selectedPedido.id}
                        className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {updatingId === selectedPedido.id ? 'Enviando...' : '🚚 Enviar'}
                      </button>
                      <button
                        onClick={() => cambiarEstado(selectedPedido.id, 'CANCELADO')}
                        disabled={updatingId === selectedPedido.id}
                        className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  {selectedPedido.estadoEntrega === 'EN_RUTA' && (
                    <>
                      <button
                        onClick={() => {
                          if (requiereFotoEntrega) {
                            setPedidoParaEntregar(selectedPedido)
                            setShowFotoEntrega(true)
                          } else {
                            cambiarEstado(selectedPedido.id, 'ENTREGADO')
                          }
                        }}
                        disabled={updatingId === selectedPedido.id}
                        className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {updatingId === selectedPedido.id ? 'Entregando...' : '✅ Marcar Entregado'}
                      </button>
                      <button
                        onClick={() => cambiarEstado(selectedPedido.id, 'PENDIENTE')}
                        disabled={updatingId === selectedPedido.id}
                        className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition disabled:opacity-50"
                      >
                        Volver a Pendiente
                      </button>
                    </>
                  )}
                  {selectedPedido.estadoEntrega === 'ENTREGADO' && (
                    <button
                      onClick={() => cambiarEstado(selectedPedido.id, 'ANULADO')}
                      disabled={updatingId === selectedPedido.id}
                      className="w-full py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition disabled:opacity-50"
                    >
                      {updatingId === selectedPedido.id ? 'Anulando...' : 'Anular Pedido'}
                    </button>
                  )}
                  {(selectedPedido.estadoEntrega === 'CANCELADO' || selectedPedido.estadoEntrega === 'ANULADO') && (
                    <div className="w-full py-2 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">
                      Pedido {selectedPedido.estadoEntrega === 'CANCELADO' ? 'cancelado' : 'anulado'} — Sin acciones disponibles
                    </div>
                  )}
                </div>
              </div>

              {/* Factura y Abonos */}
              {selectedPedido.factura && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">Factura</h3>
                    <a
                      href={`/facturas?openFactura=${selectedPedido.factura.id}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      → Ver factura #{selectedPedido.factura.numero}
                    </a>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-500">#{selectedPedido.factura.numero}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        selectedPedido.factura.estado === 'PAGADA' ? 'bg-green-100 text-green-700' :
                        selectedPedido.factura.estado === 'ANULADA' ? 'bg-gray-100 text-gray-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {selectedPedido.factura.estado}
                      </span>
                    </div>
                    {selectedPedido.factura.abonos && selectedPedido.factura.abonos.length > 0 && (
                      <div className="border-t pt-2 mt-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">Abonos ({selectedPedido.factura.abonos.length}):</p>
                        <div className="space-y-1">
                          {selectedPedido.factura.abonos.map((abono) => (
                            <div key={abono.id} className="flex justify-between items-center text-sm">
                              <div>
                                <a
                                  href={`/facturas?openFactura=${selectedPedido.factura!.id}`}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  #{selectedPedido.factura!.numero}
                                </a>
                                <span className="text-gray-600 ml-2">{abono.metodoPago}</span>
                                <span className="text-gray-400 text-xs ml-2">{new Date(abono.fecha).toLocaleDateString('es-CO')}</span>
                              </div>
                              <span className="font-medium text-green-600">{formatCurrency(Number(abono.monto))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Modal Editar Pedido */}
      {pedidoEditando && (() => {
        const itemsArray = pedidoEditando.items && pedidoEditando.items.length > 0
          ? pedidoEditando.items.map((i: any) => ({
              producto: i.producto,
              cantidad: i.cantPedido,
              precioManual: i.precioOrigen === 'manual' ? Number(i.precio) : undefined,
            }))
          : [
              ...(pedidoEditando.cPacaAguaPed ? [{ producto: 'PACA_AGUA' as const, cantidad: pedidoEditando.cPacaAguaPed, precioManual: Number(pedidoEditando.precioPacaAgua) || undefined }] : []),
              ...(pedidoEditando.cPacaHieloPed ? [{ producto: 'PACA_HIELO' as const, cantidad: pedidoEditando.cPacaHieloPed, precioManual: Number(pedidoEditando.precioPacaHielo) || undefined }] : []),
              ...(pedidoEditando.cBotellonFabPed || pedidoEditando.cBotellonDomPed ? [{ producto: 'BOTELLON' as const, cantidad: pedidoEditando.cBotellonFabPed || pedidoEditando.cBotellonDomPed, precioManual: (Number(pedidoEditando.precioBotellonFab) || Number(pedidoEditando.precioBotellonDom)) || undefined }] : []),
              ...(pedidoEditando.cBolsaAguaPed ? [{ producto: 'BOLSA_AGUA' as const, cantidad: pedidoEditando.cBolsaAguaPed, precioManual: Number(pedidoEditando.precioBolsaAgua) || undefined }] : []),
              ...(pedidoEditando.cBolsaHieloPed ? [{ producto: 'BOLSA_HIELO' as const, cantidad: pedidoEditando.cBolsaHieloPed, precioManual: Number(pedidoEditando.precioBolsaHielo) || undefined }] : []),
            ]

        return (
          <Modal open={!!pedidoEditando} onClose={() => setPedidoEditando(null)} className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-amber-50">
              <h2 className="text-xl font-bold text-amber-800">
                ✏️ Editar Pedido #{pedidoEditando.numero}
              </h2>
              <button
                onClick={() => setPedidoEditando(null)}
                className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <PedidoFormUnified
                key={`edit-${pedidoEditando.id}`}
                contexto={pedidoEditando.canal as 'PUNTO' | 'DOMICILIO'}
                clientes={clientes}
                onSubmit={handlePedidoSubmit}
                onClose={() => setPedidoEditando(null)}
                pedidoInicial={{
                  id: pedidoEditando.id,
                  canal: pedidoEditando.canal as 'PUNTO' | 'DOMICILIO',
                  cliente: pedidoEditando.clienteId !== 'CONSUMIDOR_FINAL'
                    ? { id: pedidoEditando.clienteId, nombre: pedidoEditando.nombreCli, telefono: pedidoEditando.telefonoCli, direccion: pedidoEditando.zonaCli, barrio: pedidoEditando.barrioCli }
                    : null,
                  negocioId: pedidoEditando.negocioId,
                  items: itemsArray,
                  obs: pedidoEditando.obs,
                }}
              />
            </div>
          </Modal>
        )
      })()}

      {/* Confirm Modal */}
      {confirmModal}

      {/* Foto entrega modal (admin) — only mounted when delivery photo is required */}
      <FotoEntregaModal
        open={showFotoEntrega}
        onClose={() => {
          if (updatingId) return
          setShowFotoEntrega(false)
          setPedidoParaEntregar(null)
          setFotoParaEntregar(null)
        }}
        onConfirm={handleFotoConfirm}
      />

      {/* GPS capture modal — second step after photo confirmation */}
      {(() => {
        const clienteParaGps = pedidoParaEntregar
          ? clientes.find(c => c.id === pedidoParaEntregar.clienteId)
          : null
        return (
          <GpsCaptureModal
            open={showGpsCapture}
            onClose={() => {
              if (updatingId) return
              setShowGpsCapture(false)
              setPedidoParaEntregar(null)
              setFotoParaEntregar(null)
            }}
            onConfirm={handleGpsConfirm}
            clienteCoords={
              clienteParaGps?.lat != null && clienteParaGps?.lng != null
                ? { lat: clienteParaGps.lat, lng: clienteParaGps.lng }
                : undefined
            }
            clienteName={pedidoParaEntregar?.nombreCli ?? undefined}
            deliveryRadiusMeters={gpsConfig.radiusMeters}
          />
        )
      })()}

      {/* FAB Unificado */}
      <div
        className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2"
        data-testid="fab-container"
        onMouseEnter={() => fabHoverable && setFabOpen(true)}
        onMouseLeave={() => fabHoverable && setFabOpen(false)}
      >
        {/* Speed Dial */}
        {fabOpen && (
          <div className="flex flex-col items-end gap-2 mb-2">
            <Tooltip content="Crea un pedido con cliente, dirección y envío a domicilio" title="Pedido con Envío" position="left">
              <button
                onClick={() => { setFabOpen(false); setShowModal(true); setModalKey(k => k + 1) }}
                data-testid="fab-pedido-envio"
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                <span>📦</span>
                <span>Pedido con Envío</span>
              </button>
            </Tooltip>
            <Tooltip content="Venta inmediata en punto de venta sin registro de cliente" title="Venta Rápida" position="left">
              <button
                onClick={() => { setFabOpen(false); setShowVentaRapida(true); setModalKey(k => k + 1) }}
                data-testid="fab-venta-rapida"
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                <span>💰</span>
                <span>Venta Rápida</span>
              </button>
            </Tooltip>
          </div>
        )}
        {/* FAB Principal */}
        <button
          onClick={() => {
            if (fabHoverable) {
              setFabOpen(true)
            } else {
              setFabOpen((v) => !v)
            }
          }}
          data-testid="fab-main"
          className={`w-14 h-14 flex items-center justify-center rounded-full shadow-xl transition-all duration-200 ${
            fabOpen ? 'bg-gray-700 rotate-45' : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
          aria-label="Acciones rápidas"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function getTituloFecha(desde: string | null, hasta: string | null, all: boolean): string {
  const presets = {
    hoy: getPresetDate('hoy'),
    ayer: getPresetDate('ayer'),
    turno: getPresetDate('turno'),
    manana: getPresetDate('manana'),
  }

  if (all) return 'Todos los Pedidos'
  if (!desde && !hasta) return 'Pedidos'
  if (presets.hoy && desde === presets.hoy.desde && hasta === presets.hoy.hasta) return 'Pedidos de Hoy'
  if (presets.ayer && desde === presets.ayer.desde && hasta === presets.ayer.hasta) return 'Pedidos de Ayer'
  if (presets.turno && desde === presets.turno.desde && hasta === presets.turno.hasta) return 'Pedidos del Turno'
  if (presets.manana && desde === presets.manana.desde && hasta === presets.manana.hasta) return 'Pedidos de Mañana'
  if (desde && hasta) {
    if (desde === hasta) {
      const fecha = new Date(desde + 'T00:00:00-05:00')
      return `Pedidos del ${fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}`
    }
    return `Pedidos: ${new Date(desde + 'T00:00:00-05:00').toLocaleDateString('es-CO')} → ${new Date(hasta + 'T00:00:00-05:00').toLocaleDateString('es-CO')}`
  }
  return 'Pedidos'
}


