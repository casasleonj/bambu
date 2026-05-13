'use client'

import { useState } from 'react'
import type { Cliente } from './types'
import { formatCurrency } from '@/lib/utils'
import { EmptyState, EmptySearch } from '@/components/empty-state'
import { Tooltip } from '@/components/tooltip'

interface ClienteTableProps {
  clientes: Cliente[]
  search: string
  onSearchChange: (val: string) => void
  fetchError: string | null
  onRetry: () => void
  onCreateClick: () => void
  onViewCliente: (id: string) => void
}

export function ClienteTable({
  clientes,
  search,
  onSearchChange,
  fetchError,
  onRetry,
  onCreateClick,
  onViewCliente,
}: ClienteTableProps) {
  const [filterSaldo, setFilterSaldo] = useState(false)
  const [filterFrecuencia, setFilterFrecuencia] = useState(false)

  const clientesFiltrados = clientes.filter((c) => {
    if (filterSaldo && !(c.saldoPendiente && c.saldoPendiente > 0)) return false
    if (filterFrecuencia && !(c.cadaNDias && c.cadaNDias > 0)) return false
    return true
  })

  const hasActiveFilters = filterSaldo || filterFrecuencia || search

  const clearFilters = () => {
    setFilterSaldo(false)
    setFilterFrecuencia(false)
    onSearchChange('')
  }

  return (
    <>
      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4 space-y-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono, negocio, barrio..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Tooltip content="Mostrar solo clientes con saldo pendiente" position="bottom">
            <button
              onClick={() => setFilterSaldo(!filterSaldo)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filterSaldo
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Con saldo
              {filterSaldo && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
            </button>
          </Tooltip>

          <Tooltip content="Mostrar solo clientes con frecuencia de compra configurada" position="bottom">
            <button
              onClick={() => setFilterFrecuencia(!filterFrecuencia)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filterFrecuencia
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Con frecuencia
              {filterFrecuencia && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
            </button>
          </Tooltip>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:text-gray-700 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Error inline */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-700 text-sm">{fetchError}</p>
          </div>
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Results count */}
      {clientes.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            {clientesFiltrados.length} de {clientes.length} clientes
            {hasActiveFilters && ' (filtrados)'}
          </p>
        </div>
      )}

      {/* Client list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header - desktop only */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <div className="col-span-3">Cliente</div>
          <div className="col-span-2">Contacto</div>
          <div className="col-span-2">Zona</div>
          <div className="col-span-2">Frecuencia</div>
          <div className="col-span-2 text-right">Saldo</div>
          <div className="col-span-1 text-center">Pedidos</div>
        </div>

        {clientesFiltrados.length === 0 ? (
          <div className="p-8">
            {search ? (
              <EmptySearch searchTerm={search} onClear={() => onSearchChange('')} />
            ) : hasActiveFilters ? (
              <EmptyState
                icon={
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                }
                title="Ningún cliente coincide con los filtros"
                description="Prueba desactivando algunos filtros para ver más resultados"
                actionLabel="Limpiar filtros"
                onAction={clearFilters}
                compact
              />
            ) : (
              <EmptyState
                icon={
                  <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
                title="No hay clientes registrados"
                description="Los clientes son el corazón de tu negocio. Registra el primero para empezar a hacer pedidos."
                actionLabel="+ Crear primer cliente"
                onAction={onCreateClick}
                guidedSteps={[
                  { label: 'Crear cliente', description: 'Nombre, teléfono y dirección básicos', onClick: onCreateClick },
                  { label: 'Configurar frecuencia', description: 'Opcional: cada cuántos días compra' },
                  { label: 'Crear primer pedido', description: 'Desde la sección Pedidos' },
                ]}
              />
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {clientesFiltrados.map((cliente) => {
              const alertas = cliente.pedidos ? calcularAlertasCliente(cliente, cliente.pedidos) : []
              const hasAlertas = alertas.length > 0
              const alertasAltas = alertas.filter((a: any) => a.severidad === 'ALTA')

              return (
                <div
                  key={cliente.id}
                  className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 cursor-pointer transition group ${
                    cliente.saldoPendiente && cliente.saldoPendiente > 0
                      ? 'bg-red-50/30 hover:bg-red-50/60'
                      : hasAlertas
                        ? 'bg-amber-50/30 hover:bg-amber-50/60'
                        : 'hover:bg-blue-50/50'
                  }`}
                  onClick={() => onViewCliente(cliente.id)}
                >
                  {/* Client name + badges */}
                  <div className="md:col-span-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                        cliente.saldoPendiente && cliente.saldoPendiente > 0
                          ? 'bg-red-500'
                          : hasAlertas
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                      }`}>
                        {cliente.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">
                          {cliente.nombre} {cliente.apellido}
                        </p>
                        {cliente.nombreNegocio && (
                          <p className="text-xs text-gray-500 truncate">{cliente.nombreNegocio}</p>
                        )}
                      </div>
                    </div>
                    {/* Mobile-only badges */}
                    <div className="flex flex-wrap gap-1 mt-1 md:hidden">
                      {cliente.saldoPendiente && cliente.saldoPendiente > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-medium rounded">
                          Saldo: {formatCurrency(cliente.saldoPendiente)}
                        </span>
                      )}
                      {alertasAltas.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-medium rounded">
                          {alertasAltas.length} alerta{alertasAltas.length > 1 ? 's' : ''}
                        </span>
                      )}
                      {cliente.cadaNDias && cliente.cadaNDias > 0 && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] font-medium rounded">
                          Cada {cliente.cadaNDias}d
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="md:col-span-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="truncate">{cliente.telefono}</span>
                    </div>
                  </div>

                  {/* Zone */}
                  <div className="md:col-span-2 text-sm text-gray-600">
                    {cliente.barrio ? (
                      <div className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate">{cliente.barrio}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>

                  {/* Frequency */}
                  <div className="md:col-span-2 text-sm">
                    {cliente.cadaNDias && cliente.cadaNDias > 0 ? (
                      <Tooltip content={`Este cliente compra cada ${cliente.cadaNDias} días`} position="top">
                        <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          Cada {cliente.cadaNDias} días
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-gray-400">Sin frecuencia</span>
                    )}
                  </div>

                  {/* Balance */}
                  <div className="md:col-span-2 text-right">
                    {cliente.saldoPendiente && cliente.saldoPendiente > 0 ? (
                      <Tooltip content={`Este cliente debe ${formatCurrency(cliente.saldoPendiente)}`} position="top">
                        <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatCurrency(cliente.saldoPendiente)}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-green-600 text-sm font-medium">Al día</span>
                    )}
                  </div>

                  {/* Orders count + alert indicator */}
                  <div className="md:col-span-1 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-sm text-gray-500">{cliente._count?.pedidos || 0}</span>
                      {alertasAltas.length > 0 && (
                        <Tooltip content={`${alertasAltas.length} alerta(s) crítica(s)`} position="top">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        </Tooltip>
                      )}
                      {hasAlertas && alertasAltas.length === 0 && (
                        <Tooltip content={`${alertas.length} alerta(s) de baja prioridad`} position="top">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// Helper function to calculate alerts (simplified version for table)
function calcularAlertasCliente(cliente: Cliente, pedidos: any[]) {
  const alertas: any[] = []
  const hoy = new Date().toISOString().slice(0, 10)

  // Check for pending balance
  if (cliente.saldoPendiente && cliente.saldoPendiente > 0) {
    alertas.push({ severidad: 'ALTA', tipo: 'SALDO_PENDIENTE', detalle: 'Saldo pendiente' })
  }

  // Check for multiple orders today
  const pedidosHoy = pedidos.filter((p: any) => p.fecha?.slice(0, 10) === hoy)
  if (pedidosHoy.length >= 2) {
    alertas.push({ severidad: 'MEDIA', tipo: 'MULTIPLES_PEDIDOS', detalle: `${pedidosHoy.length} pedidos hoy` })
  }

  // Check for expired payment
  const pedidosVencidos = pedidos.filter((p: any) => p.estadoPago === 'VENCIDO')
  if (pedidosVencidos.length > 0) {
    alertas.push({ severidad: 'ALTA', tipo: 'PAGO_VENCIDO', detalle: 'Pago vencido' })
  }

  return alertas
}
