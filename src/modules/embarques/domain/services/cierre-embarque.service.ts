/**
 * CierreEmbarque Domain Service.
 *
 * Encapsulates the business logic for closing an embarque:
 * - Conciliation of products (loaded vs delivered vs returned vs broken)
 * - Discrepancy calculation
 * - Commission calculation
 * - Cash reconciliation
 *
 * Pure domain logic — no infrastructure dependencies.
 */

import { Carga, ProductCode } from '../value-objects/Carga'

export interface ProductoConciliacion {
  producto: ProductCode
  cargadas: number
  entregadas: number
  devueltas: number
  cambios: number
  rotas: number
  discrepancia: number
}

export interface DiscrepanciaResult {
  totalDiscrepancia: number
  discrepanciasPorProducto: ProductoConciliacion[]
  justificado: boolean
  justificacion?: string
}

export interface ComisionResult {
  base: number
  tasa: number
  monto: number
}

export interface CajaResult {
  efectivoEsperado: number
  efectivoReal: number
  diferencia: number
  otrosPagos: number
}

export class CierreEmbarqueService {
  /**
   * Tasa de comision para repartidores (5%).
   */
  private readonly TASA_COMISION = 0.05

  /**
   * Tolerancia de pagos: 1% sobre el total.
   */
  private readonly TOLERANCIA_PAGOS = 0.01

  /**
   * Concilia productos cargados vs entregados.
   */
  conciliarProductos(
    carga: Carga,
    productosEntregados: Record<ProductCode, { entregadas: number; devueltas: number; cambios: number; rotas: number }>,
  ): ProductoConciliacion[] {
    const productos: ProductCode[] = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']

    return productos.map((producto) => {
      const cargadas = carga.get(producto)
      const entregado = productosEntregados[producto] ?? { entregadas: 0, devueltas: 0, cambios: 0, rotas: 0 }

      const discrepancia = cargadas - entregado.entregadas - entregado.devueltas - entregado.cambios - entregado.rotas

      return {
        producto,
        cargadas,
        entregadas: entregado.entregadas,
        devueltas: entregado.devueltas,
        cambios: entregado.cambios,
        rotas: entregado.rotas,
        discrepancia,
      }
    })
  }

  /**
   * Calcula discrepancias totales y determina si requiere descuento.
   */
  calcularDiscrepancia(
    conciliacion: ProductoConciliacion[],
    justificado: boolean = false,
    justificacion?: string,
  ): DiscrepanciaResult {
    const totalDiscrepancia = conciliacion.reduce((sum, p) => sum + Math.max(0, p.discrepancia), 0)

    return {
      totalDiscrepancia,
      discrepanciasPorProducto: conciliacion,
      justificado,
      justificacion,
    }
  }

  /**
   * Calcula la comision del repartidor sobre ventas efectivas.
   */
  calcularComision(totalVentas: number): ComisionResult {
    return {
      base: totalVentas,
      tasa: this.TASA_COMISION,
      monto: totalVentas * this.TASA_COMISION,
    }
  }

  /**
   * Reconcilia caja: efectivo esperado vs efectivo real.
   * efectivoReal = baseDinero + totalVentas - otrosPagos - gastos
   * La baseDinero es la base inicial de efectivo que el repartidor recibe
   * al salir a la ruta — DEBE incluirse en el efectivo que retorna.
   * Bug C-4: la versión anterior ignoraba _baseDinero (parámetro con
   * underscore indicando "no usado"), lo que subestimaba sistemáticamente
   * el efectivo esperado por el monto de la base.
   */
  calcularCaja(
    totalVentas: number,
    pagosRecibidos: Array<{ metodo: string; monto: number }>,
    baseDinero: number,
    gastos: number,
  ): CajaResult {
    const efectivoEsperado = pagosRecibidos
      .filter((p) => p.metodo === 'EFECTIVO')
      .reduce((sum, p) => sum + p.monto, 0)

    const otrosPagos = pagosRecibidos
      .filter((p) => p.metodo !== 'EFECTIVO')
      .reduce((sum, p) => sum + p.monto, 0)

    // FIX C-4: incluir baseDinero en efectivoReal.
    // El repartidor sale con base + cobra ventas - paga gastos.
    // Si no contamos la base, el sistema cree que le falta dinero.
    const efectivoReal = baseDinero + totalVentas - otrosPagos - gastos

    return {
      efectivoEsperado,
      efectivoReal,
      diferencia: efectivoEsperado - efectivoReal,
      otrosPagos,
    }
  }

  /**
   * Valida que los pagos no excedan el total (con tolerancia del 1%).
   */
  validarPagos(totalVentas: number, totalPagos: number): { valid: boolean; error?: string } {
    const maxPermitido = totalVentas * (1 + this.TOLERANCIA_PAGOS)
    if (totalPagos > maxPermitido) {
      return {
        valid: false,
        error: `Los pagos (${totalPagos}) exceden el total de ventas (${totalVentas}) con tolerancia del 1%`,
      }
    }
    return { valid: true }
  }
}
