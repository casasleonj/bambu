/**
 * CrearDeudaFaltanteCajaService.
 *
 * Responsabilidad única: al cerrar un embarque, si el trabajador entregó
 * menos efectivo de lo esperado (sobranteFaltante < 0) y no hay una
 * justificación documentada, crear una DeudaTrabajador de tipo
 * DEFICIT_EFECTIVO para recuperar el faltante vía nómina.
 *
 * Reglas de negocio:
 * - Solo se crea si el faltante supera UMBRAL_MINIMO_FALTANTE_CAJA.
 * - Si hay justificacionFaltante, no se crea deuda (se asume explicado).
 * - El plan de pago por defecto evita descuentos agresivos de una sola nómina.
 * - La deuda queda ligada al embarque para trazabilidad.
 */

import {
  UMBRAL_MINIMO_FALTANTE_CAJA,
  DEUDA_FALTANTE_CAJA_PLAZO_NOMINAS_DEFAULT,
  DEUDA_FALTANTE_CAJA_PORCENTAJE_NOMINA_DEFAULT,
} from '@/lib/constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxOrPrisma = any

export class CrearDeudaFaltanteCajaService {
  /**
   * Crea una deuda por faltante de caja si aplica.
   *
   * @param faltante Monto negativo: dineroEntregado - efectivoReal. Solo valores < 0 generan deuda.
   * @returns Datos de la deuda creada, o undefined si no aplica.
   */
  async execute(
    client: TxOrPrisma,
    trabajadorId: string,
    embarqueId: string,
    faltante: number,
    justificacionFaltante: string | undefined,
    createdById?: string,
  ): Promise<{ id: string; monto: number } | undefined> {
    // Solo faltantes (negativos), no sobrantes.
    if (faltante >= 0) return undefined

    const montoFaltante = Math.abs(faltante)

    // No crear deudas por diferencias menores al umbral operativo.
    if (montoFaltante < UMBRAL_MINIMO_FALTANTE_CAJA) return undefined

    // Si el administrador documentó una razón, no castigamos al trabajador.
    if (justificacionFaltante && justificacionFaltante.trim().length > 0) return undefined

    const embarque = await client.embarque.findUnique({
      where: { id: embarqueId },
      select: { numero: true },
    })

    const deuda = await client.deudaTrabajador.create({
      data: {
        createdById,
        trabajadorId,
        tipo: 'DEFICIT_EFECTIVO',
        montoOriginal: montoFaltante,
        montoPendiente: montoFaltante,
        plazoNominas: DEUDA_FALTANTE_CAJA_PLAZO_NOMINAS_DEFAULT,
        porcentajePorNomina: DEUDA_FALTANTE_CAJA_PORCENTAJE_NOMINA_DEFAULT,
        embarqueId,
        descripcion: `Faltante de caja en cierre de embarque #${embarque?.numero ?? embarqueId}`,
      },
    })

    return { id: deuda.id, monto: Number(deuda.monto) }
  }
}
