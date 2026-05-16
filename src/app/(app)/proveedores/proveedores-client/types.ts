export interface Proveedor {
  id: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
  tipoProducto?: string
  observaciones?: string
  activo?: boolean
  createdAt?: string
}

export interface ProveedorInsumo {
  id: string
  nombre: string
  unidad: string
  stock: number
  stockMin: number
  precioUnit: number
}

export interface ProveedorCompra {
  id: string
  numero: string
  insumo: { id: string; nombre: string; unidad: string }
  cantidad: number
  montoTotal: number
  fecha: string
}

export interface ProveedorDetail {
  id: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
  tipoProducto?: string
  observaciones?: string
  activo?: boolean
  createdAt?: string
  insumos?: ProveedorInsumo[]
  compras?: ProveedorCompra[]
}

export type ProveedorForm = Omit<Proveedor, 'id' | 'activo' | 'createdAt'>

export interface ProveedoresClientProps {
  initialProveedores: Proveedor[]
}

export type SortBy = 'nombre'
export type SortDir = 'asc' | 'desc'
