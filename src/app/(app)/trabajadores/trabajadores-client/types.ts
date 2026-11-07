export type FrecuenciaPago = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'FECHAS'

export interface Trabajador {
  id: string
  nombre: string
  rol: string
  tipoPago: string
  usaMoto: boolean
  capacidadKg: number
  comPacaAgua: number
  comPacaHielo: number
  comBotellon: number
  comRepartAgua: number
  comRepartHielo: number
  comRepartBotellon: number
  salarioFijo: number
  /** #644: cada cuánto se paga el sueldo fijo (null = una vez por nómina) */
  frecuenciaPago?: FrecuenciaPago | null
  diasPago?: number[]
  pagoFueraDeCaja?: boolean
  deudaReposAgua: number
  deudaReposHielo: number
  telefono?: string
  activo: boolean
  createdAt: string
  /** #566: number = saldo (0 sin deuda), null = no se pudo calcular, undefined = el rol no ve deudas */
  deudaPendiente?: number | null
}

export interface TrabajadorFormData {
  nombre: string
  rol: string
  tipoPago: string
  usaMoto: boolean
  capacidadKg: number
  comPacaAgua: number
  comPacaHielo: number
  comBotellon: number
  comRepartAgua: number
  comRepartHielo: number
  comRepartBotellon: number
  salarioFijo: number
  frecuenciaPago: FrecuenciaPago | null
  diasPago: number[]
  pagoFueraDeCaja: boolean
  telefono: string
}

export const rolOptions = ['SELLADOR', 'REPARTIDOR', 'ADMIN', 'CONTADOR']
export const tipoPagoOptions = ['COMISION', 'FIJO', 'MIXTO']

export const rolLabels: Record<string, string> = {
  SELLADOR: 'Sellador',
  REPARTIDOR: 'Repartidor',
  ADMIN: 'Administrador',
  CONTADOR: 'Contador',
}

export const tipoPagoLabels: Record<string, string> = {
  COMISION: 'Comision',
  FIJO: 'Fijo',
  MIXTO: 'Mixto',
}

export interface TrabajadoresClientProps {
  initialTrabajadores: Trabajador[]
  /** Sin crear, editar ni desactivar (todo rol que no sea ADMIN). */
  soloLectura?: boolean
}

export const frecuenciaLabels: Record<FrecuenciaPago, string> = {
  SEMANAL: 'Cada semana',
  QUINCENAL: 'Cada quincena (días 15 y último)',
  MENSUAL: 'Una vez al mes',
  FECHAS: 'En fechas que yo elija',
}

export const diasSemanaLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
