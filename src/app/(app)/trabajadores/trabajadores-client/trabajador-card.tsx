import { formatCurrency } from '@/lib/utils'
import type { Trabajador } from './types'
import { rolLabels, tipoPagoLabels } from './types'

export function TrabajadorCard({
  trabajador,
  onEdit,
  onDelete,
}: {
  trabajador: Trabajador
  onEdit: (t: Trabajador) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="bg-white p-4 rounded-xl shadow hover:shadow-md transition">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="font-semibold text-gray-800">{trabajador.nombre}</p>
          <span className="inline-block mt-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
            {rolLabels[trabajador.rol] || trabajador.rol}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(trabajador)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            title="Editar"
          >
            Editar
          </button>
          <button
            onClick={() => onDelete(trabajador.id)}
            className="text-red-600 hover:text-red-800 text-sm font-medium"
            title="Desactivar"
          >
            Desactivar
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Tipo de pago</span>
          <span className="font-medium text-gray-700">
            {tipoPagoLabels[trabajador.tipoPago] || trabajador.tipoPago}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500">Usa moto</span>
          <span className="font-medium text-gray-700">
            {trabajador.usaMoto ? 'Si' : 'No'}
          </span>
        </div>

        {trabajador.usaMoto && (
          <div className="flex justify-between">
            <span className="text-gray-500">Capacidad moto</span>
            <span className="font-medium text-gray-700">
              {trabajador.capacidadKg} kg
            </span>
          </div>
        )}

        {trabajador.telefono && (
          <div className="flex justify-between">
            <span className="text-gray-500">Teléfono</span>
            <span className="font-medium text-gray-700">{trabajador.telefono}</span>
          </div>
        )}

        <div className="border-t pt-2 mt-2 space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Configuracion de pago
          </p>
          <div className="flex justify-between">
            <span className="text-gray-500">Com. paca agua</span>
            <span className="font-medium text-gray-700">
              {formatCurrency(trabajador.comPacaAgua)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Com. paca hielo</span>
            <span className="font-medium text-gray-700">
              {formatCurrency(trabajador.comPacaHielo)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Salario fijo</span>
            <span className="font-medium text-gray-700">
              {formatCurrency(trabajador.salarioFijo)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
