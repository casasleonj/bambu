'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
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
  sortBy: 'nombre' | 'createdAt'
  sortDir: 'asc' | 'desc'
  onSortChange: (by: 'nombre' | 'createdAt', dir: 'asc' | 'desc') => void
  selectedClienteId?: string | null
  totalClientes?: number
}

export const ClienteTable = React.memo(function ClienteTable({
  clientes,
  search,
  onSearchChange,
  fetchError,
  onRetry,
  onCreateClick,
  onViewCliente,
  sortBy,
  sortDir,
  onSortChange,
  selectedClienteId,
  totalClientes,
}: ClienteTableProps) {
  const [filterSaldo, setFilterSaldo] = useState(false)
  const [filterFrecuencia, setFilterFrecuencia] = useState(false)
  const [quickActionsRow, setQuickActionsRow] = useState<string | null>(null)
  const quickActionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!quickActionsRow) return
    function handleClickOutside(e: MouseEvent) {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) {
        setQuickActionsRow(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [quickActionsRow])

  const clientesFiltrados = useMemo(() => clientes.filter((c) => {
    if (filterSaldo && !(c.saldoPendiente && c.saldoPendiente > 0)) return false
    if (filterFrecuencia && !c.plantillaRecurrente?.activo) return false
    return true
  }), [clientes, filterSaldo, filterFrecuencia])

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

      {/* Results count + sort toggle */}
      {clientes.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">
            {clientesFiltrados.length}{totalClientes && totalClientes > clientes.length ? ` de ${totalClientes}` : ` de ${clientes.length}`} clientes
            {hasActiveFilters && ' (filtrados)'}
          </p>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className="hidden sm:inline">Ordenar:</span>
            <button
              onClick={() => onSortChange('nombre', sortBy === 'nombre' && sortDir === 'asc' ? 'desc' : 'asc')}
              className={`px-2 py-1 rounded font-medium transition ${sortBy === 'nombre' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'}`}
            >
              Nombre {sortBy === 'nombre' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
            <button
              onClick={() => onSortChange('createdAt', sortBy === 'createdAt' && sortDir === 'asc' ? 'desc' : 'asc')}
              className={`px-2 py-1 rounded font-medium transition ${sortBy === 'createdAt' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'}`}
            >
              Fecha {sortBy === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </div>
        </div>
      )}

      {/* Client list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header - desktop only */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <button onClick={() => onSortChange('nombre', sortBy === 'nombre' && sortDir === 'asc' ? 'desc' : 'asc')} className="col-span-3 flex items-center gap-1 text-left hover:text-gray-700 transition">
            Cliente
            {sortBy === 'nombre' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
          </button>
          <div className="col-span-2">Contacto</div>
          <div className="col-span-2">Zona</div>
          <div className="col-span-2">Frecuencia</div>
          <div className="col-span-2 text-right">Saldo</div>
          <div className="col-span-1 text-center">
            <button onClick={() => onSortChange('createdAt', sortBy === 'createdAt' && sortDir === 'asc' ? 'desc' : 'asc')} className="inline-flex items-center gap-1 hover:text-gray-700 transition">
              Registro
              {sortBy === 'createdAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </div>
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
                  className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 cursor-pointer transition group relative ${
                    selectedClienteId === cliente.id
                      ? 'bg-blue-50 border-l-4 border-blue-500'
                      : cliente.saldoPendiente && cliente.saldoPendiente > 0
                        ? 'bg-red-50/30 hover:bg-red-50/60'
                        : hasAlertas
                          ? 'bg-amber-50/30 hover:bg-amber-50/60'
                          : 'hover:bg-blue-50/50'
                  }`}
                  onClick={() => onViewCliente(cliente.id)}
                >
                  {/* Quick actions menu */}
                  <div className="absolute right-2 top-2 z-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); setQuickActionsRow(quickActionsRow === cliente.id ? null : cliente.id) }}
                      className="p-1.5 rounded-lg bg-white/80 hover:bg-white shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 transition text-gray-500 hover:text-gray-700"
                      aria-label="Acciones rápidas"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                    {quickActionsRow === cliente.id && (
                      <div ref={quickActionsRef} className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                        <a
                          href={`tel:${cliente.telefono}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          Llamar
                        </a>
                        <Link
                          href={`/pedidos?cliente=${cliente.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Crear pedido
                        </Link>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(cliente.telefono); toast.success('Teléfono copiado'); setQuickActionsRow(null) }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          Copiar teléfono
                        </button>
                        {cliente.direccion && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(cliente.direccion || ''); toast.success('Dirección copiada'); setQuickActionsRow(null) }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Copiar dirección
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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
                        {(() => {
                          if (!search || !cliente.contactos) return null
                          const term = search.toLowerCase()
                          const matched = cliente.contactos.find(ct =>
                            ct.nombre.toLowerCase().includes(term) ||
                            ct.telefono.includes(term) ||
                            ct.relacion?.toLowerCase().includes(term)
                          )
                          if (!matched) return null
                          return (
                            <p className="text-xs text-amber-600 font-medium truncate">
                              👤 {matched.nombre}{matched.relacion ? ` (${matched.relacion})` : ''} — {matched.telefono}
                            </p>
                          )
                        })()}
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
                      {cliente.plantillaRecurrente?.activo && (
                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-medium rounded inline-flex items-center gap-0.5">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Cada {cliente.plantillaRecurrente.cadaNDias}d
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
                      {cliente.contactos && cliente.contactos.length > 0 && (
                        <span className="text-gray-400" title={`${cliente.contactos.length} contacto(s) adicional(es)`}>👥</span>
                      )}
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
                        {cliente.linkUbicacion && <span className="text-blue-500" title="Tiene ubicación en mapa">📍</span>}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </div>

                  {/* Frequency */}
                  <div className="md:col-span-2 text-sm">
                    {cliente.plantillaRecurrente?.activo ? (
                      <Tooltip content={`Pedidos recurrentes activos — cada ${cliente.plantillaRecurrente.cadaNDias} días`} position="top">
                        <span className="inline-flex items-center gap-1 text-indigo-600 font-medium">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Cada {cliente.plantillaRecurrente.cadaNDias} días
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
})

// Helper function to calculate alerts (simplified version for table)
function calcularAlertasCliente(cliente: Cliente, pedidos: any[]) {
  const alertas: any[] = []
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

  // Check for pending balance
  if (cliente.saldoPendiente && cliente.saldoPendiente > 0) {
    alertas.push({ severidad: 'ALTA', tipo: 'SALDO_PENDIENTE', detalle: 'Saldo pendiente' })
  }

  // Check for multiple orders today
  const pedidosHoy = pedidos.filter((p: any) => {
    const fechaLocal = p.fecha ? new Date(p.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) : ''
    return fechaLocal === hoy
  })
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
