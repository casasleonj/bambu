import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { Trabajador } from './types'
import { rolLabels, tipoPagoLabels } from './types'
import { formatearTelefonoParaInput } from '@/lib/telefono'

export function TrabajadorCard({
  trabajador,
  onEdit,
  onDelete,
  onRetryDeuda,
}: {
  trabajador: Trabajador
  onEdit: (t: Trabajador) => void
  onDelete: (id: string) => void
  /** Reintenta la carga de la lista cuando la deuda no se pudo calcular (#566) */
  onRetryDeuda?: () => void
}) {
  return (
    <div data-testid="trabajador-card" className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md dark:bg-zinc-900">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            <Link
              href={`/trabajadores/${trabajador.id}`}
              className="rounded hover:text-emerald-700 hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:text-emerald-400"
            >
              {trabajador.nombre}
            </Link>
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="default">
              {rolLabels[trabajador.rol] || trabajador.rol}
            </Badge>
            <Badge variant="secondary">
              {tipoPagoLabels[trabajador.tipoPago] || trabajador.tipoPago}
            </Badge>
            {typeof trabajador.deudaPendiente === 'number' && trabajador.deudaPendiente > 0 && (
              <span
                data-testid="trabajador-deuda-badge"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              >
                Deuda pendiente <span className="tabular-nums">{formatCurrency(trabajador.deudaPendiente)}</span>
              </span>
            )}
            {trabajador.deudaPendiente === null && (
              <span
                role="status"
                data-testid="trabajador-deuda-error"
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              >
                Deuda no disponible
                {onRetryDeuda && (
                  <button type="button" onClick={onRetryDeuda} className="underline focus-visible:outline-2 focus-visible:outline-red-600">
                    Reintentar
                  </button>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        {trabajador.telefono && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-500 dark:text-zinc-500">Teléfono:</span>
            <span>{formatearTelefonoParaInput(trabajador.telefono)}</span>
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
          {trabajador.rol === 'SELLADOR' && (trabajador.tipoPago === 'COMISION' || trabajador.tipoPago === 'MIXTO') && (
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
            </>
          )}
          {trabajador.usaMoto && (trabajador.tipoPago === 'COMISION' || trabajador.tipoPago === 'MIXTO') && (
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
