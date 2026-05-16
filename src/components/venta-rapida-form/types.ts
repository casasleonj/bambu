export interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  barrio?: string
}

export interface Tier {
  cantMin: number
  cantMax: number | null
  precio: number
}

export interface VentaRapidaFormProps {
  precios: Record<string, number>
  clientes: Cliente[]
  onSubmit: (data: VentaRapidaData) => void | Promise<void>
}

export interface VentaRapidaItem {
  producto: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO'
  cantidad: number
  precioManual?: number
}

export interface VentaRapidaData {
  clienteId?: string
  clienteNuevo?: { nombre: string; apellido?: string; telefono: string; direccion: string; barrio?: string }
  tipo: 'PUNTO' | 'ENVIO'
  canal: 'PUNTO' | 'DOMICILIO'
  ventaRapida: true
  preciosManuales?: Record<string, number>
  items: VentaRapidaItem[]
  pagos: { metodo: string; monto: number }[]
  obs: string
  total: number
}
