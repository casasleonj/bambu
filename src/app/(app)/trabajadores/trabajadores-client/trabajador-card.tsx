import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
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
    <div className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md dark:bg-zinc-900">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{trabajador.nombre}</h2>
          <div className="mt-1 flex gap-1.5">
            <Badge variant="default">
              {rolLabels[trabajador.rol] || trabajador.rol}
            </Badge>
            <Badge variant="secondary">
              {tipoPagoLabels[trabajador.tipoPago] || trabajador.tipoPago}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        {trabajador.telefono && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-500 dark:text-zinc-500">Teléfono:</span>
            <span>{trabajador.telefono}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-500 dark:text-zinc-500">Usa moto:</span>
          <span>{trabajador.usaMoto ? 'Sí' : 'No'}</span>
          {!trabajador.usaMoto && (
            <Badge variant="outline" className="text-xs text-gray-500">Solo fijo</Badge>
          )}
        </div>
        {trabajador.usaMoto && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-500 dark:text-zinc-500">Capacidad:</span>
            <span>{trabajador.capacidadKg} kg</span>
          </div>
        )}

        <div className="border-t pt-2 mt-3 space-y-1">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Configuración de pago
          </p>
          {(trabajador.tipoPago === 'COMISION' || trabajador.tipoPago === 'MIXTO') && (
            <>
              <p className="text-[10px] text-zinc-400 mt-1">Sellado</p>
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-500 dark:text-zinc-500">Com. paca agua:</span>
                <span>{formatCurrency(trabajador.comPacaAgua ?? 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-500 dark:text-zinc-500">Com. paca hielo:</span>
                <span>{formatCurrency(trabajador.comPacaHielo ?? 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-500 dark:text-zinc-500">Com. botellón:</span>
                <span>{formatCurrency(trabajador.comBotellon ?? 0)}</span>
              </div>
              {trabajador.usaMoto && (
                <>
                  <p className="text-[10px] text-blue-500 mt-1">Reparto</p>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-500 dark:text-zinc-500">Com. reparto agua:</span>
                    <span>{formatCurrency(trabajador.comRepartAgua ?? 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-500 dark:text-zinc-500">Com. reparto hielo:</span>
                    <span>{formatCurrency(trabajador.comRepartHielo ?? 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-500 dark:text-zinc-500">Com. reparto botellón:</span>
                    <span>{formatCurrency(trabajador.comRepartBotellon ?? 0)}</span>
                  </div>
                </>
              )}
            </>
          )}
          {(trabajador.tipoPago === 'FIJO' || trabajador.tipoPago === 'MIXTO') && (
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-500 dark:text-zinc-500">Salario fijo:</span>
              <span>{formatCurrency(trabajador.salarioFijo ?? 0)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => onEdit(trabajador)}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(trabajador.id)}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
        >
          Desactivar
        </button>
      </div>
    </div>
  )
}
