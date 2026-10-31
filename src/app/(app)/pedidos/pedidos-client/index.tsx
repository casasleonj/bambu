'use client'

import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { canCreatePedidos } from '@/lib/permissions'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { Modal } from '@/components/modal'
import { PedidoDetalle } from '../pedido-detalle/pedido-detalle'
import { ErrorState } from '@/components/error-state'
import { SkeletonPage, SkeletonCard } from '@/components/skeleton'
import { Tooltip, InfoBanner } from '@/components/tooltip'
import { useConfirm } from '@/components/confirm-modal'
import { SmartDateFilter } from '@/components/smart-date-filter'
import { normalizeCanalFilter, tipoDesdeCanal } from '@/lib/pedido-canal'
import { PedidoFilters } from './pedido-filters'
import { PedidoTable } from './pedido-table'
import { FiadosTable } from './fiados-table'
import { AlertasTable } from './alertas-table'
import { FacturaConsultaModal } from './factura-consulta-modal'
import { CobroFiadoDialog } from './cobro-fiado-dialog'
import { ConsultaPedidosHub } from '../pedido-hub/consulta-pedidos-hub'
import type { ResultadoConsultaPedidos } from '@/lib/pedidos-consulta'
import { EstoSeRepite, type EstoSeRepiteContexto } from '../pedido-hub/esto-se-repite'
import { PedidosWorkspace, type WorkspacePedidoInicial } from '@/components/pedido-workspace'
import { pedidosV2Enabled } from '@/lib/flags'

import type { Pedido, Embarque, Cliente } from './types'
import { getPresetDate, getTodayString, buildDateRangeFilter, getTodayRange } from '@/lib/dates'
import { usePedidos } from '@/hooks/use-pedidos'
import { usePedidosCounts } from '@/hooks/use-pedidos-counts'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import type { DraftPedido } from '@/components/pedido-workspace/types'
import { useCrearPedido, type CrearPedidoPayload } from '@/hooks/use-crear-pedido'
import { offlineDb } from '@/lib/db/offline'
import { SYNC_ITEM_DONE_EVENT } from '@/lib/db/sync'
import { useAnularPedido } from '@/hooks/use-anular-pedido'
import { useCancelarPedido } from '@/hooks/use-cancelar-pedido'
import { useAsignarEmbarque } from '@/hooks/use-asignar-embarque'
import { useEntregarPedido } from '@/hooks/use-entregar-pedido'
import { useGestionAdmin } from '@/hooks/use-gestion-admin'
import { RegistrarEntregaDialog } from '../registrar-entrega/registrar-entrega-dialog'
import { CorregirCanalDialog } from '../corregir-canal/corregir-canal-dialog'
import { itemsCambiaron } from '@/lib/pedido-edicion-items'
import { useReconnectHandler } from '@/hooks/use-reconnect-handler'
import { usePollingRefetch } from '@/hooks/use-polling-refetch'
import { useRealtimeListener } from '@/hooks/use-realtime-listener'
import { useExcepcionesPendientes } from '@/components/excepcion-credito/use-excepciones-pendientes'
import { ExcepcionesPendientesBanner } from '@/components/excepcion-credito/excepciones-pendientes-banner'
import { ExcepcionCreditoModal } from '@/components/excepcion-credito/excepcion-credito-modal'
import { capturarGpsSilencioso } from '@/lib/gps-silencioso'
import { resolverEntrega } from '@/lib/entrega-quien'
import { isWithinDeliveryRadius } from '@/lib/gps'
import { loadClienteDetail } from '@/lib/cliente-detail-cache'

const PedidoFormUnified = dynamic(() => import('@/components/pedido-form-unified').then(m => m.PedidoFormUnified), { ssr: false })
import type { PedidoInicial, PedidoUnifiedData } from '@/components/pedido-form-unified'

interface PedidosClientProps {
  /** Initial pedidos data from server component (SSR). Used as display fallback
   *  before usePedidos hook returns data. Se elimina el waterfall de API calls
   *  iniciales y reduce cold starts. */
  initialPedidos?: Pedido[]
  initialConsulta?: ResultadoConsultaPedidos
  initialActorId?: string
}

/**
 * Construye una fila optimista para un pedido creado offline (aun en
 * requestQueue, sin id ni numero real de servidor). Mismo patrón que
 * buildPendingCliente en clientes-client/index.tsx (bug Aponte) — sin esto,
 * el pedido no deja rastro visible hasta sincronizar y el usuario asume
 * que no se guardó.
 */
function buildPendingPedido(offlineId: string, payload: CrearPedidoPayload, clienteNombre: string): Pedido {
  return {
    id: `offline-${offlineId}`,
    numero: 0,
    clienteId: payload.clienteId || '',
    negocioId: payload.negocioId,
    nombreCli: clienteNombre,
    apellidoCli: null,
    telefonoCli: '',
    zonaCli: '',
    barrioCli: '',
    tipo: tipoDesdeCanal(payload.canal),
    canal: payload.canal,
    estado: 'PENDIENTE',
    origen: payload.origen ?? 'PEDIDO',
    estadoEntrega: 'PENDIENTE',
    estadoPago: 'PENDIENTE',
    items: (payload.items || []).map(i => ({
      producto: i.producto,
      cantPedido: i.cantidad,
      cantEntrega: 0,
      precio: 0,
      subtotal: 0,
    })),
    cPacaAguaPed: 0, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
    cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
    precioPacaAgua: 0, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
    totalPagado: 0,
    total: 0,
    saldo: 0,
    fecha: new Date().toISOString(),
    _pendingSync: true,
    _pendingOfflineId: offlineId,
  }
}

/** Lee requestQueue y reconstruye las filas pendientes de "crear-pedido". */
async function loadPendingPedidosFromQueue(clientes: Cliente[]): Promise<Pedido[]> {
  const items = await offlineDb.requestQueue.where('localEndpoint').equals('crear-pedido').toArray()
  return items.map((item) => {
    let payload: CrearPedidoPayload
    try {
      payload = JSON.parse(item.body)
    } catch {
      payload = { clienteId: '', canal: 'DOMICILIO', items: [] }
    }
    const clienteNombre =
      payload.clienteNuevo?.nombre ??
      clientes.find(c => c.id === payload.clienteId)?.nombre ??
      'Cliente'
    return buildPendingPedido(item.offlineId, payload, clienteNombre)
  })
}

export function PedidosClient({ initialPedidos,initialConsulta,initialActorId }: PedidosClientProps = {}) {
  // useShallowSearchParams (no useSearchParams crudo): una vez que CUALQUIER
  // escritor de la URL (este componente o SmartDateFilter) hace su primer
  // set(), pasa a leer/escribir siempre desde window.location.search real +
  // un broadcast cross-componente — evita el race donde dos escritores de
  // shallow-routing independientes (cada uno reconstruyendo la URL desde su
  // propio snapshot de useSearchParams, potencialmente stale) se pisan entre
  // sí. Mismo hook que ya usan SmartDateFilter/DateRangeFilter/facturas-client.
  const shallowParams = useShallowSearchParams()
  const { confirm, modal: confirmModal } = useConfirm()
  const { data: session, status: sessionStatus } = useSession()
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? null
  const hubMode = pedidosV2Enabled()
  const [hubRefreshKey,setHubRefreshKey] = useState(0)
  const [hubTotal,setHubTotal] = useState(initialConsulta?.total ?? 0)
  const actualizarTotalHub = useCallback((n:number)=>setHubTotal(n),[])
  const [consultaPedidos,setConsultaPedidos] = useState<Pedido[]>(initialConsulta?.pedidos??[])
  const actualizarContextoHub = useCallback((p:Pedido[])=>setConsultaPedidos(p),[])
  // B-17 (#434): solo ADMIN/ASISTENTE crean pedidos (igual que POST /api/pedidos).
  // Mientras la sesión carga el rol es null → no se ofrece nada.
  const puedeCrear = canCreatePedidos(userRole)
  const router = useRouter()
  const triggerNuevoAtendidoRef = useRef(false)

  const [showModal, setShowModal] = useState(false)
  const [showVentaRapida, setShowVentaRapida] = useState(false)
  // TEMPORAL-SIN-EMBARQUE(#535): «venta en ruta» = la venta rápida abierta con repartidor obligatorio.
  const [ventaEnRutaActiva, setVentaEnRutaActiva] = useState(false)
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [preciosActuales, setPreciosActuales] = useState<Record<string, { precio: number; origen: string }>>({})
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [clienteCobro, setClienteCobro] = useState<{ id: string; nombre: string } | null>(null)
  const [facturaConsulta, setFacturaConsulta] = useState<{ id: string; volver: string; pedidoId?: string; pedidoNumero?: number; consulta?:string; desdePedido?:boolean } | null>(null)
  const [pedidoDocumento, setPedidoDocumento] = useState<{ id: string; volver: string; loading: boolean; error: string | null } | null>(null)

  // Pedidos creados offline (2G/3G rural) que siguen encolados en IndexedDB
  // esperando sync. Mismo mecanismo que clientes-client/index.tsx (bug
  // Aponte): sin esto, el pedido no aparece en la lista hasta sincronizar y
  // el usuario asume que no se guardó — con el riesgo agravado de que el
  // modal quedaba abierto invitando a un doble-submit real (pedido pagado
  // duplicado). Se reconstruyen desde requestQueue al montar (sobreviven a
  // un refresh) y se reconcilian con el evento bambu:sync-item-done.
  const [pendingPedidos, setPendingPedidos] = useState<Pedido[]>([])
  const clientesLoadedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadPendingPedidosFromQueue(clientes)
      .then((rows) => { if (!cancelled) setPendingPedidos(rows) })
      .catch((error) => {
        console.warn('[pendingPedidos] error leyendo requestQueue', error)
      })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando `clientes` pasa de vacío a poblado, re-resolvemos los nombres de
  // las filas pendientes que hayan quedado con el fallback genérico
  // 'Cliente' (reconstruidas antes de que fetchClientes() terminara).
  useEffect(() => {
    if (clientesLoadedRef.current || clientes.length === 0) return
    clientesLoadedRef.current = true
    setPendingPedidos((prev) => {
      if (prev.length === 0) return prev
      return prev.map((p) => {
        if (!p._pendingOfflineId || p.nombreCli !== 'Cliente') return p
        const nombre = clientes.find(c => c.id === p.clienteId)?.nombre
        return nombre ? { ...p, nombreCli: nombre } : p
      })
    })
  }, [clientes])

  const discardFailedPedido = useCallback((offlineId: string) => {
    setPendingPedidos((prev) => prev.filter((p) => p._pendingOfflineId !== offlineId))
    void offlineDb.failedItems.where('offlineId').equals(offlineId).delete().catch((error) => {
      console.warn('[pendingPedidos] error descartando failedItem', error)
    })
  }, [])

  // Corrección de un pedido offline rechazado (422): se reabre en el Hub con el
  // borrador original y la MISMA clave de idempotencia (offlineId).
  const [correccion, setCorreccion] = useState<{ offlineId: string; draft: Partial<DraftPedido> } | null>(null)

  const corregirFailedPedido = useCallback(async (offlineId: string) => {
    try {
      const item = await offlineDb.failedItems.where('offlineId').equals(offlineId).first()
      if (!item) {
        toast.error('No se encontró el pedido rechazado en este dispositivo.')
        return
      }
      const body = JSON.parse(item.body) as Record<string, unknown>
      const draft: Partial<DraftPedido> = {
        clienteId: (body.clienteId as string | undefined) ?? null,
        negocioId: (body.negocioId as string | undefined) ?? null,
        canal: (body.canal as 'PUNTO' | 'DOMICILIO' | undefined) ?? 'DOMICILIO',
        origen: (body.origen as 'PEDIDO' | 'VENTA_RAPIDA' | undefined) ?? 'PEDIDO',
        items: Array.isArray(body.items) ? (body.items as DraftPedido['items']) : [],
        pagos: Array.isArray(body.pagos) ? (body.pagos as DraftPedido['pagos']) : [],
        entregado: body.entregado as boolean | undefined,
        obs: body.obs as string | undefined,
        direccionEntrega: body.direccionEntrega as string | undefined,
        barrioEntrega: body.barrioEntrega as string | undefined,
        entregaLat: (body.entregaLat as number | null | undefined) ?? null,
        entregaLng: (body.entregaLng as number | null | undefined) ?? null,
        pedidoOrigenId: body.pedidoOrigenId as string | undefined,
      }
      setCorreccion({ offlineId, draft })
      setShowVentaRapida(false)
      setModalKey((k) => k + 1)
      setShowModal(true)
    } catch (error) {
      console.warn('[pendingPedidos] error reabriendo pedido rechazado', error)
      toast.error('No se pudo reabrir el pedido rechazado.')
    }
  }, [])

  const [embarques, setEmbarques] = useState<Embarque[]>([])
  const [showEmbarqueModal, setShowEmbarqueModal] = useState(false)
  const [selectedPedidoForEmbarque, setSelectedPedidoForEmbarque] = useState<string | null>(null)
  const [pedidoEditando, setPedidoEditando] = useState<Pedido | null>(null)
  const [selectedEmbarqueId, setSelectedEmbarqueId] = useState('')
  const tabFromUrl = shallowParams.get('tab')
  const activeTab = tabFromUrl === 'fiados' || tabFromUrl === 'alertas' ? tabFromUrl : 'hoy'
  const volverConsulta = activeTab === 'alertas' ? 'Volver a Alertas' : activeTab === 'fiados' ? 'Volver a Fiados' : 'Volver a Pedidos'
  const setActiveTab = (tab: 'hoy' | 'fiados' | 'alertas') => {
    shallowParams.set({ tab: tab === 'hoy' ? undefined : tab, atrasados: undefined, enRiesgo: undefined,
      ...(activeTab === 'hoy' && tab !== 'hoy' ? { pedidosCliente: shallowParams.get('clienteId') ?? undefined, clienteId: undefined } : {}),
      ...(activeTab !== 'hoy' && tab === 'hoy' ? { clienteId: shallowParams.get('pedidosCliente') ?? undefined, pedidosCliente: undefined } : {}),
    }, { history: 'push' })
  }
  // Clientes con alertas tras descontar las ignoradas (el contador del servidor no las conoce).
  const [alertasVisibles, setAlertasVisibles] = useState<number | null>(null)
  const [fabOpen, setFabOpen] = useState(false)
  const [fabHoverable, setFabHoverable] = useState(false)
  const [modalKey, setModalKey] = useState(0)

  useEffect(() => {
    // window.matchMedia no existe en el servidor, no se puede leer
    // durante el render.
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFabHoverable(mq.matches)
    const handler = (e: MediaQueryListEvent) => setFabHoverable(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const [pedidoInicial, setPedidoInicial] = useState<PedidoInicial | undefined>(undefined)
  // G11.B (Fase 6-ii) — "nueva demanda": el workspace se monta con cliente +
  // canal del pedido origen (inmutables) y `pedidoOrigenId` seteado.
  const [nuevaDemanda, setNuevaDemanda] = useState<
    { pedidoOrigenId: string; numeroOrigen: number; clienteId: string; canal: 'PUNTO' | 'DOMICILIO' } | null
  >(null)
  // F8-ii — "esto se repite": propuesta post-commit (transacción separada).
  const [proponerHabitual, setProponerHabitual] = useState<
    { contexto: EstoSeRepiteContexto; canal: 'PUNTO' | 'DOMICILIO'; items: Array<{ producto: string; cantidad: number }> } | null
  >(null)
  const anularMotivoRef = useRef<string>('')
  const anularDevolverStockRef = useRef<boolean>(false)
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
  const desdeUrl = shallowParams.get('desde')
  const hastaUrl = shallowParams.get('hasta')

  // G6 (ADR-PEDIDO-ORIGEN-CANAL-001): el filtro es "Canal" (PUNTO/DOMICILIO).
  // Se acepta el param legacy `?tipo=ENVIO|PUNTO` y se normaliza (ENVIO→DOMICILIO).
  const canalParamKey = shallowParams.getAll('canal').join(',') + '|' + shallowParams.getAll('tipo').join(',')
  const filtroCanal = useMemo(
    () => normalizeCanalFilter([...shallowParams.getAll('canal'), ...shallowParams.getAll('tipo')]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canalParamKey],
  )
  const filtroOrigen = shallowParams.getAll('origen')
  // F8-i: faceta "Solo habituales" del Hub — solo pedidos con `origen`
  // RECURRENTE. Misma semántica que el SSR (`pedidos/page.tsx`) y el dominio
  // (`PrismaPedidoRepository.buildWhere`); acá se resuelve en memoria sobre
  // `pedidosSource` (el cache trae `origen` por fila), igual que el resto de
  // los filtros persistentes.
  const conRecurrenciaFromUrl = shallowParams.get('conRecurrencia') === 'true'
  const filtroEstadoEntrega = shallowParams.getAll('estadoEntrega')
  const filtroEstadoPago = shallowParams.getAll('estadoPago')
  const search = shallowParams.get('search') || ''
  const clienteIdFromUrl = shallowParams.get('clienteId')
  const openPedidoParam = shallowParams.get('openPedido')
  // P0-3 PR 2: la notificación EXCEPCION_CREDITO_SOLICITADA y el aviso abren la
  // ventana de decisión con este param (la URL es la fuente de verdad).
  const openExcepcionParam = shallowParams.get('openExcepcionCredito')
  const allFromUrl = shallowParams.get('all') === 'true'
  // Vistas autocontenidas (mismo patrón que scope=fiados/alertas): ignoran
  // desde/hasta/estadoEntrega y cualquier otro filtro persistente. Se activan
  // solo por el link del banner de atrasados/en-riesgo, no son un tab.
  const atrasadosParam = shallowParams.get('atrasados') === 'true'
  const enRiesgoParam = shallowParams.get('enRiesgo') === 'true'

  // Sync de URL sin navegación RSC: los filtros se resuelven 100% en memoria
  // (ver pedidosVisibles/allPedidos más abajo). history:'replace' porque son
  // cambios de filtro, no navegación (no queremos spamear el historial del
  // navegador en cada click de chip).
  const syncUrl = useCallback((updates: Record<string, string | string[] | undefined>) => {
    shallowParams.set(updates, { history: 'replace' })
  }, [shallowParams])

  // Filtros derivados de la URL (fuente de verdad)
  const pedidoFilterParams = useMemo(() => ({
    desde: desdeUrl || undefined,
    hasta: hastaUrl || undefined,
    canal: filtroCanal.length > 0 ? filtroCanal : undefined,
    origen: filtroOrigen.length > 0 ? filtroOrigen : undefined,
    estadoEntrega: filtroEstadoEntrega.length > 0 ? filtroEstadoEntrega : undefined,
    estadoPago: filtroEstadoPago.length > 0 ? filtroEstadoPago : undefined,
    search: search || undefined,
    clienteId: clienteIdFromUrl || undefined,
    conRecurrencia: conRecurrenciaFromUrl || undefined,
  }), [desdeUrl, hastaUrl, filtroCanal, filtroOrigen, filtroEstadoEntrega, filtroEstadoPago, search, clienteIdFromUrl, conRecurrenciaFromUrl])

  // --- Cache-driven pedidos (P0 fix: filtros en memoria, sin RSC round-trip) ---
  // Igual patrón que clientes-client/index.tsx (loadAllClientes): se carga el
  // dataset completo una vez en background y todos los filtros persistentes
  // (clienteId, desde, hasta, search, tipo, origen, estadoEntrega, estadoPago)
  // se resuelven en memoria. window.history.replaceState (syncUrl) reemplaza
  // router.push para que cambiar un filtro no dispare re-render del Server
  // Component.
  const [allPedidos, setAllPedidos] = useState<Pedido[]>([])
  const [allPedidosTotal, setAllPedidosTotal] = useState(0)
  const [allPedidosError, setAllPedidosError] = useState<string | null>(null)
  const [cacheLoadedOnce, setCacheLoadedOnce] = useState(false)
  const allPedidosLoadingRef = useRef(false)

  const redirectIfAuthError = useCallback((res: Response): boolean => {
    if (res.status === 401 || res.status === 403) {
      router.push('/login?reason=expired')
      return true
    }
    return false
  }, [router])

  const loadAllPedidos = useCallback(async () => {
    if (allPedidosLoadingRef.current) return
    allPedidosLoadingRef.current = true
    try {
      const params = new URLSearchParams()
      params.set('all', 'true')
      params.set('pageSize', '500')
      const res = await fetch(`/api/pedidos?${params.toString()}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(30_000),
      })
      if (redirectIfAuthError(res)) return
      const data = await res.json()
      if (!data.success) throw new Error(data.error?.message || 'Error cargando pedidos')
      setAllPedidos((data.pedidos || data.data || []) as Pedido[])
      setAllPedidosTotal(data.total || 0)
      setAllPedidosError(null)
    } catch (err) {
      setAllPedidosError('No se pudieron cargar los pedidos')
      console.error('[loadAllPedidos] error:', err)
    } finally {
      allPedidosLoadingRef.current = false
      setCacheLoadedOnce(true)
    }
  }, [redirectIfAuthError])

  useEffect(() => {
    // Vistas autocontenidas atrasados/enRiesgo (ej. clic en "Verlos" del
    // banner del dashboard) no usan `allPedidos` — tienen su propio hook
    // más abajo. Pedir hasta 500 filas que nadie va a leer solo agrega
    // tráfico en una red 2G/3G rural (ver AGENTS.md, perf de /pedidos).
    // Al salir de esa vista (atrasadosParam/enRiesgoParam vuelven a false)
    // este mismo efecto se re-ejecuta y sí dispara la carga.
    if (hubMode || atrasadosParam || enRiesgoParam) return
    // Fetch de datos al montar — side effect de red real, no derivable
    // durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAllPedidos()
  }, [loadAllPedidos, atrasadosParam, enRiesgoParam, hubMode])

  // cacheActive: el cache trajo el dataset completo (no truncado por el tope
  // de 500). Si el negocio supera el tope, cae a fallback server-filtrado.
  const cacheActive = useMemo(
    () => allPedidos.length > 0 && allPedidos.length >= allPedidosTotal,
    [allPedidos.length, allPedidosTotal],
  )

  // Fallback: solo se activa (refetchOnParamsChange) cuando el cache está
  // truncado. Mismo mecanismo de red que antes (fetch a /api/pedidos con los
  // filtros actuales), pero sin pasar por router.push/RSC.
  const fetchAllForTab = activeTab !== 'hoy'
  const {
    pedidos: fallbackPedidosRaw,
    error: fallbackError,
    refetch: fallbackRefetch,
  } = usePedidos(pedidoFilterParams, {
    all: allFromUrl || fetchAllForTab,
    autoFetch: false,
    refetchOnParamsChange: !hubMode && !cacheActive,
  })

  // Dispara el primer fetch del fallback exactamente en la transición
  // cache-completo → cache-truncado (no en cada render ni en el mount).
  const wasCacheActiveRef = useRef(true)
  useEffect(() => {
    if (!hubMode && wasCacheActiveRef.current && !cacheActive && cacheLoadedOnce) {
      fallbackRefetch()
    }
    wasCacheActiveRef.current = cacheActive
  }, [cacheActive, cacheLoadedOnce, fallbackRefetch, hubMode])

  // Fuente de datos "cruda" a filtrar en memoria: prioriza allPedidos una vez
  // cargado; antes de eso (o si quedó truncado), usa el SSR inicial / fallback
  // para no mostrar una lista vacía durante el gap de carga.
  const pedidosSource = useMemo(() => {
    if (hubMode) return consultaPedidos
    if (!cacheLoadedOnce) return initialPedidos || []
    if (cacheActive) return allPedidos
    return (fallbackPedidosRaw as Pedido[]).length > 0 ? (fallbackPedidosRaw as Pedido[]) : allPedidos
  }, [cacheLoadedOnce, cacheActive, allPedidos, fallbackPedidosRaw, initialPedidos,hubMode,consultaPedidos])

  const pedidos = pedidosSource
  // Las vistas autocontenidas atrasados/enRiesgo no cargan la lista base ni
  // reciben initialPedidos del SSR (page.tsx hace early-return): tienen su
  // propio loading/error (usePedidos({atrasados|enRiesgo})). Sin este caso,
  // hasLoadedOnce nunca pasaba a true y la página quedaba en el skeleton (#273).
  const hasLoadedOnce = hubMode || initialPedidos !== undefined || cacheLoadedOnce || atrasadosParam || enRiesgoParam
  const fetchError = allPedidosError || fallbackError
  const loading = !hasLoadedOnce

  // Independent datasets for Fiados and Alertas tabs.
  // Eager background fetch (not blocking the main list render), pero NO en
  // el mount mismo: autoFetch:false + trigger explícito más abajo, gateado
  // en !atrasadosParam && !enRiesgoParam. Si el usuario entra directo a la
  // vista "Verlos" (atrasados/enRiesgo), ninguna de las dos tabs es visible
  // ahí — cargarlas de entrada solo suma tráfico en 2G/3G rural. Se cargan
  // en cuanto el usuario vuelve a la vista normal (mismo idioma que el
  // efecto de atrasados/enRiesgo unas líneas más abajo).
  const {
    pedidos: pedidosFiadosRaw,
    loading: loadingFiados,
    error: errorFiados,
    refetch: refetchFiados,
    hasLoadedOnce: fiadosCargados,
    refetching: actualizandoFiados,
  } = usePedidos({ scope: 'fiados' }, { all: true, autoFetch: false, refetchOnParamsChange: true })
  const pedidosFiados = pedidosFiadosRaw as Pedido[]

  const {
    pedidos: pedidosAlertasRaw,
    loading: loadingAlertas,
    error: errorAlertas,
    refetch: refetchAlertas,
    hasLoadedOnce: alertasCargadas,
  } = usePedidos({ scope: 'alertas' }, { all: true, autoFetch: false, refetchOnParamsChange: true })
  const pedidosAlertas = pedidosAlertasRaw as Pedido[]

  useEffect(() => {
    if (!atrasadosParam && !enRiesgoParam) {
      refetchFiados()
      refetchAlertas()
    }
  }, [atrasadosParam, enRiesgoParam, refetchFiados, refetchAlertas])

  // Vistas autocontenidas "atrasados"/"en riesgo": a diferencia de fiados/
  // alertas (siempre visibles vía badge), estas solo se piden cuando el
  // usuario entra por el link del banner — autoFetch:false + refetch manual
  // en la transición false→true, mismo idioma que wasCacheActiveRef arriba.
  const {
    pedidos: pedidosAtrasadosRaw,
    loading: loadingAtrasados,
    error: errorAtrasados,
    refetch: refetchAtrasados,
  } = usePedidos({ atrasados: true }, { all: true, autoFetch: false, refetchOnParamsChange: false })
  const pedidosAtrasados = pedidosAtrasadosRaw as Pedido[]

  useEffect(() => {
    if (atrasadosParam) refetchAtrasados()
  }, [atrasadosParam, refetchAtrasados])

  const {
    pedidos: pedidosEnRiesgoRaw,
    loading: loadingEnRiesgo,
    error: errorEnRiesgo,
    refetch: refetchEnRiesgo,
  } = usePedidos({ enRiesgo: true }, { all: true, autoFetch: false, refetchOnParamsChange: false })
  const pedidosEnRiesgo = pedidosEnRiesgoRaw as Pedido[]

  useEffect(() => {
    if (enRiesgoParam) refetchEnRiesgo()
  }, [enRiesgoParam, refetchEnRiesgo])

  // G6: migrar el param legacy `?tipo=ENVIO|PUNTO` → `?canal=DOMICILIO|PUNTO`
  // una sola vez, para que los toggles del filtro operen sobre un solo param.
  const tipoParamRaw = shallowParams.getAll('tipo')
  useEffect(() => {
    if (tipoParamRaw.length === 0) return
    const canal = normalizeCanalFilter([...shallowParams.getAll('canal'), ...tipoParamRaw])
    syncUrl({ canal: canal.length > 0 ? canal : undefined, tipo: undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoParamRaw.join(',')])

  const volverAPedidosDeHoy = useCallback(() => {
    syncUrl({ atrasados: undefined, enRiesgo: undefined })
  }, [syncUrl])

  // "Verlos →" de los banners, estando ya en /pedidos: entra a la vista
  // autocontenida con el mismo mecanismo shallow que volverAPedidosDeHoy.
  // Con <Link> Next navegaba (RSC) a la misma página y este componente no se
  // enteraba del cambio de URL (useShallowSearchParams lee window.location
  // solo tras un broadcast/popstate): la vista aparecía recién con el próximo
  // re-render ajeno, ~15 s después (safety-net de loadTimeout). `push` para
  // que "atrás" vuelva a la lista; el href se conserva para abrir en otra
  // pestaña (click con modificadores o botón del medio sigue el link).
  const abrirVistaAutocontenida = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, vista: 'atrasados' | 'enRiesgo') => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      shallowParams.set(
        { atrasados: vista === 'atrasados' ? 'true' : undefined, enRiesgo: vista === 'enRiesgo' ? 'true' : undefined },
        { history: 'push' },
      )
    },
    [shallowParams],
  )

  // Lightweight badge counts fetched independently from the full datasets.
  // This keeps the badge live without re-downloading the entire Pedidos list.
  const {
    fiadosCount,
    alertasCount,
    atrasadosCount,
    enRiesgoCount,
    porPlanificarCount,
    enRutaCount,
    esperandoPagoCount,
    esperandoPagoTotal,
    pendientesN2Count,
    refetch: refetchCounts,
  } = usePedidosCounts(true)

  // Fase 4a — Pedido Hub detrás del flag. OFF: la vista de consulta es la
  // actual (tabs). Ver docs/pedidos/fase4a-hub-plan.md.

  // Refresca el dataset activo: el cache completo (modo normal) o el
  // fallback server-filtrado (negocio con más pedidos que el tope del cache).
  const refreshPedidos = useCallback(async () => {
    if (hubMode) { setHubRefreshKey(n => n + 1); return }
    if (cacheActive) await loadAllPedidos()
    else await fallbackRefetch()
  }, [cacheActive, loadAllPedidos, fallbackRefetch, hubMode])

  // Reconcilia las filas pendientes (offline) contra el resultado real del
  // sync. Declarado después de refreshPedidos/refetchFiados/refetchAlertas/
  // refetchCounts (no antes: son useCallback con deps propias, referenciarlos
  // en el array de deps de este efecto antes de su declaración sería un
  // acceso en temporal dead zone).
  useEffect(() => {
    function handleSyncItemDone(e: Event) {
      const detail = (e as CustomEvent<{ offlineId: string; localEndpoint: string; status: string; reason?: string }>).detail
      if (!detail) return

      // Asignación de pedido a embarque hecha offline: al sincronizar puede
      // volver `conflict` (409) si el pedido ya estaba en OTRO embarque. El
      // pedido no se pierde, pero el usuario debe enterarse de que su
      // asignación no se aplicó tal cual (review PR #147, hallazgo F6).
      if (detail.localEndpoint === 'asignar-embarque') {
        if (detail.status === 'conflict') {
          toast.info('Un pedido que asignaste sin conexión ya estaba en otro embarque. Revisá la lista.')
        }
        if (detail.status === 'dlq') {
          toast.error(detail.reason || 'No se pudo asignar un pedido a su embarque.')
        }
        refreshPedidos()
        refetchCounts()
        return
      }

      if (detail.localEndpoint !== 'crear-pedido') return
      if (detail.status === 'dlq') {
        // Rechazo permanente (ej. límite de fiado excedido): NO desaparece
        // en silencio — se marca como fallido con el motivo real del
        // servidor, y el usuario decide si reintenta o descarta.
        setPendingPedidos((prev) => prev.map((p) =>
          p._pendingOfflineId === detail.offlineId
            ? { ...p, _pendingFailed: true, _pendingFailReason: detail.reason || 'No se pudo crear el pedido.' }
            : p
        ))
        return
      }
      setPendingPedidos((prev) => prev.filter((p) => p._pendingOfflineId !== detail.offlineId))
      if (detail.status === 'synced' || detail.status === 'conflict') {
        refreshPedidos()
        refetchFiados()
        refetchAlertas()
        refetchCounts()
      }
    }
    window.addEventListener(SYNC_ITEM_DONE_EVENT, handleSyncItemDone)
    return () => window.removeEventListener(SYNC_ITEM_DONE_EVENT, handleSyncItemDone)
  }, [refreshPedidos, refetchFiados, refetchAlertas, refetchCounts])

  // Polling: refetch active tab dataset + counts every 60s.
  // Fiados/alertas datasets are lazy-loaded and only polled when their tab is active.
  // Clientes/embarques have their own polling (60s default) in their respective components.
  usePollingRefetch(() => {
    refreshPedidos()
    if (activeTab === 'fiados') refetchFiados()
    if (activeTab === 'alertas') refetchAlertas()
    refetchCounts()
    fetchClientes()
    fetchEmbarques()
  }, 60_000)

  // Refetch active dataset on SSE reconnect (Vercel 60s cycle). The client
  // may have missed realtime events while disconnected.
  useReconnectHandler(() => {
    refreshPedidos()
    if (activeTab === 'fiados') refetchFiados()
    if (activeTab === 'alertas') refetchAlertas()
    refetchCounts()
    fetchClientes()
    fetchEmbarques()
  })

  // Wire-up de realtime (aditivo sobre el polling de 60s, que queda intacto
  // como fallback para cuando SSE está apagado: 2G, circuit breaker, tab
  // oculta, offline). Mismo patrón que clientes-client.
  // `embarque.*` también: reasignar el embarque o su repartidor cambia la segunda
  // línea de la fila (P2-3, #453).
  useRealtimeListener(['pedido.*', 'embarque.*'], () => {
    refreshPedidos()
  })

  // Solicitudes de excepción de crédito pendientes: solo las recibe quien tiene
  // el permiso por usuario (el servidor responde vacío al resto).
  const { excepciones: excepcionesPendientes, refetch: refetchExcepciones } = useExcepcionesPendientes()

  // Auto-open pedido from URL param. Si está en la lista cargada se abre al
  // instante; si no (pedido de otra fecha, cache truncado) se busca por id
  // (P1-1 PR A, #377) y se avisa cuando no existe / no hay acceso / no hay red.
  const openPedidoBuscandoRef = useRef<string | null>(null)
  useEffect(() => {
    if (!openPedidoParam) return
    const pedido = pedidos.find(p => p.id === openPedidoParam || p.numero.toString() === openPedidoParam)
    if (pedido) {
      handleDetail(pedido)
      syncUrl({ openPedido: undefined })
      return
    }
    if (!hasLoadedOnce || openPedidoBuscandoRef.current === openPedidoParam) return
    openPedidoBuscandoRef.current = openPedidoParam
    void abrirPedidoPorId(openPedidoParam).finally(() => {
      openPedidoBuscandoRef.current = null
      syncUrl({ openPedido: undefined })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- abrirPedidoPorId/handleDetail son funciones del componente (recreadas por render); la guarda es openPedidoBuscandoRef
  }, [openPedidoParam, pedidos, hasLoadedOnce, syncUrl])

  const updateFilter = useCallback((key: string, value: string) => {
    const current = shallowParams.getAll(key)
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    // G6: al togglear "Canal", limpiar también el param legacy `?tipo=` para
    // que no quede un filtro fantasma si el efecto de migración aún no corrió.
    const extra = key === 'canal' ? { tipo: undefined } : {}
    syncUrl({ [key]: next.length > 0 ? next : undefined, ...extra })
  }, [shallowParams, syncUrl])

  const setSingleFilter = useCallback((key: string, value: string) => {
    syncUrl({ [key]: value })
  }, [syncUrl])

  const setHoyFilter = useCallback((key: string, value: string) => {
    const today = getTodayString()
    syncUrl({ [key]: value, desde: today, hasta: today })
  }, [syncUrl])

  const updateSearch = useCallback((value: string) => {
    syncUrl({ search: value || undefined })
  }, [syncUrl])

  const updateClienteId = useCallback((value: string | null) => {
    syncUrl({ clienteId: value || undefined })
  }, [syncUrl])

  const [searchInput, setSearchInput] = useState(search)
  // Último valor de search que fue committeado a la URL. Trata la URL como
  // fuente de verdad y el input como borrador (AGENTS.md #22): el effect de
  // debounce solo navega si el input difiere del ref, no de la prop stale.
  const lastCommittedSearchRef = useRef(search)
  const [prevSearchProp, setPrevSearchProp] = useState(search)

  const clearAllFilters = useCallback(() => {
    setSearchInput('')
    // Marcar el ref ANTES de navegar: el effect de debounce de searchInput
    // compararía '' (nuevo input) contra la prop search aún stale ('Pedro')
    // y sobreescribiría la URL con un closure viejo, perdiendo all=true y
    // dejando estadoEntrega. Mismo anti-patrón documentado en AGENTS.md #22.
    lastCommittedSearchRef.current = ''
    syncUrl({
      search: undefined,
      clienteId: undefined,
      origen: undefined,
      estadoEntrega: undefined,
      estadoPago: undefined,
      canal: undefined,
      tipo: undefined, // legacy — limpiar ambos
      desde: undefined,
      hasta: undefined,
      all: 'true',
    })
  }, [syncUrl])

  async function fetchClientes(): Promise<Cliente[]> {
    try {
      const res = await fetch('/api/clientes?all=true', { credentials: 'include', signal: AbortSignal.timeout(8_000) })
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
      const res = await fetch('/api/embarques', { credentials: 'include', signal: AbortSignal.timeout(8_000) })
      if (redirectIfAuthError(res)) return
      const data = await res.json()
      setEmbarques((data.embarques || data.data || []).filter((e: Embarque) => e.estado === 'ABIERTO' || e.estado === 'EN_RUTA'))
    } catch (error) {
      console.error('Error fetching embarques:', error)
    }
  }

  // Sincroniza searchInput desde la prop search durante el render en vez
  // de en un efecto (mismo mecanismo de lastCommittedSearchRef, AGENTS.md #22).
  if (search !== prevSearchProp) {
    setPrevSearchProp(search)
    setSearchInput(search)
    lastCommittedSearchRef.current = search
  }

  useEffect(() => {
    if (searchInput === lastCommittedSearchRef.current) return
    const timer = setTimeout(() => {
      if (searchInput !== lastCommittedSearchRef.current) {
        lastCommittedSearchRef.current = searchInput
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

  // Carga inicial: clientes/embarques para el buscador interno del modal de
  // nuevo pedido. El listado principal se carga por usePedidos(autoFetch).
  // Deliberadamente NO se espera este fetch para abrir el modal cuando hay
  // un clienteId conocido (ver efecto siguiente): `fetchClientes()` pega a
  // GET /api/clientes?all=true, un scan sin paginar de toda la tabla con 4
  // relaciones — antes bloqueaba la apertura del modal solo para encontrar
  // el ÚNICO cliente que ya se conocía por id.
  // Se salta en las vistas autocontenidas atrasados/enRiesgo ("Verlos" del
  // dashboard): el modal de nuevo pedido no es el foco de esa vista. Se
  // carga en cuanto el usuario vuelve a la vista normal (mismo efecto,
  // re-ejecutado por el cambio de atrasadosParam/enRiesgoParam), y como red
  // de seguridad también al abrir el modal de nuevo pedido directamente
  // desde ahí (ver efecto de showModal/showVentaRapida más abajo).
  useEffect(() => {
    if (atrasadosParam || enRiesgoParam) return
    let cancelled = false
    ;(async () => {
      await Promise.all([fetchClientes(), fetchEmbarques()])
      if (cancelled) return
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atrasadosParam, enRiesgoParam])

  // Red de seguridad: si el usuario abre el modal de nuevo pedido/venta
  // rápida directo desde la vista atrasados/enRiesgo (sin haber vuelto antes
  // a la vista normal), clientes/embarques todavía pueden estar vacíos
  // porque el efecto de arriba los saltó. Cargarlos on-demand en ese caso.
  useEffect(() => {
    if (!showModal && !showVentaRapida) return
    if (clientes.length > 0) return
    void fetchClientes()
    void fetchEmbarques()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, showVentaRapida])

  // Apertura del modal de "Nuevo Pedido" con cliente pre-seleccionado
  // (?new=1&clienteId=X, deep-link desde /clientes). Fetch targeted de un
  // solo cliente (con caché compartida, ver src/lib/cliente-detail-cache.ts)
  // en vez de esperar la lista completa de arriba — la apertura del modal ya
  // no depende de fetchClientes()/fetchEmbarques().
  useEffect(() => {
    // B-17 (#434): el rol decide si el enlace puede abrir el formulario; hasta
    // que la sesión resuelve no se sabe, así que se espera (una sola vez).
    if (sessionStatus === 'loading' || triggerNuevoAtendidoRef.current) return
    triggerNuevoAtendidoRef.current = true
    let cancelled = false
    const clienteId = shallowParams.get('clienteId')
    const negocioId = shallowParams.get('negocioId')
    const openNew = shallowParams.get('new') === '1'

    if (openNew && !puedeCrear) {
      // quien no puede crear no recibe el formulario ni un error: se limpia el
      // disparador y queda la lista (clienteId, si vino, sigue siendo filtro).
      syncUrl({ new: undefined, negocioId: undefined })
    } else if (openNew && clienteId) {
      ;(async () => {
        const result = await loadClienteDetail<{
          id: string
          nombre: string
          telefono: string
          direccion?: string | null
          barrio?: string | null
          frecuenciaSugerida?: { dias: number; label: string } | null
          productosSugeridos?: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }>
        }>(clienteId)
        if (cancelled) return
        if (result.ok) {
          const cliente = result.cliente
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
            frecuenciaSugerida: cliente.frecuenciaSugerida ?? null,
            productosSugeridos: cliente.productosSugeridos ?? [],
          })
          setShowModal(true)
          setModalKey(k => k + 1)
        } else if (result.status === 401 || result.status === 403) {
          router.push('/login?reason=expired')
        } else if (result.status === 404) {
          toast.error('El cliente seleccionado no está disponible')
        } else {
          // Error de red/timeout, distinto de "no encontrado": no colapsar
          // a un solo mensaje genérico para no confundir al usuario.
          toast.error(result.error)
        }
        syncUrl({ new: undefined, clienteId: undefined, negocioId: undefined })
      })()
    } else if (openNew) {
      // new=1 sin clienteId no es un estado válido para abrir el formulario.
      syncUrl({ new: undefined, negocioId: undefined })
    }
    // Si solo hay clienteId (sin new=1), se aplica como filtro de lista
    // mediante pedidoFilterParams; no se limpia para que el usuario vea
    // el filtro activo.
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus])

  useEffect(() => {
    // Fetch GPS delivery config (best-effort, defaults applied on error).
    ;(async () => {
      try {
        const res = await fetch('/api/config?keys=umbralGpsEntregaMetros,requerirGpsParaEntrega,permitirEntregaSinGpsConJustificacion', { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
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
        const res = await fetch('/api/config?clave=LIMITE_PEDIDOS_FIADOS_DEFAULT', { cache: 'no-store', signal: AbortSignal.timeout(8_000) })
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

  // true si el último envío de creación quedó encolado offline (lo marca
  // `onOffline`, que corre antes de que `crearPedido` devuelva null).
  const envioEncoladoRef = useRef(false)
  const { create: crearPedido } = useCrearPedido({
    onSuccess: () => {
      setShowModal(false)
      setShowVentaRapida(false)
      setPedidoInicial(undefined)
      setNuevaDemanda(null)
      setPedidoEditando(null)
      setShowDetailModal(false)
      refreshPedidos()
      if (activeTab === 'fiados') refetchFiados()
      if (activeTab === 'alertas') refetchAlertas()
      refetchCounts()
      fetchClientes()
    },
    onOffline: ({ localId, payload }) => {
      envioEncoladoRef.current = true
      // Antes: el modal se quedaba abierto con el botón reactivado, sin
      // ninguna fila visible en la lista — el usuario asumía que el pedido
      // no se guardó y podía reenviar el mismo form (pedido duplicado real,
      // con cobro real). Ahora: cerramos el modal igual que en un submit
      // exitoso, y la fila pendiente queda visible arriba de la lista.
      const clienteNombre =
        payload.clienteNuevo?.nombre ??
        clientes.find(c => c.id === payload.clienteId)?.nombre ??
        'Cliente'
      setPendingPedidos((prev) => [...prev, buildPendingPedido(localId, payload, clienteNombre)])
      setShowModal(false)
      setShowVentaRapida(false)
      setPedidoInicial(undefined)
      setNuevaDemanda(null)
      setPedidoEditando(null)
    },
  })

  const { anular: anularPedido } = useAnularPedido({
    onSuccess: () => {
      refreshPedidos()
      refetchFiados()
      refetchAlertas()
      refetchCounts()
    },
  })

  const { cancelar: cancelarPedido } = useCancelarPedido({
    onSuccess: () => {
      setShowDetailModal(false)
      refreshPedidos()
      refetchFiados()
      refetchAlertas()
      refetchCounts()
    },
  })

  const { asignar: asignarEmbarque } = useAsignarEmbarque({
    onSuccess: () => {
      refreshPedidos()
      fetchEmbarques()
    },
  })

  // TEMPORAL-SIN-EMBARQUE(#472): el ADMIN registra entregas y cobros sin embarque.
  const gestionAdmin = useGestionAdmin(userRole === 'ADMIN')
  const [registrarEntregaPara, setRegistrarEntregaPara] = useState<Pedido | null>(null)
  const [corregirCanalPara, setCorregirCanalPara] = useState<Pedido | null>(null)

  const { entregar } = useEntregarPedido({
    onSuccess: () => {
      setShowDetailModal(false)
      refreshPedidos()
      refetchFiados()
      refetchAlertas()
      toast.success('Pedido entregado')
    },
    onError: (error) => {
      toast.error(error || 'Error registrando entrega')
    },
  })

  /**
   * `true` = el pedido quedó guardado (creado, deduplicado o encolado offline);
   * `false` = no se guardó y el formulario debe permitir reintentar el MISMO
   * borrador (misma clave de idempotencia, ver `use-crear-pedido`).
   */
  function ubicacionCambio(data: PedidoUnifiedData, actual: Pedido | null): boolean {
    if (data.entregaLat === undefined && data.entregaLng === undefined) return false
    return (data.entregaLat ?? null) !== (actual?.entregaLat ?? null) || (data.entregaLng ?? null) !== (actual?.entregaLng ?? null)
  }

  async function handlePedidoSubmit(data: PedidoUnifiedData): Promise<boolean> {
    try {
      const isEdit = data.isEdit && data.pedidoId
      if (isEdit) {
        // Edit uses PUT endpoint directly (not yet migrated to hook)
        const itemsEditados = !pedidoEditando || itemsCambiaron(
          (pedidoEditando.items ?? []).map((i) => ({ producto: i.producto, cantidad: i.cantPedido, precio: Number(i.precio), precioOrigen: i.precioOrigen ?? 'base' })),
          data.items,
        )
        const cuerpo = {
          // Solo si de verdad cambiaron líneas: editar una nota o la dirección
          // NO debe reenviar ítems (el servidor los rechaza en pedidos con
          // entregas, cerrados o con N2 — y no hay nada que cambiar en ellos).
          items: itemsEditados ? data.items : undefined,
          // Se envía solo si cambió: '' significa "borrar la observación", y
          // mandarlo sin que el usuario lo haya tocado la borraría.
          obs: (data.obs ?? '') === (pedidoEditando?.obs ?? '') ? undefined : (data.obs ?? ''),
          actualizarCliente: data.actualizarCliente,
          // La dirección efectiva actual del pedido es zonaCli/barrioCli: si el
          // formulario la devuelve igual, no hay nada que pedir.
          direccionEntrega: data.direccionEntrega !== undefined && data.direccionEntrega === (pedidoEditando?.zonaCli ?? '') && (data.barrioEntrega ?? '') === (pedidoEditando?.barrioCli ?? '') ? undefined : data.direccionEntrega,
          barrioEntrega: data.direccionEntrega !== undefined && data.direccionEntrega === (pedidoEditando?.zonaCli ?? '') && (data.barrioEntrega ?? '') === (pedidoEditando?.barrioCli ?? '') ? undefined : data.barrioEntrega,
          // Ubicación propia: solo si cambió (undefined = no tocar; null = quitar).
          ...(ubicacionCambio(data, pedidoEditando) ? { entregaLat: data.entregaLat ?? null, entregaLng: data.entregaLng ?? null } : {}),
        }
        if (Object.values(cuerpo).every((v) => v === undefined)) {
          // Nada que pedir: no se llama al servidor ni se aparenta haber guardado.
          setShowModal(false)
          setShowVentaRapida(false)
          setPedidoInicial(undefined)
          setPedidoEditando(null)
          toast.info('Sin cambios: no modificaste nada')
          return true
        }
        const res = await fetch(`/api/pedidos/${data.pedidoId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: AbortSignal.timeout(8_000),
          body: JSON.stringify(cuerpo),
        })
        const payload = await res.json().catch(() => null) as
          | { aplicado?: { campos: string[]; sinCambios: boolean }; error?: { message?: string; formErrors?: string[]; fieldErrors?: Record<string, string[]>; code?: string } }
          | null
        if (res.ok) {
          // Contrato PR-1: el servidor informa qué se aplicó. Sin `aplicado`
          // (servidor anterior) no se puede afirmar que algo se guardó.
          const aplicado = payload?.aplicado
          if (!aplicado) {
            toast.warning('No se pudo confirmar qué se guardó. Recarga el pedido para verificar.')
            refreshPedidos()
            return false
          }
          setShowModal(false)
          setShowVentaRapida(false)
          setPedidoInicial(undefined)
          setPedidoEditando(null)
          setShowDetailModal(false)
          refreshPedidos()
          fetchClientes()
          if (aplicado.sinCambios) toast.info('Sin cambios: el pedido ya tenía esos valores')
          else toast.success(`Pedido actualizado (${aplicado.campos.join(', ')})`)
          return true
        }
        const campo = payload?.error?.fieldErrors ? Object.values(payload.error.fieldErrors)[0]?.[0] : undefined
        toast.error(campo || payload?.error?.message || payload?.error?.formErrors?.[0] || 'Error al guardar')
        return false
      } else {
        // Create uses the hook
        // PedidoUnifiedData.clienteId es opcional (venta rápida sin cliente
        // aún no valida contra CONSUMIDOR_FINAL en el tipo del form), pero
        // CrearPedidoPayload lo exige -- el servidor resuelve/crea el
        // canónico si falta (ver CrearPedidoUseCase lookup-or-create).
        envioEncoladoRef.current = false
        const result = await crearPedido(data as unknown as CrearPedidoPayload)
        if (!result) return envioEncoladoRef.current // null: error u offline (encolado)
        // Corrección de un pedido rechazado: ya se registró con su clave original.
        if (correccion) {
          discardFailedPedido(correccion.offlineId)
          setCorreccion(null)
        }
        setShowModal(false)
        setShowVentaRapida(false)
        setPedidoInicial(undefined)
        setNuevaDemanda(null)
        setPedidoEditando(null)
        refreshPedidos()
        fetchClientes()
        // F8-ii: "esto se repite" — propuesta POST-commit, transacción
        // separada (Q5). Solo Hub + contexto real + >=3 productos +
        // ADMIN/ASISTENTE. Nunca en el mismo paso que "Crear pedido".
        const totalItems = (data.items ?? []).reduce((s, i) => s + (i.cantidad || 0), 0)
        const contextoReal = data.clienteId && data.clienteId !== 'CONSUMIDOR_FINAL'
        if (hubMode && contextoReal && totalItems >= 3 && (userRole === 'ADMIN' || userRole === 'ASISTENTE')) {
          setProponerHabitual({
            contexto: data.negocioId
              ? { tipo: 'negocio', id: data.negocioId }
              : { tipo: 'cliente', id: data.clienteId as string, nombre: clientes.find(c => c.id === data.clienteId)?.nombre },
            canal: data.canal,
            items: (data.items ?? []).map(i => ({ producto: i.producto, cantidad: i.cantidad })),
          })
        }
        // ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001: "entregar después" deja una
        // entrega/retiro pendiente — el toast debe decirlo (no confundir con
        // una venta de mostrador ya entregada).
        const msg = data.origen === 'VENTA_RAPIDA'
          ? data.entregado === false
            ? (data.pagos?.length === 0 ? 'Venta registrada — entrega pendiente' : 'Venta cobrada — entrega pendiente')
            : (data.pagos?.length === 0 ? 'Venta registrada (pendiente)' : 'Venta cobrada')
          : 'Pedido creado exitosamente'
        if (result.deduped) {
          // Reintento de un envío que sí había llegado: es el MISMO pedido.
          const numero = (result.pedido as { numero?: number } | null)?.numero
          toast.info(numero != null ? `Esta venta ya estaba registrada (#${numero}). No se duplicó.` : 'Esta venta ya estaba registrada. No se duplicó.')
        } else {
          toast.success(msg)
        }
        return true
      }
    } catch (error) {
      console.error('Error saving pedido:', error)
      toast.error('Error al guardar')
      return false
    }
  }

  // Filtrado 100% en memoria sobre pedidosSource (cache completo o fallback).
  // Reemplaza el filtrado server-side que antes hacía RSC-nav por filtro.
  // Se separa en dos niveles para preservar exactamente la semántica previa:
  // - pedidosSinSearch: aplica clienteId/desde/hasta/tipo/origen/estado
  //   (antes: filtros server-side que ya llegaban aplicados en displayPedidos).
  // - pedidosVisibles: pedidosSinSearch + search (antes: pedidosFiltrados).
  // stats se calcula sobre pedidosSinSearch (mismo comportamiento previo:
  // ignora el término de búsqueda, respeta el resto de los filtros activos).
  const pedidosSinSearch = useMemo(() => {
    const { gte: desde, lte: hasta } = allFromUrl
      ? { gte: undefined, lte: undefined }
      : (buildDateRangeFilter(desdeUrl, hastaUrl) ?? (() => {
          const { startOfDay, endOfDay } = getTodayRange()
          return { gte: startOfDay, lte: endOfDay }
        })())
    return pedidosSource.filter((p) => {
      if (clienteIdFromUrl && p.clienteId !== clienteIdFromUrl) return false
      if (filtroCanal.length > 0 && !(filtroCanal as string[]).includes(p.canal)) return false
      if (filtroOrigen.length > 0 && !filtroOrigen.includes(p.origen)) return false
      if (conRecurrenciaFromUrl && p.origen !== 'RECURRENTE') return false
      if (filtroEstadoEntrega.length > 0 && !filtroEstadoEntrega.includes(p.estadoEntrega)) return false
      if (filtroEstadoPago.length > 0 && !filtroEstadoPago.includes(p.estadoPago)) return false
      if (!p.fecha) return false
      const fecha = new Date(p.fecha)
      if (desde && fecha < desde) return false
      if (hasta && fecha > hasta) return false
      return true
    })
  }, [pedidosSource, allFromUrl, desdeUrl, hastaUrl, clienteIdFromUrl, filtroCanal, filtroOrigen, conRecurrenciaFromUrl, filtroEstadoEntrega, filtroEstadoPago])

  const pedidosVisibles = useMemo(() => {
    if (!search) return pedidosSinSearch
    const term = search.toLowerCase()
    return pedidosSinSearch.filter((p) =>
      p.nombreCli?.toLowerCase().includes(term) ||
      p.telefonoCli?.includes(search) ||
      p.numero.toString().includes(term)
    )
  }, [pedidosSinSearch, search])

  // Filas pendientes (offline, aun en requestQueue) filtradas por el mismo
  // término de búsqueda, prependeadas a la vista principal "hoy". No se
  // inyectan en pedidosSinSearch/pedidosSource: esas listas alimentan
  // filtros de fecha/tipo/estado y un pending item no tiene esos campos
  // reales — se agregan después de todo el filtrado, como en clientes.
  const pendingPedidosVisibles = useMemo(() => {
    if (!search) return pendingPedidos
    const term = search.toLowerCase()
    return pendingPedidos.filter((p) =>
      p.nombreCli?.toLowerCase().includes(term) || p.telefonoCli?.includes(search)
    )
  }, [pendingPedidos, search])

  const pedidosVisiblesConPendientes = useMemo(
    () => (pendingPedidosVisibles.length > 0 ? [...pendingPedidosVisibles, ...pedidosVisibles] : pedidosVisibles),
    [pendingPedidosVisibles, pedidosVisibles],
  )

  const hoyStr = useMemo(() => getTodayString(), [])
  const stats = useMemo(() => {
    const fechaEsHoy = (p: Pedido) => {
      if (!p.fecha) return false
      return new Date(p.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) === hoyStr
    }
    const entregadosHoyArr = pedidosSinSearch.filter(p => p.estadoEntrega === 'ENTREGADO' && fechaEsHoy(p))
    return {
      totalPedidos: pedidosSinSearch.length,
      pendientes: pedidosSinSearch.filter(p => p.estadoEntrega === 'PENDIENTE').length,
      enRuta: pedidosSinSearch.filter(p => p.estadoEntrega === 'EN_RUTA').length,
      entregadosHoy: entregadosHoyArr.length,
      pacasVendidas: pedidosSinSearch
        .filter(p => p.estadoEntrega === 'ENTREGADO')
        .reduce(
          (acc, p) => acc
            + Number(p.cPacaAguaEnt || 0)
            + Number(p.cPacaHieloEnt || 0)
            + Number(p.cBotellonFabEnt || 0)
            + Number(p.cBotellonDomEnt || 0),
          0
        ),
      fiadoTotal: pedidosSinSearch
        .filter(p => p.estadoEntrega === 'ENTREGADO' && Number(p.saldo) > 0)
        .reduce((acc, p) => acc + Number(p.saldo), 0),
    }
  }, [pedidosSinSearch, hoyStr])

  const hasActiveFilters = !!(search || clienteIdFromUrl || filtroCanal.length > 0 || filtroOrigen.length > 0 || filtroEstadoEntrega.length > 0 || filtroEstadoPago.length > 0 || desdeUrl || hastaUrl)
  const hasDateFilter = !!(desdeUrl || hastaUrl)

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

  function getCanalBadge(canal: string) {
    const styles: Record<string, string> = {
      DOMICILIO: 'bg-indigo-100 text-indigo-700',
      PUNTO: 'bg-emerald-100 text-emerald-700',
    }
    const labels: Record<string, string> = { DOMICILIO: 'Domicilio', PUNTO: 'Punto' }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${styles[canal] || 'bg-gray-100 text-gray-500'}`}>
        {labels[canal] || canal}
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

  /**
   * Entregar SIEMPRE pasa por POST /api/pedidos/[id]/entrega (cantidades, pagos,
   * reconexión N2, factura). Sin pantallas intermedias: la oficina no llena foto
   * ni GPS (la obligatoriedad por rol la aplica el servidor).
   *
   * Quién entregó, sin preguntar cuando no hace falta:
   *  - sin embarque (mostrador)           → entrega normal;
   *  - embarque que aún no sale (ABIERTO) → es un retiro: el vehículo no pudo entregar;
   *  - embarque EN_RUTA                   → el botón elegido ("Entregó el repartidor"
   *                                         o "Cliente retiró").
   * El GPS se toma solo y se envía únicamente si está en el domicilio del cliente:
   * la posición de la oficina NO se guarda como GPS de entrega (contaminaría la
   * geocodificación de negocios, que usa la mediana del GPS de entregas).
   */
  async function entregarPedido(pedido: Pedido, quien: 'REPARTIDOR' | 'CLIENTE_RETIRO' = 'REPARTIDOR') {
    if (updatingId) return
    // El detalle trae el estado de su embarque; la lista de embarques es el respaldo.
    let embarqueEstado = pedido.embarqueId
      ? (pedido.embarqueResumen?.estado ?? embarques.find((e) => e.id === pedido.embarqueId)?.estado)
      : undefined
    // Sin el estado no se sabe si el vehículo ya salió (entrega física) o si es un retiro:
    // adivinar registra la entrega sin atribuirla ni soltar el pedido del embarque.
    if (pedido.embarqueId && !embarqueEstado) {
      try {
        const res = await fetch(`/api/pedidos/${pedido.id}`)
        const json = res.ok ? await res.json() : null
        embarqueEstado = (json?.data?.pedido ?? json?.pedido)?.embarqueResumen?.estado
      } catch {
        embarqueEstado = undefined
      }
      if (!embarqueEstado) {
        toast.error('No se pudo verificar el embarque del pedido. Intenta de nuevo.')
        return
      }
    }
    const decision = resolverEntrega({ embarqueId: pedido.embarqueId, embarqueEstado, quien })
    setUpdatingId(pedido.id)
    try {
      // PR-1: `entregar()` acumula → se envía el RESTO por línea (`cantPedido − cantEntrega`).
      const itemsEntregados = (pedido.items || []).flatMap((i) => {
        const resto = i.cantPedido - (i.cantEntrega || 0)
        return resto > 0 ? [{ producto: i.producto, cantidad: resto }] : []
      })

      let gps: { lat: number; lng: number; accuracy?: number } | null = null
      if (decision.tomarGps) {
        const clienteParaGps = clientes.find((c) => c.id === pedido.clienteId)
        const targetLat = pedido.lat ?? clienteParaGps?.lat
        const targetLng = pedido.lng ?? clienteParaGps?.lng
        const medido = await capturarGpsSilencioso()
        if (medido && targetLat != null && targetLng != null &&
            isWithinDeliveryRadius(medido, { lat: Number(targetLat), lng: Number(targetLng) }, gpsConfig.radiusMeters)) {
          gps = medido
        }
      }

      await entregar({
        pedidoId: pedido.id,
        itemsEntregados,
        pagos: [],
        // Contexto físico: solo si lo entregó el vehículo de un embarque que ya salió.
        embarqueEntregaId: decision.embarqueEntregaId,
        clienteRetiro: decision.clienteRetiro ? true : undefined,
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
        gpsAccuracy: gps?.accuracy,
        entregadoConGps: gps !== null,
      })
    } finally {
      setUpdatingId(null)
    }
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    if (updatingId) return

    if (nuevoEstado === 'ENTREGADO') {
      const pedido = (selectedPedido?.id === id ? selectedPedido : null) ?? pedidos.find((p) => p.id === id)
      if (pedido) void entregarPedido(pedido)
      return
    }

    if (nuevoEstado === 'EN_RUTA') {
      setShowDetailModal(false)
      setSelectedPedidoForEmbarque(id)
      setSelectedEmbarqueId('')
      setShowEmbarqueModal(true)
      return
    }

    // Confirmaciones con contexto para acciones destructivas
    if (nuevoEstado === 'CANCELADO') {
      anularMotivoRef.current = ''
      const ok = await confirm({
        title: 'Cancelar pedido',
        message: '¿Estás seguro de cancelar este pedido?',
        description: 'El pedido se marcará como cancelado y no se podrá revertir.',
        details: (
          <div className="space-y-3 w-full">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo de cancelación *</label>
              <input
                type="text"
                placeholder="Ej: el cliente ya no lo necesita, pedido duplicado..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition"
                onChange={(e) => { anularMotivoRef.current = e.target.value }}
                autoFocus
              />
            </div>
          </div>
        ),
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
      if (!anularMotivoRef.current.trim()) {
        toast.error('Debes indicar el motivo de cancelación')
        return
      }
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
        success = await cancelarPedido({ pedidoId: id, motivo: anularMotivoRef.current.trim() })
      } else {
        // Volver a PENDIENTE = quitar el pedido de su embarque, con la operación
        // especializada (libera la asignación, audita y avisa al repartidor).
        // El PUT /api/pedidos/[id] ya NO cambia estados.
        const embarqueId = (selectedPedido?.id === id ? selectedPedido : pedidos.find((p) => p.id === id))?.embarqueId
        if (nuevoEstado !== 'PENDIENTE' || !embarqueId) {
          toast.error('Esa transición se hace con su operación específica')
          return
        }
        const res = await fetch(`/api/embarques/${embarqueId}/pedidos/${id}`, {
          method: 'DELETE',
          credentials: 'include',
          signal: AbortSignal.timeout(8_000),
        })
        const cuerpo = await res.json().catch(() => null) as { error?: { message?: string } | string } | null
        if (!res.ok) {
          const msg = typeof cuerpo?.error === 'string' ? cuerpo.error : cuerpo?.error?.message
          toast.error(msg || 'Error actualizando estado')
          return
        }
        success = true
      }
      if (success) {
        setShowDetailModal(false)
        refreshPedidos()
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

  // Stale guard: rejects responses from a previous rapid-click request.
  // Pattern: identical to clientes-client viewSeqRef.
  const detailSeqRef = useRef(0)

  // Fase 4b — la acción destacada del Hub enruta al flujo existente
  // correspondiente. Las mutaciones inline desde el peek son alcance de
  // Composición (no de 4b): acá abrimos el modal/flujo que ya maneja la
  // mutación con sus confirmaciones + estados offline.
  function handleHubAccion(pedido: Pedido, key: string) {
    switch (key) {
      case 'registrar-entrega':
        if (gestionAdmin.activa && userRole === 'ADMIN' && ['PENDIENTE','NO_ENTREGADO'].includes(pedido.estadoEntrega)) setRegistrarEntregaPara(pedido)
        else handleDetail(pedido)
        break
      case 'planificar':
        setSelectedPedidoForEmbarque(pedido.id)
        setShowEmbarqueModal(true)
        break
      case 'confirmar-pago':
        router.push('/pagos-confirmar')
        break
      case 'ver-cartera':
        router.push(pedido.clienteId === 'CONSUMIDOR_FINAL' ? '/cartera' : `/cartera?clienteId=${pedido.clienteId}`)
        break
      case 'nueva-demanda':
        // G11.B — pedido nuevo e independiente, vinculado por `pedidoOrigenId`
        // (declaración explícita del usuario, no inferencia). Cliente y canal
        // vienen del origen y son inmutables; items en blanco.
        setPedidoInicial(undefined)
        setShowVentaRapida(false)
        setNuevaDemanda({
          pedidoOrigenId: pedido.id,
          numeroOrigen: pedido.numero,
          clienteId: pedido.clienteId,
          canal: pedido.canal === 'PUNTO' ? 'PUNTO' : 'DOMICILIO',
        })
        setShowModal(true)
        break
      case 'venta-libre':
        // Frontera N2 ↔ Venta Libre (P4 / contrato de cierre VENTA_LIBRE §4):
        // el Pedido Hub **NO crea** una Venta Libre. Esta opción SOLO NAVEGA
        // al contexto de Embarques (donde se registra: repartidor en ruta, o
        // Admin/Asistente durante la conciliación de ESE embarque). Cero
        // creación desde Pedidos, cero segunda implementación.
        router.push(pedido.embarqueId ? `/embarques/${pedido.embarqueId}` : '/embarques')
        break
      default:
        // registrar-entrega / registrar-pago / resolver-excepcion /
        // completar-pendiente → el modal de detalle tiene la acción según estado.
        handleDetail(pedido)
    }
  }

  /** Abre el detalle de un pedido que no está en la lista cargada (GET /api/pedidos/[id]). */
  async function abrirPedidoPorId(id: string, onError?: (message: string) => void) {
    const toastId = toast.loading('Abriendo pedido…')
    try {
      const res = await fetch(`/api/pedidos/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(8_000) })
      if (res.status === 404) {
        onError?.('Ese pedido no existe o ya no está disponible.')
        toast.error('Ese pedido no existe o ya no está disponible.', { id: toastId })
        return
      }
      if (res.status === 403) {
        onError?.('No tienes acceso a ese pedido.')
        toast.error('No tienes acceso a ese pedido.', { id: toastId })
        return
      }
      if (!res.ok) {
        onError?.('No se pudo abrir el pedido. Intenta de nuevo.')
        toast.error('No se pudo abrir el pedido. Intenta de nuevo.', { id: toastId })
        return
      }
      const data = await res.json()
      const pedido = data.pedido as Pedido | undefined
      if (!pedido || !Array.isArray(pedido.items) || pedido.id !== id && String(pedido.numero) !== id) {
        onError?.('No se pudo identificar el pedido solicitado.')
        toast.error('No se pudo abrir el pedido. Intenta de nuevo.', { id: toastId })
        return
      }
      toast.dismiss(toastId)
      // el detalle ya viene completo: handleDetail no lo vuelve a pedir
      await handleDetail(pedido, { yaCompleto: true })
    } catch {
      onError?.('Sin conexión. No se pudo abrir el pedido.')
      toast.error('Sin conexión. No se pudo abrir el pedido.', { id: toastId })
    }
  }

  function abrirDocumentoPedido(id: string, volver = volverConsulta) {
    setPedidoDocumento({ id, volver, loading: true, error: null })
    void abrirPedidoPorId(id, error => setPedidoDocumento(prev => prev ? { ...prev, error } : prev))
      .finally(() => setPedidoDocumento(prev => prev ? { ...prev, loading: false } : prev))
  }

  async function handleDetail(pedido: Pedido, opts?: { yaCompleto?: boolean }) {
    const seq = ++detailSeqRef.current
    setSelectedPedido(pedido)
    setShowDetailModal(true)

    // Lazy-load factura for the detail modal (issue 3). The list does not
    // eagerly fetch it, so we fetch it when the user opens a pedido.
    try {
      const res = opts?.yaCompleto ? null : await fetch(`/api/pedidos/${pedido.id}`, { signal: AbortSignal.timeout(8_000) })
      if (seq !== detailSeqRef.current) return // stale, discard
      if (res?.ok) {
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
      } else if (res) {
        // El listado no trae campos del detalle (p. ej. si un precio manual fue autorizado):
        // sin aviso, la copia del listado pasaría por la definitiva (#467).
        toast.warning('No se pudo cargar todo el detalle del pedido. Algunos datos pueden estar incompletos.', { id: 'detalle-pedido-incompleto' })
      }
    } catch {
      // Se sigue mostrando la copia del listado, pero se avisa que puede estar incompleta (#467).
      if (seq === detailSeqRef.current) {
        toast.warning('No se pudo cargar todo el detalle del pedido. Algunos datos pueden estar incompletos.', { id: 'detalle-pedido-incompleto' })
      }
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
          signal: AbortSignal.timeout(8_000),
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

  // Si ya tenemos datos cargados, un error posterior no debe bloquear la UI;
  // mostramos un toast y un banner ámbar persistente para que el usuario
  // sepa que ocurrió un error y pueda reintentar.
  // En hubMode el Hub muestra un chip persistente ("No se pudo actualizar",
  // F9-ii); el toast por cada poll fallido (cada 60s) sería ruido redundante.
  const showErrorBanner = fetchError && hasLoadedOnce
  useEffect(() => {
    if (showErrorBanner && !hubMode) {
      toast.error(fetchError)
    }
  }, [showErrorBanner, fetchError, hubMode])

  if (fetchError && !hasLoadedOnce) {
    return (
      <ErrorState
        title="Error cargando pedidos"
        message={fetchError || 'No se pudieron cargar los pedidos'}
        errorCode="FETCH_PEDIDOS_ERROR"
        onRetry={() => { refreshPedidos(); fetchClientes(); fetchEmbarques(); }}
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
        onRetry={() => { setLoadTimeoutReached(false); refreshPedidos(); fetchClientes(); fetchEmbarques(); }}
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

  return (
    <div>
      {/* Banner de error persistente cuando hay datos cargados pero falló el refetch.
          En hubMode lo representa el propio Hub (chip "No se pudo actualizar",
          Fase 9 F9-ii) — evitamos el doble mensaje. */}
      {showErrorBanner && !hubMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-amber-800 text-sm font-medium">{fetchError}</span>
          </div>
          <button
            onClick={() => refreshPedidos()}
            className="text-amber-700 text-sm font-semibold hover:text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition shrink-0"
            data-testid="retry-fetch"
          >
            Reintentar
          </button>
        </div>
      )}
      {/* Header con tabs */}
      <div className="mb-6">
        <ExcepcionesPendientesBanner
          excepciones={excepcionesPendientes}
          onRevisar={(id) => shallowParams.set({ openExcepcionCredito: id }, { history: 'push' })}
        />
        {openExcepcionParam && (
          <ExcepcionCreditoModal
            excepcionId={openExcepcionParam}
            onClose={() => syncUrl({ openExcepcionCredito: undefined })}
            onResuelta={() => { void refetchExcepciones() }}
          />
        )}
        {/* Pedidos pendientes de días anteriores sin asignar a un viaje —
            ver src/lib/pedidos-sin-asignar.ts. Visible sin importar el tab
            activo: es una advertencia operativa, no un filtro de la vista. */}
        {activeTab === 'hoy' && atrasadosCount > 0 && (
          <div data-testid="banner-atrasados-sin-asignar">
            <InfoBanner type="tip" className="mb-4">
              <span>
                ⚠️ {atrasadosCount} pedido{atrasadosCount === 1 ? '' : 's'} de días anteriores sin
                asignar o sin entregar — riesgo de incumplir la entrega.{' '}
                {/* <a> a propósito (AGENTS.md #27): navegar con <Link> a la misma ruta no avisa a useShallowSearchParams */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href="/pedidos?atrasados=true"
                  onClick={(e) => abrirVistaAutocontenida(e, 'atrasados')}
                  className="font-semibold underline hover:no-underline"
                  data-testid="banner-atrasados-verlos"
                >
                  Verlos →
                </a>
              </span>
            </InfoBanner>
          </div>
        )}
        {/* Pedidos pendientes de HOY sin asignar (por 3+ embarques cerrados de
            su ruta, o por horas hábiles transcurridas) + pedidos EN_RUTA
            atascados sin entregar de CUALQUIER día — ver
            findPedidosHoyEnRiesgoIds en pedidos-sin-asignar.ts. */}
        {activeTab === 'hoy' && enRiesgoCount > 0 && (
          <div data-testid="banner-hoy-en-riesgo">
            <InfoBanner type="tip" className="mb-4">
              <span>
                🟠 {enRiesgoCount} pedido{enRiesgoCount === 1 ? '' : 's'} lleva
                {enRiesgoCount === 1 ? '' : 'n'} demasiado tiempo sin gestionar — riesgo de olvido o de quedar sin entregar.{' '}
                {/* <a> a propósito (AGENTS.md #27): navegar con <Link> a la misma ruta no avisa a useShallowSearchParams */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  href="/pedidos?enRiesgo=true"
                  onClick={(e) => abrirVistaAutocontenida(e, 'enRiesgo')}
                  className="font-semibold underline hover:no-underline"
                  data-testid="banner-en-riesgo-verlos"
                >
                  Verlos →
                </a>
              </span>
            </InfoBanner>
          </div>
        )}

        {/* Banner explicativo para nuevos usuarios */}
        {!hubMode && activeTab === 'hoy' && pedidosVisibles.length === 0 && !hasActiveFilters && (
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
                : atrasadosParam
                  ? 'Pedidos atrasados sin asignar'
                  : enRiesgoParam
                    ? 'Pedidos en riesgo'
                    : getTituloFecha(desdeUrl, hastaUrl, allFromUrl)}
          </h1>
          {hubMode && activeTab==='hoy' && !atrasadosParam && !enRiesgoParam && <Link href="/recurrentes" className="inline-flex min-h-11 items-center rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-slate-700">↻ Habituales</Link>}
        </div>

        {/* #515: los focos operativos no sustituyen la consulta por cliente. */}
        <div className="flex border-b border-gray-200" role="tablist" aria-label="Vistas de Pedidos">
          {[
            { key: 'hoy', label: 'Pedidos', count: hubMode ? hubTotal : pedidosVisibles.length },
            { key: 'fiados', label: 'Fiados', count: fiadosCount },
            { key: 'alertas', label: 'Alertas', count: alertasVisibles ?? alertasCount },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`pedidos-tab-${tab.key}`}
              aria-controls={`pedidos-panel-${tab.key}`}
              aria-selected={activeTab === tab.key}
              tabIndex={activeTab === tab.key ? 0 : -1}
              onKeyDown={e => {
                if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
                e.preventDefault()
                const keys = ['hoy', 'fiados', 'alertas'] as const
                const index = keys.indexOf(tab.key as typeof keys[number])
                const next = keys[e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3]
                setActiveTab(next)
                requestAnimationFrame(() => document.getElementById(`pedidos-tab-${next}`)?.focus())
              }}
              data-testid={`tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key as 'hoy' | 'fiados' | 'alertas')}
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

      <div role="tabpanel" id={`pedidos-panel-${activeTab}`} aria-labelledby={`pedidos-tab-${activeTab}`} tabIndex={0}>
      {/* Fase 4a — Pedido Hub (flag ON). Reemplaza la vista "hoy" de tabs;
          atrasados/enRiesgo y todos los modales siguen compartidos. */}
      {hubMode && activeTab === 'hoy' && !atrasadosParam && !enRiesgoParam && (
        <ConsultaPedidosHub
          key={`consulta-pedidos:${session?.user?.id ?? 'sin-sesion'}`}
          initial={initialActorId === session?.user?.id ? initialConsulta : undefined}
          pendientes={pendingPedidosVisibles}
          refreshKey={hubRefreshKey}
          gestion={gestionAdmin}
          counts={{ porPlanificarCount, atrasadosCount, enRutaCount, esperandoPagoCount, esperandoPagoTotal, pendientesN2Count }}
          userRole={userRole}
          onAccion={handleHubAccion}
          onNuevaOperacion={puedeCrear ? () => setShowModal(true) : undefined}
          onRefetchCounts={refetchCounts}
          onTotal={actualizarTotalHub}
          onPedidos={actualizarContextoHub}
          onVerPedido={id => abrirDocumentoPedido(id,'Volver a Pedidos')}
          onVerFactura={p => p.factura && setFacturaConsulta({id:p.factura.id,volver:'Volver a Pedidos',pedidoId:p.id,pedidoNumero:p.numero,consulta:`/pedidos?${shallowParams.toString()}`})}
          onCorregirPendiente={corregirFailedPedido}
          onDescartarPendiente={discardFailedPedido}
        />
      )}

      {/* Stats - solo en Hoy (siempre sobre todos los pedidos, ignoran filtros activos) */}
      {!hubMode && activeTab === 'hoy' && !atrasadosParam && !enRiesgoParam && (
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
            onClick={() => syncUrl({ estadoEntrega: undefined })}
            className="bg-white p-3 rounded-xl shadow text-left hover:shadow-md transition"
          >
            <p className="text-xs text-gray-500">Total Pedidos</p>
            <p className="text-xl font-bold text-gray-800">{stats.totalPedidos}</p>
          </button>
        </div>
      )}

      {/* Vista autocontenida: atrasados/en-riesgo, sin filtros de fecha ni SmartDateFilter */}
      {activeTab === 'hoy' && (atrasadosParam || enRiesgoParam) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 flex justify-between items-center">
          <p className="text-sm text-blue-900">
            {atrasadosParam
              ? 'Mostrando solo pedidos pendientes sin asignar de días anteriores.'
              : 'Mostrando pedidos pendientes de hoy sin asignar, y pedidos atascados en ruta sin entregar de cualquier día, que llevan demasiado tiempo sin gestionar.'}
          </p>
          <button
            onClick={volverAPedidosDeHoy}
            className="text-blue-700 text-sm font-semibold hover:text-blue-900 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition shrink-0"
            data-testid="volver-pedidos-hoy"
          >
            ← Volver a Pedidos de Hoy
          </button>
        </div>
      )}

      {/* Filtros - solo en Hoy (fuente de verdad URL) */}
      {!hubMode && activeTab === 'hoy' && !atrasadosParam && !enRiesgoParam && (
        <div className="bg-white p-4 rounded-xl shadow mb-6 space-y-4">
          <SmartDateFilter defaultPreset="hoy" turnoLabel="Ayer y hoy" />
          <PedidoFilters
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            clientes={clientes.map(c => ({ ...c, direccion: c.direccion ?? null, barrio: c.barrio ?? null }))}
            selectedClienteId={clienteIdFromUrl}
            onClienteSelect={updateClienteId}
            filtroCanal={filtroCanal}
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
            const countCliente = pedidosVisibles.length
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
      {activeTab === 'hoy' && (atrasadosParam || enRiesgoParam) && (() => {
        const vistaLoading = atrasadosParam ? loadingAtrasados : loadingEnRiesgo
        const vistaError = atrasadosParam ? errorAtrasados : errorEnRiesgo
        const vistaPedidos = atrasadosParam ? pedidosAtrasados : pedidosEnRiesgo
        if (vistaLoading && vistaPedidos.length === 0) {
          return (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )
        }
        return (
          <>
            {vistaError && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="text-amber-800 text-sm font-medium">{vistaError}</span>
                <button
                  onClick={() => (atrasadosParam ? refetchAtrasados() : refetchEnRiesgo())}
                  className="text-amber-700 text-sm font-semibold hover:text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition shrink-0"
                >
                  Reintentar
                </button>
              </div>
            )}
            <PedidoTable
              pedidos={vistaPedidos}
              updatingId={updatingId}
              hasActiveFilters={false}
              hasDateFilter={false}
              userRole={userRole}
              renderOrigenBadge={getOrigenBadge}
              renderEstadoEntregaBadge={getEstadoEntregaBadge}
              renderEstadoPagoBadge={getEstadoPagoBadge}
              getAlertasPedido={getAlertasPedido}
              tieneFiado={tieneFiado}
              onDetail={handleDetail}
              onCambiarEstado={cambiarEstado}
              onCreateClick={puedeCrear ? () => setShowModal(true) : undefined}
            />
          </>
        )
      })()}
      {!hubMode && activeTab === 'hoy' && !atrasadosParam && !enRiesgoParam && (
        !hasLoadedOnce && loading && pedidosVisiblesConPendientes.length === 0 ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <PedidoTable
            pedidos={pedidosVisiblesConPendientes}
            updatingId={updatingId}
            hasActiveFilters={hasActiveFilters}
            hasDateFilter={hasDateFilter}
            userRole={userRole}
            renderOrigenBadge={getOrigenBadge}
            renderEstadoEntregaBadge={getEstadoEntregaBadge}
            renderEstadoPagoBadge={getEstadoPagoBadge}
            getAlertasPedido={getAlertasPedido}
            tieneFiado={tieneFiado}
            onDetail={handleDetail}
            onCambiarEstado={cambiarEstado}
            onCreateClick={puedeCrear ? () => setShowModal(true) : undefined}
            onDiscardFailed={discardFailedPedido}
            onCorrectFailed={hubMode ? corregirFailedPedido : undefined}
          />
        )
      )}
      <CobroFiadoDialog key={`cobro-fiado:${session?.user?.id ?? 'sin-sesion'}`} cliente={clienteCobro} onClose={() => setClienteCobro(null)} userRole={userRole}
        actorId={session?.user?.id ?? null} visible={activeTab === 'fiados'}
        onRegistrado={() => { refetchFiados(); refetchCounts(); refreshPedidos() }}
        onOpenPedido={abrirDocumentoPedido}
        onOpenFactura={(id, volver) => setFacturaConsulta({ id, volver: volver ?? volverConsulta })} />
      {activeTab === 'fiados' && (
        <FiadosTable
          clientes={clientes}
          limiteGlobal={limiteGlobalFiados}
          pedidos={pedidosFiados}
          loading={loadingFiados || !fiadosCargados && !errorFiados}
          refetching={actualizandoFiados}
          error={errorFiados}
          activeTab={activeTab}
          onPedidosChange={refetchFiados}
          userRole={userRole}
          onCobrar={setClienteCobro}
          onOpenPedido={abrirDocumentoPedido}
          onOpenFactura={(id, volver) => setFacturaConsulta({ id, volver: volver ?? volverConsulta })}
        />
      )}
      {activeTab === 'alertas' && (
        <AlertasTable
          pedidos={pedidosAlertas}
          loading={loadingAlertas || !alertasCargadas && !errorAlertas}
          error={errorAlertas}
          activeTab={activeTab}
          onCountChange={setAlertasVisibles}
          onRetry={refetchAlertas}
          userRole={userRole}
          onOpenPedido={abrirDocumentoPedido}
          onOpenFactura={(id, volver) => setFacturaConsulta({ id, volver: volver ?? volverConsulta })}
        />
      )}

      </div>
      {/* Modal Formulario Unificado */}
      <Modal open={showModal || showVentaRapida} onClose={() => { setShowModal(false); setShowVentaRapida(false); setPedidoInicial(undefined); setNuevaDemanda(null) }} className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className={`p-4 border-b flex justify-between items-center ${showVentaRapida ? 'bg-green-50' : 'bg-blue-50'}`}>
          <div>
            <h2 className={`text-xl font-bold ${showVentaRapida ? 'text-green-800' : 'text-blue-800'}`}>
              {showVentaRapida ? (ventaEnRutaActiva ? '🚚 Venta en ruta' : '💰 Venta Rápida') : nuevaDemanda ? '📦 Nueva demanda' : '📦 Nuevo Pedido'}
            </h2>
            {!nuevaDemanda && !(showVentaRapida && ventaEnRutaActiva) && (
              <InfoBanner type="info" className="mt-2 text-xs">
                <strong>Venta Rápida</strong> = cliente conocido, paga en el momento.
                <strong> Venta Libre</strong> = consumidor final sin registro (mostrador).
              </InfoBanner>
            )}
          </div>
          <button
            onClick={() => { setShowModal(false); setShowVentaRapida(false); setPedidoInicial(undefined); setNuevaDemanda(null) }}
            className="text-gray-500 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          {hubMode && nuevaDemanda ? (
            <PedidosWorkspace
              key={`ws-nd-${nuevaDemanda.pedidoOrigenId}-${modalKey}`}
              clientes={clientes}
              modo="nueva-demanda"
              pedidoOrigenNumero={nuevaDemanda.numeroOrigen}
              initialDraft={{
                clienteId: nuevaDemanda.clienteId,
                canal: nuevaDemanda.canal,
                pedidoOrigenId: nuevaDemanda.pedidoOrigenId,
              }}
              onSubmit={handlePedidoSubmit}
              onCancel={() => { setShowModal(false); setShowVentaRapida(false); setPedidoInicial(undefined); setNuevaDemanda(null) }}
            />
          ) : hubMode && !pedidoInicial ? (
            <PedidosWorkspace
              key={`ws-${modalKey}`}
              clientes={clientes}
              intent={showVentaRapida ? 'venta-rapida' : 'pedido'}
              ventaEnRuta={showVentaRapida && ventaEnRutaActiva ? { repartidores: gestionAdmin.repartidores } : undefined}
              initialDraft={correccion?.draft}
              offlineIdInicial={correccion?.offlineId}
              onSubmit={handlePedidoSubmit}
              onCancel={() => { setShowModal(false); setShowVentaRapida(false); setPedidoInicial(undefined); setNuevaDemanda(null); setCorreccion(null) }}
            />
          ) : (
            <PedidoFormUnified
              key={`${pedidoInicial?.id || 'new'}-${modalKey}`}
              contexto={showVentaRapida ? 'PUNTO' : 'DOMICILIO'}
              clientes={clientes}
              onSubmit={handlePedidoSubmit}
              onClose={() => { setShowModal(false); setShowVentaRapida(false); setPedidoInicial(undefined); setNuevaDemanda(null) }}
              pedidoInicial={pedidoInicial}
            />
          )}
        </div>
      </Modal>

      {/* F8-ii: "esto se repite" — propuesta post-commit, modal aparte */}
      <Modal open={!!proponerHabitual} onClose={() => setProponerHabitual(null)} className="bg-white rounded-xl shadow-xl max-w-sm w-full">
        {proponerHabitual && (
          <EstoSeRepite
            contexto={proponerHabitual.contexto}
            canal={proponerHabitual.canal}
            items={proponerHabitual.items}
            onClose={() => setProponerHabitual(null)}
          />
        )}
      </Modal>

      {/* Modal Asignar Embarque */}
      <Modal open={showEmbarqueModal} onClose={() => { setShowEmbarqueModal(false); setSelectedPedidoForEmbarque(null); setSelectedEmbarqueId('') }} className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-bold mb-4">Asignar a Embarque</h2>
        <p className="text-sm text-gray-500 mb-2">Selecciona un embarque abierto o en ruta para este pedido:</p>
        {(() => {
          const pedidoPacas = selectedPedidoForEmbarque ? pedidos.find((p) => p.id === selectedPedidoForEmbarque) ?? (selectedPedido?.id===selectedPedidoForEmbarque?selectedPedido:null) : null
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

      {/* Detalle del pedido (P1-1 PR B, #379): cajón lateral en escritorio, pantalla completa en móvil */}
      <Modal
        open={showDetailModal && !!selectedPedido}
        onClose={() => { setShowDetailModal(false); setPedidoDocumento(null) }}
        overlayClassName="fixed inset-0 bg-black/50 flex justify-end z-50"
        className="bg-white w-full h-[100dvh] md:max-w-3xl md:shadow-xl flex flex-col"
        title={selectedPedido ? `Pedido #${selectedPedido.numero}` : 'Detalle del pedido'}
      >
        {selectedPedido && (
          <PedidoDetalle
            pedido={selectedPedido}
            embarqueNumeroDia={embarques.find(e => e.id === selectedPedido.embarqueId)?.numeroDia}
            preciosActuales={preciosActuales}
            updatingId={updatingId}
            userRole={userRole}
            gestionAdmin={gestionAdmin.activa}
            nombreRepartidor={gestionAdmin.repartidores.find((r) => r.id === selectedPedido.entregadoPorId)?.nombre ?? null}
            estadoBadge={getEstadoEntregaBadge(selectedPedido.estadoEntrega)}
            canalBadge={getCanalBadge(selectedPedido.canal)}
            volverLabel={pedidoDocumento?.volver}
            onOpenFactura={id => setFacturaConsulta({ id, volver: 'Volver a Pedidos',pedidoId:selectedPedido.id,pedidoNumero:selectedPedido.numero,consulta:`/pedidos?${shallowParams.toString()}`,desdePedido:true })}
            onClose={() => { setShowDetailModal(false); setPedidoDocumento(null) }}
            onAccion={(key) => {
              setPedidoDocumento(null)
              switch (key) {
                case 'editar':
                  setPedidoEditando(selectedPedido)
                  setShowDetailModal(false)
                  break
                case 'enviar': void cambiarEstado(selectedPedido.id, 'EN_RUTA'); break
                case 'cancelar': void cambiarEstado(selectedPedido.id, 'CANCELADO'); break
                case 'entregar': void entregarPedido(selectedPedido, 'REPARTIDOR'); break
                case 'entregar-retiro': void entregarPedido(selectedPedido, 'CLIENTE_RETIRO'); break
                case 'registrar-entrega':
                  setShowDetailModal(false)
                  setRegistrarEntregaPara(selectedPedido)
                  break
                case 'corregir-canal':
                  setShowDetailModal(false)
                  setCorregirCanalPara(selectedPedido)
                  break
                case 'volver-pendiente': void cambiarEstado(selectedPedido.id, 'PENDIENTE'); break
                case 'anular': void cambiarEstado(selectedPedido.id, 'ANULADO'); break
              }
            }}
          />
        )}
      </Modal>

      {/* TEMPORAL-SIN-EMBARQUE(#472): Registrar entrega (ADMIN, sin embarque) */}
      {registrarEntregaPara && (
        <RegistrarEntregaDialog
          pedido={{
            id: registrarEntregaPara.id,
            numero: registrarEntregaPara.numero,
            canal: registrarEntregaPara.canal,
            clienteId: registrarEntregaPara.clienteId,
            nombreCliente: registrarEntregaPara.nombreCli,
            total: Number(registrarEntregaPara.total),
            totalPagado: Number(registrarEntregaPara.totalPagado),
            entregadoPorId: registrarEntregaPara.entregadoPorId ?? null,
            items: (registrarEntregaPara.items ?? []).map((i) => ({ producto: i.producto, cantPedido: i.cantPedido, cantEntrega: i.cantEntrega })),
          }}
          repartidores={gestionAdmin.repartidores}
          onClose={() => setRegistrarEntregaPara(null)}
          onRegistrado={({ deduped, numero }) => {
            setRegistrarEntregaPara(null)
            refreshPedidos()
            refetchFiados()
            refetchAlertas()
            if (deduped) toast.info(`La entrega del pedido #${numero} ya estaba registrada`)
            else toast.success(`Entrega del pedido #${numero} registrada`)
          }}
        />
      )}

      {/* TEMPORAL-SIN-EMBARQUE(#472): Corregir canal (ADMIN, pedido abierto) */}
      {corregirCanalPara && (
        <CorregirCanalDialog
          pedido={{
            id: corregirCanalPara.id,
            numero: corregirCanalPara.numero,
            canal: corregirCanalPara.canal,
            nombreCliente: corregirCanalPara.nombreCli,
            total: Number(corregirCanalPara.total),
          }}
          onClose={() => setCorregirCanalPara(null)}
          onCorregido={({ deduped, numero, canalDespues }) => {
            setCorregirCanalPara(null)
            refreshPedidos()
            refetchFiados()
            refetchAlertas()
            if (deduped) toast.info(`El canal del pedido #${numero} ya estaba corregido`)
            else toast.success(`Pedido #${numero} corregido a ${canalDespues === 'DOMICILIO' ? 'domicilio' : 'punto de venta'}`)
          }}
        />
      )}

      {/* Modal Editar Pedido */}
      {pedidoEditando && (() => {
        // FIX: pedidoEditando.zonaCli/barrioCli ya son la dirección RESUELTA
        // (negocio gana, fallback cliente) — usarla como si fuera la
        // dirección propia del cliente corrompía la opción "domicilio
        // principal" del selector con la dirección del negocio cuando el
        // pedido tenía uno. Se busca el registro real del cliente ya
        // cargado en memoria; zonaCli/barrioCli solo quedan como fallback
        // defensivo si por algún motivo el cliente no está en la lista.
        const clienteRaw = clientes.find(c => c.id === pedidoEditando.clienteId)
        const itemsArray = pedidoEditando.items && pedidoEditando.items.length > 0
          ? pedidoEditando.items.map((i) => ({
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
              {/* C4: el workspace de edición solo cubre PEDIDO / VENTA_RAPIDA.
                  VENTA_LIBRE / RECURRENTE siguen en el form legacy (§8.3 PENDIENTE). */}
              {hubMode && (pedidoEditando.origen === 'PEDIDO' || pedidoEditando.origen === 'VENTA_RAPIDA') ? (
                <PedidosWorkspace
                  key={`edit-ws-${pedidoEditando.id}`}
                  clientes={clientes}
                  onSubmit={handlePedidoSubmit}
                  onCancel={() => setPedidoEditando(null)}
                  pedidoInicial={{
                    id: pedidoEditando.id,
                    numero: pedidoEditando.numero,
                    clienteId: pedidoEditando.clienteId,
                    clienteNombre: pedidoEditando.nombreCli,
                    clienteTelefono: pedidoEditando.telefonoCli,
                    clienteDireccion: clienteRaw?.direccion ?? pedidoEditando.zonaCli,
                    clienteBarrio: clienteRaw?.barrio ?? pedidoEditando.barrioCli,
                    negocioId: pedidoEditando.negocioId,
                    negocioDireccion: pedidoEditando.negocioId ? pedidoEditando.zonaCli : null,
                    negocioBarrio: pedidoEditando.negocioId ? pedidoEditando.barrioCli : null,
                    canal: pedidoEditando.canal as 'PUNTO' | 'DOMICILIO',
                    origen: pedidoEditando.origen as 'PEDIDO' | 'VENTA_RAPIDA',
                    items: itemsArray as WorkspacePedidoInicial['items'],
                    obs: pedidoEditando.obs,
                    entregaLat: pedidoEditando.entregaLat ?? null,
                    entregaLng: pedidoEditando.entregaLng ?? null,
                  }}
                />
              ) : (
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
                      ? {
                          id: pedidoEditando.clienteId,
                          nombre: pedidoEditando.nombreCli,
                          telefono: pedidoEditando.telefonoCli,
                          direccion: clienteRaw?.direccion ?? pedidoEditando.zonaCli,
                          barrio: clienteRaw?.barrio ?? pedidoEditando.barrioCli,
                        }
                      : null,
                    negocioId: pedidoEditando.negocioId,
                    // zonaCli/barrioCli YA están resueltos con prioridad negocio
                    // cuando el pedido tiene negocioId — son la dirección del
                    // negocio en ese caso, no la del cliente.
                    negocioDireccion: pedidoEditando.negocioId ? pedidoEditando.zonaCli : null,
                    negocioBarrio: pedidoEditando.negocioId ? pedidoEditando.barrioCli : null,
                    items: itemsArray,
                    obs: pedidoEditando.obs,
                  }}
                />
              )}
            </div>
          </Modal>
        )
      })()}

      {/* Confirm Modal */}
      <FacturaConsultaModal documento={facturaConsulta} onClose={() => setFacturaConsulta(null)}
        onVolverConsulta={() => { if(facturaConsulta?.desdePedido){setShowDetailModal(false);setPedidoDocumento(null)}setFacturaConsulta(null) }}
        onOpenPedido={id => abrirDocumentoPedido(id, pedidoDocumento?.volver ?? volverConsulta)} />
      <Modal open={!!pedidoDocumento && (pedidoDocumento.loading || !!pedidoDocumento.error)} onClose={() => setPedidoDocumento(null)}
        title="Consulta de pedido" overlayClassName="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
        {pedidoDocumento?.loading ? <p role="status">Abriendo pedido…</p> : <div role="alert"><p>{pedidoDocumento?.error}</p><button className="mt-3 min-h-11 rounded border px-4" onClick={() => pedidoDocumento && abrirDocumentoPedido(pedidoDocumento.id, pedidoDocumento.volver)}>Reintentar</button></div>}
        <button className="mt-4 min-h-11 rounded bg-blue-600 px-4 text-white" onClick={() => setPedidoDocumento(null)}>{pedidoDocumento?.volver}</button>
      </Modal>
      {confirmModal}

      {/* FAB Unificado — solo para quien puede crear pedidos (B-17, #434) */}
      {puedeCrear && (
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
                onClick={() => { setFabOpen(false); setVentaEnRutaActiva(false); setShowVentaRapida(true); setModalKey(k => k + 1) }}
                data-testid="fab-venta-rapida"
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                <span>💰</span>
                <span>Venta Rápida</span>
              </button>
            </Tooltip>
            {hubMode && userRole === 'ADMIN' && gestionAdmin.activa && (
              <Tooltip content="El repartidor vendió en la calle algo que nadie había pedido. No necesita embarque." title="Venta en ruta" position="left">
                <button
                  onClick={() => { setFabOpen(false); setVentaEnRutaActiva(true); setShowVentaRapida(true); setModalKey(k => k + 1) }}
                  data-testid="fab-venta-en-ruta"
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-full shadow-lg hover:bg-emerald-700 transition text-sm font-medium"
                >
                  <span>🚚</span>
                  <span>Venta en ruta</span>
                </button>
              </Tooltip>
            )}
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
      )}
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
  if (!desde && !hasta) return 'Pedidos de hoy'
  if (presets.hoy && desde === presets.hoy.desde && hasta === presets.hoy.hasta) return 'Pedidos de Hoy'
  if (presets.ayer && desde === presets.ayer.desde && hasta === presets.ayer.hasta) return 'Pedidos de Ayer'
  if (presets.turno && desde === presets.turno.desde && hasta === presets.turno.hasta) return 'Pedidos de ayer y hoy'
  if (presets.manana && desde === presets.manana.desde && hasta === presets.manana.hasta) return 'Pedidos de Mañana'
  if (desde && hasta) {
    if (desde === hasta) {
      const fecha = new Date(desde + 'T00:00:00-05:00')
      return `Pedidos del ${fecha.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}`
    }
    return `Pedidos: ${new Date(desde + 'T00:00:00-05:00').toLocaleDateString('es-CO')} → ${new Date(hasta + 'T00:00:00-05:00').toLocaleDateString('es-CO')}`
  }
  return 'Pedidos de hoy'
}


