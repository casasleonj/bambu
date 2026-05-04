export interface PrecioVolumen {
  id: string
  productoId: string
  canal: string
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
  precios: PrecioVolumen[]
}

export interface PreciosClientProps {
  productos: Producto[]
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
  const canalCounts = new Map<string, number>()
  for (const p of precios) {
    canalCounts.set(p.canal, (canalCounts.get(p.canal) || 0) + 1)
  }
  for (const count of canalCounts.values()) {
    if (count > 1) return true
  }
  return false
}
