const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** «2026-11-04» → «4 nov». Sin zonas horarias: el día ya viene en Bogotá. */
export function diaCorto(dia: string): string {
  const [, m, d] = dia.split('-').map(Number)
  return m >= 1 && m <= 12 && d ? `${d} ${MESES[m - 1]}` : dia
}
