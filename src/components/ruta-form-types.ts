export interface RutaFormData {
  nombre: string
  dias: string
  repartidorId: string
  repartidorRespaldoId: string
  horarioInicio: string
  horarioFin: string
}

export interface RutaFormProps {
  initialData?: RutaFormData
  rutaId?: string
  onSuccess?: () => void
}

export const DIAS_SEMANA = [
  { key: 'LUN', label: 'Lun' },
  { key: 'MAR', label: 'Mar' },
  { key: 'MIE', label: 'Mie' },
  { key: 'JUE', label: 'Jue' },
  { key: 'VIE', label: 'Vie' },
  { key: 'SAB', label: 'Sab' },
  { key: 'DOM', label: 'Dom' },
]
