export interface Insumo {
  id: string
  nombre: string
  unidad: string
  stock: number
  stockMin: number
  precioUnit: number
  proveedor: { id: string; nombre: string } | null
  activo: boolean
}

export interface Proveedor {
  id: string
  nombre: string
}

export interface InsumosClientProps {
  initialInsumos: Insumo[]
  initialProveedores: Proveedor[]
}
