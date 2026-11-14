import { toast } from 'sonner'
import type { ResultadoUbicacionGuardada } from '@/hooks/use-crear-pedido'

export type AvisoUbicacion = { tipo: 'success' | 'info' | 'error'; texto: string }

const donde = (destino: 'NEGOCIO' | 'CLIENTE') => (destino === 'NEGOCIO' ? 'en la tienda' : 'en el cliente')

/**
 * #426 (maqueta D): lo que se le dice a la persona después de guardar el pedido con «Guardar también la
 * ubicación». El pedido ya está guardado: un fallo aquí nunca lo pierde, solo se avisa.
 */
export function avisoUbicacionGuardada(r: ResultadoUbicacionGuardada | undefined): AvisoUbicacion | null {
  if (!r) return null
  switch (r.resultado) {
    case 'GUARDADA':
      return { tipo: 'success', texto: `La ubicación quedó guardada ${donde(r.destino)} para los próximos pedidos.` }
    case 'REEMPLAZADA':
      return { tipo: 'success', texto: `La ubicación ${donde(r.destino)} se reemplazó por la nueva. Quedó anotado en el historial.` }
    case 'IGUAL':
      return { tipo: 'info', texto: `Esa ubicación ya estaba guardada ${donde(r.destino)}.` }
    case 'CONSERVADA':
      return { tipo: 'info', texto: `El pedido se guardó. La ubicación guardada ${donde(r.destino)} no se cambió.` }
    case 'ERROR':
      return {
        tipo: 'error',
        texto: 'Se guardó el pedido, pero no la ubicación. El pedido está bien: puedes guardarla desde la ficha del cliente o de la tienda.',
      }
    default:
      return { tipo: 'info', texto: 'El pedido se guardó, pero no había dónde guardar la ubicación.' }
  }
}

export function avisarUbicacionGuardada(r: ResultadoUbicacionGuardada | undefined): void {
  const aviso = avisoUbicacionGuardada(r)
  if (!aviso) return
  toast[aviso.tipo](aviso.texto)
}
