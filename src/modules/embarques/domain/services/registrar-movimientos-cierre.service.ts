/**
 * RegistrarMovimientosCierre (FASE FINAL, dual-write §23 — ADR-FISICO-001).
 *
 * Al cerrar un embarque, además de la conciliación legacy (EmbarqueProducto),
 * se escribe el ledger físico canónico (EmbarqueMovimiento): las entregas, las
 * ventas de ruta y los retornos como hechos físicos dirigidos. El efecto se
 * determina por el `tipo`, nunca por el signo de `cantidad` (contrato §8).
 *
 * No inventa datos (§15): solo escribe movimientos para cantidades > 0
 * reportadas en el cierre.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxOrPrisma = any

const PRODUCTOS = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const

export interface PedidoConEntregas {
  cPacaAguaEnt?: number
  cPacaHieloEnt?: number
  cBotellonFabEnt?: number
  cBotellonDomEnt?: number
  cBolsaAguaEnt?: number
  cBolsaHieloEnt?: number
}

export interface VentaLibreConCantidades {
  cPacaAgua?: number
  cPacaHielo?: number
  cBotellonFab?: number
  cBotellonDom?: number
  cBolsaAgua?: number
  cBolsaHielo?: number
}

export interface ProductoRetorno {
  producto: string
  devueltas?: number
  rotas?: number
  cambios?: number
}

export class RegistrarMovimientosCierre {
  /**
   * Escribe los movimientos físicos del cierre. Retorna la cantidad de
   * movimientos creados.
   */
  async execute(
    client: TxOrPrisma,
    input: {
      embarqueId: string
      pedidosRaw: PedidoConEntregas[]
      ventasLibres: VentaLibreConCantidades[]
      productosRetorno: ProductoRetorno[]
    },
  ): Promise<number> {
    let count = 0

    const entregados: Record<string, number> = Object.fromEntries(PRODUCTOS.map((p) => [p, 0]))
    const ventasRuta: Record<string, number> = Object.fromEntries(PRODUCTOS.map((p) => [p, 0]))
    const retornos: Record<string, number> = Object.fromEntries(PRODUCTOS.map((p) => [p, 0]))

    for (const p of input.pedidosRaw) {
      entregados.PACA_AGUA += p.cPacaAguaEnt || 0
      entregados.PACA_HIELO += p.cPacaHieloEnt || 0
      entregados.BOTELLON += (p.cBotellonFabEnt || 0) + (p.cBotellonDomEnt || 0)
      entregados.BOLSA_AGUA += p.cBolsaAguaEnt || 0
      entregados.BOLSA_HIELO += p.cBolsaHieloEnt || 0
    }

    for (const v of input.ventasLibres) {
      ventasRuta.PACA_AGUA += v.cPacaAgua || 0
      ventasRuta.PACA_HIELO += v.cPacaHielo || 0
      ventasRuta.BOTELLON += (v.cBotellonFab || 0) + (v.cBotellonDom || 0)
      ventasRuta.BOLSA_AGUA += v.cBolsaAgua || 0
      ventasRuta.BOLSA_HIELO += v.cBolsaHielo || 0
    }

    for (const pr of input.productosRetorno) {
      if (pr.producto in retornos) {
        retornos[pr.producto] += (pr.devueltas || 0) + (pr.rotas || 0)
      }
    }

    for (const producto of PRODUCTOS) {
      if (entregados[producto] > 0) {
        await client.embarqueMovimiento.create({
          data: {
            embarqueId: input.embarqueId,
            tipo: 'ENTREGA',
            producto,
            cantidad: entregados[producto],
            origen: 'VEHICULO',
            destino: 'CLIENTE',
          },
        })
        count++
      }
      if (ventasRuta[producto] > 0) {
        await client.embarqueMovimiento.create({
          data: {
            embarqueId: input.embarqueId,
            tipo: 'VENTA_RUTA',
            producto,
            cantidad: ventasRuta[producto],
            origen: 'VEHICULO',
            destino: 'CLIENTE',
          },
        })
        count++
      }
      if (retornos[producto] > 0) {
        await client.embarqueMovimiento.create({
          data: {
            embarqueId: input.embarqueId,
            tipo: 'RETORNO',
            producto,
            cantidad: retornos[producto],
            origen: 'VEHICULO',
            destino: 'INSPECCION',
          },
        })
        count++
      }
    }

    return count
  }
}
