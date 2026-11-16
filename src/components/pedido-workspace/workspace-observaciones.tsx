'use client'

/** Observaciones del pedido (#635). El servidor admite hasta 500 caracteres (`obs`). */
export const OBS_MAX = 500

export function WorkspaceObservaciones({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (obs: string) => void
  disabled?: boolean
}) {
  return (
    <section className="rounded-lg border border-gray-200 px-3 py-2 text-sm" data-testid="workspace-observaciones">
      <label htmlFor="workspace-obs" className="text-xs font-semibold uppercase text-gray-400">
        📝 Observaciones <span className="font-normal normal-case">(opcional · las ve quien consulta el pedido)</span>
      </label>
      <textarea
        id="workspace-obs"
        rows={2}
        maxLength={OBS_MAX}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ej.: dejar con el portero, llamar antes de llegar"
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <p className="mt-0.5 text-right text-[11px] text-gray-500" aria-live="off">
        Quedan {OBS_MAX - value.length} de {OBS_MAX}
      </p>
    </section>
  )
}
