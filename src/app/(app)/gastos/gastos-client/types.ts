export interface Gasto {
  id: string
  categoria: string
  descripcion: string
  monto: number
  responsable: string | null
  fecha: string
}

// #641: NOMINA no se ofrece al registrar un gasto: los pagos al personal van por «Pagar» en Nómina.
export const categorias = [
  'ARRIENDO',
  'SERVICIOS',
  'INSUMOS',
  'MANTENIMIENTO',
  'TRANSPORTE',
  'OTRO',
]

/** #641: aviso suave si la descripción parece un pago a una persona del equipo (no bloquea). */
export const PARECE_PAGO_PERSONAL = /\b(pago a|pagu[eé] a|nómina|nomina|sueldo|salario|comisi[oó]n|quincena)\b/i
