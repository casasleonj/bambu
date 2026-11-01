/**
 * Traducción de errores del caso de uso de reducción comercial a HTTP
 * (#451, ADR-REDUCCION-COMERCIAL-001). Comparte el contrato `CODIGO: texto`.
 */

export interface ErrorHttpReduccion {
  status: number
  message: string
  code?: string
}

const POR_CODIGO: Record<string, number> = {
  FORBIDDEN: 403,
  PEDIDO_NOT_FOUND: 404,
  REDUCCION_NOT_FOUND: 404,
  LINEA_NOT_FOUND: 404,
  LINEA_NO_ENCONTRADA: 404,
  CANTIDAD_INVALIDA: 400,
  PRECIO_INVALIDO: 400,
  MOTIVO_REQUERIDO: 400,
  CONSENTIMIENTO_REQUERIDO: 400,
  REDUCCION_SOBRE_ENTREGADO: 409,
  REDUCCION_TOTAL: 409,
  PEDIDO_NO_REDUCIBLE: 409,
  REDUCCION_PENDIENTE: 409,
  REDUCCION_OBSOLETA: 409,
  REDUCCION_GENERARIA_SOBREPAGO: 422,
  EXCEDENTE_SIN_CLIENTE: 422,
  EXCEDENTE_SIN_CONFIRMAR: 422,
}

export function mapReduccionComercialError(message: string): ErrorHttpReduccion | null {
  const sep = message.indexOf(': ')
  const codigo = sep > 0 ? message.slice(0, sep) : message
  const status = POR_CODIGO[codigo]
  if (!status) return null
  const texto = sep > 0 ? message.slice(sep + 2) : codigo
  return { status, message: texto, code: codigo }
}
