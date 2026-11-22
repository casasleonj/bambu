/** Días de negocio: texto DD/MM/AAAA para usuarios y YYYY-MM-DD para APIs. */
const PATRON_ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const PATRON_CO = /^(\d{2})\/(\d{2})\/(\d{4})$/

export function mostrarDiaColombia(fechaISO: string): string {
  const match = PATRON_ISO.exec(fechaISO)
  if (!match) return ''
  return `${match[3]}/${match[2]}/${match[1]}`
}

/** Devuelve null si la fecha no existe (incluidos 29/02 no bisiestos). */
export function interpretarDiaColombia(texto: string): string | null {
  const match = PATRON_CO.exec(texto.trim())
  if (!match) return null
  const [, dia, mes, anno] = match
  const iso = `${anno}-${mes}-${dia}`
  const fecha = new Date(`${iso}T12:00:00-05:00`)
  if (!Number.isFinite(fecha.getTime())) return null
  return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) === iso ? iso : null
}

/** Fechas con hora: nunca depender de la zona configurada en el dispositivo. */
export function mostrarInstanteBogota(fechaISO: string): string {
  const instante = new Date(fechaISO)
  if (!Number.isFinite(instante.getTime())) return ''
  return instante.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  })
}
