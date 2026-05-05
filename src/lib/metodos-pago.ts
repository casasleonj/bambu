export interface MetodoPago {
  id: string
  nombre: string
  emoji: string
}

export const METODOS_PAGO: MetodoPago[] = [
  { id: 'EFECTIVO', nombre: 'Efectivo', emoji: '💵' },
  { id: 'TRANSFERENCIA', nombre: 'Transferencia', emoji: '🏦' },
  { id: 'NEQUI', nombre: 'Nequi', emoji: '📱' },
  { id: 'DAVIPLATA', nombre: 'Daviplata', emoji: '📲' },
  { id: 'BONO', nombre: 'Bono', emoji: '🎫' },
]

export const METODO_PAGO_ICONS: Record<string, string> = {
  EFECTIVO: '💵',
  TRANSFERENCIA: '🏦',
  NEQUI: '📱',
  DAVIPLATA: '📲',
  BONO: '🎫',
}

export const METODOS_PAGO_IDS = METODOS_PAGO.map(m => m.id)
