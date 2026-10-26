export interface Nomina {
  id: string
  trabajadorId: string
  fechaInicio: string
  fechaFin: string
  entregasAgua: number
  entregasHielo: number
  entregasBotellon: number
  comEntregasAgua: number
  comEntregasHielo: number
  comEntregasBotellon: number
  totalComisiones: number
  salario: number
  descuentoDeudas: number
  /** #499: comisión ya pagada de la caja día a día; el `total` viene sin ella. */
  comisionPagadaCaja?: number
  total: number
  estado: string
  trabajador: {
    nombre: string
    rol: string
  }
}

export interface Trabajador {
  id: string
  nombre: string
  rol: string
}
