'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { DEFAULT_PRICES, PRODUCTO_INFO, getProductosForCanal } from '@/lib/prices'
import { METODOS_PAGO, METODO_PAGO_ICONS } from '@/lib/metodos-pago'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { TipoNegocioSelect } from '@/components/tipo-negocio-select'
import { matchCliente } from '@/lib/cliente-search'
import { NegocioSelector } from '@/components/negocio-selector'
import { resolveActualizarCliente } from './resolve-actualizar-cliente'
import { usePriceSync } from '@/hooks/use-price-sync'
import { Money, calcularSaldo } from '@/shared/domain'
import type { FiadoStatus } from '@/modules/pedidos/domain/types'
import type { Cliente, Tier } from './types'
import { fetchClienteDetailFresh } from '@/lib/cliente-detail-cache'

const FUENTES: string[] = [
  'Página web', 'Instagram', 'Facebook', 'Referido', 'WhatsApp',
]

// ==================== TYPES ====================

export interface PedidoInicialCliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string | null
  barrio?: string | null
}

export interface PedidoInicialItem {
  producto: string
  cantidad: number
  precioManual?: number
}

export interface PatronConsumo {
  frecuenciaSugerida: { dias: number; label: string } | null
  productosSugeridos: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }>
}

export interface PedidoInicial {
  id: string
  canal: 'PUNTO' | 'DOMICILIO'
  cliente?: PedidoInicialCliente | null
  negocioId?: string | null
  /** Dirección/barrio del NEGOCIO (no del cliente) cuando negocioId está seteado —
   * necesarios para que el selector no muestre la dirección del cliente al abrir
   * un pedido a negocio para editar. */
  negocioDireccion?: string | null
  negocioBarrio?: string | null
  items: PedidoInicialItem[]
  obs?: string | null
  // Patrón de consumo del cliente (frecuencia/productos habituales, calculado
  // server-side en GET /api/clientes/[id]). Vive en PedidoInicial, no en
  // PedidoInicialCliente: `clienteSeleccionado` se castea a `Cliente` de
  // ./types (línea ~272) y ese tipo no debe cargar estos campos transitorios.
  frecuenciaSugerida?: { dias: number; label: string } | null
  productosSugeridos?: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }>
}

export interface PedidoFormUnifiedProps {
  contexto: 'PUNTO' | 'DOMICILIO'
  clientes: Cliente[]
  onSubmit: (data: PedidoUnifiedData) => void
  onClose?: () => void
  pedidoInicial?: PedidoInicial
}

export interface PedidoUnifiedData {
  clienteId?: string
  negocioId?: string
  canal: 'PUNTO' | 'DOMICILIO'
  items: Array<{ producto: string; cantidad: number; precioManual?: number }>
  preciosManuales: Record<string, number>
  pagos: Array<{ metodo: string; monto: number }>
  obs?: string
  clienteNuevo?: { nombre: string; apellido?: string; telefono: string; direccion: string; barrio?: string; fuente?: string }
  actualizarCliente?: { direccion: string; barrio: string }
  /**
   * Snapshot de dirección puntual del pedido — se envía siempre que el
   * canal sea DOMICILIO (independientemente del checkbox "solo para este
   * pedido"). El servidor decide si difiere de la dirección resuelta en
   * vivo (negocio gana, fallback cliente) y solo entonces la persiste
   * como override propio del pedido (Pedido.direccionEntrega/barrioEntrega).
   */
  direccionEntrega?: string
  barrioEntrega?: string
  ventaRapida: boolean
  isEdit?: boolean
  pedidoId?: string
}

// `productosSugeridos[].codigo` (de GET /api/clientes/[id]) usa los nombres
// de columna legacy de Pedido, no el ProductCode canónico de PRODUCTO_INFO.
// BOTELLON tiene dos columnas legacy (Fab/Dom) que mapean al mismo ProductCode.
const LEGACY_CODIGO_TO_PRODUCT_CODE: Record<string, string> = {
  cPacaAguaPed: 'PACA_AGUA',
  cPacaHieloPed: 'PACA_HIELO',
  cBotellonFabPed: 'BOTELLON',
  cBotellonDomPed: 'BOTELLON',
  cBolsaAguaPed: 'BOLSA_AGUA',
  cBolsaHieloPed: 'BOLSA_HIELO',
}

function mapLegacyCodigoToProdId(legacyCodigo: string): string | undefined {
  const productCode = LEGACY_CODIGO_TO_PRODUCT_CODE[legacyCodigo]
  if (!productCode) return undefined
  return Object.keys(PRODUCTO_INFO).find(k => PRODUCTO_INFO[k].codigo === productCode)
}

// ==================== COMPONENTE ====================

export function PedidoFormUnified({ contexto, clientes, onSubmit, pedidoInicial }: PedidoFormUnifiedProps) {
  const [canal, setCanal] = useState<'PUNTO' | 'DOMICILIO'>(contexto)
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [negocioSeleccionado, setNegocioSeleccionado] = useState<string | null>(null)
  const [negocioData, setNegocioData] = useState<{ direccion: string | null; barrio: string | null } | null>(null)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', apellido: '', telefono: '', direccion: '', barrio: '', fuente: '' })
  const [pagos, setPagos] = useState<{ metodo: string; monto: number }[]>([])
  const [modoPagoActivo, setModoPagoActivo] = useState<string | null>(null)
  const [montoInput, setMontoInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [preciosResueltos, setPreciosResueltos] = useState<Record<string, number>>({})
  const [preciosOrigen, setPreciosOrigen] = useState<Record<string, string>>({})
  const [tablaPrecios, setTablaPrecios] = useState<Record<string, Tier[]>>({})
  const [preciosManuales, setPreciosManuales] = useState<Record<string, number>>({})
  const [preciosLoading, setPreciosLoading] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [editDireccion, setEditDireccion] = useState('')
  const [editBarrio, setEditBarrio] = useState('')
  // Default false preserva el comportamiento actual: toda edición de la
  // dirección del domicilio principal se guarda. Marcarlo es el opt-out
  // explícito para "solo por esta vez, no toques el dato guardado".
  const [soloParaEstePedido, setSoloParaEstePedido] = useState(false)
  const resolverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [productosConfig, setProductosConfig] = useState<Array<{ codigo: string; aplicaDomicilio: boolean; sobreCostoDomicilio: number }>>([])
  const [fiadosStatus, setFiadosStatus] = useState<FiadoStatus | null>(null)
  const [precioBajoConfirmado, setPrecioBajoConfirmado] = useState<Record<string, boolean>>({})
  // Patrón de consumo (guía): banner de solo lectura + botón opt-in para
  // aplicar cantidades sugeridas. Nunca se auto-aplica — este es un ERP con
  // dinero y despachos reales; pre-llenar cantidades sin acción explícita
  // del operador puede terminar en un pedido/cobro que el cliente no pidió.
  const [sugerenciaConsumo, setSugerenciaConsumo] = useState<PatronConsumo | null>(null)
  const [sugerenciaLoading, setSugerenciaLoading] = useState(false)
  const [sugerenciaAplicada, setSugerenciaAplicada] = useState(false)
  const cantidadesRef = useRef(cantidades)
  const canalRef = useRef(canal)
  const clienteIdRef = useRef<string | null>(null)

  useEffect(() => { cantidadesRef.current = cantidades }, [cantidades])
  useEffect(() => { canalRef.current = canal }, [canal])

  const productosActuales = useMemo(
    () => getProductosForCanal(canal, productosConfig),
    [canal, productosConfig]
  )

  useEffect(() => {
    fetch(`/api/productos/configs`)
      .then(r => r.json())
      .then(d => { if (d.success && d.productos) setProductosConfig(d.productos) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/precios/tabla`)
      .then(r => r.json())
      .then(d => { if (d.tabla) setTablaPrecios(d.tabla) })
      .catch(() => {})
  }, [])

  const resolverSeqRef = useRef(0)

  const resolverPrecios = useCallback(async (prods: Record<string, number>, canalVal: 'PUNTO' | 'DOMICILIO', clienteId?: string, negocioId?: string | null) => {
    const items = productosActuales
      .filter(id => (prods[id] || 0) > 0)
      .map(id => ({ codigo: PRODUCTO_INFO[id].codigo, cantidad: prods[id] || 0 }))

    if (items.length === 0) {
      // Invalida cualquier fetch anterior todavía en vuelo para que su
      // respuesta tardía no pise este estado vacío con precios stale.
      resolverSeqRef.current++
      setPreciosResueltos({})
      setPreciosOrigen({})
      setPreciosLoading(false)
      return
    }
    setPreciosLoading(true)
    const seq = ++resolverSeqRef.current
    try {
      const res = await fetch('/api/precios/resolver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          canal: canalVal,
          clienteId: clienteId || clienteSeleccionado?.id,
          negocioId: negocioId ?? negocioSeleccionado ?? undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.precios && resolverSeqRef.current === seq) {
          const nuevosPrecios: Record<string, number> = {}
          const nuevosOrigen: Record<string, string> = {}
          for (const [codigo, info] of Object.entries(data.precios)) {
            nuevosPrecios[codigo] = (info as { precio: number }).precio
            nuevosOrigen[codigo] = (info as { origen?: string }).origen || 'base'
          }
          setPreciosResueltos(nuevosPrecios)
          setPreciosOrigen(nuevosOrigen)
        }
      }
    } catch (error) {
      console.error('Error resolviendo precios:', error)
    } finally {
      if (resolverSeqRef.current === seq) {
        setPreciosLoading(false)
      }
    }
  }, [productosActuales, clienteSeleccionado?.id, negocioSeleccionado])

  // Price sync: detectar cambios de precios via polling
  const handlePriceRefresh = useCallback(async () => {
    try {
      const res = await fetch('/api/precios/tabla')
      const data = await res.json()
      if (data.tabla) {
        setTablaPrecios(data.tabla)
        // Re-resolver precios si hay cantidades cargadas
        if (Object.values(cantidadesRef.current).some(c => c > 0)) {
          resolverPrecios(cantidadesRef.current, canalRef.current, clienteSeleccionado?.id, negocioSeleccionado)
        }
      }
    } catch (error) {
      console.error('Error refreshing prices:', error)
    }
  }, [resolverPrecios, clienteSeleccionado?.id, negocioSeleccionado])

  const { stale: preciosStale, refresh: refreshPrecios } = usePriceSync(handlePriceRefresh)

  // FIX B9: resolver precios para todos los productos visibles (cantidad 1)
  // inmediatamente al seleccionar un cliente o cambiar de canal. Esto garantiza
  // que se muestre el precio especial desde el primer render,
  // sin esperar a que el usuario modifique la cantidad.
  // En edición usamos las cantidades actuales del pedido para no perder
  // la resolución por volumen que ya tenía.
  const resolverPreciosCliente = useCallback(() => {
    if (productosConfig.length === 0) return
    if (!clienteSeleccionado?.id) {
      setPreciosResueltos({})
      setPreciosOrigen({})
      return
    }
    const allProducts: Record<string, number> = {}
    const isEdit = Boolean(pedidoInicial?.id)
    for (const id of productosActuales) {
      const actual = cantidadesRef.current[id] || 0
      allProducts[id] = isEdit && actual > 0 ? actual : 1
    }
    resolverPrecios(allProducts, canalRef.current, clienteSeleccionado.id, negocioSeleccionado)
  }, [productosConfig, clienteSeleccionado?.id, productosActuales, resolverPrecios, pedidoInicial?.id, negocioSeleccionado])

  useEffect(() => {
    resolverPreciosCliente()
  }, [resolverPreciosCliente])

  // Sync direccion/barrio when negocio selection changes.
  // Use clienteSeleccionado?.id to avoid re-running when the parent
  // passes a fresh object reference on every render.
  useEffect(() => {
    if (!clienteSeleccionado) return
    if (negocioData) {
      // Use negocio's address if it has one, otherwise fall back to client's
      setEditDireccion(negocioData.direccion || clienteSeleccionado.direccion || '')
      setEditBarrio(negocioData.barrio || clienteSeleccionado.barrio || '')
    } else {
      // No negocio selected — use client's address
      setEditDireccion(clienteSeleccionado.direccion || '')
      setEditBarrio(clienteSeleccionado.barrio || '')
    }
  }, [negocioData, clienteSeleccionado?.id])

  useEffect(() => {
    if (!clienteSeleccionado?.id) {
      setFiadosStatus(null)
      return
    }

    const capturedId = clienteSeleccionado.id
    const controller = new AbortController()
    clienteIdRef.current = capturedId

    fetch(`/api/clientes/${capturedId}/fiado-status`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(r => r.json())
      .then(d => {
        if (controller.signal.aborted) return
        if (clienteIdRef.current !== capturedId) return
        if (d?.success && d.status) {
          setFiadosStatus(d.status)
        } else {
          setFiadosStatus(null)
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError') return
        setFiadosStatus(null)
      })

    return () => controller.abort()
  }, [clienteSeleccionado?.id])

  useEffect(() => {
    if (!pedidoInicial) return
    setCanal(pedidoInicial.canal)
    setObservaciones(pedidoInicial.obs || '')
    setSoloParaEstePedido(false)
    if (pedidoInicial.cliente) {
      setClienteSeleccionado(pedidoInicial.cliente as Cliente)
    }
    // Revalidación silenciosa de campos de despacho para pedido NUEVO con
    // cliente pre-seleccionado (deep-link ?new=1&clienteId=... desde
    // /clientes). El cliente pudo venir de un caché de hasta 60s
    // (cliente-detail-cache.ts) — dirección/barrio/teléfono no deben
    // depender de eso para un despacho real. Se hace acá (no en el padre)
    // porque tanto este efecto como el de sync de editDireccion/editBarrio
    // están keyed en `.id` (no en el contenido), así que mutar el prop
    // `pedidoInicial` después de este primer render no dispararía ningún
    // re-render que lo propague — hay que actualizar el state derivado
    // directamente.
    if (!pedidoInicial.id && pedidoInicial.cliente?.id) {
      const capturedId = pedidoInicial.cliente.id
      const cachedTelefono = pedidoInicial.cliente.telefono
      const cachedDireccion = pedidoInicial.cliente.direccion ?? null
      const cachedBarrio = pedidoInicial.cliente.barrio ?? null
      fetchClienteDetailFresh<{ id: string; telefono: string; direccion?: string | null; barrio?: string | null }>(capturedId)
        .then(fresh => {
          if (!fresh.ok) return
          const f = fresh.cliente
          const changed =
            f.telefono !== cachedTelefono ||
            (f.direccion ?? null) !== cachedDireccion ||
            (f.barrio ?? null) !== cachedBarrio
          if (!changed) return
          // Solo corrige si sigue siendo el mismo cliente (no cambió a mitad
          // de la revalidación) y solo pisa editDireccion/editBarrio si el
          // operador no los tocó todavía (siguen igual al valor con el que
          // se sembraron desde el caché).
          setClienteSeleccionado(prev =>
            prev && prev.id === capturedId
              ? { ...prev, telefono: f.telefono, direccion: f.direccion ?? undefined, barrio: f.barrio ?? undefined }
              : prev
          )
          setEditDireccion(prev => (prev === (cachedDireccion || '') ? (f.direccion || '') : prev))
          setEditBarrio(prev => (prev === (cachedBarrio || '') ? (f.barrio || '') : prev))
        })
    }
    // Patrón de consumo: viene gratis en la misma respuesta que ya resolvió
    // el cliente (GET /api/clientes/[id]) — no dispara un fetch adicional.
    // Solo lectura hasta que el usuario haga clic en "Aplicar sugerencia".
    setSugerenciaConsumo(
      pedidoInicial.frecuenciaSugerida || (pedidoInicial.productosSugeridos && pedidoInicial.productosSugeridos.length > 0)
        ? {
            frecuenciaSugerida: pedidoInicial.frecuenciaSugerida ?? null,
            productosSugeridos: pedidoInicial.productosSugeridos ?? [],
          }
        : null
    )
    setSugerenciaAplicada(false)
    setNegocioSeleccionado(pedidoInicial.negocioId ?? null)
    // FIX: negocioData nunca se inicializaba al editar un pedido a negocio —
    // solo se setea vía el click del usuario dentro de NegocioSelector. El
    // efecto de sync de dirección (más abajo) dependía de negocioData, no de
    // negocioSeleccionado, así que en el primer render tomaba la rama "sin
    // negocio" y prellenaba con la dirección del cliente en vez de la del
    // negocio.
    if (pedidoInicial.negocioId && (pedidoInicial.negocioDireccion || pedidoInicial.negocioBarrio)) {
      setNegocioData({
        direccion: pedidoInicial.negocioDireccion ?? null,
        barrio: pedidoInicial.negocioBarrio ?? null,
      })
    } else {
      setNegocioData(null)
    }
    const items = pedidoInicial.items
    const cantidadesIniciales: Record<string, number> = {}
    const manuales: Record<string, number> = {}
    for (const item of items) {
      const prodId = Object.keys(PRODUCTO_INFO).find(k => PRODUCTO_INFO[k].codigo === item.producto)
      if (prodId) {
        cantidadesIniciales[prodId] = item.cantidad
        if (item.precioManual) manuales[PRODUCTO_INFO[prodId].codigo] = item.precioManual
      }
    }
    setCantidades(cantidadesIniciales)
    setPreciosManuales(manuales)
    // Price resolution is handled by the useEffect at line 191
    // which triggers when clienteSeleccionado changes.
    // No need to call resolverPrecios here — it would be redundant
    // and causes a re-initialization loop when resolverPrecios reference changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoInicial?.id])

  const getPrecioBase = (codigo: string): number => {
    if (preciosResueltos[codigo]) return preciosResueltos[codigo]
    const tiers = tablaPrecios[codigo]
    let precio = tiers && tiers.length > 0 ? tiers[0].precio : (DEFAULT_PRICES[codigo] || 0)
    if (canal === 'DOMICILIO') {
      const prod = productosConfig.find(p => p.codigo === codigo)
      if (prod?.aplicaDomicilio) {
        precio += Number(prod.sobreCostoDomicilio)
      }
    }
    return precio
  }

  const getPrecio = (codigo: string) => {
    if (preciosManuales[codigo] !== undefined) return preciosManuales[codigo]
    return getPrecioBase(codigo)
  }



  const calcularTotal = () => {
    return productosActuales.reduce((sum, prodId) => {
      const cant = cantidades[prodId] || 0
      if (cant <= 0) return sum
      const info = PRODUCTO_INFO[prodId]
      return sum + cant * getPrecio(info.codigo)
    }, 0)
  }

  const total = calcularTotal()
  const totalPagado = pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
  const saldoPendiente = calcularSaldo(
    Money.fromDecimal(total),
    Money.fromDecimal(totalPagado)
  ).toDecimal()
  const requiereCliente = canal === 'DOMICILIO' || saldoPendiente > 0

  // Ruta única para aplicar un nuevo objeto `cantidades` (cambio manual de
  // un input O aplicar la sugerencia de patrón de consumo). Centralizada a
  // propósito: marca preciosLoading=true ANTES de esperar el debounce, no
  // solo durante el fetch. Sin esto había una ventana de hasta 400ms donde
  // preciosLoading seguía en false pero la cantidad ya había cambiado,
  // dejando que el usuario cobrara/enviara con el precio previo (stale).
  // Cualquier nuevo call site que modifique `cantidades` en bloque debe
  // pasar por acá, no reimplementar el debounce+guard.
  const applyCantidadesUpdate = (next: Record<string, number>) => {
    setCantidades(next)
    if (resolverTimeoutRef.current) {
      clearTimeout(resolverTimeoutRef.current)
    }
    if (Object.values(next).some(c => c > 0)) {
      setPreciosLoading(true)
    }
    resolverTimeoutRef.current = setTimeout(() => {
      resolverTimeoutRef.current = null
      resolverPrecios(next, canalRef.current, clienteSeleccionado?.id, negocioSeleccionado)
    }, 400)
  }

  const handleCantidadChange = (id: string, value: string) => {
    const cant = parseInt(value) || 0
    applyCantidadesUpdate({ ...cantidades, [id]: cant })
  }

  const aplicarSugerenciaConsumo = () => {
    if (!sugerenciaConsumo?.productosSugeridos.length) return
    const next = { ...cantidades }
    for (const sugerido of sugerenciaConsumo.productosSugeridos) {
      const prodId = mapLegacyCodigoToProdId(sugerido.codigo)
      if (prodId) next[prodId] = sugerido.cantidadPromedio
    }
    applyCantidadesUpdate(next)
    setSugerenciaAplicada(true)
  }

  const verPatronConsumo = () => {
    if (!clienteSeleccionado?.id || sugerenciaLoading || sugerenciaConsumo) return
    const capturedId = clienteSeleccionado.id
    setSugerenciaLoading(true)
    fetchClienteDetailFresh<{
      frecuenciaSugerida?: { dias: number; label: string } | null
      productosSugeridos?: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }>
    }>(capturedId).then(result => {
      // Guard anti-carrera: si el usuario ya cambió de cliente mientras este
      // fetch estaba en vuelo, no pisar el estado del cliente actual con la
      // respuesta tardía del cliente anterior (mismo patrón que el efecto de
      // fiado-status un poco más abajo, con el mismo clienteIdRef).
      if (clienteIdRef.current !== capturedId) return
      setSugerenciaLoading(false)
      if (result.ok) {
        setSugerenciaConsumo({
          frecuenciaSugerida: result.cliente.frecuenciaSugerida ?? null,
          productosSugeridos: result.cliente.productosSugeridos ?? [],
        })
      }
    })
  }

  const increment = (id: string) => handleCantidadChange(id, String((cantidades[id] || 0) + 1))
  const decrement = (id: string) => handleCantidadChange(id, String(Math.max(0, (cantidades[id] || 0) - 1)))

  const metodosUsados = new Set(pagos.map(p => p.metodo))

  const seleccionarChip = (metodoId: string) => {
    if (metodosUsados.has(metodoId)) return
    setModoPagoActivo(metodoId)
    setMontoInput('')
  }

  const confirmarMonto = () => {
    if (!modoPagoActivo) return
    const monto = parseFloat(montoInput) || 0
    if (monto <= 0) { setModoPagoActivo(null); setMontoInput(''); return }
    setPagos(prev => [...prev, { metodo: modoPagoActivo, monto }])
    setModoPagoActivo(null)
    setMontoInput('')
  }

  const cancelarMonto = () => { setModoPagoActivo(null); setMontoInput('') }
  const eliminarPago = (idx: number) => { setPagos(prev => prev.filter((_, i) => i !== idx)) }
  const pagarCompleto = () => { if (total > 0) setPagos([{ metodo: 'EFECTIVO', monto: total }]) }

  const filteredClientes = searchTerm
    ? clientes.filter((c) => matchCliente(c, searchTerm))
    : []

  const handleSelectCliente = (cliente: Cliente) => {
    setClienteSeleccionado(cliente)
    setNegocioSeleccionado(null)
    setSearchTerm('')
    setMostrarNuevo(false)
    setSoloParaEstePedido(false)
    // Selección manual: a diferencia del deep-link desde /clientes, acá NO
    // se dispara un fetch automático de patrón de consumo (ver
    // verPatronConsumo) — el proyecto es offline-first para 2G/3G y la
    // selección de cliente ya dispara fiado-status + negocios.
    setSugerenciaConsumo(null)
    setSugerenciaLoading(false)
    setSugerenciaAplicada(false)
  }
  const handleCrearNuevo = () => { setMostrarNuevo(true); setClienteSeleccionado(null); setNuevoCliente(prev => ({ ...prev, nombre: searchTerm })) }

  const handleToggleCanal = (nuevoCanal: 'PUNTO' | 'DOMICILIO') => {
    if (nuevoCanal === canal) return
    const productosNuevoCanal = getProductosForCanal(nuevoCanal, productosConfig)
    const nuevasCantidades: Record<string, number> = {}
    for (const id of productosNuevoCanal) {
      if (cantidades[id] > 0) nuevasCantidades[id] = cantidades[id]
    }
    setCantidades(nuevasCantidades)
    setCanal(nuevoCanal)
    if (!pedidoInicial?.id) {
      setPreciosResueltos({})
      setPreciosOrigen({})
      setPreciosManuales({})
    }
    // FIX B9: resolver precios para todos los productos del nuevo canal
    // (cantidad 1 o la cantidad real en edición) para que los precios especiales
    // aparezcan inmediatamente, sin esperar a modificar cantidades.
    if (productosNuevoCanal.length > 0) {
      setPreciosLoading(true)
    }
    setTimeout(() => {
      const allProducts: Record<string, number> = {}
      const isEdit = Boolean(pedidoInicial?.id)
      for (const id of productosNuevoCanal) {
        const actual = cantidadesRef.current[id] || 0
        allProducts[id] = isEdit && actual > 0 ? actual : 1
      }
      resolverPrecios(allProducts, nuevoCanal, clienteSeleccionado?.id, negocioSeleccionado)
    }, 0)
  }

  const setPrecioManual = (codigo: string, valor: number) => {
    if (valor <= 0 || valor === getPrecioBase(codigo)) {
      setPreciosManuales(prev => {
        const next = { ...prev }
        delete next[codigo]
        return next
      })
      setPrecioBajoConfirmado(prev => {
        const next = { ...prev }
        delete next[codigo]
        return next
      })
    } else {
      setPreciosManuales(prev => ({ ...prev, [codigo]: valor }))
      if (valor >= getPrecioBase(codigo) * 0.5) {
        setPrecioBajoConfirmado(prev => {
          const next = { ...prev }
          delete next[codigo]
          return next
        })
      }
    }
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    // Bloquear el submit mientras el precio real todavía se está resolviendo
    // (debounce + fetch a /api/precios/resolver). El total/precio autoritativo
    // lo calcula el servidor de todas formas, pero si se cobra/factura con un
    // total desactualizado en pantalla, lo cobrado no cuadra con lo registrado
    // y el pedido queda con saldo pendiente o saldo a favor sin que nadie se
    // entere. Ver también: disabled del botón de submit más abajo.
    if (preciosLoading) {
      toast.info('Espera a que se actualicen los precios...')
      return
    }
    if (total <= 0) { toast.error('Agrega al menos un producto'); return }
    if (requiereCliente && !clienteSeleccionado && !mostrarNuevo) {
      toast.error(canal === 'DOMICILIO' ? 'Selecciona un cliente para el envío' : 'Selecciona un cliente para registrar el fiado')
      return
    }
    if (mostrarNuevo && (!nuevoCliente.nombre || !nuevoCliente.telefono)) {
      toast.error('Nombre y teléfono son obligatorios')
      return
    }
    if (canal === 'DOMICILIO') {
      if (clienteSeleccionado && (!editDireccion || !editBarrio)) {
        toast.error('Dirección y barrio son obligatorios para envío a domicilio')
        return
      }
      if (mostrarNuevo && (!nuevoCliente.direccion || !nuevoCliente.barrio)) {
        toast.error('Dirección y barrio son obligatorios para envío a domicilio')
        return
      }
    }

    setSubmitting(true)

    let clienteId = 'CONSUMIDOR_FINAL'
    let clienteNuevoData: { nombre: string; apellido?: string; telefono: string; direccion: string; barrio?: string; fuente?: string } | undefined

    if (clienteSeleccionado) {
      clienteId = clienteSeleccionado.id
    } else if (mostrarNuevo) {
      clienteNuevoData = { nombre: nuevoCliente.nombre, apellido: nuevoCliente.apellido || undefined, telefono: nuevoCliente.telefono, direccion: nuevoCliente.direccion, barrio: nuevoCliente.barrio || undefined, fuente: nuevoCliente.fuente || undefined }
    }

    const items = productosActuales
      .filter(id => (cantidades[id] || 0) > 0)
      .map(id => ({
        producto: PRODUCTO_INFO[id].codigo,
        cantidad: cantidades[id] || 0,
        precioManual: preciosManuales[PRODUCTO_INFO[id].codigo],
      }))

    const actualizarCliente = resolveActualizarCliente({
      clienteSeleccionado,
      canal,
      negocioSeleccionado,
      editDireccion,
      editBarrio,
      soloParaEstePedido,
    })

    const data: PedidoUnifiedData = {
      clienteId,
      negocioId: negocioSeleccionado || undefined,
      canal,
      items,
      preciosManuales,
      pagos: pagos.filter(p => p.monto > 0),
      obs: observaciones || undefined,
      clienteNuevo: clienteNuevoData,
      actualizarCliente,
      direccionEntrega: canal === 'DOMICILIO' ? editDireccion || undefined : undefined,
      barrioEntrega: canal === 'DOMICILIO' ? editBarrio || undefined : undefined,
      ventaRapida: canal === 'PUNTO',
      isEdit: !!pedidoInicial?.id,
      pedidoId: pedidoInicial?.id,
    }

    await onSubmit(data)
    setSubmitting(false)
  }

  // ==================== RENDER ====================

  return (
    <form onSubmit={handleSubmit} className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 h-full">
      {/* COLUMNA IZQUIERDA */}
      <div className="space-y-4 overflow-y-auto lg:max-h-[calc(90vh-2rem)] pr-1">
        {/* Canal toggle (solo si contexto lo permite) */}
        {contexto === 'PUNTO' && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleToggleCanal('PUNTO')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${canal === 'PUNTO' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              🏪 Punto de Venta
            </button>
            <button
              type="button"
              onClick={() => handleToggleCanal('DOMICILIO')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${canal === 'DOMICILIO' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              🚚 Domicilio
            </button>
          </div>
        )}

        {/* Banner de precios desactualizados */}
        {preciosStale && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium">Precios actualizados disponibles</span>
            </div>
            <button
              type="button"
              onClick={refreshPrecios}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition"
            >
              Actualizar
            </button>
          </div>
        )}

        {/* Cliente */}
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">{canal === 'DOMICILIO' ? 'Cliente *' : 'Cliente (opcional)'}</h3>
          {clienteSeleccionado ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-blue-50 rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium text-sm">{clienteSeleccionado.nombre}{clienteSeleccionado.apellido ? ` ${clienteSeleccionado.apellido}` : ''}</span>
                  <span className="text-xs text-gray-500 ml-2">{clienteSeleccionado.telefono}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setClienteSeleccionado(null)
                    setSearchTerm('')
                    setNegocioSeleccionado(null)
                    setNegocioData(null)
                    setFiadosStatus(null)
                    setPreciosResueltos({})
                    setEditDireccion('')
                    setEditBarrio('')
                    setSoloParaEstePedido(false)
                    setSugerenciaConsumo(null)
                    setSugerenciaLoading(false)
                    setSugerenciaAplicada(false)
                  }}
                  className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                  title="Quitar cliente"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* Banner de fiados */}
              {fiadosStatus && fiadosStatus.nivel !== 'ok' && (
                <div
                  data-testid="fiado-status-banner"
                  className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                    fiadosStatus.nivel === 'limite'
                      ? 'bg-red-50 border border-red-200 text-red-700'
                      : 'bg-amber-50 border border-amber-200 text-amber-700'
                  }`}
                >
                  <span>{fiadosStatus.nivel === 'limite' ? '🔒' : '⚠️'}</span>
                  <span>
                    {fiadosStatus.nivel === 'limite'
                      ? `Cliente tiene ${fiadosStatus.count}/${fiadosStatus.limite} pedidos fiados (límite alcanzado). Debe pagar antes de crear otro.`
                      : `Cliente tiene ${fiadosStatus.count}/${fiadosStatus.limite} pedidos fiados. Al crear este pedido, quedará al límite.`
                    }
                  </span>
                </div>
              )}

              {/* Patrón de consumo (guía) — solo lectura; aplicar cantidades
                  es siempre una acción explícita del usuario, nunca automática. */}
              {sugerenciaConsumo && (sugerenciaConsumo.frecuenciaSugerida || sugerenciaConsumo.productosSugeridos.length > 0) && (
                <div
                  data-testid="patron-consumo-banner"
                  className="px-3 py-2 rounded-lg text-xs bg-blue-50 border border-blue-200 text-blue-800 space-y-1.5"
                >
                  <p className="font-semibold uppercase text-[11px] text-blue-700">Patrón de consumo (guía)</p>
                  {sugerenciaConsumo.frecuenciaSugerida && (
                    <p>Compra {sugerenciaConsumo.frecuenciaSugerida.label.toLowerCase()}</p>
                  )}
                  {sugerenciaConsumo.productosSugeridos.length > 0 && (
                    <p>
                      Suele pedir: {sugerenciaConsumo.productosSugeridos.map(p =>
                        `${p.cantidadPromedio} ${p.nombre} (${p.frecuencia}%)`
                      ).join(', ')}
                    </p>
                  )}
                  {sugerenciaConsumo.productosSugeridos.length > 0 && (
                    sugerenciaAplicada ? (
                      <p className="italic text-blue-600">Cantidades aplicadas — puedes ajustarlas abajo.</p>
                    ) : (
                      <button
                        type="button"
                        data-testid="aplicar-sugerencia-btn"
                        onClick={aplicarSugerenciaConsumo}
                        disabled={productosConfig.length === 0}
                        className="px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        Aplicar sugerencia
                      </button>
                    )
                  )}
                </div>
              )}
              {!sugerenciaConsumo && !sugerenciaLoading && (
                <button
                  type="button"
                  onClick={verPatronConsumo}
                  className="text-xs text-blue-600 hover:text-blue-700 underline"
                >
                  Ver patrón de consumo
                </button>
              )}
              {sugerenciaLoading && (
                <p className="text-xs text-gray-400">Cargando patrón de consumo…</p>
              )}

              {/* NEGOCIO SELECTOR */}
              <NegocioSelector
                clienteId={clienteSeleccionado.id}
                clienteNombre={clienteSeleccionado.nombre}
                clienteDireccion={clienteSeleccionado.direccion}
                clienteBarrio={clienteSeleccionado.barrio}
                clienteLinkUbicacion={clienteSeleccionado.linkUbicacion}
                selectedNegocioId={negocioSeleccionado}
                onNegocioSelected={(id, data) => { setNegocioSeleccionado(id); setNegocioData(data) }}
                // FIX: editar un pedido existente NUNCA puede cambiar su
                // negocioId (ActualizarPedidoInput no tiene ese campo — el
                // backend siempre reusa el negocioId original). El selector
                // quedaba interactivo igual, sugiriendo una capacidad que no
                // existe. Se vuelve de solo lectura al editar.
                readOnly={Boolean(pedidoInicial?.id)}
              />

              {canal === 'DOMICILIO' && (
                <div className="space-y-2">
                  {/* La dirección de destino (negocio o domicilio principal) ya se
                      muestra en el selector de arriba una sola vez (resumen
                      colapsado). Estos inputs son para AJUSTAR el texto de entrega
                      de este pedido puntual, no repiten el indicador de destino. */}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Dirección *"
                      value={editDireccion}
                      onChange={(e) => setEditDireccion(e.target.value)}
                      className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Barrio *"
                      value={editBarrio}
                      onChange={(e) => setEditBarrio(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  {/* Solo tiene sentido para el domicilio principal: cuando hay
                      negocio seleccionado, la persistencia a Cliente ya está
                      bloqueada incondicionalmente (ver resolveActualizarCliente),
                      así que el checkbox sería ruido sin efecto. */}
                  {!negocioSeleccionado && (
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={soloParaEstePedido}
                        onChange={(e) => setSoloParaEstePedido(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      🕓 Solo para este pedido (no actualizar la dirección guardada)
                    </label>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Buscar cliente por nombre o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              {searchTerm && clientes.length === 0 && (
                // La lista completa de clientes se carga en background al
                // abrir /pedidos (ya no bloquea la apertura del modal
                // cuando viene con un cliente pre-seleccionado). Si el
                // usuario busca a OTRO cliente antes de que termine, se
                // avisa en vez de mostrar una lista vacía sin explicación.
                <p className="text-xs text-gray-400">Cargando lista completa de clientes…</p>
              )}
              {searchTerm && filteredClientes.length > 0 && (
                <div className="border rounded-lg max-h-40 overflow-y-auto">
                  {filteredClientes.map(c => (
                    <button key={c.id} type="button" data-testid="cliente-search-result" onClick={() => handleSelectCliente(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 text-sm">
                      <span className="font-medium">
                        {c.negocios?.[0]?.nombre || `${c.nombre}${c.apellido ? ` ${c.apellido}` : ''}`}
                      </span>
                      {c.negocios?.[0] && (
                        <span className="text-gray-400 ml-2 text-xs">de {c.nombre}{c.apellido ? ` ${c.apellido}` : ''}</span>
                      )}
                      <span className="text-gray-400 ml-2">{c.telefono}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchTerm && (
                <button type="button" onClick={handleCrearNuevo} className="text-sm text-blue-600 hover:text-blue-700">+ Crear cliente nuevo en vez de estos</button>
              )}
              {mostrarNuevo && (
                <div
                  onKeyDown={(e) => { if (e.key === 'Escape') setMostrarNuevo(false) }}
                  className="space-y-2"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Nuevo cliente</span>
                    <button
                      type="button"
                      onClick={() => setMostrarNuevo(false)}
                      className="lg:hidden text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Nombre *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({ ...p, nombre: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                    <input placeholder="Apellido" value={nuevoCliente.apellido} onChange={e => setNuevoCliente(p => ({ ...p, apellido: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                    <input placeholder="Teléfono *" value={nuevoCliente.telefono} onChange={e => setNuevoCliente(p => ({ ...p, telefono: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
                    <input placeholder={canal === 'DOMICILIO' ? 'Dirección *' : 'Dirección'} value={nuevoCliente.direccion} onChange={e => setNuevoCliente(p => ({ ...p, direccion: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
                    <input placeholder={canal === 'DOMICILIO' ? 'Barrio *' : 'Barrio'} value={nuevoCliente.barrio} onChange={e => setNuevoCliente(p => ({ ...p, barrio: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm col-span-2" />
                    <div className="col-span-2">
                      <TipoNegocioSelect options={FUENTES} value={nuevoCliente.fuente} onChange={(val) => setNuevoCliente(p => ({ ...p, fuente: val }))} placeholder="¿Cómo nos conoció?" apiUrl="/api/clientes/fuentes" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Productos - Grid 2 cols en desktop */}
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">Productos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {productosActuales.map((prodId) => {
              const info = PRODUCTO_INFO[prodId]
              const cant = cantidades[prodId] || 0
              const precio = getPrecio(info.codigo)
              const tiers = tablaPrecios[info.codigo] || []
              const Icon = getProductoIconConfig(info.codigo).Icon

              return (
                <div key={prodId} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon size={24} />
                      <span className="font-medium text-sm">{info.nombre}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {preciosLoading && (
                        <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                      )}
                      {preciosManuales[info.codigo] !== undefined && preciosManuales[info.codigo] > 0 ? (
                        <>
                          <span className="text-[9px] text-gray-400 line-through">${getPrecioBase(info.codigo).toLocaleString()}</span>
                          <span className="text-xs font-bold text-amber-600">${preciosManuales[info.codigo].toLocaleString()}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">${precio.toLocaleString()}</span>
                      )}
                      {preciosOrigen[info.codigo] === 'cliente' && (
                        <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Especial</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => decrement(prodId)} className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-gray-600" disabled={cant === 0}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                      </button>
                      <Input type="number" min="0" value={cant || ''} onChange={(e) => handleCantidadChange(prodId, e.target.value)} className="w-14 text-center p-1 h-8 text-sm bg-white" placeholder="0" />
                      <button type="button" onClick={() => increment(prodId)} className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                    {cant > 0 && <span className="text-sm font-bold">${(cant * precio).toLocaleString()}</span>}
                  </div>
                  {cant > 0 && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-[10px] text-gray-400">Precio:</span>
                      <input
                        type="number"
                        min="0"
                        value={preciosManuales[info.codigo] ?? ''}
                        onChange={(e) => setPrecioManual(info.codigo, parseFloat(e.target.value) || 0)}
                        placeholder={`${getPrecioBase(info.codigo)}`}
                        className="w-16 text-xs border border-gray-300 rounded px-1 py-0.5 text-right focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                      />
                      {preciosManuales[info.codigo] !== undefined && preciosManuales[info.codigo] > 0 && (
                        <button
                          type="button"
                          onClick={() => setPrecioManual(info.codigo, 0)}
                          className="text-[10px] text-gray-400 hover:text-red-500"
                          title="Restaurar precio base"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  )}
                  {cant > 0 && preciosManuales[info.codigo] !== undefined &&
                    preciosManuales[info.codigo] > 0 &&
                    preciosManuales[info.codigo] < getPrecioBase(info.codigo) * 0.5 &&
                    !precioBajoConfirmado[info.codigo] && (
                    <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-[10px] text-amber-700 flex items-center justify-between">
                      <span>⚠️ {Math.round((1 - preciosManuales[info.codigo] / getPrecioBase(info.codigo)) * 100)}% bajo</span>
                      <button
                        type="button"
                        onClick={() => setPrecioBajoConfirmado(prev => ({ ...prev, [info.codigo]: true }))}
                        className="text-amber-800 font-medium underline"
                      >
                        Confirmar
                      </button>
                    </div>
                  )}
                  {tiers.length > 0 && cant > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tiers.map((t, i) => (
                        <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${cant >= t.cantMin && (t.cantMax === null || cant <= t.cantMax) ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                          {t.cantMax ? `${t.cantMin}-${t.cantMax}` : `${t.cantMin}+`}: ${t.precio.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Observaciones */}
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-gray-700 text-sm mb-2">Observaciones</h3>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Notas adicionales..."
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
          />
        </div>
      </div>

      {/* COLUMNA DERECHA - STICKY */}
      <div className="lg:sticky lg:top-0 lg:h-fit space-y-4 mt-4 lg:mt-0">
        {/* Ticket / Resumen */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-gray-700 text-sm mb-3">🧾 Resumen</h3>
          <div className="space-y-1.5 mb-3">
            {productosActuales.filter(id => (cantidades[id] || 0) > 0).map(id => {
              const info = PRODUCTO_INFO[id]
              const cant = cantidades[id] || 0
              const precio = getPrecio(info.codigo)
              const Icon = getProductoIconConfig(info.codigo).Icon
              return (
                <div key={id} className="flex justify-between text-sm">
                  <span className="text-gray-600"><Icon size={16} className="inline-block align-text-bottom" /> {cant} x {info.nombre}</span>
                  <span className="font-medium">${(cant * precio).toLocaleString()}</span>
                </div>
              )
            })}
            {productosActuales.filter(id => (cantidades[id] || 0) > 0).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">Sin productos seleccionados</p>
            )}
          </div>
          <div className="border-t pt-2 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total:</span>
              <span className="font-bold text-lg">${total.toLocaleString()}</span>
            </div>
            {totalPagado > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pagado:</span>
                <span className="font-medium text-green-600">${totalPagado.toLocaleString()}</span>
              </div>
            )}
            {saldoPendiente > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Saldo:</span>
                <span className="font-medium text-red-600">${saldoPendiente.toLocaleString()}</span>
              </div>
            )}

          </div>
        </div>

        {/* Pagos */}
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-700 text-sm">💳 Pagos</h3>
            {total > 0 && (
              <button
                type="button"
                onClick={pagarCompleto}
                disabled={preciosLoading}
                title={preciosLoading ? 'Esperando precio actualizado...' : undefined}
                className="text-xs text-green-600 hover:text-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Pagar completo
              </button>
            )}
          </div>

          {modoPagoActivo ? (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
              <span className="text-lg">{METODO_PAGO_ICONS[modoPagoActivo]}</span>
              <span className="text-sm font-medium">{METODOS_PAGO.find(m => m.id === modoPagoActivo)?.nombre}</span>
              <div className="flex-1 flex items-center gap-1 ml-2">
                <span className="text-xs text-gray-400">$</span>
                <input
                  type="number"
                  min="0"
                  autoFocus
                  value={montoInput}
                  onChange={(e) => setMontoInput(e.target.value)}
                  onBlur={confirmarMonto}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmarMonto(); if (e.key === 'Escape') cancelarMonto() }}
                  className="flex-1 border border-blue-300 rounded px-2 py-1 text-sm text-right"
                  placeholder="0"
                />
              </div>
              <button type="button" onClick={cancelarMonto} className="text-gray-400 hover:text-red-500 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {METODOS_PAGO.map(m => {
                const usado = metodosUsados.has(m.id)
                const pagoExistente = pagos.find(p => p.metodo === m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => seleccionarChip(m.id)}
                    disabled={usado}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition ${usado ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white hover:bg-gray-50 cursor-pointer'}`}
                  >
                    <span>{m.emoji}</span>
                    <span>{m.nombre}</span>
                    {usado && pagoExistente && <span className="text-xs ml-1">✅ ${pagoExistente.monto.toLocaleString()}</span>}
                  </button>
                )
              })}
            </div>
          )}

          {pagos.length > 0 && (
            <div className="space-y-1.5 mt-3">
              {pagos.map((pago, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{METODO_PAGO_ICONS[pago.metodo] || '💳'}</span>
                    <span className="text-sm text-gray-600">{METODOS_PAGO.find(m => m.id === pago.metodo)?.nombre}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">${pago.monto.toLocaleString()}</span>
                    <button type="button" onClick={() => eliminarPago(idx)} className="text-gray-400 hover:text-red-500 p-0.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Botón Submit */}
        <button
          type="button"
          onClick={() => handleSubmit()}
          data-testid="submit-pedido"
          disabled={submitting || preciosLoading || total <= 0 || fiadosStatus?.nivel === 'limite'}
          className={`w-full py-3 rounded-xl text-white font-bold text-lg shadow-lg transition ${
            canal === 'PUNTO'
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-blue-600 hover:bg-blue-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {submitting
            ? 'Procesando...'
            : preciosLoading
              ? 'Actualizando precios...'
              : pedidoInicial?.id ? `📝 Actualizar Pedido $${total.toLocaleString()}` : canal === 'PUNTO' ? `💰 Cobrar $${total.toLocaleString()}` : `📦 Crear Pedido $${total.toLocaleString()}`}
        </button>
      </div>
    </form>
  )
}


