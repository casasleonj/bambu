'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { rolLabels } from '../trabajadores/trabajadores-client/types'

interface ResumenDeuda {
  trabajadorId: string
  nombre: string
  rol: string
  activo: boolean
  totalPendiente: number
  totalOriginal: number
  cantidadDeudas: number
}

export default function DeudasGlobalClient({
  initialResumen,
  totalGeneral,
}: {
  initialResumen: ResumenDeuda[]
  totalGeneral: number
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Deudas Pendientes</h1>
        <Link
          href="/trabajadores"
          className="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          &larr; Trabajadores
        </Link>
      </div>

      {/* Total */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-red-600 font-medium">Total Deudas Pendientes</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(totalGeneral)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-red-600 font-medium">Trabajadores con Deuda</p>
            <p className="text-2xl font-bold text-red-700">{initialResumen.length}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      {initialResumen.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg font-medium">No hay deudas pendientes</p>
          <p className="text-sm mt-1">Todos los trabajadores estan al dia</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Trabajador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rol</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Deudas</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Pendiente</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Original</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Accion</th>
              </tr>
            </thead>
            <tbody>
              {initialResumen.map(r => (
                <tr key={r.trabajadorId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/trabajadores/${r.trabajadorId}`} className="font-medium text-gray-800 hover:text-blue-600 hover:underline">
                      {r.nombre}
                    </Link>
                    {!r.activo && <span className="ml-2 text-xs text-red-500">(inactivo)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{rolLabels[r.rol] || r.rol}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{r.cantidadDeudas}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-bold text-red-600">{formatCurrency(r.totalPendiente)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">{formatCurrency(r.totalOriginal)}</td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/trabajadores/${r.trabajadorId}`}
                      className="text-sm text-blue-600 hover:underline font-medium"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
