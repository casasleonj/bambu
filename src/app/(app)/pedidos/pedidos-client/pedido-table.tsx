'use client'

import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { formatCurrency } from '@/lib/utils'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import type { Pedido } from './types'

function getItemsFromPedido(pedido: Pedido) {
  if (pedido.items && pedido.items.length > 0) {
    return pedido.items.filter(i => i.cantPedido > 0)
  }
  // Fallback to legacy fields
  const legacy: { producto: string; cantPedido: number }[] = []
  if (pedido.cPacaAguaPed > 0) legacy.push({ producto: 'PACA_AGUA', cantPedido: pedido.cPacaAguaPed })
  if (pedido.cPacaHieloPed > 0) legacy.push({ producto: 'PACA_HIELO', cantPedido: pedido.cPacaHieloPed })
  if (pedido.cBotellonFabPed > 0) legacy.push({ producto: 'BOTELLON_FAB', cantPedido: pedido.cBotellonFabPed })
  if (pedido.cBotellonDomPed > 0) legacy.push({ producto: 'BOTELLON_DOM', cantPedido: pedido.cBotellonDomPed })
  if (pedido.cBolsaAguaPed > 0) legacy.push({ producto: 'BOLSA_AGUA', cantPedido: pedido.cBolsaAguaPed })
  if (pedido.cBolsaHieloPed > 0) legacy.push({ producto: 'BOLSA_HIELO', cantPedido: pedido.cBolsaHieloPed })
  return legacy
}

interface PedidoTableProps {
  pedidos: Pedido[]
  updatingId: string | null
  hasActiveFilters: boolean
  renderOrigenBadge: (origen: string) => ReactNode
  renderEstadoEntregaBadge: (estado: string) => ReactNode
  renderEstadoPagoBadge: (estado: string) => ReactNode
  getAlertasPedido: (pedido: Pedido) => Array<{ tipo: string; label: string; severidad: string }>
  tieneFiado: (pedido: Pedido) => boolean
  onDetail: (pedido: Pedido) => void
  onCambiarEstado: (id: string, nuevoEstado: string) => void
  onCreateClick: () => void
}

function DesktopRow({
  pedido,
  updatingId,
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
    <tr key={pedido.id} className={`hover:bg-gray-50 transition ${fiado ? 'bg-red-50/30' : ''}`}>
      <td className="px-4 py-3 text-sm font-medium text-gray-500">#{pedido.numero}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-medium text-gray-800">{pedido.nombreCli}</span>
          {renderOrigenBadge(pedido.origen)}
          {alertas.map((a) => (
            <span key={a.tipo} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${alertaBadgeClass(a.severidad)}`} title={a.label}>
              ⚠️ {a.label}
            </span>
          ))}
        </div>
        <div className="text-xs text-gray-400">{pedido.telefonoCli}</div>
        {fiado && (
          <span className="text-xs text-red-600 font-medium">Fiado: {formatCurrency(Number(pedido.saldo))}</span>
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
        <div className="font-semibold text-gray-800">{formatCurrency(Number(pedido.total))}</div>
      </td>
      <td className="px-4 py-3 text-right">
        {Number(pedido.saldo) > 0 ? (
          <span className="text-sm font-semibold text-red-600">{formatCurrency(Number(pedido.saldo))}</span>
        ) : (
          <span className="text-xs text-green-600 font-medium">✓</span>
        )}
      </td>
      <td className="px-4 py-3 text-center space-y-1">
        {renderEstadoEntregaBadge(pedido.estadoEntrega)}
        {renderEstadoPagoBadge(pedido.estadoPago)}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => onDetail(pedido)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          </button>
          {pedido.estadoEntrega === 'PENDIENTE' && (
            <button
              onClick={() => onCambiarEstado(pedido.id, 'EN_RUTA')}
              disabled={updatingId === pedido.id}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              title="Enviar"
              aria-label="Enviar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          )}
          {pedido.estadoEntrega === 'EN_RUTA' && (
            <button
              onClick={() => onCambiarEstado(pedido.id, 'ENTREGADO')}
              disabled={updatingId === pedido.id}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
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
      className={`p-4 hover:bg-gray-50 cursor-pointer transition ${fiado ? 'bg-red-50/30' : ''}`}
      onClick={() => onDetail(pedido)}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-medium text-gray-400">#{pedido.numero}</span>
            {renderOrigenBadge(pedido.origen)}
            {alertas.map((a) => (
              <span key={a.tipo} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${alertaBadgeClass(a.severidad)}`} title={a.label}>
                ⚠️ {a.label}
              </span>
            ))}
          </div>
          <h3 className="font-medium text-gray-800 text-sm">{pedido.nombreCli}</h3>
          <p className="text-xs text-gray-400">{pedido.telefonoCli}</p>
          <div className="flex gap-1 mt-1">
            {renderEstadoEntregaBadge(pedido.estadoEntrega)}
            {renderEstadoPagoBadge(pedido.estadoPago)}
          </div>
        </div>
        <div className="text-right ml-2">
          <p className="font-bold text-gray-800 text-sm">{formatCurrency(Number(pedido.total))}</p>
          {Number(pedido.saldo) > 0 ? (
            <p className="text-xs text-red-500 font-medium">Debe: {formatCurrency(Number(pedido.saldo))}</p>
          ) : (
            <p className="text-xs text-green-600 font-medium">Pagado</p>
          )}
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
            className="flex-1 flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            aria-label="Enviar pedido"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        )}
        {pedido.estadoEntrega === 'EN_RUTA' && (
          <button
            onClick={(e) => { e.stopPropagation(); onCambiarEstado(pedido.id, 'ENTREGADO') }}
            disabled={updatingId === pedido.id}
            className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            aria-label="Marcar entregado"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}

export function PedidoTable({
  pedidos,
  updatingId,
  hasActiveFilters,
  renderOrigenBadge,
  renderEstadoEntregaBadge,
  renderEstadoPagoBadge,
  getAlertasPedido,
  tieneFiado,
  onDetail,
  onCambiarEstado,
  onCreateClick,
}: PedidoTableProps) {
  const rowProps = { updatingId, renderOrigenBadge, renderEstadoEntregaBadge, renderEstadoPagoBadge, getAlertasPedido, tieneFiado, onDetail, onCambiarEstado }

  return (
    <div className="space-y-4">
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
              Usa los filtros arriba para buscar por cliente, estado o tipo.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
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
                    title={hasActiveFilters ? "No hay resultados" : "No hay pedidos"}
                    description={hasActiveFilters ? "Ajusta los filtros o búsqueda para ver más pedidos" : "Crea tu primer pedido para comenzar"}
                    actionLabel={hasActiveFilters ? undefined : "+ Crear Pedido"}
                    onAction={onCreateClick}
                  />
                </td>
              </tr>
            ) : (
              pedidos.map((pedido) => (
                <DesktopRow key={pedido.id} pedido={pedido} {...rowProps} />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-gray-100">
        {pedidos.length === 0 ? (
          <EmptyState
            icon={<svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
            title={hasActiveFilters ? "No hay resultados" : "No hay pedidos"}
            description={hasActiveFilters ? "Ajusta los filtros o búsqueda para ver más pedidos" : "Crea tu primer pedido para comenzar"}
            actionLabel={hasActiveFilters ? undefined : "+ Crear Pedido"}
            onAction={onCreateClick}
          />
        ) : (
          pedidos.map((pedido) => (
            <MobileCard key={pedido.id} pedido={pedido} {...rowProps} />
          ))
        )}
      </div>
    </div>
    </div>
  )
}
