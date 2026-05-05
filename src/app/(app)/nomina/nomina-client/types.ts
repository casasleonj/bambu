export interface Nomina {
  id: string
  fechaInicio: string
  fechaFin: string
  comEntregasAgua: number
  comEntregasHielo: number
  totalComisiones: number
  salario: number
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
