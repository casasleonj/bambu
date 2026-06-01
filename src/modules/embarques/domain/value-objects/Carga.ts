/**
 * Carga Value Object.
 *
 * Represents the product quantities loaded onto an embarque.
 * Immutable — creates new instances on modification.
 */

export const PRODUCT_CODES = [
  'PACA_AGUA',
  'PACA_HIELO',
  'BOTELLON',
  'BOLSA_AGUA',
  'BOLSA_HIELO',
] as const

export type ProductCode = (typeof PRODUCT_CODES)[number]

export interface CargaData {
  PACA_AGUA: number
  PACA_HIELO: number
  BOTELLON: number
  BOLSA_AGUA: number
  BOLSA_HIELO: number
}

export class Carga {
  readonly PACA_AGUA: number
  readonly PACA_HIELO: number
  readonly BOTELLON: number
  readonly BOLSA_AGUA: number
  readonly BOLSA_HIELO: number

  constructor(data: CargaData) {
    this.PACA_AGUA = Math.max(0, data.PACA_AGUA ?? 0)
    this.PACA_HIELO = Math.max(0, data.PACA_HIELO ?? 0)
    this.BOTELLON = Math.max(0, data.BOTELLON ?? 0)
    this.BOLSA_AGUA = Math.max(0, data.BOLSA_AGUA ?? 0)
    this.BOLSA_HIELO = Math.max(0, data.BOLSA_HIELO ?? 0)
  }

  static empty(): Carga {
    return new Carga({
      PACA_AGUA: 0,
      PACA_HIELO: 0,
      BOTELLON: 0,
      BOLSA_AGUA: 0,
      BOLSA_HIELO: 0,
    })
  }

  /**
   * Returns total units across all products.
   */
  totalUnidades(): number {
    return (
      this.PACA_AGUA +
      this.PACA_HIELO +
      this.BOTELLON +
      this.BOLSA_AGUA +
      this.BOLSA_HIELO
    )
  }

  /**
   * Returns total weight in KG based on actual product weights.
   */
  pesoKg(): number {
    return (
      this.PACA_AGUA * PESOS_KG.PACA_AGUA +
      this.PACA_HIELO * PESOS_KG.PACA_HIELO +
      this.BOTELLON * PESOS_KG.BOTELLON +
      this.BOLSA_AGUA * PESOS_KG.BOLSA_AGUA +
      this.BOLSA_HIELO * PESOS_KG.BOLSA_HIELO
    )
  }

  /**
   * Returns quantity for a specific product code.
   */
  get(product: ProductCode): number {
    return this[product] ?? 0
  }

  /**
   * Returns a new Carga with the updated product quantity.
   */
  withProduct(product: ProductCode, quantity: number): Carga {
    return new Carga({
      ...this.toJSON(),
      [product]: quantity,
    })
  }

  /**
   * Returns true if all quantities are zero.
   */
  isEmpty(): boolean {
    return this.totalUnidades() === 0
  }

  /**
   * Converts to a plain object for serialization.
   */
  toJSON(): CargaData {
    return {
      PACA_AGUA: this.PACA_AGUA,
      PACA_HIELO: this.PACA_HIELO,
      BOTELLON: this.BOTELLON,
      BOLSA_AGUA: this.BOLSA_AGUA,
      BOLSA_HIELO: this.BOLSA_HIELO,
    }
  }

  equals(other: Carga): boolean {
    return (
      this.PACA_AGUA === other.PACA_AGUA &&
      this.PACA_HIELO === other.PACA_HIELO &&
      this.BOTELLON === other.BOTELLON &&
      this.BOLSA_AGUA === other.BOLSA_AGUA &&
      this.BOLSA_HIELO === other.BOLSA_HIELO
    )
  }
}

/**
 * Real weights per product unit (in KG).
 * Based on actual measurements.
 */
export const PESOS_KG = {
  PACA_AGUA: 10.0,
  PACA_HIELO: 11.0,
  BOTELLON: 20.0,
  BOLSA_AGUA: 0.25,
  BOLSA_HIELO: 0.55,
} as const
