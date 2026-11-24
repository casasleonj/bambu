/**
 * #630 F1-B1b: fecha/hora DECLARADA por el operador de un cierre de embarque.
 * Un día conocido no equivale a las 12:00; no fabricar timestamps para fechas
 * con precisión DIA. Esta declaración jamás modifica la fecha oficial.
 */
export type DeclaracionFechaVentaLibre = {
  precision: 'DIA' | 'INSTANTE'
  fecha: string // calendario local de Colombia, YYYY-MM-DD
  hora?: string // HH:mm sólo para precisión INSTANTE
}

const DIAS_UTC_MINUS_5 = 5 * 60 * 60 * 1000

/** No usar la zona horaria del navegador ni locale dependiente de ICU. */
export const diaColombia = (instante: Date): string =>
  new Date(instante.getTime() - DIAS_UTC_MINUS_5).toISOString().slice(0, 10)

const fechaCalendarioValida = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T12:00:00Z')
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Retorna error de negocio, o null si es declaración plausible. */
export function errorDeclaracionFechaVentaLibre(
  valor: DeclaracionFechaVentaLibre | undefined,
  ahora = new Date(),
): string | null {
  if (!valor) return null // "No conozco" no bloquea ningún cierre.
  if (!fechaCalendarioValida(valor.fecha)) return 'Escribe una fecha de calendario válida.'
  if (valor.fecha > diaColombia(ahora)) return 'La fecha declarada no puede estar en el futuro.'
  if (valor.precision === 'DIA') {
    if (valor.hora !== undefined) return 'Una fecha sin hora no debe declarar una hora precisa.'
    return null
  }
  if (valor.precision !== 'INSTANTE' ||
      !valor.hora || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(valor.hora)) {
    return 'Selecciona una hora válida entre 00:00 y 23:59.'
  }
  // Colombia no utiliza horario de verano. Usar la fecha local correcta UTC-05.
  const declarado = new Date(valor.fecha + 'T' + valor.hora + ':00-05:00')
  if (!Number.isFinite(declarado.getTime()) || declarado > ahora) {
    return 'La hora declarada no puede ser posterior al momento del cierre.'
  }
  return null
}

/** Metadatos de auditoría, sin instantáneo falso ni lectura como ENTREGA. */
export function metadataDeclaracionFechaVentaLibre(
  valor: DeclaracionFechaVentaLibre,
  embarqueId: string,
  registradaEn: Date,
) {
  return {
    version: 1,
    evento: 'DECLARACION_FECHA_VENTA_LIBRE_630',
    fuente: 'OPERADOR_CIERRE_EMBARQUE',
    estado: 'DECLARADA_NO_CERTIFICADA',
    embarqueId,
    precision: valor.precision,
    fechaDeclarada: valor.fecha,
    horaDeclarada: valor.precision === 'INSTANTE' ? valor.hora : null,
    registradaEn: registradaEn.toISOString(),
  }
}
