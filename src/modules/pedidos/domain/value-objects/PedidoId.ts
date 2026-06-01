/**
 * PedidoId Value Object.
 *
 * Strongly typed identifier for Pedido entities.
 */

export class PedidoId {
  private constructor(private readonly value: string) {}

  static from(id: string): PedidoId {
    if (typeof id !== 'string') {
      throw new Error('PedidoId inválido')
    }
    return new PedidoId(id)
  }

  get(): string {
    return this.value
  }

  equals(other: PedidoId): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
