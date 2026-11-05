export interface StockInicial {
  stockIniAgua: number
  stockIniHielo: number
  ventasAgua: number
  ventasHielo: number
}

export interface FormData {
  trabajadorId: string
  turno: 'MANANA' | 'TARDE' | 'NOCHE' | 'JORNADA'
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
  /** #645: botellones llenados (se digitan; llenados ≠ vendidos) */
  botellonesLlenados: number
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
  entregasAgua: number
  entregasHielo: number
}

export interface PreviewData {
  stockIniAgua: number
  stockIniHielo: number
  ventasAgua: number
  ventasHielo: number
  repartidores: RepartidorOption[]
  embarquesAbiertos: boolean
}

export interface ProduccionItem {
  id: string
  producto: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON'
  conteoA: number
  conteoB: number
  producido: number
  stockIni: number
  ventas: number
  stockFinEsperado: number
  stockFinFisico: number
  diferencia: number
  filtradas: number
  rotas: number
  consumoInterno: number
}

export interface ProduccionRegistro {
  id: string
  fecha: string
  turno: 'MANANA' | 'TARDE' | 'NOCHE' | 'JORNADA'
  trabajadorId: string
  trabajador: { id: string; nombre: string }
  obs: string | null
  items: ProduccionItem[]
}

export const TURNO_LABEL: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', NOCHE: 'Noche', JORNADA: 'Jornada completa' }
