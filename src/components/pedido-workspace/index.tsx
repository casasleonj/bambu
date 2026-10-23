'use client'

import { useCallback, useMemo, useReducer, useState } from 'react'
import { generateUUID } from '@/lib/uuid'
import { PRODUCTO_INFO, getProductosForCanal } from '@/lib/prices'
import { useClienteSearch } from '@/hooks/use-cliente-search'
import type { NegocioPreseleccionado } from '@/lib/cliente-coincidencia'
import { PedidoPricingSummary } from '@/components/pedido-form-unified/pedido-pricing-summary'
import { PedidoRiskSignals } from './pedido-risk-signals'
import { PedidoCreditoPanel } from './pedido-credito-panel'
import { useExcepcionCredito } from './use-excepcion-credito'
import { PedidoProposal } from './pedido-proposal'
import { PedidoReview } from './pedido-review'
import { PedidoCommitBar } from './pedido-commit-bar'
import { WorkspaceEntrega } from './workspace-entrega'
import { WorkspaceComprador } from './workspace-comprador'
import { WorkspaceDinero } from './workspace-dinero'
import { PedidoItemEditor, type PedidoItemEditorItem } from '@/components/pedido-form-unified/pedido-item-editor'
import { PedidoContextPanel, type NuevoClienteForm } from '@/components/pedido-form-unified/pedido-context-panel'
import { resolveActualizarCliente } from '@/components/pedido-form-unified/resolve-actualizar-cliente'
import { workspaceReducer, initWorkspace, canCommit, EMPTY_DRAFT } from './workspace-reducer'
import { usePreview } from './use-preview'
import { estimarTotalOffline } from './estimar-total'
import { useItemPricing } from './use-item-pricing'
import { useClienteContext } from './use-cliente-context'
import { usePedidoPropuesta } from './use-pedido-propuesta'
import type { Propuesta } from './build-propuestas'
import type { ValueOrigin } from './types'
import type { DraftClienteNuevo, DraftPedido, ProductoCodigo, WorkspaceErrorKind } from './types'
import type { PreviewPedidoResult } from '@/modules/pedidos/application/dto'
import type { PedidoUnifiedData } from '@/components/pedido-form-unified'
import type { Cliente } from '@/components/pedido-form-unified/types'
import type { NegocioComprador } from '@/lib/comprador-opciones'

const CODIGO_TO_PRODID: Record<string, string> = Object.fromEntries(
  Object.entries(PRODUCTO_INFO).map(([prodId, info]) => [info.codigo, prodId]),
)

const CANONICAL_CODIGOS = new Set(Object.values(PRODUCTO_INFO).map((i) => i.codigo))
const LEGACY_CODIGO_TO_CODIGO: Record<string, string> = {
  cPacaAguaPed: 'PACA_AGUA',
  cPacaHieloPed: 'PACA_HIELO',
  cBotellonFabPed: 'BOTELLON',
  cBotellonDomPed: 'BOTELLON',
  cBolsaAguaPed: 'BOLSA_AGUA',
  cBolsaHieloPed: 'BOLSA_HIELO',
}

/** un `codigo` de patrón de consumo puede venir canónico o en la forma legacy. */
function toCodigo(codigo: string): ProductoCodigo | null {
  if (CANONICAL_CODIGOS.has(codigo)) return codigo as ProductoCodigo
  const mapped = LEGACY_CODIGO_TO_CODIGO[codigo]
  return mapped ? (mapped as ProductoCodigo) : null
}

/** El formulario cuenta como cliente nuevo cuando ya tiene lo mínimo (nombre y teléfono), igual que el formulario antiguo. */
function toDraftClienteNuevo(f: NuevoClienteForm): DraftClienteNuevo | undefined {
  const nombre = f.nombre.trim()
  const telefono = f.telefono.trim()
  if (!nombre || !telefono) return undefined
  return {
    nombre,
    apellido: f.apellido.trim() || undefined,
    telefono,
    direccion: f.direccion.trim() || undefined,
    barrio: f.barrio.trim() || undefined,
    fuente: f.fuente || undefined,
  }
}

const EMPTY_NUEVO_CLIENTE: NuevoClienteForm = {
  nombre: '', apellido: '', telefono: '', direccion: '', barrio: '', fuente: '',
}

/** Pedido existente para el modo edición (Composición C4). Subconjunto de `pedidoEditando`. */
export interface WorkspacePedidoInicial {
  id: string
  numero?: number
  clienteId: string
  clienteNombre: string
  clienteTelefono?: string
  clienteDireccion?: string | null
  clienteBarrio?: string | null
  negocioId?: string | null
  /** dirección/barrio del NEGOCIO cuando `negocioId` está seteado (ya resueltos por el caller). */
  negocioDireccion?: string | null
  negocioBarrio?: string | null
  /** ubicación propia ya guardada en el pedido */
  entregaLat?: number | null
  entregaLng?: number | null
  canal: 'PUNTO' | 'DOMICILIO'
  /**
   * Origen PERSISTIDO del pedido — se usa tal cual, NUNCA se re-deriva del
   * cliente (origen y canal son independientes; CONSUMIDOR_FINAL = ausencia
   * de cliente real, no un tipo comercial — decisión PO G6/ventaRapida→origen).
   * El caller solo debe montar el workspace de edición para `PEDIDO`/`VENTA_RAPIDA`
   * (VENTA_LIBRE/RECURRENTE siguen en el form legacy — §8.3 PENDIENTE).
   */
  origen: 'PEDIDO' | 'VENTA_RAPIDA'
  items: Array<{ producto: ProductoCodigo; cantidad: number; precioManual?: number }>
  obs?: string | null
}

export interface PedidosWorkspaceProps {
  clientes: Cliente[]
  /** intención inicial — determina el origen del draft. */
  intent?: 'pedido' | 'venta-rapida'
  initialDraft?: Partial<DraftPedido>
  /** modo edición: pedido existente a editar (cliente/negocio/canal inmutables). */
  pedidoInicial?: WorkspacePedidoInicial
  /**
   * `nueva-demanda` (G11.B): el cliente y el canal vienen del pedido origen
   * y son **inmutables**; los items nacen en blanco. `initialDraft` debe
   * traer `clienteId`, `canal` y `pedidoOrigenId`.
   */
  modo?: 'crear' | 'nueva-demanda'
  /**
   * Corrección de un pedido offline rechazado (422): reusa la clave de
   * idempotencia ORIGINAL para que reenviarlo no cree un segundo pedido ni
   * un segundo cobro.
   */
  offlineIdInicial?: string
  /** número del pedido origen — sólo para el encabezado en modo nueva-demanda. */
  pedidoOrigenNumero?: number
  /**
   * mismo contrato que `PedidoFormUnified.onSubmit` — reusa `handlePedidoSubmit`
   * de pedidos-client. `false` = no se guardó: el workspace sale de COMMITTING
   * para reintentar el mismo borrador (misma clave de idempotencia).
   */
  onSubmit: (data: PedidoUnifiedData) => void | Promise<boolean>
  onCancel?: () => void
}

/**
 * PedidosWorkspace (blueprint §3.2) — la captura como **workspace adaptativo**,
 * no un formulario. Zonas que aparecen por `state.phase`. El cálculo, el
 * riesgo y las acciones permitidas vienen del backend (`POST /api/pedidos/preview`,
 * vía `usePreview`) — este componente **muestra y compone**, no recalcula.
 *
 * Composición (fase C1 + C1b): reusa las piezas canónicas del monolito
 * (`PedidoContextPanel`, `PedidoItemEditor`, `PedidoPricingSummary`) con el
 * estado efímero en `workspaceReducer` y el cálculo autoritativo del preview.
 * El estado transitorio de captura de cliente (búsqueda, "cliente nuevo",
 * "aplicada" del patrón) vive como `useState` local — igual que en el
 * monolito, no es parte del "draft" que se envía.
 */
export function PedidosWorkspace({ clientes, intent, initialDraft, pedidoInicial, modo = 'crear', pedidoOrigenNumero, offlineIdInicial, onSubmit, onCancel }: PedidosWorkspaceProps) {
  const modoEdicion = Boolean(pedidoInicial)
  const esNuevaDemanda = modo === 'nueva-demanda'
  // Clave de idempotencia del borrador (plan de integridad v1.2 §5.B): nace al
  // abrir el workspace y se reusa en cada reintento de este mismo borrador.
  const [claveBorrador] = useState(() => offlineIdInicial ?? generateUUID())

  const [state, dispatch] = useReducer(
    workspaceReducer,
    pedidoInicial
      ? {
          ...EMPTY_DRAFT,
          // origen PERSISTIDO — no se re-deriva del cliente (G6/ventaRapida→origen).
          origen: pedidoInicial.origen,
          clienteId: pedidoInicial.clienteId,
          negocioId: pedidoInicial.negocioId ?? null,
          canal: pedidoInicial.canal,
          items: pedidoInicial.items.map((i) => ({ producto: i.producto, cantidad: i.cantidad, precioManual: i.precioManual })),
          obs: pedidoInicial.obs ?? undefined,
          direccionEntrega: (pedidoInicial.negocioId ? pedidoInicial.negocioDireccion : pedidoInicial.clienteDireccion) ?? '',
          barrioEntrega: (pedidoInicial.negocioId ? pedidoInicial.negocioBarrio : pedidoInicial.clienteBarrio) ?? '',
          entregaLat: pedidoInicial.entregaLat ?? null,
          entregaLng: pedidoInicial.entregaLng ?? null,
        }
      : intent === 'venta-rapida'
        // venta rápida = entrega inmediata: el preview proyecta lo mismo que el
        // commit (ENTREGADO), así el estado de pago mostrado coincide.
        // venta rápida: nace en PUNTO (mostrador), como el formulario antiguo; DOMICILIO
        // es una elección explícita y exige dirección (P1-2).
        ? { ...EMPTY_DRAFT, origen: 'VENTA_RAPIDA' as const, canal: 'PUNTO' as const, clienteId: 'CONSUMIDOR_FINAL', entregado: true, ...initialDraft }
        : { ...EMPTY_DRAFT, origen: 'PEDIDO' as const, ...initialDraft },
    initWorkspace,
  )

  const [searchTerm, setSearchTerm] = useState('')
  // Clientes elegidos de la búsqueda al servidor (#376) que pueden no estar en la
  // lista precargada `clientes`; `clienteSeleccionado` los necesita para resolverse.
  const [clientesEncontrados, setClientesEncontrados] = useState<Cliente[]>([])
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState<NuevoClienteForm>(EMPTY_NUEVO_CLIENTE)
  const [sugerenciaAplicada, setSugerenciaAplicada] = useState(false)
  const [reviewMotivo, setReviewMotivo] = useState('')

  const onPending = useCallback(() => dispatch({ type: 'PREVIEW_PENDING' }), [])
  const onReceived = useCallback((preview: PreviewPedidoResult) => dispatch({ type: 'PREVIEW_RECEIVED', preview }), [])
  const onError = useCallback((kind: WorkspaceErrorKind, message: string) => dispatch({ type: 'PREVIEW_ERROR', kind, message }), [])

  usePreview(state.draft, { onPending, onReceived, onError }, { pedidoId: pedidoInicial?.id })

  const { tabla, configs, loading: pricingLoading, precioBaseFor } = useItemPricing()
  const { fiadoStatus, patron, patronLoading, loadPatron } = useClienteContext(state.draft.clienteId)
  const propuesta = usePedidoPropuesta()
  // P0-3 (#357): excepción de crédito del cliente seleccionado (solo clientes reales).
  const excepcionCredito = useExcepcionCredito(state.draft.clienteId, {
    onAutorizada: (excepcionId) => dispatch({ type: 'SET_EXCEPCION', excepcionId }),
  })

  const esVentaRapida = state.draft.origen === 'VENTA_RAPIDA'

  const clienteSeleccionado: Cliente | null = useMemo(() => {
    const id = state.draft.clienteId
    if (!id || id === 'CONSUMIDOR_FINAL') return null
    const enLista = clientes.find((c) => c.id === id) ?? clientesEncontrados.find((c) => c.id === id)
    if (enLista) return enLista
    // modo edición: si el cliente no está en la lista, sintetizarlo del pedido.
    if (pedidoInicial && pedidoInicial.clienteId === id) {
      return {
        id,
        nombre: pedidoInicial.clienteNombre,
        telefono: pedidoInicial.clienteTelefono ?? '',
        direccion: pedidoInicial.clienteDireccion ?? undefined,
        barrio: pedidoInicial.clienteBarrio ?? undefined,
      }
    }
    return null
  }, [state.draft.clienteId, clientes, clientesEncontrados, pedidoInicial])

  const {
    resultados: filteredClientes,
    buscando: buscandoCliente,
    error: errorBusquedaCliente,
    reintentar: reintentarBusquedaCliente,
  } = useClienteSearch(searchTerm, clientes)

  const calc = state.preview?.calculation

  const cantOf = useCallback(
    (codigo: ProductoCodigo) => state.draft.items.find((i) => i.producto === codigo)?.cantidad ?? 0,
    [state.draft.items],
  )

  const editorItems: PedidoItemEditorItem[] = useMemo(() => {
    const prodIds = getProductosForCanal(state.draft.canal, configs)
    return prodIds.map((prodId) => {
      const codigo = PRODUCTO_INFO[prodId].codigo as ProductoCodigo
      const draftItem = state.draft.items.find((i) => i.producto === codigo)
      const previewItem = calc?.items.find((c) => c.producto === codigo)
      const precioBase = precioBaseFor(codigo, state.draft.canal)
      return {
        prodId,
        cantidad: draftItem?.cantidad ?? 0,
        precio: previewItem?.precioUnitario ?? draftItem?.precioManual ?? precioBase,
        precioBase,
        precioManual: draftItem?.precioManual,
        precioOrigen: previewItem?.precioOrigen,
        tiers: tabla[codigo] ?? [],
        precioBajoConfirmado: Boolean(state.precioBajoConfirmado[codigo]),
      }
    })
  }, [state.draft.canal, state.draft.items, state.precioBajoConfirmado, calc, configs, tabla, precioBaseFor])

  const setCantidad = useCallback((prodId: string, cantidad: number) => {
    const codigo = PRODUCTO_INFO[prodId].codigo as ProductoCodigo
    dispatch({ type: 'SET_ITEM_CANTIDAD', producto: codigo, cantidad })
  }, [])

  const pricingLineas = useMemo(
    () => state.draft.items
      .filter((i) => i.cantidad > 0)
      .map((i) => {
        const previewItem = calc?.items.find((c) => c.producto === i.producto)
        return {
          prodId: CODIGO_TO_PRODID[i.producto] ?? i.producto,
          cantidad: i.cantidad,
          precio: previewItem?.precioUnitario ?? 0,
        }
      }),
    [state.draft.items, calc],
  )

  const handleSelectCliente = (c: Cliente, negocio?: NegocioPreseleccionado | null) => {
    setClientesEncontrados((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))
    dispatch({ type: 'SET_CLIENTE', clienteId: c.id })
    dispatch({ type: 'SET_DIRECCION', direccion: c.direccion ?? '', barrio: c.barrio ?? '' })
    if (negocio) {
      dispatch({ type: 'SET_NEGOCIO', negocioId: negocio.id, direccion: negocio.direccion ?? c.direccion ?? '', barrio: negocio.barrio ?? c.barrio ?? '' })
    }
    setSearchTerm('')
    setMostrarNuevo(false)
    setNuevoCliente(EMPTY_NUEVO_CLIENTE)
    setSugerenciaAplicada(false)
    propuesta.clear()
  }

  // P1-3 (#394): el comprador se elige de una vez (tienda o persona); nada queda preseleccionado.
  const handleSeleccionarComprador = (c: Cliente, negocio: NegocioComprador | null) => {
    setClientesEncontrados((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))
    dispatch({ type: 'SET_CLIENTE', clienteId: c.id })
    if (negocio) {
      dispatch({ type: 'SET_NEGOCIO', negocioId: negocio.id, direccion: negocio.direccion ?? '', barrio: negocio.barrio ?? '' })
    } else {
      dispatch({ type: 'SET_DIRECCION', direccion: c.direccion ?? '', barrio: c.barrio ?? '' })
    }
    setSearchTerm('')
    setMostrarNuevo(false)
    setNuevoCliente(EMPTY_NUEVO_CLIENTE)
    setSugerenciaAplicada(false)
    propuesta.clear()
  }

  // venta rápida: quitar al comprador devuelve la venta a «Sin identificar» (CONSUMIDOR_FINAL).
  const handleVolverASinIdentificar = () => {
    dispatch({ type: 'SET_CLIENTE', clienteId: 'CONSUMIDOR_FINAL' })
    dispatch({ type: 'SET_DIRECCION', direccion: '', barrio: '' })
    setSearchTerm('')
    setMostrarNuevo(false)
    setNuevoCliente(EMPTY_NUEVO_CLIENTE)
    setSugerenciaAplicada(false)
    propuesta.clear()
  }

  const handleNuevoClienteChange = (updater: (prev: NuevoClienteForm) => NuevoClienteForm) => {
    const next = updater(nuevoCliente)
    setNuevoCliente(next)
    dispatch({ type: 'SET_CLIENTE_NUEVO', clienteNuevo: toDraftClienteNuevo(next) })
  }

  const handleCerrarNuevo = () => {
    setMostrarNuevo(false)
    dispatch({ type: 'SET_CLIENTE_NUEVO', clienteNuevo: undefined })
  }

  const handleQuitarCliente = () => {
    dispatch({ type: 'CLEAR_CLIENTE' })
    setSearchTerm('')
    setMostrarNuevo(false)
    setSugerenciaAplicada(false)
    propuesta.clear()
  }

  const handleUsarPropuesta = (p: Propuesta) => {
    const origins: Record<string, ValueOrigin> = {}
    for (const l of p.lineas) origins[`item.${l.producto}.cantidad`] = p.origin
    if (p.canal) origins['canal'] = p.origin
    dispatch({
      type: 'APPLY_PROPOSAL',
      draft: {
        items: p.lineas.map((l) => ({ producto: l.producto, cantidad: l.cantidad })),
        canal: p.canal ?? state.draft.canal,
      },
      origins,
    })
    propuesta.clear()
  }

  const handleAplicarSugerencia = () => {
    if (!patron?.productosSugeridos.length) return
    for (const sugerido of patron.productosSugeridos) {
      const codigo = toCodigo(sugerido.codigo)
      if (codigo) dispatch({ type: 'SET_ITEM_CANTIDAD', producto: codigo, cantidad: sugerido.cantidadPromedio })
    }
    setSugerenciaAplicada(true)
  }

  const accionCommit = modoEdicion ? 'actualizar' : 'crear'
  const hasDraftItems = state.draft.items.some((i) => i.cantidad > 0)
  const sinConexion = state.sinConexion && !modoEdicion
  const commitEnabled = canCommit(state, accionCommit)
    && (state.phase === 'PREVIEW_READY' || (sinConexion && state.phase === 'DRAFTING'))
  // B-20: sin preview del servidor, el cobro "completo" usa un total estimado con la tabla ya cargada.
  const totalEstimado = sinConexion && !calc
    ? estimarTotalOffline(state.draft.items, state.draft.canal, tabla, configs)
    : null
  const blockedReason =
    state.preview && !state.preview.allowedActions.includes(accionCommit)
      ? (state.preview.warnings[0]?.message ?? `El backend no permite ${modoEdicion ? 'guardar' : 'crear'} este pedido.`)
      : null

  const handleConfirmReview = () => {
    dispatch({ type: 'ACKNOWLEDGE_REVIEW', motivo: reviewMotivo })
  }

  // P1-4 (#419): lo guardado del comprador (no cambia al escribir otro destino)
  // y si el pedido lleva un destino propio (texto distinto o ubicación propia).
  const destinoGuardado = useMemo(() => {
    if (!clienteSeleccionado) return null
    const negocio = state.draft.negocioId
      ? clienteSeleccionado.negocios?.find((n) => n.id === state.draft.negocioId)
      : undefined
    const fuente = negocio ?? clienteSeleccionado
    const direccion = (negocio ? negocio.direccion ?? clienteSeleccionado.direccion : fuente.direccion) ?? ''
    const barrio = (negocio ? negocio.barrio ?? clienteSeleccionado.barrio : fuente.barrio) ?? ''
    return {
      origen: negocio ? ('negocio' as const) : ('cliente' as const),
      direccion,
      barrio,
      texto: [direccion, barrio].filter(Boolean).join(' · '),
    }
  }, [clienteSeleccionado, state.draft.negocioId])
  const textoDestinoCambiado = destinoGuardado
    ? (state.draft.direccionEntrega ?? '') !== destinoGuardado.direccion || (state.draft.barrioEntrega ?? '') !== destinoGuardado.barrio
    : false
  const destinoPropio = textoDestinoCambiado || state.draft.entregaLat != null

  const handleVolverAGuardada = () => {
    dispatch({ type: 'SET_DIRECCION', direccion: destinoGuardado?.direccion ?? '', barrio: destinoGuardado?.barrio ?? '' })
    dispatch({ type: 'SET_UBICACION', lat: null, lng: null })
    dispatch({ type: 'SET_GUARDAR_DIRECCION_EN_CLIENTE', value: false })
  }

  const handleCommit = async () => {
    dispatch({ type: 'COMMIT_START' })
    const clienteNuevo = clienteSeleccionado ? undefined : state.draft.clienteNuevo
    const tieneClienteReal = Boolean(clienteSeleccionado) || Boolean(clienteNuevo)

    const actualizarCliente = resolveActualizarCliente({
      clienteSeleccionado,
      canal: state.draft.canal,
      negocioSeleccionado: state.draft.negocioId,
      editDireccion: state.draft.direccionEntrega ?? '',
      editBarrio: state.draft.barrioEntrega ?? '',
      // P1-4 (#419): lo escrito es SOLO del pedido salvo que el usuario marque la casilla.
      soloParaEstePedido: !state.draft.guardarDireccionEnCliente,
    })

    const guardado = await onSubmit({
      // Contrato de POST /api/pedidos (PedidoCreateSchema exige clienteId): con
      // cliente nuevo viaja el canónico como marcador y el servidor resuelve el
      // cliente real por `clienteNuevo` (igual que el formulario antiguo).
      clienteId: clienteSeleccionado ? clienteSeleccionado.id : 'CONSUMIDOR_FINAL',
      negocioId: state.draft.negocioId ?? undefined,
      canal: state.draft.canal,
      // edición: origen persistido (inmutable). nueva-demanda: siempre PEDIDO.
      // creación normal: derivado de si hay cliente real.
      origen: modoEdicion ? state.draft.origen : ((esNuevaDemanda || tieneClienteReal) ? 'PEDIDO' : 'VENTA_RAPIDA'),
      pedidoOrigenId: state.draft.pedidoOrigenId,
      items: state.draft.items
        .filter((i) => i.cantidad > 0)
        .map((i) => ({ producto: i.producto, cantidad: i.cantidad, precioManual: i.precioManual })),
      preciosManuales: Object.fromEntries(
        state.draft.items.filter((i) => i.precioManual).map((i) => [i.producto, i.precioManual as number]),
      ),
      // solo el dinero APLICADO (recibido/cambio son ayuda de caja, no se envían).
      pagos: state.draft.pagos.filter((p) => p.monto > 0),
      // el motivo de revisión (flujo de acción sensible) se persiste en obs
      // hasta que el commit acepte un campo dedicado (política PENDIENTE DE NEGOCIO).
      obs: state.reviewMotivo
        ? `[Revisión: ${state.reviewMotivo}]${state.draft.obs ? ` ${state.draft.obs}` : ''}`
        : state.draft.obs,
      entregado: state.draft.entregado,
      excepcionId: state.draft.excepcionId,
      clienteNuevo: clienteNuevo ? { ...clienteNuevo, direccion: clienteNuevo.direccion ?? '' } : undefined,
      actualizarCliente,
      direccionEntrega: state.draft.canal === 'DOMICILIO' ? (state.draft.direccionEntrega || undefined) : undefined,
      barrioEntrega: state.draft.canal === 'DOMICILIO' ? (state.draft.barrioEntrega || undefined) : undefined,
      entregaLat: state.draft.canal === 'DOMICILIO' ? (state.draft.entregaLat ?? undefined) : undefined,
      entregaLng: state.draft.canal === 'DOMICILIO' ? (state.draft.entregaLng ?? undefined) : undefined,
      // modo edición: el PUT /api/pedidos/[id] (handlePedidoSubmit bifurca en isEdit).
      ...(modoEdicion ? { isEdit: true, pedidoId: pedidoInicial!.id } : { offlineId: claveBorrador }),
    })
    if (guardado === false) {
      dispatch({
        type: 'COMMIT_ERROR',
        message: 'No se pudo confirmar el guardado. Al reintentar se usa este mismo pedido: no se duplica.',
      })
    } else if (guardado === true) {
      dispatch({ type: 'COMMIT_SUCCESS' })
    }
  }

  return (
    <div className="space-y-4" data-testid="pedidos-workspace">
      {/* ── Zona: Contexto ── */}
      <section data-testid="workspace-contexto" className="space-y-2">
        {esNuevaDemanda ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm" data-testid="workspace-nueva-demanda">
            <div className="font-medium text-blue-900">
              Nueva demanda{clienteSeleccionado ? ` de ${clienteSeleccionado.nombre}` : ''}
            </div>
            <div className="text-[11px] text-blue-700">
              {pedidoOrigenNumero != null && <>Pedido origen #{pedidoOrigenNumero} · </>}
              Cliente y canal ({state.draft.canal === 'DOMICILIO' ? 'Domicilio' : 'Punto'}) vienen del pedido original y no se cambian acá. Es un pedido nuevo e independiente.
            </div>
          </div>
        ) : modoEdicion && esVentaRapida ? (
          <div className="rounded-lg bg-gray-50 border px-3 py-2 text-sm text-gray-600" data-testid="workspace-venta-rapida">
            Venta rápida — sin identificar
          </div>
        ) : modoEdicion ? (
          <PedidoContextPanel
            readOnly={modoEdicion}
            ocultarInputsEntrega
            pedidoInicialId={pedidoInicial?.id}
            canal={state.draft.canal}
            clienteSeleccionado={clienteSeleccionado}
            onQuitarCliente={handleQuitarCliente}
            fiadosStatus={fiadoStatus}
            sugerenciaConsumo={patron}
            sugerenciaLoading={patronLoading}
            sugerenciaAplicada={sugerenciaAplicada}
            aplicarSugerenciaDisabled={false}
            onAplicarSugerencia={handleAplicarSugerencia}
            onVerPatronConsumo={loadPatron}
            negocioSeleccionado={state.draft.negocioId}
            onNegocioSelected={(id, data) =>
              dispatch({ type: 'SET_NEGOCIO', negocioId: id, direccion: data?.direccion, barrio: data?.barrio })
            }
            editDireccion={state.draft.direccionEntrega ?? ''}
            onEditDireccionChange={(v) =>
              dispatch({ type: 'SET_DIRECCION', direccion: v, barrio: state.draft.barrioEntrega ?? '' })
            }
            editBarrio={state.draft.barrioEntrega ?? ''}
            onEditBarrioChange={(v) =>
              dispatch({ type: 'SET_DIRECCION', direccion: state.draft.direccionEntrega ?? '', barrio: v })
            }
            soloParaEstePedido={state.draft.soloParaEstePedido ?? false}
            onSoloParaEstePedidoChange={(v) => dispatch({ type: 'SET_SOLO_PARA_ESTE_PEDIDO', value: v })}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            clientesCargando={false}
            filteredClientes={filteredClientes}
            buscandoCliente={buscandoCliente}
            errorBusquedaCliente={errorBusquedaCliente}
            onReintentarBusqueda={reintentarBusquedaCliente}
            onSelectCliente={handleSelectCliente}
            onCrearNuevo={() => setMostrarNuevo(true)}
            mostrarNuevo={mostrarNuevo}
            onCerrarNuevo={handleCerrarNuevo}
            nuevoCliente={nuevoCliente}
            onNuevoClienteChange={handleNuevoClienteChange}
          />
        ) : (
          <WorkspaceComprador
            capturaRapida={intent === 'venta-rapida'}
            canal={state.draft.canal}
            clienteSeleccionado={clienteSeleccionado}
            negocioId={state.draft.negocioId ?? null}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            resultados={filteredClientes}
            buscando={buscandoCliente}
            errorBusqueda={errorBusquedaCliente}
            onReintentar={reintentarBusquedaCliente}
            onSeleccionar={handleSeleccionarComprador}
            onQuitar={intent === 'venta-rapida' ? handleVolverASinIdentificar : handleQuitarCliente}
            fiadosStatus={fiadoStatus}
            patron={patron}
            patronLoading={patronLoading}
            patronAplicado={sugerenciaAplicada}
            onAplicarPatron={handleAplicarSugerencia}
            onVerPatron={loadPatron}
            onCrearNuevo={() => setMostrarNuevo(true)}
            mostrarNuevo={mostrarNuevo}
            onCerrarNuevo={intent === 'venta-rapida' ? handleVolverASinIdentificar : handleCerrarNuevo}
            nuevoCliente={nuevoCliente}
            onNuevoClienteChange={handleNuevoClienteChange}
          />
        )}
        {/* canal: inmutable en edición (el PUT no lo cambia); en nueva-demanda
            viene del pedido origen y ya se muestra en el banner. */}
        {modoEdicion ? (
          <p className="text-xs text-gray-400" data-testid="workspace-canal-fijo">
            {state.draft.canal === 'DOMICILIO' ? '🚚 Domicilio' : '🏪 Punto'} · el canal no se cambia al editar; si fue un error de registro o cambió la entrega, pida la corrección formal a un administrador
          </p>
        ) : esNuevaDemanda ? null : (
          <div className="flex gap-2">
            {(['DOMICILIO', 'PUNTO'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                data-testid={`workspace-canal-${ch}`}
                onClick={() => dispatch({ type: 'SET_CANAL', canal: ch })}
                className={`rounded-lg border px-3 py-1.5 text-xs ${state.draft.canal === ch ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200'}`}
              >
                {ch === 'DOMICILIO' ? '🚚 Domicilio' : '🏪 Punto'}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Zona: Entrega (adaptativa por suficiencia — F-ENTREGA-i) ── */}
      {(!esVentaRapida || state.draft.canal === 'DOMICILIO') && (
        <WorkspaceEntrega
          entrega={state.preview?.entrega}
          canal={state.draft.canal}
          direccionEntrega={state.draft.direccionEntrega ?? ''}
          barrioEntrega={state.draft.barrioEntrega ?? ''}
          onDireccionChange={(v) => dispatch({ type: 'SET_DIRECCION', direccion: v, barrio: state.draft.barrioEntrega ?? '' })}
          onBarrioChange={(v) => dispatch({ type: 'SET_DIRECCION', direccion: state.draft.direccionEntrega ?? '', barrio: v })}
          entregaLat={state.draft.entregaLat ?? null}
          entregaLng={state.draft.entregaLng ?? null}
          onUbicacionChange={(lat, lng) => dispatch({ type: 'SET_UBICACION', lat, lng })}
          previewPending={state.previewPending}
          ventaRapida={esVentaRapida}
          guardada={destinoGuardado ? { texto: destinoGuardado.texto, origen: destinoGuardado.origen } : null}
          destinoPropio={Boolean(destinoGuardado) && destinoPropio}
          puedeGuardarEnCliente={Boolean(destinoGuardado) && destinoGuardado?.origen === 'cliente' && textoDestinoCambiado}
          guardarEnCliente={state.draft.guardarDireccionEnCliente ?? false}
          onGuardarEnClienteChange={(v) => dispatch({ type: 'SET_GUARDAR_DIRECCION_EN_CLIENTE', value: v })}
          onVolverAGuardada={handleVolverAGuardada}
        />
      )}

      {/* ── Zona: Operación ── */}
      <section data-testid="workspace-operacion" className="space-y-2">
        {/* "Repetir" (blueprint §3) — solo al crear, con cliente real y sin items aún */}
        {!modoEdicion && !esVentaRapida && clienteSeleccionado && !hasDraftItems && (
          <PedidoProposal
            propuestas={propuesta.propuestas}
            loading={propuesta.loading}
            cargado={propuesta.cargado}
            onPedir={() => state.draft.clienteId && propuesta.load(state.draft.clienteId)}
            onUsar={handleUsarPropuesta}
            onDescartar={propuesta.clear}
          />
        )}
        <PedidoItemEditor
          testIdPrefix="workspace"
          items={editorItems}
          preciosLoading={state.previewPending || pricingLoading}
          onIncrement={(prodId) => setCantidad(prodId, cantOf(PRODUCTO_INFO[prodId].codigo as ProductoCodigo) + 1)}
          onDecrement={(prodId) => setCantidad(prodId, cantOf(PRODUCTO_INFO[prodId].codigo as ProductoCodigo) - 1)}
          onCantidadChange={(prodId, value) => {
            const n = parseInt(value, 10)
            setCantidad(prodId, Number.isNaN(n) ? 0 : n)
          }}
          onPrecioManualChange={(codigo, valor) =>
            dispatch({
              type: 'SET_ITEM_PRECIO_MANUAL',
              producto: codigo as ProductoCodigo,
              precioManual: valor > 0 ? valor : undefined,
            })
          }
          onConfirmarPrecioBajo={(codigo) => dispatch({ type: 'CONFIRMAR_PRECIO_BAJO', producto: codigo as ProductoCodigo })}
        />
      </section>

      {/* ── Zona: Cálculo (del backend) ── */}
      <section data-testid="workspace-calculo">
        <PedidoPricingSummary
          lineas={pricingLineas}
          total={calc?.total ?? 0}
          totalPagado={calc?.totalPagado ?? 0}
          saldoPendiente={calc?.saldoProyectado ?? 0}
        />
        {state.previewPending && <p className="mt-1 text-xs text-gray-400" data-testid="workspace-preview-pending">Calculando…</p>}
        {state.error && (
          <p className="mt-1 text-xs text-amber-700" data-testid="workspace-error">{state.error.message}</p>
        )}
      </section>

      {/* ── Zona: Dinero (P0 — HUB_REVISION_INTEGRAL). En edición el PUT
          conserva los pagos existentes; el cobro posterior va por pagar-fiado. ── */}
      {!modoEdicion && (
        <WorkspaceDinero
          total={calc?.total ?? totalEstimado}
          totalEstimado={!calc && totalEstimado != null}
          saldoProyectado={calc?.saldoProyectado ?? null}
          pagos={state.draft.pagos}
          pagoCompleto={state.draft.pagoCompleto ?? null}
          esAnonima={state.draft.clienteId === 'CONSUMIDOR_FINAL' && !state.draft.clienteNuevo}
          disabled={state.phase === 'COMMITTING' || state.phase === 'COMMITTED'}
          onPagarCompleto={(metodo) => dispatch({ type: 'PAGAR_COMPLETO', metodo, total: totalEstimado ?? undefined })}
          onSetPagos={(pagos) => dispatch({ type: 'SET_PAGOS', pagos })}
        />
      )}

      {sinConexion && (
        <p role="status" data-testid="workspace-offline-aviso" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sin conexión: el pedido se guarda en este equipo y se envía solo al reconectar. El total, los precios especiales y los límites de crédito se confirman al sincronizar.
        </p>
      )}

      {/* ── Zona: Límite de crédito (P0-3, maqueta 1) — solo al crear, con cliente real ── */}
      {!modoEdicion && (
        <PedidoCreditoPanel
          credito={state.preview?.credito}
          excepcionAplicada={Boolean(state.preview?.excepcionAplicada)}
          excepcionNoAplica={state.preview?.excepcionNoAplica}
          vista={excepcionCredito.excepcion}
          solicitando={excepcionCredito.solicitando}
          error={excepcionCredito.error}
          total={calc?.total ?? 0}
          onSolicitar={(motivo, nota) => void excepcionCredito.solicitar({
            motivo, nota, total: calc?.total ?? 0, totalPagado: calc?.totalPagado ?? 0,
          })}
          onReiniciar={() => {
            excepcionCredito.reiniciar()
            dispatch({ type: 'SET_EXCEPCION', excepcionId: undefined })
          }}
          onCobrarAhora={() => document.querySelector('[data-testid="workspace-dinero"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
      )}

      {/* ── Zona: Señales de riesgo (blueprint §5.3) ── */}
      <PedidoRiskSignals
        // el panel de crédito ya explica el límite; no se repite el aviso rojo
        warnings={(state.preview?.warnings ?? []).filter((w) => !(w.code === 'FIADO_SOBRE_LIMITE' && state.preview?.credito))}
        riskSignals={state.preview?.riskSignals ?? []}
      />

      {/* ── Zona: Revisión (acción sensible, ALS §10) ── */}
      {state.phase === 'REVIEW_REQUIRED' && state.preview && (
        <PedidoReview
          preview={state.preview}
          motivo={reviewMotivo}
          onMotivoChange={setReviewMotivo}
          onConfirm={handleConfirmReview}
          onVolver={() => { setReviewMotivo(''); dispatch({ type: 'RETURN_TO_DRAFTING' }) }}
        />
      )}

      {/* ── Zona: Commit (adaptativo) ── */}
      <PedidoCommitBar
        phase={state.phase}
        total={calc?.total ?? null}
        previewPending={state.previewPending}
        canCommit={commitEnabled}
        blockedReason={blockedReason}
        modoEdicion={modoEdicion}
        sinConexion={sinConexion}
        onCommit={handleCommit}
        onCancel={onCancel}
      />
    </div>
  )
}
