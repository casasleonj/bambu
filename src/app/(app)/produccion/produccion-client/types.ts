export interface StockInicial {
  stockIniAgua: number
  stockIniHielo: number
  ventasAgua: number
  ventasHielo: number
}

export interface FormData {
  trabajadorId: string
  turno: 'MANANA' | 'TARDE' | 'NOCHE'
  conteoAAgua: number
  conteoBAgua: number
  conteoAHielo: number
  conteoBHielo: number
  stockFinFisicoAgua: number
  stockFinFisicoHielo: number
  filtradasAgua: number
  filtradasHielo: number
  rotasAgua: number
  rotasHielo: number
  consumoInternoAgua: number
  consumoInternoHielo: number
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

export interface RepartidorOption {
  id: string
  nombre: string
  comPacaAgua: number
  comPacaHielo: number
}

export interface PreviewData {
  stockIniAgua: number
  stockIniHielo: number
  ventasAgua: number
  ventasHielo: number
  repartidores: RepartidorOption[]
  embarquesAbiertos: boolean
}
