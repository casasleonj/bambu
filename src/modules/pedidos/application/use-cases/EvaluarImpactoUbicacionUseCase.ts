/**
 * EvaluarImpactoUbicacionUseCase — F3 (Impacto en Demanda).
 *
 * Autoridad ÚNICA para detectar y registrar el impacto de un cambio de
 * dirección/barrio de un Cliente o Negocio sobre los Pedidos pendientes que
 * todavía dependen de esa dirección. Se llama desde los 3 lugares donde una
 * dirección maestra puede cambiar — ninguno de los 3 reimplementa la
 * detección por su cuenta:
 *   - PrismaClienteRepository.updateDireccion (flujo "actualizar cliente" desde Pedidos)
 *   - PUT /api/clientes/[id]
 *   - PUT /api/negocios
 *
 * Es puramente informativa (docs/AGUA_BAMBU_F3_DISENO_TECNICO_IMPACTO_UBICACION_v1.0.md):
 * NUNCA muta el Pedido, NUNCA modifica su snapshot, NUNCA cancela, NUNCA
 * crea otro Pedido, NUNCA toca el planificador. Solo registra una señal
 * (`PedidoImpactoUbicacion`) por Pedido afectado y notifica.
 */

import { notifyEvent } from '@/lib/notifications/notify-event'
import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'

export interface EvaluarImpactoUbicacionInput {
  origenTipo: 'CLIENTE' | 'NEGOCIO'
  origenId: string
  direccionAnterior: string | null
  barrioAnterior: string | null
  direccionNueva: string | null
  barrioNueva: string | null
  tx: TransactionClient
}

export interface EvaluarImpactoUbicacionResult {
  pedidosAfectados: number
}

export class EvaluarImpactoUbicacionUseCase {
  async execute(input: EvaluarImpactoUbicacionInput): Promise<EvaluarImpactoUbicacionResult> {
    const { origenTipo, origenId, direccionAnterior, barrioAnterior, direccionNueva, barrioNueva, tx } = input

    // Sin cambio real → sin ruido. Comparación explícita null-safe (un
    // cambio de "" a null, por ejemplo, no es un cambio real de dirección).
    const normalizar = (v: string | null) => (v || null)
    if (
      normalizar(direccionAnterior) === normalizar(direccionNueva) &&
      normalizar(barrioAnterior) === normalizar(barrioNueva)
    ) {
      return { pedidosAfectados: 0 }
    }

    // Pedidos "afectados" (docs §2): mismo cliente/negocio, entrega todavía
    // pendiente (PENDIENTE/EN_RUTA — NO_ENTREGADO queda deliberadamente
    // fuera, ver diseño técnico §2), y SIN snapshot propio de dirección —
    // es decir, siguen resolviendo su dirección en vivo contra el dato
    // maestro que acaba de cambiar.
    const where = origenTipo === 'CLIENTE'
      ? { clienteId: origenId, negocioId: null }
      : { negocioId: origenId }

    const pedidosAfectados = await tx.pedido.findMany({
      where: {
        ...where,
        estadoEntrega: { in: ['PENDIENTE', 'EN_RUTA'] },
        direccionEntrega: null,
        barrioEntrega: null,
      },
      select: { id: true },
    })

    if (pedidosAfectados.length === 0) {
      return { pedidosAfectados: 0 }
    }

    await tx.pedidoImpactoUbicacion.createMany({
      data: pedidosAfectados.map(p => ({
        pedidoId: p.id,
        origenTipo,
        origenId,
        direccionAnterior,
        barrioAnterior,
        direccionNueva,
        barrioNueva,
      })),
    })

    // Un solo evento agregado, no uno por pedido — mismo criterio de "no
    // generar ruido" ya aplicado en el resto del sistema de notificaciones.
    void notifyEvent('PEDIDO_UBICACION_DESACTUALIZADA', {
      title: 'Pedidos con dirección desactualizada',
      body: `${pedidosAfectados.length} pedido(s) pendiente(s) quedaron con la dirección anterior tras un cambio de ubicación.`,
    })

    return { pedidosAfectados: pedidosAfectados.length }
  }
}
