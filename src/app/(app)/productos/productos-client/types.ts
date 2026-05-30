export interface PrecioVolumen {
  id: string
  productoId: string
  cantMin: number
  cantMax: number | null
  precio: string | number
  activo: boolean
}

export interface Producto {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  unidad: string
  contenido: string | null
  aplicaDomicilio: boolean
  sobreCostoDomicilio: string | number
  precioBase: string | number
  precios: PrecioVolumen[]
  preciosInactivos?: PrecioVolumen[]
}

export interface PreciosClientProps {
  productos: Producto[]
  isAdmin?: boolean
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function tierLabel(cantMin: number, cantMax: number | null): string {
  if (cantMax === null) return `${cantMin}+`
  if (cantMin === cantMax) return `${cantMin}`
  return `${cantMin}-${cantMax}`
}

export function hasVolumeTiers(precios: PrecioVolumen[]): boolean {
  return precios.length > 1
}
