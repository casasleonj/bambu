export interface TramoVolumen {
  cantMin: number
  cantMax: number | null
}

export interface TramoConfig extends TramoVolumen {
  precio: number
}

/**
 * Tramo de precio por volumen que le corresponde a una línea ya guardada.
 *
 * El pedido guarda solo el precio y su origen (`volumen`), no el tramo. Se
 * reconstruye con la tabla vigente (misma regla que `pricing.ts`: el tramo de
 * mayor `cantMin` que cubre la cantidad) y solo se devuelve si el precio de ese
 * tramo (más el sobrecosto de domicilio) coincide con el precio guardado: si la
 * tabla cambió desde entonces, es mejor no mostrar un rango que no es el real.
 */
export function resolverTramoVolumen(
  tramos: TramoConfig[],
  cantidad: number,
  precioGuardado: number,
  sobreCostoDomicilio = 0,
): TramoVolumen | null {
  const candidato = tramos
    .filter((t) => t.cantMin <= cantidad && (t.cantMax === null || t.cantMax >= cantidad))
    .sort((a, b) => b.cantMin - a.cantMin)[0]
  if (!candidato) return null
  const esperado = candidato.precio + sobreCostoDomicilio
  if (Math.abs(esperado - precioGuardado) > 0.005) return null
  return { cantMin: candidato.cantMin, cantMax: candidato.cantMax }
}

/** "4–9 und" · "10 o más und" · "1 und". */
export function formatoTramo(t: TramoVolumen): string {
  if (t.cantMax === null) return `${t.cantMin} o más und`
  if (t.cantMax === t.cantMin) return `${t.cantMin} und`
  return `${t.cantMin}–${t.cantMax} und`
}
