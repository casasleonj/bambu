export interface DeudaPendiente {
  id: string
  tipo: string
  montoOriginal: number
  montoPendiente: number
  plazoNominas: number | null
  porcentajePorNomina: number | null
  fecha: Date
  createdAt: Date
}

export interface DeduccionResult {
  deudaId: string
  monto: number
}

/**
 * Calcula las deducciones de deudas a aplicar en una nómina.
 *
 * Reglas:
 *  - ADELANTO_NOMINA se descuenta 100% (hasta lo disponible), primero.
 *  - El resto se ordena FIFO por fecha/creación.
 *  - Cada deuda respeta plazoNominas (cuota = montoOriginal / plazoNominas)
 *    y porcentajePorNomina (tope = disponible * %).
 *  - Nunca se descuenta más del monto pendiente ni del disponible.
 */
export function calcularDeduccionesDeuda(
  deudas: DeudaPendiente[],
  disponible: number,
): { descuentoDeudas: number; deducciones: DeduccionResult[] } {
  if (disponible <= 0 || deudas.length === 0) {
    return { descuentoDeudas: 0, deducciones: [] }
  }

  const ordenadas = [
    ...deudas.filter((d) => d.tipo === 'ADELANTO_NOMINA'),
    ...deudas
      .filter((d) => d.tipo !== 'ADELANTO_NOMINA')
      .sort((a, b) => {
        const fechaDiff = a.fecha.getTime() - b.fecha.getTime()
        if (fechaDiff !== 0) return fechaDiff
        return a.createdAt.getTime() - b.createdAt.getTime()
      }),
  ]

  let restanteDisponible = disponible
  const deducciones: DeduccionResult[] = []

  for (const deuda of ordenadas) {
    if (restanteDisponible <= 0) break
    const pendiente = deuda.montoPendiente
    if (pendiente <= 0) continue

    let maxDeduccion = pendiente
    if (deuda.tipo !== 'ADELANTO_NOMINA') {
      const topePorcentaje = deuda.porcentajePorNomina
        ? (restanteDisponible * deuda.porcentajePorNomina) / 100
        : Infinity
      const topePlazo = deuda.plazoNominas
        ? deuda.montoOriginal / deuda.plazoNominas
        : Infinity
      maxDeduccion = Math.min(pendiente, topePorcentaje, topePlazo)
    }

    const monto = Math.min(Math.floor(maxDeduccion), restanteDisponible)
    if (monto <= 0) continue

    deducciones.push({ deudaId: deuda.id, monto })
    restanteDisponible -= monto
  }

  const descuentoDeudas = deducciones.reduce((sum, d) => sum + d.monto, 0)
  return { descuentoDeudas, deducciones }
}
