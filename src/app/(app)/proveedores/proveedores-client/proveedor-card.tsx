import type { Proveedor } from './types'

export function ProveedorCard({
  proveedor,
  onEdit,
  onDeactivate,
}: {
  proveedor: Proveedor
  onEdit: (p: Proveedor) => void
  onDeactivate: (id: string) => void
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-white p-6 shadow-sm transition hover:shadow-md dark:bg-zinc-900">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{proveedor.nombre}</h2>
        {proveedor.activo === false && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
            Inactivo
          </span>
        )}
      </div>

      <div className="flex-1 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        {proveedor.telefono && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-500 dark:text-zinc-500">Telefono:</span>
            <span>{proveedor.telefono}</span>
          </div>
        )}
        {proveedor.email && (
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-500 dark:text-zinc-500">Email:</span>
            <span className="break-all">{proveedor.email}</span>
          </div>
        )}
        {proveedor.direccion && (
          <div className="flex items-start gap-2">
            <span className="font-medium text-zinc-500 dark:text-zinc-500">Direccion:</span>
            <span>{proveedor.direccion}</span>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => onEdit(proveedor)}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          Editar
        </button>
        <button
          onClick={() => onDeactivate(proveedor.id)}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900"
        >
          Desactivar
        </button>
      </div>
    </div>
  )
}
