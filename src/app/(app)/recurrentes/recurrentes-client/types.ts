export interface Recurrente {
  id: string
  activo: boolean
  clienteId: string | null
  negocioId: string | null
  cliente: { id: string; nombre: string; telefono: string } | null
  negocio: { id: string; nombre: string; cliente: { id: string; nombre: string } | null } | null
  cadaNDias: number
  tipo: string
  canal: string
  horaPreferida: string | null
  productos: Record<string, number>
  ultimaGeneracion: string | null
  proxGeneracion: string | null
  saltos: string[]
  pausaHasta: string | null
  notas: string | null
}

export interface PreviewItem {
  recurrenteId: string
  version: string
  negocioId: string | null
  negocioNombre: string | null
  clienteNombre: string
  cadaNDias: number
  proximaFecha: string
  horaPreferida: string | null
  clienteBloqueado: boolean
  esDomingo: boolean
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
  pedidosConDeuda: Array<{
    id: string
    numero: number
    total: number
    saldo: number
    cPacaAguaPed: number
    cPacaHieloPed: number
    cBotellonFabPed: number
    cBotellonDomPed: number
    cBolsaAguaPed: number
    cBolsaHieloPed: number
  }>
  pedidosPagados: Array<{
    id: string
    numero: number
    total: number
    totalPagado: number
    cPacaAguaPed: number
    cPacaHieloPed: number
    cBotellonFabPed: number
    cBotellonDomPed: number
    cBolsaAguaPed: number
    cBolsaHieloPed: number
  }>
  sugerencias: Array<{
    tipo: 'NORMAL' | 'CON_PENDIENTES' | 'SOLO_PENDIENTES' | 'APLICAR_CREDITO' | 'SALTAR'
    label: string
    descripcion: string
    totalPacas: number
    totalValor: number
    disabled?: boolean
    disabledReason?: string
  }>
  saltos: string[]
  cumpleMinimo: boolean
  entregaInsuficiente: boolean
  cantidadBase: Record<string, number>
}
