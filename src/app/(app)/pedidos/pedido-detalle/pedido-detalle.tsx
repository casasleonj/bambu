'use client'

import { CorreccionPrecioPanel } from '@/components/correccion-precio/correccion-precio-panel'
import { ReduccionComercialPanel } from '@/components/reduccion-comercial/reduccion-comercial-panel'
import { SaldoFavorHistorial } from '@/components/saldo-favor/saldo-favor-historial'
import { cierreV2Enabled } from '@/lib/flags'
import { canReadFacturas } from '@/lib/permissions'
import Link from 'next/link'
import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import { getProductoIconConfig } from '@/lib/producto-iconos'
import { PedidoClienteDisplay } from '@/components/pedido-cliente-display'
import type { Pedido } from '../pedidos-client/types'
import {
  accionesDetalle,
  lineaDeTiempo,
  linksContacto,
  origenPrecio,
  porcentajePagado,
  type AccionDetalle,
  type AccionDetalleKey,
} from './derive-detalle'

interface Props {
  pedido: Pedido
  embarqueNumeroDia?: number
  preciosActuales: Record<string, { precio: number; origen: string }>
  updatingId: string | null
  userRole?: string | null
  /** TEMPORAL-SIN-EMBARQUE(#472): ADMIN con la gestión temporal activa. */
  gestionAdmin?: boolean
  /** Nombre del repartidor responsable (si se conoce). */
  nombreRepartidor?: string | null
  estadoBadge: React.ReactNode
  canalBadge: React.ReactNode
  onClose: () => void
  onAccion: (key: AccionDetalleKey) => void
  volverLabel?: string
  onOpenFactura?: (id: string) => void
}

const ITEM_BG: Record<string, string> = {
  PACA_AGUA: 'bg-blue-50',
  PACA_HIELO: 'bg-cyan-50',
  BOTELLON: 'bg-indigo-50',
  BOLSA_AGUA: 'bg-sky-50',
  BOLSA_HIELO: 'bg-teal-50',
}

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  OTRO: 'Otro',
}

const fmtHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : null
const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString('es-CO')

function Seccion({ titulo, children, testId }: { titulo: string; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="bg-white border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{titulo}</h3>
      {children}
    </section>
  )
}

function itemsDe(p: Pedido): Array<{ producto: string; cantPedido: number; precio: number; precioOrigen?: string; autorizadoPorAdmin?: boolean; tramoVolumen?: { cantMin: number; cantMax: number | null } | null }> {
  if (p.items && p.items.length > 0) return p.items
  const legacy: Array<[string, number, number]> = [
    ['PACA_AGUA', p.cPacaAguaPed, Number(p.precioPacaAgua)],
    ['PACA_HIELO', p.cPacaHieloPed, Number(p.precioPacaHielo)],
    ['BOTELLON', (p.cBotellonFabPed || 0) + (p.cBotellonDomPed || 0), Number(p.precioBotellonFab) || Number(p.precioBotellonDom) || 0],
    ['BOLSA_AGUA', p.cBolsaAguaPed, Number(p.precioBolsaAgua)],
    ['BOLSA_HIELO', p.cBolsaHieloPed, Number(p.precioBolsaHielo)],
  ]
  return legacy.filter(([, c]) => c > 0).map(([producto, cantPedido, precio]) => ({ producto, cantPedido, precio }))
}

const TONO_BOTON: Record<AccionDetalle['tone'], string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  warn: 'bg-amber-500 text-white hover:bg-amber-600',
  neutral: 'border border-gray-300 text-gray-700 hover:bg-gray-50 bg-white',
  danger: 'border border-red-300 text-red-600 hover:bg-red-50 bg-white',
}

export function PedidoDetalle({
  pedido, embarqueNumeroDia, preciosActuales, updatingId, userRole, gestionAdmin, nombreRepartidor, estadoBadge, canalBadge, onClose, onAccion, volverLabel, onOpenFactura,
}: Props) {
  const [relacionadoAbierto, setRelacionadoAbierto] = useState(false)
  const total = Number(pedido.total)
  const pagado = Number(pedido.totalPagado)
  const saldo = Number(pedido.saldo)
  const entregado = pedido.estadoEntrega === 'ENTREGADO'
  const pct = porcentajePagado(total, pagado)
  const links = linksContacto(pedido)
  const acciones = accionesDetalle(pedido.estadoEntrega, pedido.embarqueResumen?.estado, { gestionAdmin })
  const busy = updatingId === pedido.id
  const pasos = lineaDeTiempo(pedido)
  const items = itemsDe(pedido)
  const pagos = pedido.pagosDetalle ?? []
  const direccion = [pedido.zonaCli, pedido.barrioCli].filter(Boolean).join(' · ')
  const n2 = pedido.pendienteN2
  const vinculados = pedido.pedidosVinculados ?? []
  const casos = pedido.casosAbiertos ?? []
  const totalRelacionado = (pedido.recurrencia ? 1 : 0) + (n2 ? 1 : 0) + vinculados.length + casos.length
  const hayPorConfirmar = pedido.pagoReportadoPendiente || pedido.pagoDiscrepante
  const pedidoCerrado = pedido.estadoEntrega === 'ANULADO' || pedido.estadoEntrega === 'CANCELADO'

  const boton = (a: AccionDetalle, full = false) => (
    <button
      key={a.key}
      type="button"
      data-testid={`detalle-accion-${a.key}`}
      onClick={() => onAccion(a.key)}
      disabled={a.key !== 'editar' && busy}
      className={`${full ? 'flex-1' : ''} min-h-[44px] px-4 rounded-lg text-sm font-medium transition disabled:opacity-50 ${TONO_BOTON[a.tone]}`}
    >
      {busy && a.labelBusy ? a.labelBusy : a.label}
    </button>
  )

  return (
    <div data-testid="pedido-detalle" className="flex flex-col h-full min-h-0">
      <header className="p-4 border-b bg-white flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm text-gray-400">#{pedido.numero}</span>
            {estadoBadge}
            {canalBadge}
          </div>
          <PedidoClienteDisplay
            clienteId={pedido.clienteId}
            nombreCli={pedido.nombreCli}
            apellidoCli={pedido.apellidoCli}
            negocioId={pedido.negocioId}
            nombreNegocioCli={pedido.nombreNegocioCli}
            variant="heading"
            showBadge
          />
          {pedido.telefonoCli && <p className="text-sm text-gray-500">{pedido.telefonoCli}</p>}
          {direccion && <p className="text-sm text-gray-500">{direccion}</p>}
          {pedido.horaPreferida && <p className="text-xs text-gray-400">Hora preferida: {pedido.horaPreferida}</p>}
          {(links.llamar || links.whatsapp || links.mapa) && (
            <div className="mt-2 flex gap-2 flex-wrap" data-testid="detalle-contacto">
              {links.llamar && <a href={links.llamar} className="min-h-[36px] inline-flex items-center px-3 rounded-full border border-gray-300 text-xs font-medium text-gray-700">📞 Llamar</a>}
              {links.whatsapp && <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className="min-h-[36px] inline-flex items-center px-3 rounded-full border border-gray-300 text-xs font-medium text-gray-700">💬 WhatsApp</a>}
              {links.mapa && <a href={links.mapa} target="_blank" rel="noopener noreferrer" className="min-h-[36px] inline-flex items-center px-3 rounded-full border border-gray-300 text-xs font-medium text-gray-700">📍 Cómo llegar</a>}
            </div>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition shrink-0" aria-label="Cerrar">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <div className="space-y-4">
            <Seccion titulo="Dinero" testId="detalle-dinero">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-500">Total Pedido</span>
                <span className="text-2xl font-bold text-gray-800">{formatCurrency(total)}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Porcentaje pagado">
                <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-gray-500">Pagado:</span>
                <span className="font-medium text-green-600">{formatCurrency(pagado)}</span>
              </div>
              {entregado && saldo > 0 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Pendiente:</span>
                  <span className="font-medium text-red-600">{formatCurrency(saldo)}</span>
                </div>
              )}
              {entregado && saldo <= 0 && pagado > 0 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Estado:</span>
                  <span className="font-medium text-green-600">Pagado completo</span>
                </div>
              )}
              {entregado && saldo > 0 && (
                <p data-testid="detalle-alerta-fiado" className="mt-3 rounded-lg bg-red-50 text-red-700 text-xs font-medium px-3 py-2">
                  Entregado con saldo por cobrar: quedó fiado.
                </p>
              )}
              {hayPorConfirmar && (
                <p data-testid="detalle-alerta-pago" className="mt-3 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium px-3 py-2">
                  {pedido.pagoDiscrepante ? 'Pago discrepante: revisar con quien lo reportó.' : 'Hay un pago reportado por confirmar.'}
                </p>
              )}
            </Seccion>

            <Seccion titulo="Entrega" testId="detalle-entrega">
              <ol className="space-y-3">
                {pasos.map((paso) => {
                  const punto =
                    paso.estado === 'hecho' ? 'bg-green-500 border-green-500'
                    : paso.estado === 'actual' ? 'bg-blue-500 border-blue-500'
                    : paso.estado === 'cerrado' ? 'bg-gray-300 border-gray-300'
                    : 'bg-white border-gray-300'
                  const hora = fmtHora(paso.fecha)
                  return (
                    <li key={paso.key} data-estado={paso.estado} className="flex gap-3 items-start">
                      <span className={`mt-1 w-3 h-3 rounded-full border-2 shrink-0 ${punto}`} />
                      <div className="text-sm">
                        <div className={paso.estado === 'pendiente' || paso.estado === 'cerrado' ? 'text-gray-400' : 'font-medium text-gray-800'}>
                          {paso.label}
                          {paso.fecha && <span className="text-gray-500 font-normal"> · {fmtFecha(paso.fecha)}{hora ? ` ${hora}` : ''}</span>}
                        </div>
                        {paso.detalle && <div className="text-xs text-gray-500">{paso.detalle}</div>}
                      </div>
                    </li>
                  )
                })}
              </ol>
              {(pedido.estadoEntrega === 'CANCELADO' || pedido.estadoEntrega === 'ANULADO') && (
                <p className="mt-3 text-xs text-gray-500">Pedido {pedido.estadoEntrega === 'CANCELADO' ? 'cancelado' : 'anulado'}.</p>
              )}
              {pedido.embarqueId && (
                <div className="mt-3 flex items-center justify-between text-sm border-t pt-3">
                  <span className="text-gray-500">Embarque #{embarqueNumeroDia ?? pedido.embarqueResumen?.numeroDia ?? pedido.embarqueId}</span>
                  <Link href={`/embarques/${pedido.embarqueId}`} className="text-xs text-blue-600 hover:text-blue-800 hover:underline">Ver →</Link>
                </div>
              )}
            </Seccion>
          </div>

          <div className="space-y-4">
            <Seccion titulo="Productos" testId="detalle-productos">
              <div className="space-y-2">
                {items.length === 0 && <div className="text-sm text-gray-400 text-center py-2">Sin productos</div>}
                {items.map((item) => {
                  const meta = getProductoIconConfig(item.producto)
                  const Icon = meta.Icon
                  const snapshot = Number(item.precio)
                  const actual = preciosActuales[item.producto]?.precio ?? 0
                  const diff = actual > 0 && snapshot > 0 ? ((actual - snapshot) / snapshot) * 100 : 0
                  const showDiff = Math.abs(diff) > 5 && actual > 0
                  return (
                    <div key={item.producto} className={`flex justify-between items-center ${ITEM_BG[item.producto] || 'bg-gray-50'} rounded-lg px-3 py-2`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon size={20} />
                        <span className="text-sm font-medium">{meta.label}</span>
                        {(() => {
                          const origen = origenPrecio(item, userRole)
                          if (!origen) return null
                          const tono = origen.tone === 'ok' ? 'bg-green-100 text-green-800' : origen.tone === 'warn' ? 'bg-amber-100 text-amber-800' : origen.tone === 'neutral' ? 'bg-gray-100 text-gray-700' : 'bg-sky-100 text-sky-800'
                          return <span data-testid="detalle-origen-precio" title={origen.ayuda} aria-label={`${origen.label}. ${origen.ayuda}`} className={`text-xs px-2 py-0.5 rounded-full font-medium ${tono}`}>{origen.label}</span>
                        })()}
                        {showDiff && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${diff > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {diff > 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{item.cantPedido} und</div>
                        <div className="text-xs text-gray-500">{formatCurrency(snapshot)} c/u</div>
                        {showDiff && <div className="text-[10px] text-gray-400">Actual: {formatCurrency(actual)}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Seccion>

            {cierreV2Enabled() && (
              <CorreccionPrecioPanel
                pedidoId={pedido.id}
                lineas={items.map((i) => ({ producto: i.producto, cantPedido: i.cantPedido, precio: Number(i.precio) }))}
                userRole={userRole}
                corregible={pedido.estadoEntrega !== 'CANCELADO' && pedido.estadoEntrega !== 'ANULADO'}
              />
            )}

            {cierreV2Enabled() && (
              <ReduccionComercialPanel
                pedidoId={pedido.id}
                lineas={(pedido.items ?? []).map((i) => ({ producto: i.producto, cantPedido: i.cantPedido, cantEntrega: i.cantEntrega, precio: Number(i.precio) }))}
                userRole={userRole}
                reducible={pedido.estadoEntrega !== 'CANCELADO' && pedido.estadoEntrega !== 'ANULADO'}
                total={total}
                totalPagado={pagado}
              />
            )}

            {/* #577: de dónde salió y a dónde fue el saldo a favor de este pedido. No se muestra si nunca movió saldo. */}
            {(userRole === 'ADMIN' || userRole === 'ASISTENTE' || userRole === 'CONTADOR')
              && (cierreV2Enabled() || pedido.estadoEntrega === 'ANULADO' || pedido.estadoEntrega === 'CANCELADO') && (
              <SaldoFavorHistorial pedidoId={pedido.id} />
            )}

            <Seccion titulo="Pagos y factura" testId="detalle-pagos">
              {pagos.length === 0 ? (
                <p className="text-sm text-gray-400">Sin pagos registrados.</p>
              ) : (
                <ul className="space-y-2">
                  {pagos.map((pg) => (
                    <li key={pg.id} data-testid="detalle-pago" className="flex justify-between items-center text-sm">
                      <div>
                        <span className="font-medium text-gray-700">{METODO_LABEL[pg.metodo] ?? pg.metodo}</span>
                        <span className="text-gray-400 text-xs ml-2">{fmtFecha(pg.fecha)} {fmtHora(pg.fecha)}</span>
                        {/* #517: en un pedido anulado o cancelado el pago ya no se confirma. */}
                        {pg.confirmacion && pg.confirmacion !== 'CONFIRMADO' && !pedidoCerrado && (
                          <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pg.confirmacion === 'DISCREPANTE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {pg.confirmacion === 'DISCREPANTE' ? 'discrepante' : 'por confirmar'}
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-green-600">{formatCurrency(pg.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {entregado && saldo > 0 && (
                <Link href={pedido.clienteId === 'CONSUMIDOR_FINAL' ? '/pedidos' : `/pedidos?tab=fiados&clienteId=${pedido.clienteId}`} data-testid="detalle-ver-cartera" className="mt-3 inline-flex min-h-[44px] items-center px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                  Ver cartera del cliente →
                </Link>
              )}
              {pedido.factura && (
                <div className="mt-3 border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Factura #{pedido.factura.numero}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      pedido.factura.estado === 'PAGADA' ? 'bg-green-100 text-green-700'
                      : pedido.factura.estado === 'ANULADA' ? 'bg-gray-100 text-gray-700'
                      : 'bg-yellow-100 text-yellow-700'}`}>
                      {pedido.factura.estado}
                    </span>
                  </div>
                  {canReadFacturas(userRole) && <a href={`/facturas?openFactura=${pedido.factura.id}`} className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    onClick={e => { if (onOpenFactura && pedido.factura && !e.ctrlKey && !e.metaKey) { e.preventDefault(); onOpenFactura(pedido.factura.id) } }}>
                    → Ver factura #{pedido.factura.numero}
                  </a>}
                  {pedido.factura.abonos && pedido.factura.abonos.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">Abonos ({pedido.factura.abonos.length}):</p>
                      <div className="space-y-1">
                        {pedido.factura.abonos.map((abono) => (
                          <div key={abono.id} className="flex justify-between items-center text-sm">
                            <div>
                              <span className="text-gray-600">{abono.metodoPago}</span>
                              <span className="text-gray-400 text-xs ml-2">{fmtFecha(abono.fecha)}</span>
                            </div>
                            <span className="font-medium text-green-600">{formatCurrency(Number(abono.monto))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Seccion>

            {pedido.obs && (
              <Seccion titulo="Observaciones" testId="detalle-obs">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{pedido.obs}</p>
              </Seccion>
            )}

            {totalRelacionado > 0 && (
              <section data-testid="detalle-relacionado" className="bg-white border border-gray-200 rounded-xl">
                <button
                  type="button"
                  onClick={() => setRelacionadoAbierto((v) => !v)}
                  aria-expanded={relacionadoAbierto}
                  className="w-full min-h-[44px] px-4 flex justify-between items-center text-sm font-semibold text-gray-700"
                >
                  <span>Relacionado ({totalRelacionado})</span>
                  <span aria-hidden>{relacionadoAbierto ? '▲' : '▼'}</span>
                </button>
                {relacionadoAbierto && (
                  <div className="px-4 pb-4 space-y-2 text-sm text-gray-700">
                    {pedido.recurrencia && (
                      <p>🔁 Recurrente cada {pedido.recurrencia.cadaNDias} día(s){pedido.recurrencia.activo ? '' : ' (inactiva)'}{pedido.recurrencia.proximaFecha ? ` · próxima ${fmtFecha(pedido.recurrencia.proximaFecha)}` : ''}</p>
                    )}
                    {n2 && <p>⏳ Pendiente de entregar: {n2.remanente} de {getProductoIconConfig(n2.producto).label} ({n2.estado})</p>}
                    {vinculados.map((v) => (
                      <p key={v.id}>
                        🔗 {v.rol === 'origen' ? 'Viene del' : 'Genera el'} pedido{' '}
                        <Link href={`/pedidos/${v.id}`} className="text-blue-600 hover:underline">#{v.numero}</Link>{' '}
                        · {formatCurrency(v.total)} · {v.estadoEntrega}
                      </p>
                    ))}
                    {casos.map((c) => (
                      <p key={c.id}>⚠️ Caso abierto: {c.alertaTipo} ({c.severidad})</p>
                    ))}
                  </div>
                )}
              </section>
            )}

            {(nombreRepartidor || pedido.entregadoPorId) && (
              <p data-testid="detalle-repartidor" className="text-xs text-gray-600 px-1">
                Entregado por {nombreRepartidor ?? 'el repartidor registrado'}
              </p>
            )}
            {pedido.creadoPor && <p className="text-xs text-gray-400 px-1">Registrado por {pedido.creadoPor}</p>}
          </div>
        </div>
      </div>

      <footer data-testid="detalle-acciones" className="sticky bottom-0 border-t bg-white p-3 flex gap-2 flex-wrap pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {volverLabel && <button type="button" className="min-h-11 rounded-lg border px-4 text-sm" onClick={onClose}>{volverLabel}</button>}
        {acciones.primaria && boton(acciones.primaria, true)}
        {acciones.secundarias.map((a) => boton(a, !acciones.primaria && acciones.secundarias.length === 1))}
        {acciones.sinAcciones && (
          <div className="w-full py-2 bg-gray-100 text-gray-500 rounded-lg text-sm text-center">{acciones.sinAcciones}</div>
        )}
      </footer>
    </div>
  )
}
