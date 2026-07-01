'use client'

import { generateUUID } from '@/lib/uuid'
import React, { useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { filtrarPorPeriodo, PERIODOS, type PeriodoFiltro } from './date-utils'
import type { Pedido, Cliente } from './types'
import { getEstadoFiados, resolverLimiteFiados } from '@/lib/pedido-utils'
import { LIMITE_FIADOS_DEFAULT } from '@/lib/constants'
import { fetchResilient } from '@/lib/fetch-resilient'
import { MoneyDisplay } from '@/components/money-display'

interface FiadoRow {
  clienteId: string
  nombreCli: string
  apellidoCli?: string | null
  nombreNegocioCli?: string | null
  telefonoCli: string
  deudaTotal: number
  pedidosFiados: Pedido[]
  diasFiado: number
  ultimoPedido: Date
  limitePedidosFiados?: number | null
}

interface FiadosTableProps {
  pedidos: Pedido[]
  clientes: Cliente[]
  limiteGlobal?: number
  onPedidosChange?: () => void
  userRole?: string | null
}

export function FiadosTable({ pedidos, clientes, limiteGlobal, onPedidosChange, userRole }: FiadosTableProps) {
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [minDeuda, setMinDeuda] = useState('')
  const [maxDeuda, setMaxDeuda] = useState('')
  const [diasFiado, setDiasFiado] = useState<'todos' | '0-7' | '8-30' | '30+' | string>('todos')
  const [periodo, setPeriodo] = useState<PeriodoFiltro>('hoy')
  const [pagandoClienteId, setPagandoClienteId] = useState<string | null>(null)
  const [montoPago, setMontoPago] = useState('')
  const [metodoPago, setMetodoPago] = useState('EFECTIVO')
  const [submitting, setSubmitting] = useState(false)

  // Pedidos filtrados por período local (independiente de URL)
  const pedidosFiltrados = useMemo(() => filtrarPorPeriodo(pedidos, periodo), [pedidos, periodo])

  // Agrupar pedidos por cliente
  const fiadoRows = useMemo(() => {
    const clientesMap = new Map<string, FiadoRow>()

    pedidosFiltrados
      .filter((p) => p.estadoEntrega === 'ENTREGADO' && Number(p.saldo) > 0 && p.clienteId !== 'CONSUMIDOR_FINAL')
      .forEach((p) => {
        const existing = clientesMap.get(p.clienteId)
        const cliente = clientes.find((c) => c.id === p.clienteId)
        if (existing) {
          existing.deudaTotal += Number(p.saldo)
          existing.pedidosFiados.push(p)
          if (new Date(p.fecha) > existing.ultimoPedido) {
            existing.ultimoPedido = new Date(p.fecha)
          }
        } else {
          clientesMap.set(p.clienteId, {
            clienteId: p.clienteId,
            nombreCli: p.nombreCli,
            apellidoCli: p.apellidoCli,
            nombreNegocioCli: p.nombreNegocioCli,
            telefonoCli: p.telefonoCli,
            deudaTotal: Number(p.saldo),
            pedidosFiados: [p],
            diasFiado: 0,
            ultimoPedido: new Date(p.fecha),
            limitePedidosFiados: cliente?.limitePedidosFiados,
          })
        }
      })

    // Calcular días fiado (desde el pedido más antiguo)
    clientesMap.forEach((row) => {
      const masAntiguo = row.pedidosFiados.reduce((min, p) =>
        new Date(p.fecha) < min ? new Date(p.fecha) : min,
        new Date(row.pedidosFiados[0].fecha)
      )
      row.diasFiado = Math.floor((Date.now() - masAntiguo.getTime()) / (1000 * 60 * 60 * 24))
    })

    return Array.from(clientesMap.values())
  }, [pedidosFiltrados])

  const filtrados = fiadoRows.filter((row) => {
    const matchSearch = !searchTerm ||
      row.nombreCli.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (row.apellidoCli || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (row.nombreNegocioCli || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.telefonoCli?.includes(searchTerm)
    const matchMin = !minDeuda || row.deudaTotal >= Number(minDeuda)
    const matchMax = !maxDeuda || row.deudaTotal <= Number(maxDeuda)
    const matchDias = diasFiado === 'todos' ||
      (diasFiado === '0-7' && row.diasFiado <= 7) ||
      (diasFiado === '8-30' && row.diasFiado > 7 && row.diasFiado <= 30) ||
      (diasFiado === '30+' && row.diasFiado > 30)
    return matchSearch && matchMin && matchMax && matchDias
  })

  async function handlePagar(clienteId: string) {
    if (!montoPago || Number(montoPago) <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }
    setSubmitting(true)
    try {
      const result = await fetchResilient<{
        success: boolean
        pagosAplicados: Array<{ pedidoId: string; numero: number; montoAplicado: number; saldoRestante: number; facturaId?: string; facturaNumero?: string }>
        montoAplicado: number
        montoSobrante: number
        deduped?: boolean
      }>(
        '/api/pedidos/pagar-fiado',
        {
          method: 'POST',
          body: {
            clienteId,
            monto: Number(montoPago),
            metodo: metodoPago,
            offlineId: generateUUID(),
          },
          localEndpoint: 'pagar-fiado',
        }
      )

      if (result.status === 'offline') {
        toast.info('Sin conexión. Pago guardado, se aplicará al recuperar la red.')
        setPagandoClienteId(null)
        setMontoPago('')
        return
      }

      if (result.status === 'error') {
        toast.error(result.error || 'Error registrando pago')
        return
      }

      // status === 'ok' — proceder con el resumen
      const data = result.data
      const pagosAplicados = data.pagosAplicados || []
      const montoSobrante = data.montoSobrante || 0
      const montoAplicado = data.montoAplicado || Number(montoPago)

      let resumenHtml = `<div class="space-y-1">`
      pagosAplicados.forEach((p: any) => {
        const estado = p.saldoRestante <= 0 ? '✅ Pagado completo' : `⏳ Saldo restante: ${formatCurrency(p.saldoRestante)}`
        resumenHtml += `<div class="text-sm">Pedido <a href="/pedidos?openPedido=${p.pedidoId}" class="text-blue-600 hover:underline font-medium">#${p.numero}</a>: <b>${formatCurrency(p.montoAplicado)}</b> <span class="text-xs text-gray-500">${estado}</span></div>`
      })
      if (montoSobrante > 0) {
        resumenHtml += `<div class="text-sm text-blue-600">💰 Sobrante: ${formatCurrency(montoSobrante)}</div>`
      }
      const facturaIds = [...new Set(pagosAplicados.filter((p: any) => p.facturaId).map((p: any) => p.facturaId))]
      if (facturaIds.length > 0) {
        resumenHtml += `<div class="text-sm text-green-600">📄 ${facturaIds.length} abono(s) generado(s) en <a href="/facturas?openFactura=${facturaIds[0]}" class="text-green-700 hover:underline font-medium">factura(s)</a></div>`
      }
      resumenHtml += `</div>`

      toast.success(
        <div className="space-y-2">
          <div className="font-semibold">💰 Pago aplicado: ${formatCurrency(montoAplicado)}</div>
          <div dangerouslySetInnerHTML={{ __html: resumenHtml }} />
        </div>,
        { duration: 6000 }
      )

      setPagandoClienteId(null)
      setMontoPago('')
      // Refetch pedidos sin recargar la página
      onPedidosChange?.()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header explicativo */}
      <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">💰</div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-red-900">Control de Fiados</h2>
              <span className="text-sm font-medium text-red-700 bg-red-100 px-3 py-1 rounded-full">
                {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''} con deuda
              </span>
            </div>
            <p className="text-sm text-red-700">
              Aquí ves todos los clientes que tienen saldo pendiente. Selecciona un cliente para ver 
              sus pedidos fiados y registrar un pago. Los pagos se aplican automáticamente a los pedidos más antiguos.
            </p>
            {/* Período independiente */}
            <div className="flex flex-wrap gap-2 mt-3">
              {PERIODOS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriodo(p.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    periodo === p.key
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-red-700 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filtros de fiados */}
      <div className="bg-white p-4 rounded-xl shadow">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-0 px-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Deuda min"
              value={minDeuda}
              onChange={(e) => setMinDeuda(e.target.value)}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <input
              type="number"
              placeholder="Deuda max"
              value={maxDeuda}
              onChange={(e) => setMaxDeuda(e.target.value)}
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={diasFiado}
            onChange={(e) => setDiasFiado(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="todos">Todos los días</option>
            <option value="0-7">0-7 días</option>
            <option value="8-30">8-30 días</option>
            <option value="30+">30+ días</option>
          </select>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay fiados pendientes</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {periodo === 'todos' 
              ? 'Todos los clientes están al día con sus pagos. No hay saldos pendientes en ningún pedido.'
              : 'No hay deudas pendientes en el período seleccionado. Intenta con "Todos" para ver el historial completo.'
            }
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-600">Cliente</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Deuda Total</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Pedidos</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-600">Días Fiado</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-600">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
              {filtrados.map((row) => (
                <React.Fragment key={row.clienteId}>
                  <tr className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="font-medium text-gray-800">{row.nombreCli}{row.apellidoCli ? ` ${row.apellidoCli}` : ''}</span>
                        {row.nombreNegocioCli && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{row.nombreNegocioCli}</span>}
                      </div>
                      <div className="text-xs text-gray-400">{row.telefonoCli}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-red-600"><MoneyDisplay value={row.deudaTotal} userRole={userRole} /></span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const limite = resolverLimiteFiados(row, String(limiteGlobal ?? LIMITE_FIADOS_DEFAULT))
                        const estado = getEstadoFiados(row.pedidosFiados, limite)
                        const badgeColor = estado.nivel === 'limite'
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : estado.nivel === 'cerca'
                            ? 'bg-amber-100 text-amber-700 border-amber-200'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeColor}`}>
                            {estado.count}/{estado.limite}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium ${row.diasFiado > 30 ? 'text-red-600' : row.diasFiado > 7 ? 'text-amber-600' : 'text-green-600'}`}>
                        {row.diasFiado} días
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setExpandedCliente(expandedCliente === row.clienteId ? null : row.clienteId)}
                          className="text-sm text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
                        >
                          {expandedCliente === row.clienteId ? 'Ocultar' : 'Ver pedidos'}
                        </button>
                        <button
                          onClick={() => setPagandoClienteId(row.clienteId)}
                          className="text-sm bg-blue-600 text-white hover:bg-blue-700 px-3 py-1.5 rounded-lg transition"
                        >
                          Pagar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedCliente === row.clienteId && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 bg-gray-50">
                        <div className="space-y-2">
                          {row.pedidosFiados.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()).map((p) => (
                            <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-b-0">
                              <div>
                                <span className="text-sm font-medium">#{p.numero}</span>
                                <span className="text-xs text-gray-400 ml-2">{new Date(p.fecha).toLocaleDateString('es-CO')}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-semibold text-red-600"><MoneyDisplay value={Number(p.saldo)} userRole={userRole} /></span>
                                <span className="text-xs text-gray-400 ml-2">de <MoneyDisplay value={Number(p.total)} userRole={userRole} /></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  {pagandoClienteId === row.clienteId && (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 bg-green-50 border-t border-green-200">
                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                          <div className="flex-1">
                            <label className="text-xs font-medium text-gray-600 block mb-1">Monto a pagar</label>
                            <input
                              type="number"
                              value={montoPago}
                              onChange={(e) => setMontoPago(e.target.value)}
                              placeholder={`Máx: ${formatCurrency(row.deudaTotal)}`}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Método</label>
                            <select
                              value={metodoPago}
                              onChange={(e) => setMetodoPago(e.target.value)}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="EFECTIVO">💵 Efectivo</option>
                              <option value="TRANSFERENCIA">🏦 Transferencia</option>
                              <option value="NEQUI">📱 Nequi</option>
                              <option value="DAVIPLATA">💳 Daviplata</option>
                              <option value="BONO">🎁 Bono</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setPagandoClienteId(null)}
                              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handlePagar(row.clienteId)}
                              disabled={submitting}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                            >
                              {submitting ? 'Procesando...' : 'Confirmar pago'}
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          El pago se aplicará automáticamente a los pedidos más antiguos primero (FIFO).
                        </p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {filtrados.map((row) => (
            <div key={row.clienteId} className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-gray-800">{row.nombreCli}{row.apellidoCli ? ` ${row.apellidoCli}` : ''}</h3>
                    {row.nombreNegocioCli && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{row.nombreNegocioCli}</span>}
                  </div>
                  <p className="text-xs text-gray-400">{row.telefonoCli}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-red-600"><MoneyDisplay value={row.deudaTotal} userRole={userRole} /></p>
                  {(() => {
                    const limite = resolverLimiteFiados(row, String(limiteGlobal ?? LIMITE_FIADOS_DEFAULT))
                    const estado = getEstadoFiados(row.pedidosFiados, limite)
                    const badgeColor = estado.nivel === 'limite'
                      ? 'text-red-600'
                      : estado.nivel === 'cerca'
                        ? 'text-amber-600'
                        : 'text-gray-500'
                    return <p className={`text-xs ${badgeColor}`}>{estado.count}/{estado.limite} fiados</p>
                  })()}
                  <p className={`text-xs ${row.diasFiado > 30 ? 'text-red-600' : row.diasFiado > 7 ? 'text-amber-600' : 'text-green-600'}`}>
                    {row.diasFiado} días
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setExpandedCliente(expandedCliente === row.clienteId ? null : row.clienteId)}
                  className="flex-1 text-sm text-blue-600 bg-blue-50 py-2 rounded-lg"
                >
                  {expandedCliente === row.clienteId ? 'Ocultar' : `Ver ${row.pedidosFiados.length} pedidos`}
                </button>
                <button
                  onClick={() => setPagandoClienteId(row.clienteId)}
                  className="flex-1 text-sm bg-blue-600 text-white py-2 rounded-lg"
                >
                  Pagar
                </button>
              </div>
              {expandedCliente === row.clienteId && (
                <div className="mt-3 space-y-2 bg-gray-50 p-3 rounded-lg">
                  {row.pedidosFiados.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()).map((p) => (
                    <div key={p.id} className="flex justify-between text-sm py-1 border-b last:border-b-0">
                      <span>#{p.numero} - {new Date(p.fecha).toLocaleDateString('es-CO')}</span>
                      <span className="font-semibold text-red-600"><MoneyDisplay value={Number(p.saldo)} userRole={userRole} /></span>
                    </div>
                  ))}
                </div>
              )}
              {pagandoClienteId === row.clienteId && (
                <div className="mt-3 space-y-2 bg-green-50 p-3 rounded-lg border border-green-200">
                  <input
                    type="number"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    placeholder="Monto a pagar"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <select
                    value={metodoPago}
                    onChange={(e) => setMetodoPago(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="EFECTIVO">💵 Efectivo</option>
                    <option value="TRANSFERENCIA">🏦 Transferencia</option>
                    <option value="NEQUI">📱 Nequi</option>
                    <option value="DAVIPLATA">💳 Daviplata</option>
                    <option value="BONO">🎁 Bono</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPagandoClienteId(null)}
                      className="flex-1 py-2 border rounded-lg text-sm"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handlePagar(row.clienteId)}
                      disabled={submitting}
                      className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
                    >
                      {submitting ? '...' : 'Pagar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
    </div>
  )
}
