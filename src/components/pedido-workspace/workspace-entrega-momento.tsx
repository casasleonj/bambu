'use client'

/**
 * Zona «Entrega» de la venta rápida a Punto: ¿se entrega ahora o después?
 * (P2-2, #463; ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001).
 *
 * El padre decide cuándo se muestra (flag + venta rápida + Punto + creando).
 * «Entregar después» deja el pedido pendiente (y anticipado si va pagado
 * completo), así que exige un comprador identificado: sin él no se puede
 * guardar, igual que en el formulario antiguo.
 */
export function WorkspaceEntregaMomento({
  entregarDespues,
  onChange,
  tieneComprador,
  pagadoCompleto,
  disabled = false,
}: {
  entregarDespues: boolean
  onChange: (despues: boolean) => void
  tieneComprador: boolean
  pagadoCompleto: boolean
  disabled?: boolean
}) {
  return (
    <section className="rounded-lg border border-gray-200 px-3 py-2 text-sm" data-testid="workspace-entrega-momento">
      <div className="text-xs font-semibold uppercase text-gray-400">📦 Entrega</div>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={!entregarDespues}
          data-testid="workspace-entrega-ahora"
          onClick={() => onChange(false)}
          className={`flex-1 rounded-lg border py-2 text-sm transition ${!entregarDespues ? 'border-green-600 bg-green-600 text-white' : 'bg-white hover:bg-gray-50'}`}
        >
          Entregar ahora
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={entregarDespues}
          data-testid="workspace-entrega-despues"
          onClick={() => onChange(true)}
          className={`flex-1 rounded-lg border py-2 text-sm transition ${entregarDespues ? 'border-amber-500 bg-amber-500 text-white' : 'bg-white hover:bg-gray-50'}`}
        >
          Entregar después
        </button>
      </div>
      {entregarDespues && (
        <p className="mt-2 text-xs text-amber-700" data-testid="workspace-entrega-despues-aviso">
          El pedido queda <strong>pendiente</strong>
          {pagadoCompleto ? ' y anticipado (pagado)' : ''}. Se entrega o se retira en una visita posterior.
        </p>
      )}
      {entregarDespues && !tieneComprador && (
        <p className="mt-1 text-xs text-red-600" data-testid="workspace-entrega-despues-sin-comprador">
          Para entregar después hay que saber quién es el comprador. Identifícalo arriba.
        </p>
      )}
    </section>
  )
}
