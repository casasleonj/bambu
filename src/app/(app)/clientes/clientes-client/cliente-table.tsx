'use client'

import type { Cliente } from './types'
import { formatCurrency } from '@/lib/utils'

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
  return (
    <>
      <div className="bg-white p-4 rounded-xl shadow mb-6">
        <input
          type="text"
          placeholder="Buscar por nombre, telefono, negocio, barrio..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
      </div>

      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center justify-between">
          <p className="text-red-700 text-sm">{fetchError}</p>
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
          <div className="col-span-3">Cliente</div>
          <div className="col-span-2">Telefono</div>
          <div className="col-span-2">Barrio</div>
          <div className="col-span-2">Frecuencia</div>
          <div className="col-span-2 text-right">Saldo Pendiente</div>
          <div className="col-span-1 text-center">Pedidos</div>
        </div>

        {clientes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No hay clientes</p>
            <button
              onClick={onCreateClick}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm"
            >
              + Crear tu primer cliente
            </button>
          </div>
        ) : (
          <div className="divide-y">
            {clientes.map((cliente) => (
              <div
                key={cliente.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-4 py-3 hover:bg-blue-50 cursor-pointer transition"
                onClick={() => onViewCliente(cliente.id)}
              >
                <div className="md:col-span-3">
                  <p className="font-semibold text-gray-800">
                    {cliente.nombre} {cliente.apellido}
                  </p>
                  {cliente.nombreNegocio && (
                    <p className="text-xs text-gray-500">{cliente.nombreNegocio}</p>
                  )}
                </div>
                <div className="md:col-span-2 text-sm text-gray-600">{cliente.telefono}</div>
                <div className="md:col-span-2 text-sm text-gray-600">{cliente.barrio || '-'}</div>
                <div className="md:col-span-2 text-sm">
                  {cliente.cadaNDias && cliente.cadaNDias > 0 ? (
                    <span className="text-green-600 font-medium">Cada {cliente.cadaNDias} días</span>
                  ) : (
                    <span className="text-gray-400">Sin frecuencia</span>
                  )}
                </div>
                <div className="md:col-span-2 text-right">
                  {cliente.saldoPendiente && cliente.saldoPendiente > 0 ? (
                    <span className="text-red-600 font-bold">{formatCurrency(cliente.saldoPendiente)}</span>
                  ) : (
                    <span className="text-green-600 text-sm">Al día</span>
                  )}
                </div>
                <div className="md:col-span-1 text-center text-sm text-gray-500">
                  {cliente._count?.pedidos || 0}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
