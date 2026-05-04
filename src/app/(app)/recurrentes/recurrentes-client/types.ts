export interface Recurrente {
  id: string
  numero: number
  cliente: { id: string; nombre: string; telefono: string }
  frecuencia: string
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  ultimaGeneracion: string | null
  saltarFechas: string[]
  obs: string | null
  _count: { pedidoHijo: number }
}

export interface PreviewItem {
  recurrenteId: string
  clienteNombre: string
  frecuencia: string
  proximaFecha: string
  pedidosPendientes: Array<{
    id: string
    numero: number
    total: number
    cPacaAguaPed: number
    cPacaHieloPed: number
    cBotellonFabPed: number
    cBotellonDomPed: number
    cBolsaAguaPed: number
    cBolsaHieloPed: number
  }>
  sugerencias: Array<{
    tipo: 'NORMAL' | 'CON_PENDIENTES' | 'SOLO_PENDIENTES' | 'SALTAR'
    label: string
    descripcion: string
    totalPacas: number
    totalValor: number
  }>
  saltarFechas: string[]
}
