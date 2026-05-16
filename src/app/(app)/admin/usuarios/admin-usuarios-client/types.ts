export interface AdminUser {
  id: string
  username: string
  nombre: string
  apellido: string
  rol: string
  activo: boolean
  createdAt: string
  trabajador?: { nombre: string } | null
}

export const ROL_OPTIONS = ['ADMIN', 'ASISTENTE', 'CONTADOR', 'REPARTIDOR', 'SELLADOR']

export const ROL_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  ASISTENTE: 'Asistente',
  CONTADOR: 'Contador',
  REPARTIDOR: 'Repartidor',
  SELLADOR: 'Sellador',
}

export const ROL_COLORS: Record<string, string> = {
  ADMIN: 'bg-yellow-100 text-yellow-800',
  ASISTENTE: 'bg-green-100 text-green-800',
  CONTADOR: 'bg-purple-100 text-purple-800',
  REPARTIDOR: 'bg-orange-100 text-orange-800',
  SELLADOR: 'bg-blue-100 text-blue-800',
}
