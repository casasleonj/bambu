/**
 * Traducción de errores del caso de uso de corrección de precio a HTTP
 * (ADR-MONETARIO-002 §1, ADR-CIERRE-004). Comparte el contrato `CODIGO: texto`.
 */

export interface ErrorHttpCorreccion {
  status: number
  message: string
  code?: string
}

const POR_CODIGO: Record<string, number> = {
  FORBIDDEN: 403,
  PEDIDO_NOT_FOUND: 404,
  CORRECCION_NOT_FOUND: 404,
  LINEA_NO_ENCONTRADA: 404,
  PRECIO_INVALIDO: 400,
  PRECIO_SIN_CAMBIO: 400,
  MOTIVO_REQUERIDO: 400,
  LINEA_SIN_CANTIDAD: 400,
  PEDIDO_NO_CORREGIBLE: 409,
  CORRECCION_PENDIENTE: 409,
  CORRECCION_OBSOLETA: 409,
  PRECIO_GENERARIA_SOBREPAGO: 422,
  EXCEDENTE_SIN_CLIENTE: 422,
  EXCEDENTE_SIN_CONFIRMAR: 422,
}

export function mapCorreccionPrecioError(message: string): ErrorHttpCorreccion | null {
  const sep = message.indexOf(': ')
  const codigo = sep > 0 ? message.slice(0, sep) : message
  const status = POR_CODIGO[codigo]
  if (!status) return null
  const texto = sep > 0 ? message.slice(sep + 2) : codigo
  return { status, message: texto, code: codigo }
}
