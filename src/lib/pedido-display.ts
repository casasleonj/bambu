import {
  getAnonymousClientDisplayName,
  type AnonymousClientDisplayVariant,
} from './cliente-canonical'

export interface PedidoClienteInput {
  clienteId: string
  nombreCli: string
  apellidoCli?: string | null
  negocioId?: string | null
  nombreNegocioCli?: string | null
}

export interface PedidoClienteDisplay {
  nombrePrincipal: string
  subtextoPersona?: string
  esNegocio: boolean
  nombreNegocio?: string
  nombrePersona: string
  anonymousVariant?: AnonymousClientDisplayVariant
}

/**
 * Resuelve el nombre a mostrar para un pedido, priorizando el negocio
 * vinculado (si hay Pedido.negocioId) sobre la persona propietaria.
 *
 * - Venta anónima: devuelve la etiqueta canónica.
 * - Pedido a un negocio: "Tienda Sur" + subtexto "de Pedro Pérez".
 * - Pedido a una persona: "Pedro Pérez".
 */
export function getPedidoClienteDisplay(
  pedido: PedidoClienteInput,
): PedidoClienteDisplay {
  const nombrePersona = [pedido.nombreCli, pedido.apellidoCli]
    .filter(Boolean)
    .join(' ')
    .trim()

  const anonLabel = getAnonymousClientDisplayName(pedido.clienteId, 'short')
  if (anonLabel) {
    return {
      nombrePrincipal: anonLabel,
      esNegocio: false,
      nombrePersona: anonLabel,
      anonymousVariant: 'short',
    }
  }

  if (pedido.negocioId && pedido.nombreNegocioCli) {
    return {
      nombrePrincipal: pedido.nombreNegocioCli,
      subtextoPersona: `de ${nombrePersona}`,
      esNegocio: true,
      nombreNegocio: pedido.nombreNegocioCli,
      nombrePersona,
    }
  }

  return {
    nombrePrincipal: nombrePersona || 'Sin nombre',
    esNegocio: false,
    nombrePersona: nombrePersona || 'Sin nombre',
  }
}
