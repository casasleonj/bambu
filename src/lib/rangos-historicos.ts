/** Accesos rápidos para movimientos reales, nunca días futuros. */
export type OpcionHistorica = 'HOY' | 'AYER' | 'SEMANA'

export function rangoHistorico(
  opcion: OpcionHistorica,
  hoyBogota: string,
): { desde: string; hasta: string } {
  // Parsear el día canónico YYYY-MM-DD en UTC evita que la zona del
  // dispositivo convierta lunes en domingo o desplace fechas de negocio.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoyBogota)) {
    throw new Error('Día de Bogotá inválido')
  }
  const hoy = new Date(`${hoyBogota}T12:00:00Z`)
  if (!Number.isFinite(hoy.getTime()) || hoy.toISOString().slice(0, 10) !== hoyBogota) {
    throw new Error('Día de Bogotá inválido')
  }

  const fechaISO = (dia: Date) => dia.toISOString().slice(0, 10)

  if (opcion === 'HOY') return { desde: hoyBogota, hasta: hoyBogota }
  if (opcion === 'AYER') {
    const ayer = new Date(hoy)
    ayer.setUTCDate(ayer.getUTCDate() - 1)
    return { desde: fechaISO(ayer), hasta: fechaISO(ayer) }
  }

  const lunes = new Date(hoy)
  lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7))
  return { desde: fechaISO(lunes), hasta: hoyBogota }
}
