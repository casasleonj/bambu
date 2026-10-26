// TEMPORAL-SIN-EMBARQUE(#472): lógica pura de «quién recibió el dinero y cuándo»
// al cobrar un fiado. Sin React ni red. El SERVIDOR es la autoridad de las reglas
// (`POST /api/pedidos/pagar-fiado`); aquí solo se anticipan con mensajes sencillos.
import { DIAS_MAX_ATRAS, hoyBogota, sumarDias, type QuienRecibio } from './logica'

export interface DatosCobroOficina {
  /** `null` = todavía sin elegir (no viene marcado, para evitar errores). */
  quien: QuienRecibio | null
  repartidorId: string
  /** YYYY-MM-DD (calendario de Bogotá). */
  fecha: string
}

export type ErroresCobro = Partial<Record<'quien' | 'repartidor' | 'fecha', string>>

export function datosCobroIniciales(ahora: Date = new Date()): DatosCobroOficina {
  return { quien: null, repartidorId: '', fecha: hoyBogota(ahora) }
}

export function validarCobro(d: DatosCobroOficina, ahora: Date = new Date()): ErroresCobro {
  const e: ErroresCobro = {}
  const hoy = hoyBogota(ahora)
  if (!d.quien) e.quien = 'Indica quién recibió el dinero.'
  else if (d.quien === 'REPARTIDOR' && !d.repartidorId) e.repartidor = 'Elige qué repartidor recibió el dinero.'
  if (d.fecha > hoy) e.fecha = 'La fecha en que se recibió el dinero no puede ser futura.'
  else if (d.fecha < sumarDias(hoy, -DIAS_MAX_ATRAS)) e.fecha = `Solo se puede registrar un cobro de hasta ${DIAS_MAX_ATRAS} días atrás.`
  return e
}

export const hayErroresCobro = (e: ErroresCobro): boolean => Object.keys(e).length > 0

/** Campos que se suman al cuerpo de `POST /api/pedidos/pagar-fiado`. */
export function camposCobro(d: DatosCobroOficina, ahora: Date = new Date()) {
  const hoy = hoyBogota(ahora)
  return {
    recibioDinero: d.quien as QuienRecibio,
    ...(d.quien === 'REPARTIDOR' && d.repartidorId ? { repartidorId: d.repartidorId } : {}),
    // Hoy = el instante actual (no se envía); otro día = mediodía de Bogotá (sin saltos de día por zona horaria).
    ...(d.fecha !== hoy ? { fechaRecepcion: `${d.fecha}T17:00:00.000Z` } : {}),
  }
}
