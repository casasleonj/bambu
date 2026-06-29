/**
 * Cliente canónico para ventas anónimas.
 *
 * La app usa el id literal 'CONSUMIDOR_FINAL' como registro sistémico para
 * ventas sin cliente real (VENTA_RAPIDA / VENTA_LIBRE). Este archivo es el
 * único lugar que conoce los detalles de creación/aseguramiento de ese
 * registro.
 *
 * IMPORTANTE: el helper debe llamarse DENTRO de una transacción que ya
 * adquiera el advisory lock 'PEDIDO' (u otro lock equivalente). Tanto
 * CrearPedidoUseCase como venta-libre/route.ts usan ese lock, por lo que
 * la creación del canónico está serializada y no hay race condition.
 */

import { CANONICAL_CONSUMIDOR_FINAL_ID } from './constants'
import type { TransactionClient } from '@/shared/infrastructure/transactions/PrismaTransactionManager'

/**
 * Asegura que el cliente canónico CONSUMIDOR_FINAL exista en la base de
 * datos. Si no existe, lo crea con activo=false para que no aparezca en
 * listados. Si ya existe, no hace nada.
 *
 * Usa INSERT ... ON CONFLICT DO NOTHING, que es atómico en PostgreSQL y
 * no sufre del race condition find-then-create.
 */
export async function ensureConsumidorFinalCanonical(
  tx: TransactionClient,
): Promise<string> {
  await tx.$executeRaw`
    INSERT INTO "Cliente" (
      id,
      nombre,
      telefono,
      direccion,
      activo,
      "creadoPorRol",
      verificado,
      bloqueado,
      frecuencia,
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${CANONICAL_CONSUMIDOR_FINAL_ID},
      'Consumidor Final',
      '',
      '',
      false,
      'ASISTENTE',
      false,
      false,
      'NINGUNA',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
  `
  return CANONICAL_CONSUMIDOR_FINAL_ID
}

/**
 * Devuelve true si el clienteId corresponde al cliente canónico para
 * ventas anónimas.
 */
export function isConsumidorFinalCanonical(clienteId: string | null | undefined): boolean {
  return clienteId === CANONICAL_CONSUMIDOR_FINAL_ID
}

export type AnonymousClientDisplayVariant = 'short' | 'medium' | 'long' | 'label'

/**
 * Devuelve un nombre legible para el cliente canónico en interfaces donde
 * mostrar "Consumidor Final" sería confuso para el usuario.
 *
 * Variantes:
 *  - 'short':  "Venta anónima"
 *  - 'medium': "Venta anónima (Consumidor Final)"
 *  - 'long':   "Venta anónima — no se guarda cliente"
 *  - 'label':  "Anónimo"
 *
 * Si el cliente no es el canónico, devuelve null para que el llamador decida
 * si usa su propio nombre.
 */
export function getAnonymousClientDisplayName(
  clienteId: string | null | undefined,
  variant: AnonymousClientDisplayVariant = 'short',
): string | null {
  if (!isConsumidorFinalCanonical(clienteId)) {
    return null
  }

  switch (variant) {
    case 'short':
      return 'Venta anónima'
    case 'medium':
      return 'Venta anónima (Consumidor Final)'
    case 'long':
      return 'Venta anónima — no se guarda cliente'
    case 'label':
      return 'Anónimo'
    default:
      return 'Venta anónima'
  }
}
