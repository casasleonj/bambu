export interface StockInicial {
  stockIniAgua: number
  stockIniHielo: number
}

export interface FormData {
  trabajadorId: string
  turno: 'MANANA' | 'TARDE' | 'NOCHE'
  conteoAAgua: number
  conteoBAgua: number
  conteoAHielo: number
  conteoBHielo: number
  obs: string
}

export interface TrabajadorOption {
  id: string
  nombre: string
  comPacaAgua: number
  comPacaHielo: number
  tipoPago: string
  salarioFijo: number
}
