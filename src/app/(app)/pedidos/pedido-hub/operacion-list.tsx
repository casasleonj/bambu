'use client'

import { EmptyState } from '@/components/empty-state'
import { pedidoItemsResumen } from '../pedido-items'
import { deriveOperacion, origenLabel, embarqueLinea } from './derive-operacion'
import type { AccionKey, DeriveContext, Pedido } from './types'
import { OperacionConsulta,type AccionesConsulta } from './operacion-consulta'
import { useEffect, useRef, useState } from 'react'
import { GrupoBarrioEncabezado } from './grupo-barrio-encabezado'
import { EntregasDestacadas } from './entregas-destacadas'
import type { EntregaDestacada } from '@/lib/pedidos-entregas-historial'
import { useShallowSearchParams } from '@/hooks/use-shallow-search-params'
import { CLAVE_VENTA_ANONIMA } from '@/lib/barrios/grupo-barrio'
import { useAhora } from '@/hooks/use-ahora'
import { ordenarPorFranja, type Franja } from '@/lib/pedidos-franja'
import { FiadosAnterioresBadge } from './fiados-anteriores-badge'

const money = (n: number) => new Intl.NumberFormat('es-CO').format(Number(n) || 0)

interface OperacionListProps {
  pedidos: Pedido[]
  viewport: 'desktop' | 'mobile'
  hoyBogota: string
  /** contexto por pedido (N2 / excepción / cliente bloqueado). Opcional en 4a. */
  contextByPedido?: Record<string, Omit<DeriveContext, 'hoyBogota'>>
  onAccion: (pedido: Pedido, key: AccionKey) => void
  onOpen: (pedido: Pedido) => void
  consulta?: AccionesConsulta
  /** #797: lista de pendientes de días anteriores (solo en la consulta). */
  arrastre?: boolean
}

function clienteLinea(p: Pedido): string {
  const nombre = p.nombreNegocioCli || `${p.nombreCli}${p.apellidoCli ? ' ' + p.apellidoCli : ''}`
  return nombre
}

function pagoSenal(p: Pedido): string | null {
  if (p.estadoPago === 'ANTICIPADO') return 'anticipado'
  if (p.estadoPago === 'PARCIAL') return 'parcial'
  return null
}

function OperacionRowDesktop({
  pedido, hoyBogota, ctx, onAccion, onOpen,
}: {
  pedido: Pedido
  hoyBogota: string
  ctx: Omit<DeriveContext, 'hoyBogota'>
  onAccion: OperacionListProps['onAccion']
  onOpen: OperacionListProps['onOpen']
}) {
  const d = deriveOperacion(pedido, { ...ctx, hoyBogota })
  const origen = origenLabel(pedido.origen)
  const embarque = embarqueLinea(pedido)
  const senal = pagoSenal(pedido)
  return (
    <tr
      data-testid={`operacion-row-${pedido.id}`}
      onClick={() => onOpen(pedido)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(pedido) }}
      className="cursor-pointer border-b hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
    >
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">#{pedido.numero}</span>
          {origen && (
            <span className="text-[10px] rounded-full border border-gray-300 px-1.5 py-0.5 text-gray-600">{origen}</span>
          )}
        </div>
        <div className="text-sm font-medium text-gray-800">{clienteLinea(pedido)}</div>
        <FiadosAnterioresBadge resumen={pedido.fiadosAnteriores} pedidoId={pedido.id} />
      </td>
      <td className="px-3 py-2 align-top text-sm text-gray-600">
        {pedido.canal === 'DOMICILIO' && <span className="mr-1" title="Domicilio">🚚</span>}
        {pedidoItemsResumen(pedido)}
      </td>
      <td className="px-3 py-2 align-top text-sm text-gray-700">
        {d.estadoLegible}
        {embarque && (
          <span className="block text-xs text-gray-500" data-testid={`operacion-embarque-${pedido.id}`}>{embarque}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top text-right">
        <div className="text-sm font-semibold text-gray-800">${money(pedido.total)}</div>
        {senal && <div className="text-[11px] text-gray-500">{senal}</div>}
      </td>
      <td className="px-3 py-2 align-top text-right">
        {d.accionDestacada && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAccion(pedido, d.accionDestacada!.key) }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            {d.accionDestacada.label}
          </button>
        )}
      </td>
    </tr>
  )
}

function OperacionCardMobile({
  pedido, hoyBogota, ctx, onAccion, onOpen,
}: {
  pedido: Pedido
  hoyBogota: string
  ctx: Omit<DeriveContext, 'hoyBogota'>
  onAccion: OperacionListProps['onAccion']
  onOpen: OperacionListProps['onOpen']
}) {
  const d = deriveOperacion(pedido, { ...ctx, hoyBogota })
  const origen = origenLabel(pedido.origen)
  const embarque = embarqueLinea(pedido)
  return (
    <div
      data-testid={`operacion-row-${pedido.id}`}
      onClick={() => onOpen(pedido)}
      className="rounded-xl border border-gray-200 bg-white p-3"
    >
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-800">{clienteLinea(pedido)}</div>
        <span className="text-xs text-gray-400">#{pedido.numero}</span>
      </div>
      <FiadosAnterioresBadge resumen={pedido.fiadosAnteriores} pedidoId={pedido.id} />
      <div className="mt-0.5 text-xs text-gray-500">
        {pedido.canal === 'DOMICILIO' && <span className="mr-1">🚚</span>}
        {pedidoItemsResumen(pedido)}
        {origen && <span className="ml-2 rounded-full border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-600">{origen}</span>}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm text-gray-700">{d.estadoLegible}</span>
        <span className="text-sm font-semibold text-gray-800">${money(pedido.total)}</span>
      </div>
      {embarque && (
        <div className="text-xs text-gray-500" data-testid={`operacion-embarque-${pedido.id}`}>{embarque}</div>
      )}
      {d.accionDestacada && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAccion(pedido, d.accionDestacada!.key) }}
          className="mt-2 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {d.accionDestacada.label}
        </button>
      )}
    </div>
  )
}

/**
 * Lista de operaciones del Pedido Hub. Responsive: tabla en desktop, tarjetas
 * en mobile (ALS §12: contexto → operación → total → CTA). 5 columnas por
 * defecto (blueprint §2.4). Estado como microcopy, no badges apilados.
 * En 4a la fila abre el modal de detalle legacy vía `onOpen`; el peek es 4b.
 */
const ETIQUETA_FRANJA: Record<Franja, string> = { ya_toca: 'Ya toca', normal: 'Normales', mas_tarde: 'Más tarde hoy' }
const TONO_FRANJA: Record<Franja, string> = {
  ya_toca: 'bg-red-100 text-red-800',
  normal: 'bg-gray-100 text-gray-600',
  mas_tarde: 'bg-indigo-50 text-indigo-800',
}

/**
 * #836 F2b: «Para hoy» agrupado por tiempo restante hasta la hora acordada. Nunca oculta un pedido:
 * «Más tarde hoy» arranca plegado pero muestra cuántos hay y se despliega con un toque.
 */
function ListaPorFranja({
  pedidos, viewport, hoyBogota, onAccion, onOpen, consulta, arrastre,
}: { pedidos: Pedido[]; viewport: 'desktop' | 'mobile'; hoyBogota: string; onAccion: (p: Pedido, k: AccionKey) => void; onOpen: (p: Pedido) => void; consulta: AccionesConsulta; arrastre?: boolean }) {
  const ahora = useAhora()
  const [tardeAbierto, setTardeAbierto] = useState(false)
  const ordenados = ordenarPorFranja(pedidos, ahora, (p) => p)
  const bloques: Array<{ franja: Franja; filas: Pedido[] }> = []
  for (const p of ordenados) {
    const ultimo = bloques[bloques.length - 1]
    if (ultimo && ultimo.franja === p._franja.franja) ultimo.filas.push(p)
    else bloques.push({ franja: p._franja.franja, filas: [p] })
  }
  return (
    <div data-testid="pedidos-por-franja">
      {bloques.map((b) => {
        const plegado = b.franja === 'mas_tarde' && !tardeAbierto
        return (
          <section key={b.franja} aria-label={ETIQUETA_FRANJA[b.franja]}>
            <div
              className={`my-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${TONO_FRANJA[b.franja]}`}
              data-testid={`franja-${b.franja}`}
            >
              <span>{ETIQUETA_FRANJA[b.franja]} · {b.filas.length}</span>
              {b.franja === 'mas_tarde' && (
                <button type="button" className="underline" aria-expanded={!plegado} onClick={() => setTardeAbierto((v) => !v)} data-testid="franja-mas-tarde-toggle">
                  {plegado ? '▼ ver' : '▲ ocultar'}
                </button>
              )}
            </div>
            {!plegado && (
              <OperacionConsulta pedidos={b.filas} viewport={viewport} hoyBogota={hoyBogota} onAccion={onAccion} onOpen={onOpen} acciones={consulta} arrastre={arrastre} />
            )}
          </section>
        )
      })}
    </div>
  )
}

export function OperacionList({
  pedidos, viewport, hoyBogota, contextByPedido, onAccion, onOpen, consulta, arrastre,
}: OperacionListProps) {
  // #859: recorrido manual temporal de la vista, sin alterar FIFO del servidor.
  const [modoRecorrido, setModoRecorrido] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('recorrido'))
  const [barrioSeleccionado, setBarrioSeleccionado] = useState("")
  // #913: el Recorrido cambia la URL SIN navegación de servidor (antes cada clic repetía la consulta
  // completa de la página en el servidor y solo después pedía los datos: dos viajes en serie).
  const urlParams = useShallowSearchParams()
  const clavesManuales = urlParams.getAll('recorrido')
  // #909: si la URL pierde las prioridades (volver a FIFO, limpiar filtros, atrás), el modo
  // Recorrido de esta lista también se apaga; no se queda «congelado» con los controles de Recorrido.
  const habiaPrioridadesUrl = useRef(clavesManuales.length > 0)
  const hayPrioridadesUrl = clavesManuales.length > 0
  useEffect(() => {
    if (habiaPrioridadesUrl.current && !hayPrioridadesUrl) setModoRecorrido(false)
    habiaPrioridadesUrl.current = hayPrioridadesUrl
  }, [hayPrioridadesUrl])
  // Persist only explicit priorities: the server appends all other barrios in FIFO order.
  const aplicarRecorrido = (orden: string[]) =>
    urlParams.set({ recorrido: orden.slice(0, 20), agrupar: 'barrio', page: '1' }, { history: 'push' })
  if (pedidos.length === 0) {
    return (
      <EmptyState
        title={consulta?.vacioCompromiso?.vacioTitulo ?? "No hay operaciones"}
        description={consulta?.vacioCompromiso?.vacioDescripcion ?? "Ajustá los filtros o creá una nueva operación."}
      />
    )
  }

  if (consulta?.franjas && !pedidos.some((p) => p.grupoBarrio) && pedidos.some((p) => p.entregaNoAntesDe)) {
    return <ListaPorFranja pedidos={pedidos} viewport={viewport} hoyBogota={hoyBogota} onAccion={onAccion} onOpen={onOpen} consulta={consulta} arrastre={arrastre} />
  }

  if (consulta && pedidos.some((p) => p.grupoBarrio)) {
    // #836 F3: bloques consecutivos por barrio, cada uno con su encabezado y el total real.
    const bloques: Array<{ clave: string; etiqueta: string; filas: Pedido[] }> = []
    for (const p of pedidos) {
      const g = p.grupoBarrio
      const ultimo = bloques[bloques.length - 1]
      if (ultimo && g && ultimo.clave === g.clave) ultimo.filas.push(p)
      else bloques.push({ clave: g?.clave ?? 'sin-barrio', etiqueta: g?.etiqueta ?? 'Sin barrio', filas: [p] })
    }
    // #915: las entregas de pedidos anteriores van dentro del grupo de su barrio; un barrio que solo tiene
    // esas entregas (sin pedidos pendientes) también obtiene su bloque, antes de «Sin barrio» y las ventas anónimas.
    const entregasPorClave = new Map<string, EntregaDestacada[]>()
    for (const d of consulta.entregasAnteriores?.entregas ?? []) {
      const clave = d.grupoBarrio?.clave ?? 'sin-barrio'
      entregasPorClave.set(clave, [...(entregasPorClave.get(clave) ?? []), d])
    }
    for (const [clave, lista] of entregasPorClave) {
      if (bloques.some(b => b.clave === clave) || !consulta.entregasAnteriores?.primeraPagina) continue
      const nuevo = { clave, etiqueta: lista[0].grupoBarrio?.etiqueta ?? 'Sin barrio', filas: [] as Pedido[] }
      const i = bloques.findIndex(b => b.clave === 'sin-barrio' || b.clave === CLAVE_VENTA_ANONIMA)
      if (i < 0) bloques.push(nuevo)
      else bloques.splice(i, 0, nuevo)
    }
    // #909: los barrios del Recorrido son los de la consulta MÁS los de los bloques que se ven.
    // Sin esto, una lista de «Pendientes de días anteriores» sin pedidos de hoy tenía el selector
    // vacío y «Llevar al primero», Subir y Bajar no hacían nada.
    // #913: la venta anónima en punto no es un barrio: no se prioriza ni se mueve en el Recorrido.
    const gruposRecorrido = (consulta.grupos ?? []).filter(g => g.clave !== CLAVE_VENTA_ANONIMA)
    for (const b of bloques) {
      if (b.clave !== CLAVE_VENTA_ANONIMA && !gruposRecorrido.some(g => g.clave === b.clave)) gruposRecorrido.push({ clave: b.clave, etiqueta: b.etiqueta, total: b.filas.length })
    }
    const clavesGlobales = gruposRecorrido.map(g => g.clave)
    const ordenEfectivo = [
      ...clavesManuales.filter(clave => clavesGlobales.includes(clave)),
      ...clavesGlobales.filter(clave => !clavesManuales.includes(clave)),
    ]
    // #913: el orden se ve al instante: los bloques visibles siguen las prioridades de la URL y el servidor
    // confirma después con el mismo orden. Sin prioridades se respeta el orden FIFO que ya trae el servidor.
    const posManual = (clave: string) => { const i = clavesManuales.indexOf(clave); return i < 0 ? Number.MAX_SAFE_INTEGER : i }
    const bloquesVisibles = clavesManuales.length ? [...bloques].sort((a, b) => posManual(a.clave) - posManual(b.clave)) : bloques
    const priorizar = (clave: string) => aplicarRecorrido([clave, ...clavesManuales.filter(k => k !== clave)])
    const mover = (clave: string, desplazamiento: number) => {
      const actual = [...ordenEfectivo]
      const indice = actual.indexOf(clave)
      const destino = indice + desplazamiento
      if (indice < 0 || destino < 0 || destino >= actual.length) return
      ;[actual[indice], actual[destino]] = [actual[destino], actual[indice]]
      aplicarRecorrido(actual.slice(0, destino + 1))
    }
    return (
      <div data-testid="pedidos-agrupados-barrio">
        <div className="my-2 flex flex-wrap items-center gap-2 text-xs">
          <button type="button" aria-label="Volver al orden FIFO" aria-pressed={!modoRecorrido} onClick={() => { setModoRecorrido(false); aplicarRecorrido([]) }}
            className={`rounded-md border px-3 py-1.5 ${!modoRecorrido ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}>FIFO</button>
          <button type="button" aria-pressed={modoRecorrido} onClick={() => setModoRecorrido(true)}
            className={`rounded-md border px-3 py-1.5 ${modoRecorrido ? 'bg-stone-800 text-white' : 'bg-white text-stone-700'}`}>Recorrido</button>
          {modoRecorrido && (
            <>
              <label htmlFor="recorrido-barrio" className="font-medium text-stone-700">Priorizar barrio</label>
              <select id="recorrido-barrio" data-testid="recorrido-barrio-select"
                value={barrioSeleccionado} onChange={e => setBarrioSeleccionado(e.target.value)}
                className="max-w-full rounded-md border border-stone-400 bg-white px-2 py-1.5">
                <option value="">Selecciona cualquier barrio</option>
                {gruposRecorrido.map(g => (
                  <option key={g.clave} value={g.clave}>{g.etiqueta} ({g.total} pedidos)</option>
                ))}
              </select>
              {barrioSeleccionado && ordenEfectivo.includes(barrioSeleccionado) ? (
                <button type="button" onClick={() => priorizar(barrioSeleccionado)} data-testid="recorrido-priorizar"
                  className="rounded-md bg-stone-800 px-3 py-1.5 text-white">Llevar al primero</button>
              ) : (
                <span aria-disabled="true" className="rounded-md bg-stone-400 px-3 py-1.5 text-white">Llevar al primero</span>
              )}
              <span className="text-stone-500">Orden global temporal, sin guardar preferencias.</span>
            </>
          )}
        </div>
        {bloquesVisibles.map((b, i) => {
          const total = consulta.grupos?.find((g) => g.clave === b.clave)?.total ?? b.filas.length
          return (
            <section key={`${b.clave}-${i}`} aria-label={`Barrio ${b.etiqueta}`}>
              <GrupoBarrioEncabezado
                grupo={consulta.grupos?.find((g) => g.clave === b.clave) ?? { clave: b.clave, etiqueta: b.etiqueta, total }}
                enPagina={b.filas.length}
                soloEste={consulta.grupoActivo === b.clave}
                onSoloEste={consulta.onGrupoBarrio ? () => consulta.onGrupoBarrio!(b.clave) : undefined}
                onTodos={consulta.onGrupoBarrio ? () => consulta.onGrupoBarrio!(null) : undefined}
              />
              {modoRecorrido && b.clave !== CLAVE_VENTA_ANONIMA && (
                <div className="mb-1 flex gap-2">
                  <button type="button" onClick={() => mover(b.clave, -1)} aria-label={`Subir ${b.etiqueta}`} disabled={ordenEfectivo.indexOf(b.clave) === 0}
                    className="rounded border px-2 py-1 text-xs disabled:pointer-events-none disabled:opacity-40">↑ Subir</button>
                  <button type="button" onClick={() => mover(b.clave, 1)} aria-label={`Bajar ${b.etiqueta}`} disabled={ordenEfectivo.indexOf(b.clave) === ordenEfectivo.length - 1}
                    className="rounded border px-2 py-1 text-xs disabled:pointer-events-none disabled:opacity-40">↓ Bajar</button>
                </div>
              )}
              {b.filas.length > 0 && (
                <OperacionConsulta pedidos={b.filas} viewport={viewport} hoyBogota={hoyBogota} onAccion={onAccion} onOpen={onOpen} acciones={consulta} arrastre={arrastre}/>
              )}
              {consulta.entregasAnteriores && entregasPorClave.has(b.clave) && bloquesVisibles.findIndex(x => x.clave === b.clave) === i && (
                <div className="mt-2" data-testid={`entregas-anteriores-${b.clave}`}>
                  <EntregasDestacadas
                    entregas={entregasPorClave.get(b.clave)!}
                    total={entregasPorClave.get(b.clave)!.length}
                    rangoAmplio={false}
                    hasta={consulta.entregasAnteriores.hasta}
                    periodo={consulta.entregasAnteriores.periodo}
                    plegable
                    onVerPedido={consulta.onVerPedido}
                    onVerTodas={consulta.entregasAnteriores.onVerTodas}
                  />
                </div>
              )}
            </section>
          )
        })}
      </div>
    )
  }

  if (consulta) return <OperacionConsulta pedidos={pedidos} viewport={viewport} hoyBogota={hoyBogota} onAccion={onAccion} onOpen={onOpen} acciones={consulta} arrastre={arrastre}/>

  const ctxFor = (id: string): Omit<DeriveContext, 'hoyBogota'> => contextByPedido?.[id] ?? {}

  if (viewport === 'mobile') {
    return (
      <div data-testid="pedido-hub-mobile" className="space-y-2">
        {pedidos.map((p) => (
          <OperacionCardMobile key={p.id} pedido={p} hoyBogota={hoyBogota} ctx={ctxFor(p.id)} onAccion={onAccion} onOpen={onOpen} />
        ))}
      </div>
    )
  }

  return (
    <div data-testid="pedido-hub-desktop" className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left">
        <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Operación</th>
            <th className="px-3 py-2 font-medium">Qué</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 text-right font-medium">Total</th>
            <th className="px-3 py-2 text-right font-medium">Acción</th>
          </tr>
        </thead>
        <tbody>
          {pedidos.map((p) => (
            <OperacionRowDesktop key={p.id} pedido={p} hoyBogota={hoyBogota} ctx={ctxFor(p.id)} onAccion={onAccion} onOpen={onOpen} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
