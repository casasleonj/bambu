export interface Trabajador {
  id: string
  nombre: string
  rol: string
  tipoPago: string
  usaMoto: boolean
  capacidadKg: number
  comPacaAgua: number
  comPacaHielo: number
  salarioFijo: number
  deudaReposAgua: number
  deudaReposHielo: number
  telefono?: string
  activo: boolean
  createdAt: string
}

export interface TrabajadorFormData {
  nombre: string
  rol: string
  tipoPago: string
  usaMoto: boolean
  capacidadKg: number
  comPacaAgua: number
  comPacaHielo: number
  salarioFijo: number
  telefono: string
}

export const rolOptions = ['SELLADOR', 'REPARTIDOR', 'ADMIN', 'CONTADOR']
export const tipoPagoOptions = ['COMISION', 'FIJO']

export const rolLabels: Record<string, string> = {
  SELLADOR: 'Sellador',
  REPARTIDOR: 'Repartidor',
  ADMIN: 'Administrador',
  CONTADOR: 'Contador',
}

export const tipoPagoLabels: Record<string, string> = {
  COMISION: 'Comision',
  FIJO: 'Fijo',
}

export interface TrabajadoresClientProps {
  initialTrabajadores: Trabajador[]
}
