/**
 * Señales del cierre (ADR-CIERRE-002 §5, #450).
 *
 * Una señal es un AVISO para revisar, no una acusación: nunca bloquea el cierre ni
 * crea deuda. Lógica pura (sin Prisma).
 *
 * Implementadas en la Fase B:
 * - `VENTA_LIBRE_FIADA_COMPENSA_FALTANTE`: una venta libre fiada (queda saldo)
 *   reduce un faltante de mercancía; sin ella la diferencia habría sido mayor.
 * - `SOBRANTE_CAJA_SIN_NOTA`: sobra efectivo en caja por encima del umbral y no hay nota.
 *
 * Fase C (#446, cambios = Σ sustituciones):
 * - `CAMBIO_A_CLIENTE_SIN_PEDIDO`: hubo cambios a un cliente que no tiene pedido en la ruta.
 * - `CAMBIO_SIN_DESTINO`: hay cambios registrados sin cliente ni pedido.
 *
 * La de «pedido corregido a la baja» llega con la reducción comercial (#451).
 */

export type CodigoSenal =
  | 'VENTA_LIBRE_FIADA_COMPENSA_FALTANTE'
  | 'SOBRANTE_CAJA_SIN_NOTA'
  | 'CAMBIO_A_CLIENTE_SIN_PEDIDO'
  | 'CAMBIO_SIN_DESTINO'

export interface SenalCierre {
  codigo: CodigoSenal
  mensaje: string
}

export interface VentaLibreResumen {
  clienteId: string
  /** Lo que quedó a deber (>0 = fiada). */
  saldo: number
  /** Unidades por producto (`PACA_AGUA`, `BOTELLON`…). */
  unidades: Record<string, number>
}

export function calcularSenales(args: {
  /** Discrepancia firmada por producto (>0 faltante, <0 sobrante), con todas las ventas incluidas. */
  discrepanciasPorProducto: Array<{ producto: string; discrepancia: number }>
  ventasLibres: VentaLibreResumen[]
  /** `sobranteFaltante` de la caja: >0 sobra efectivo, <0 falta. */
  sobranteFaltanteCaja: number
  notaCaja?: string
  umbralCaja: number
  /** #446: conteo de sustituciones por destino; ausente = cierre sin cambios derivados. */
  cambios?: { aClienteSinPedido: number; sinDestino: number }
}): SenalCierre[] {
  const senales: SenalCierre[] = []

  // 1. Venta libre fiada que compensa un faltante.
  const fiadas = args.ventasLibres.filter((v) => v.saldo > 0.01)
  if (fiadas.length > 0) {
    const fiadasPorProducto: Record<string, number> = {}
    for (const v of fiadas) {
      for (const [producto, cantidad] of Object.entries(v.unidades)) {
        fiadasPorProducto[producto] = (fiadasPorProducto[producto] ?? 0) + cantidad
      }
    }
    let unidadesCompensadas = 0
    for (const d of args.discrepanciasPorProducto) {
      const fiadasDelProducto = fiadasPorProducto[d.producto] ?? 0
      if (fiadasDelProducto <= 0) continue
      // Faltante con y sin las ventas fiadas: la diferencia es lo que "taparon".
      const faltanteSin = Math.max(0, d.discrepancia + fiadasDelProducto)
      const faltanteCon = Math.max(0, d.discrepancia)
      unidadesCompensadas += faltanteSin - faltanteCon
    }
    if (unidadesCompensadas > 0) {
      senales.push({
        codigo: 'VENTA_LIBRE_FIADA_COMPENSA_FALTANTE',
        mensaje:
          `Hay ventas libres fiadas que compensan ${unidadesCompensadas} unidad(es) de faltante. ` +
          'Confirma que esos clientes recibieron la mercancía.',
      })
    }
  }

  // 2. Sobrante de caja sin explicar.
  if (args.sobranteFaltanteCaja >= args.umbralCaja && !args.notaCaja?.trim()) {
    senales.push({
      codigo: 'SOBRANTE_CAJA_SIN_NOTA',
      mensaje:
        `Sobran ${args.sobranteFaltanteCaja} en caja sin explicar. Puede ser un cobro sin registrar: agrega una nota.`,
    })
  }

  // 3. Cambios (sustituciones) sin pedido en la ruta o sin destino.
  if (args.cambios && args.cambios.aClienteSinPedido > 0) {
    senales.push({
      codigo: 'CAMBIO_A_CLIENTE_SIN_PEDIDO',
      mensaje:
        `${args.cambios.aClienteSinPedido} cambio(s) fueron a un cliente que no tiene pedido en esta ruta. ` +
        'Confirma con el repartidor que la unidad defectuosa se recibió.',
    })
  }
  if (args.cambios && args.cambios.sinDestino > 0) {
    senales.push({
      codigo: 'CAMBIO_SIN_DESTINO',
      mensaje:
        `${args.cambios.sinDestino} cambio(s) no dicen a quién se entregaron. Revisa el tab «Físico» y completa el destino.`,
    })
  }

  return senales
}
