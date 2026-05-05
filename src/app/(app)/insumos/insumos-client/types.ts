export interface Insumo {
  id: string
  nombre: string
  unidad: string
  stock: number
  stockMin: number
  precioUnit: number
  proveedor: { nombre: string } | null
}

export interface Proveedor {
  id: string
  nombre: string
}

export interface InsumosClientProps {
  initialInsumos: Insumo[]
  initialProveedores: Proveedor[]
}
