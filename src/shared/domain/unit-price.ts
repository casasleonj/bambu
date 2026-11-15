import { Money } from './value-objects'

/** #795: un precio puede tener más precisión que el importe que se cobra.
 * Se conserva en millonésimas; solo el producto final se redondea a centavos.
 * Ocho dígitos enteros conservan el rango anterior de Decimal(10, 2).
 */
export const UNIT_PRICE_DECIMALS = 6
export const MAX_UNIT_PRICE = 99_999_999.999999
const SCALE = BigInt(1_000_000)
const MICROS_PER_CENT = BigInt(10_000)

export class UnitPrice {
  private constructor(private readonly micros: bigint) {}

  static fromDecimal(value: number | string): UnitPrice {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number) || number < 0 || number > MAX_UNIT_PRICE ||
        (typeof value === 'string' && !/^\d+(?:\.\d{1,6})?$/.test(value))) {
      throw new Error('PRECIO_INVALIDO: usa un precio positivo con hasta 6 decimales.')
    }
    const canonical = typeof value === 'number' ? value.toFixed(UNIT_PRICE_DECIMALS) : value
    if (Number(canonical) !== number) {
      throw new Error('PRECIO_INVALIDO: el precio admite hasta 6 decimales.')
    }
    const [whole, decimals = ''] = canonical.split('.')
    return new UnitPrice(BigInt(whole) * SCALE + BigInt(decimals.padEnd(UNIT_PRICE_DECIMALS, '0')))
  }

  toDecimal(): number {
    return Number(this.micros) / Number(SCALE)
  }

  toJSON(): number {
    return this.toDecimal()
  }

  add(other: UnitPrice): UnitPrice {
    const sum = this.micros + other.micros
    if (sum >= BigInt(100_000_000) * SCALE) throw new Error('PRECIO_INVALIDO: el precio excede el rango admitido.')
    return new UnitPrice(sum)
  }

  /** Redondeo de media unidad hacia arriba sobre valores no negativos. */
  total(cantidad: number): Money {
    if (!Number.isSafeInteger(cantidad) || cantidad < 0) {
      throw new Error('CANTIDAD_INVALIDA: la cantidad debe ser un entero no negativo.')
    }
    const cents = (this.micros * BigInt(cantidad) + MICROS_PER_CENT / BigInt(2)) / MICROS_PER_CENT
    if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('IMPORTE_FUERA_DE_RANGO: el importe excede la precisión monetaria admitida.')
    }
    return new Money(Number(cents))
  }
}

/** Para lectores Prisma/JSON; nunca redondea el precio antes de multiplicar. */
export function importeLineaCentavos(precio: unknown, cantidad: number): number {
  return UnitPrice.fromDecimal(Number(precio ?? 0)).total(cantidad).cents
}

export function importeLinea(precio: unknown, cantidad: number): number {
  return importeLineaCentavos(precio, cantidad) / 100
}

/** El último parcial absorbe solo el redondeo de su propia línea. */
export function importeEntregaCentavos(precio: unknown, cantidad: number, cantidadPrevia = 0): number {
  return importeLineaCentavos(precio, cantidadPrevia + cantidad) - importeLineaCentavos(precio, cantidadPrevia)
}

export function sumarPreciosUnitarios(precio: number, recargo: number): number {
  return UnitPrice.fromDecimal(precio).add(UnitPrice.fromDecimal(recargo)).toDecimal()
}
