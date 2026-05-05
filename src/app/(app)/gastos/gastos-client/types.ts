export interface Gasto {
  id: string
  categoria: string
  descripcion: string
  monto: number
  responsable: string | null
  fecha: string
}

export const categorias = [
  'ARRIENDO',
  'SERVICIOS',
  'INSUMOS',
  'MANTENIMIENTO',
  'TRANSPORTE',
  'NOMINA',
  'OTRO',
]
