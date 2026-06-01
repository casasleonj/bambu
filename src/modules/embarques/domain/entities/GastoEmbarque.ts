/**
 * GastoEmbarque Entity.
 *
 * Represents an expense incurred during an embarque route.
 */

export interface GastoEmbarqueProps {
  id: string
  embarqueId: string
  categoria: string
  descripcion: string
  monto: number
  responsable?: string
  notas?: string
}

export class GastoEmbarque {
  readonly id: string
  readonly embarqueId: string
  readonly categoria: string
  readonly descripcion: string
  readonly monto: number
  readonly responsable?: string
  readonly notas?: string

  constructor(props: GastoEmbarqueProps) {
    this.id = props.id
    this.embarqueId = props.embarqueId
    this.categoria = props.categoria
    this.descripcion = props.descripcion
    this.monto = Math.max(0, props.monto)
    this.responsable = props.responsable
    this.notas = props.notas
  }

  toJSON(): GastoEmbarqueProps {
    return {
      id: this.id,
      embarqueId: this.embarqueId,
      categoria: this.categoria,
      descripcion: this.descripcion,
      monto: this.monto,
      responsable: this.responsable,
      notas: this.notas,
    }
  }
}
