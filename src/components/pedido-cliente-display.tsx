import { getPedidoClienteDisplay, type PedidoClienteInput } from '@/lib/pedido-display'

export type PedidoClienteDisplayVariant = 'row' | 'card' | 'heading' | 'chip'

interface PedidoClienteDisplayProps extends PedidoClienteInput {
  variant?: PedidoClienteDisplayVariant
  showBadge?: boolean
  className?: string
}

export function PedidoClienteDisplay({
  variant = 'row',
  showBadge = false,
  className,
  ...pedido
}: PedidoClienteDisplayProps) {
  const display = getPedidoClienteDisplay(pedido)

  if (variant === 'heading') {
    return (
      <h2 className={`text-lg font-bold text-gray-800 ${className || ''}`}>
        {display.nombrePrincipal}
        {display.subtextoPersona && (
          <span className="text-sm font-normal text-gray-500 ml-2">
            {display.subtextoPersona}
          </span>
        )}
        {showBadge && display.esNegocio && <NegocioBadge />}
      </h2>
    )
  }

  if (variant === 'card') {
    return (
      <div className={className}>
        <h3 className="font-medium text-gray-800 text-sm">
          {display.nombrePrincipal}
          {showBadge && display.esNegocio && <NegocioBadge />}
        </h3>
        {display.subtextoPersona && (
          <p className="text-xs text-gray-500">{display.subtextoPersona}</p>
        )}
      </div>
    )
  }

  if (variant === 'chip') {
    return (
      <span className={className}>
        {display.nombrePrincipal}
        {display.subtextoPersona && (
          <span className="text-xs text-gray-500 ml-1">
            — {display.nombrePersona}
          </span>
        )}
      </span>
    )
  }

  // variant === 'row' (default)
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className || ''}`}>
      <span className="font-medium text-gray-800">{display.nombrePrincipal}</span>
      {display.subtextoPersona && (
        <span className="text-xs text-gray-500">{display.subtextoPersona}</span>
      )}
      {showBadge && display.esNegocio && <NegocioBadge />}
    </div>
  )
}

function NegocioBadge() {
  return (
    <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-medium">
      🏪 Negocio
    </span>
  )
}
