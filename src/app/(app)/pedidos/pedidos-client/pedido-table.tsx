'use client'

import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { MoneyDisplay } from '@/components/money-display'
import { PedidoClienteDisplay } from '@/components/pedido-cliente-display'
import { calcularEstadoPagoVisual } from '@/modules/pedidos/presentation/visual-states'
import type { Pedido } from './types'

// ADR-PAGO-REPORTADO-CONFIRMADO-001 §5 — el badge "Reportado" solo con el flag ON.
const PAGO_CONFIRMACION_ON = process.env.NEXT_PUBLIC_PAGO_CONFIRMACION === 'true'

/** Chip "sin confirmar" cuando el pedido tiene algún Pago REPORTADO (AC-05). */
function ReportadoChip({ pedido }: { pedido: Pedido }) {
  if (!PAGO_CONFIRMACION_ON || !pedido.pagoReportadoPendiente) return null
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800"
      title="Pago digital reportado — falta verificar que el dinero entró"
    >
      ⏳ Sin confirmar
    </span>
  )
}

function getPagoVisual(pedido: Pedido) {
  return calcularEstadoPagoVisual({
    estadoPago: pedido.estadoPago,
    estadoEntrega: pedido.estadoEntrega,
    saldo: Number(pedido.saldo),
    total: Number(pedido.total),
    totalPagado: Number(pedido.totalPagado),
    pagoReportado: PAGO_CONFIRMACION_ON ? pedido.pagoReportadoPendiente : undefined,
  })
}

const BOGOTA_TZ = 'America/Bogota'

export function formatFechaPedido(fecha: string): string {
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return ''
  const fechaCorta = d.toLocaleDateString('es-CO', {
    timeZone: BOGOTA_TZ,
    day: 'numeric',
    month: 'short',
  })
  // Hora AM/PM construida a mano en vez de toLocaleString con hour:'2-digit':
  // el marcador "a. m."/"p. m." que agrega ICU usa un espacio distinto
  // (narrow no-break space U+202F vs espacio normal) según la versión de
  // ICU/motor JS. Node (SSR) y el motor del navegador (hidratación) pueden
  // diferir, causando un hydration mismatch reproducible en cada carga.
  // hour12:false evita por completo el marcador AM/PM dependiente de ICU;
  // el resto se arma con aritmética simple, así el resultado es siempre
  // idéntico entre servidor y cliente.
  const [horaStr, minStr] = d
    .toLocaleTimeString('en-GB', { timeZone: BOGOTA_TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .split(':')
  const hora24 = Number(horaStr)
  const periodo = hora24 < 12 ? 'a. m.' : 'p. m.'
  const hora12 = hora24 % 12 === 0 ? 12 : hora24 % 12
  return `${fechaCorta}, ${String(hora12).padStart(2, '0')}:${minStr} ${periodo}`
}

/** Días de atraso (Bogotá) de un pedido PENDIENTE o NO_ENTREGADO cuya fecha
 *  es anterior a hoy. `null` si no aplica (resuelto, o es de hoy/futuro).
 *  NO_ENTREGADO se incluye porque es el estado en el que queda un pedido
 *  despachado que no se pudo entregar y no se reasignó a otro embarque —
 *  sin este badge, esos pedidos solo mostraban la fecha pelada, sin ningún
 *  indicio de cuántos días llevan sin resolverse. */
export function getDiasAtraso(fecha: string, estadoEntrega: string): number | null {
  if (estadoEntrega !== 'PENDIENTE' && estadoEntrega !== 'NO_ENTREGADO') return null
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return null
  const hoyStr = new Date().toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ })
  const fechaStr = d.toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ })
  if (fechaStr >= hoyStr) return null
  const hoy = new Date(`${hoyStr}T00:00:00-05:00`)
  const dia = new Date(`${fechaStr}T00:00:00-05:00`)
  return Math.round((hoy.getTime() - dia.getTime()) / 86_400_000)
}

function FechaPedido({ pedido }: { pedido: Pedido }) {
  const diasAtraso = getDiasAtraso(pedido.fecha, pedido.estadoEntrega)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-gray-400">{formatFechaPedido(pedido.fecha)}</span>
      {diasAtraso !== null && (
        <span className="text-xs text-red-600 font-semibold">
          Hace {diasAtraso} día{diasAtraso === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

function getItemsFromPedido(pedido: Pedido) {
  if (pedido.items && pedido.items.length > 0) {
    return pedido.items.filter(i => i.cantPedido > 0)
  }
  // Fallback to legacy fields
  const legacy: { producto: string; cantPedido: number }[] = []
  if (pedido.cPacaAguaPed > 0) legacy.push({ producto: 'PACA_AGUA', cantPedido: pedido.cPacaAguaPed })
  if (pedido.cPacaHieloPed > 0) legacy.push({ producto: 'PACA_HIELO', cantPedido: pedido.cPacaHieloPed })
  const botellonTotal = (pedido.cBotellonFabPed || 0) + (pedido.cBotellonDomPed || 0)
  if (botellonTotal > 0) legacy.push({ producto: 'BOTELLON', cantPedido: botellonTotal })
  if (pedido.cBolsaAguaPed > 0) legacy.push({ producto: 'BOLSA_AGUA', cantPedido: pedido.cBolsaAguaPed })
  if (pedido.cBolsaHieloPed > 0) legacy.push({ producto: 'BOLSA_HIELO', cantPedido: pedido.cBolsaHieloPed })
  return legacy
}

interface PedidoTableProps {
  pedidos: Pedido[]
  updatingId: string | null
  hasActiveFilters: boolean
  /** True when the user has a date range filter active (desde/hasta). Used to show a specific empty-state message. */
  hasDateFilter?: boolean
  userRole?: string | null
  renderOrigenBadge: (origen: string) => ReactNode
  renderEstadoEntregaBadge: (estado: string) => ReactNode
  renderEstadoPagoBadge: (estado: string) => ReactNode
  getAlertasPedido: (pedido: Pedido) => Array<{ tipo: string; label: string; severidad: string }>
  tieneFiado: (pedido: Pedido) => boolean
  onDetail: (pedido: Pedido) => void
  onCambiarEstado: (id: string, nuevoEstado: string) => void
  onCreateClick: () => void
  /** Descarta un pedido offline que el server rechazó permanentemente
   *  (ej. límite de fiado excedido). Opcional: solo se usa si hay filas
   *  pendientes fallidas en `pedidos`. */
  onDiscardFailed?: (offlineId: string) => void
}

function pedidoItemsResumen(pedido: Pedido): string {
  const items = getItemsFromPedido(pedido)
  if (items.length === 0) return 'Sin productos'
  return items.map((i) => `${i.cantPedido} ${getProductoIconConfig(i.producto).label ?? i.producto}`).join(', ')
}

function PendingPedidoDesktopRow({ pedido, onDiscardFailed }: { pedido: Pedido; onDiscardFailed?: (offlineId: string) => void }) {
  const failed = pedido._pendingFailed
  return (
    <tr className={failed ? 'bg-red-50/60' : 'bg-amber-50/60'}>
      <td className="px-4 py-3 text-sm text-gray-400" colSpan={2}>
        <div className="font-medium text-gray-700">{pedido.nombreCli}</div>
        <div className="text-xs text-gray-500">{pedidoItemsResumen(pedido)}</div>
      </td>
      <td className="px-4 py-3" colSpan={5}>
        {failed ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-red-700">
              No se pudo crear: {pedido._pendingFailReason || 'motivo desconocido'}
            </span>
            {pedido._pendingOfflineId && onDiscardFailed && (
              <button
                onClick={() => onDiscardFailed(pedido._pendingOfflineId!)}
                className="text-xs font-semibold text-red-700 hover:text-red-900 px-2 py-1 rounded hover:bg-red-100 transition shrink-0"
              >
                Descartar
              </button>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Sin conexión — guardado en el celular, se creará al recuperar la señal
          </span>
        )}
      </td>
    </tr>
  )
}

function PendingPedidoMobileCard({ pedido, onDiscardFailed }: { pedido: Pedido; onDiscardFailed?: (offlineId: string) => void }) {
  const failed = pedido._pendingFailed
  return (
    <div className={`p-4 border rounded-lg border-dashed ${failed ? 'bg-red-50/60 border-red-200' : 'bg-amber-50/60 border-amber-200'}`}>
      <div className="font-medium text-gray-700 text-sm">{pedido.nombreCli}</div>
      <div className="text-xs text-gray-500 mb-2">{pedidoItemsResumen(pedido)}</div>
      {failed ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-red-700">
            No se pudo crear: {pedido._pendingFailReason || 'motivo desconocido'}
          </span>
          {pedido._pendingOfflineId && onDiscardFailed && (
            <button
              onClick={() => onDiscardFailed(pedido._pendingOfflineId!)}
              className="text-xs font-semibold text-red-700 hover:text-red-900 px-2 py-1 rounded hover:bg-red-100 transition shrink-0"
            >
              Descartar
            </button>
          )}
        </div>
      ) : (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Sincronizando…
        </span>
      )}
    </div>
  )
}

function DesktopRow({
  pedido,
  updatingId,
  userRole,
  renderOrigenBadge,
  renderEstadoEntregaBadge,
  renderEstadoPagoBadge,
  getAlertasPedido,
  tieneFiado,
  onDetail,
  onCambiarEstado,
}: Omit<PedidoTableProps, 'pedidos' | 'hasActiveFilters' | 'onCreateClick'> & { pedido: Pedido }) {
  const fiado = tieneFiado(pedido)
  const items = getItemsFromPedido(pedido)
  const alertas = getAlertasPedido(pedido)

  const alertaBadgeClass = (severidad: string) => {
    switch (severidad) {
      case 'ALTA': return 'bg-red-100 text-red-700'
      case 'MEDIA': return 'bg-amber-100 text-amber-700'
      default: return 'bg-blue-100 text-blue-700'
    }
  }

  return (
    <tr
      key={pedido.id}
      tabIndex={0}
      className={`hover:bg-gray-50 transition outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 cursor-pointer ${fiado ? 'bg-red-50/30' : ''}`}
      onClick={() => onDetail(pedido)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onDetail(pedido)
        }
      }}
    >
      <td className="px-4 py-3 text-sm font-medium text-gray-500">#{pedido.numero}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <PedidoClienteDisplay
            clienteId={pedido.clienteId}
            nombreCli={pedido.nombreCli}
            apellidoCli={pedido.apellidoCli}
            negocioId={pedido.negocioId}
            nombreNegocioCli={pedido.nombreNegocioCli}
            variant="row"
          />
          {renderOrigenBadge(pedido.origen)}
          {alertas.map((a) => (
            <span key={a.tipo} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${alertaBadgeClass(a.severidad)}`} title={a.label}>
              ⚠️ {a.label}
            </span>
          ))}
        </div>
        <div className="text-xs text-gray-400">{pedido.telefonoCli}</div>
        <FechaPedido pedido={pedido} />
        {pedido.horaPreferida && (
          <span className="text-xs text-amber-600 font-medium">{pedido.horaPreferida}</span>
        )}
        {pedido.horaAperturaCli && (
          <span className="text-xs text-gray-500">🕐 {pedido.horaAperturaCli}</span>
        )}
        {fiado && (
          <span className="text-xs text-red-600 font-medium">Fiado: <MoneyDisplay value={Number(pedido.saldo)} userRole={userRole} /></span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5 flex-wrap">
          {items.length === 0 ? (
            <span className="text-xs text-gray-400">Sin productos</span>
          ) : (
            items.map((item) => {
              const meta = getProductoIconConfig(item.producto)
              const Icon = meta.Icon
              return (
                <span key={item.producto} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                  <Icon size={14} />
                  <span>{item.cantPedido}</span>
                </span>
              )
            })
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="font-semibold text-gray-800"><MoneyDisplay value={Number(pedido.total)} userRole={userRole} /></div>
      </td>
      <td className="px-4 py-3 text-right">
        {((): ReactNode => {
          const visual = getPagoVisual(pedido)
          if (visual.key === 'FIADO') {
            return <span className="text-sm font-semibold text-red-600"><MoneyDisplay value={Number(pedido.saldo)} userRole={userRole} /></span>
          }
          if (visual.key === 'REPORTADO') {
            return <span className="text-xs text-amber-600 font-medium" title="Pago reportado, sin confirmar">⏳</span>
          }
          if (visual.key === 'PAGADO') {
            return <span className="text-xs text-green-600 font-medium">✓</span>
          }
          if (visual.key === 'ANULADO') {
            return <span className="text-xs text-gray-500 font-medium">Anulado</span>
          }
          return <span className="text-xs text-gray-400 font-medium">—</span>
        })()}
      </td>
      <td className="px-4 py-3 text-center space-y-1">
        {renderEstadoEntregaBadge(pedido.estadoEntrega)}
        {renderEstadoPagoBadge(pedido.estadoPago)}
        <ReportadoChip pedido={pedido} />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); onDetail(pedido) }}
            className="p-1.5 min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 text-blue-600 hover:bg-blue-50 rounded-lg transition"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          </button>
          {pedido.estadoEntrega === 'PENDIENTE' && (
            <button
              onClick={(e) => { e.stopPropagation(); onCambiarEstado(pedido.id, 'EN_RUTA') }}
              disabled={updatingId === pedido.id}
              className="p-1.5 min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Enviar"
              aria-label="Enviar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          )}
          {pedido.estadoEntrega === 'EN_RUTA' && (
            <button
              onClick={(e) => { e.stopPropagation(); onCambiarEstado(pedido.id, 'ENTREGADO') }}
              disabled={updatingId === pedido.id}
              className="p-1.5 min-h-[40px] min-w-[40px] md:min-h-0 md:min-w-0 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Entregar"
              aria-label="Entregar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function MobileCard({
  pedido,
  updatingId,
  userRole,
  renderOrigenBadge,
  renderEstadoEntregaBadge,
  renderEstadoPagoBadge,
  getAlertasPedido,
  tieneFiado,
  onDetail,
  onCambiarEstado,
}: Omit<PedidoTableProps, 'pedidos' | 'hasActiveFilters' | 'onCreateClick'> & { pedido: Pedido }) {
  const fiado = tieneFiado(pedido)
  const alertas = getAlertasPedido(pedido)
  const items = getItemsFromPedido(pedido)

  const alertaBadgeClass = (severidad: string) => {
    switch (severidad) {
      case 'ALTA': return 'bg-red-100 text-red-700'
      case 'MEDIA': return 'bg-amber-100 text-amber-700'
      default: return 'bg-blue-100 text-blue-700'
    }
  }

  return (
    <div
      key={pedido.id}
      tabIndex={0}
      role="button"
      className={`p-4 hover:bg-gray-50 cursor-pointer transition outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 ${fiado ? 'bg-red-50/30' : ''}`}
      onClick={() => onDetail(pedido)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onDetail(pedido)
        }
      }}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-medium text-gray-400">#{pedido.numero}</span>
            {renderOrigenBadge(pedido.origen)}
            {alertas.map((a) => (
              <span key={a.tipo} className={`px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1 ${alertaBadgeClass(a.severidad)}`} title={a.label}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                {a.label}
              </span>
            ))}
          </div>
          <PedidoClienteDisplay
            clienteId={pedido.clienteId}
            nombreCli={pedido.nombreCli}
            apellidoCli={pedido.apellidoCli}
            negocioId={pedido.negocioId}
            nombreNegocioCli={pedido.nombreNegocioCli}
            variant="card"
          />
          <p className="text-xs text-gray-400">{pedido.telefonoCli}</p>
          <FechaPedido pedido={pedido} />
          {pedido.horaAperturaCli && (
            <p className="text-xs text-gray-500">🕐 {pedido.horaAperturaCli}</p>
          )}
          {pedido.horaPreferida && (
            <p className="text-xs text-amber-600 font-medium">{pedido.horaPreferida}</p>
          )}
          <div className="flex gap-1 mt-1 flex-wrap">
            {renderEstadoEntregaBadge(pedido.estadoEntrega)}
            {renderEstadoPagoBadge(pedido.estadoPago)}
            <ReportadoChip pedido={pedido} />
          </div>
        </div>
        <div className="text-right ml-2">
          <p className="font-bold text-gray-800 text-sm"><MoneyDisplay value={Number(pedido.total)} userRole={userRole} /></p>
          {((): ReactNode => {
            const visual = getPagoVisual(pedido)
            if (visual.key === 'FIADO') {
              return <p className="text-xs text-red-500 font-medium">Debe: <MoneyDisplay value={Number(pedido.saldo)} userRole={userRole} /></p>
            }
            return <p className={`text-xs font-medium ${visual.color === 'green' ? 'text-green-600' : 'text-gray-500'}`}>{visual.label}</p>
          })()}
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap mt-2">
        {items.length === 0 ? (
          <span className="text-xs text-gray-400">Sin productos</span>
        ) : (
          items.map((item) => {
            const meta = getProductoIconConfig(item.producto)
            const Icon = meta.Icon
            return (
              <span key={item.producto} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                <Icon size={14} /> {item.cantPedido}
              </span>
            )
          })
        )}
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        {pedido.estadoEntrega === 'PENDIENTE' && (
          <button
            onClick={(e) => { e.stopPropagation(); onCambiarEstado(pedido.id, 'EN_RUTA') }}
            disabled={updatingId === pedido.id}
            className="flex-1 flex items-center justify-center px-3 py-2 min-h-[40px] bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            aria-label="Enviar pedido"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        )}
        {pedido.estadoEntrega === 'EN_RUTA' && (
          <button
            onClick={(e) => { e.stopPropagation(); onCambiarEstado(pedido.id, 'ENTREGADO') }}
            disabled={updatingId === pedido.id}
            className="flex-1 flex items-center justify-center px-3 py-2 min-h-[40px] bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            aria-label="Marcar entregado"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}

function splitPinned(pedidos: Pedido[]) {
  const pinned = pedidos.filter(p => p.horaPreferida)
  const unpinned = pedidos.filter(p => !p.horaPreferida)
  return { pinned, unpinned }
}

function PinnedDivider({ label }: { label: string }) {
  return (
    <tr className="bg-amber-50">
      <td colSpan={7} className="px-4 py-2 text-xs font-semibold text-amber-700 uppercase tracking-wider">
        {label}
      </td>
    </tr>
  )
}

function MobileSectionHeader({ label }: { label: string }) {
  return (
    <div className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 uppercase tracking-wider">
      {label}
    </div>
  )
}

export function PedidoTable({
  pedidos,
  updatingId,
  hasActiveFilters,
  hasDateFilter,
  userRole,
  renderOrigenBadge,
  renderEstadoEntregaBadge,
  renderEstadoPagoBadge,
  getAlertasPedido,
  tieneFiado,
  onDetail,
  onCambiarEstado,
  onCreateClick,
  onDiscardFailed,
}: PedidoTableProps) {
  const rowProps = { updatingId, userRole, renderOrigenBadge, renderEstadoEntregaBadge, renderEstadoPagoBadge, getAlertasPedido, tieneFiado, onDetail, onCambiarEstado }
  // Filas pendientes (offline, sin id/numero real de servidor): se excluyen
  // de splitPinned (no participan de la sección "con horario preferido") y
  // se renderizan aparte, siempre arriba.
  const pendingRows = pedidos.filter(p => p._pendingSync)
  const { pinned, unpinned } = splitPinned(pedidos.filter(p => !p._pendingSync))

  function renderPinnedRows() {
    if (pinned.length === 0) return null
    return (
      <>
        <PinnedDivider label={`Con horario preferido (${pinned.length})`} />
        {pinned.map((pedido) => (
          <DesktopRow key={pedido.id} pedido={pedido} {...rowProps} />
        ))}
        <PinnedDivider label={`Sin horario (${unpinned.length})`} />
      </>
    )
  }

  function renderMobileSections() {
    const sections: Array<{ label: string; items: Pedido[] }> = []
    if (pinned.length > 0) sections.push({ label: `Con horario preferido (${pinned.length})`, items: pinned })
    sections.push({ label: `Sin horario (${unpinned.length})`, items: unpinned })
    return sections
  }

  function handleTableKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const focusable = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[tabindex="0"]')
    )
    if (focusable.length === 0) return
    const idx = focusable.indexOf(document.activeElement as HTMLElement)
    if (idx < 0) return
    e.preventDefault()
    const next = e.key === 'ArrowDown' ? focusable[idx + 1] : focusable[idx - 1]
    next?.focus()
  }

  return (
    <div className="space-y-4" onKeyDown={handleTableKeyDown}>
      {/* Header descriptivo */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">📋</div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-blue-900">Lista de Pedidos</h2>
              <span className="text-sm font-medium text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-sm text-blue-700">
              Aquí ves todos los pedidos con sus estados de entrega y pago. 
              Usa los filtros arriba para buscar por cliente, estado o canal.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="hidden md:block overflow-x-auto" data-testid="pedidos-desktop">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">#</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Cliente</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Productos</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Total</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Saldo</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Entrega / Pago</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pedidos.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
                    title={hasDateFilter ? "No hay pedidos en este rango de fechas" : hasActiveFilters ? "No hay resultados" : "No hay pedidos"}
                    description={hasDateFilter ? "Prueba con un rango más amplio o presiona \"Limpiar\" para ver todo el histórico" : hasActiveFilters ? "Ajusta los filtros o búsqueda para ver más pedidos" : "Crea tu primer pedido para comenzar"}
                    actionLabel={hasActiveFilters && !hasDateFilter ? undefined : "+ Crear Pedido"}
                    onAction={onCreateClick}
                  />
                </td>
              </tr>
            ) : (
              <>
                {pendingRows.map((pedido) => (
                  <PendingPedidoDesktopRow key={pedido.id} pedido={pedido} onDiscardFailed={onDiscardFailed} />
                ))}
                {renderPinnedRows()}
                {unpinned.map((pedido) => (
                  <DesktopRow key={pedido.id} pedido={pedido} {...rowProps} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3" data-testid="pedidos-mobile">
        {pedidos.length === 0 ? (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
            title={hasDateFilter ? "No hay pedidos en este rango de fechas" : hasActiveFilters ? "No hay resultados" : "No hay pedidos"}
            description={hasDateFilter ? "Prueba con un rango más amplio o presiona \"Limpiar\" para ver todo el histórico" : hasActiveFilters ? "Ajusta los filtros o búsqueda para ver más pedidos" : "Crea tu primer pedido para comenzar"}
            actionLabel={hasActiveFilters && !hasDateFilter ? undefined : "+ Crear Pedido"}
            onAction={onCreateClick}
          />
        ) : (
          <>
            {pendingRows.length > 0 && (
              <div className="space-y-3">
                {pendingRows.map((pedido) => (
                  <PendingPedidoMobileCard key={pedido.id} pedido={pedido} onDiscardFailed={onDiscardFailed} />
                ))}
              </div>
            )}
            {(pinned.length > 0 || unpinned.length > 0) && renderMobileSections().map((section) => (
              <div key={section.label} className="space-y-3">
                <MobileSectionHeader label={section.label} />
                {section.items.map((pedido) => (
                  <div key={pedido.id} className="bg-white border border-gray-200 rounded-lg shadow-sm">
                    <MobileCard pedido={pedido} {...rowProps} />
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
    </div>
  )
}
