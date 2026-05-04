export interface Proveedor {
  id: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
  activo?: boolean
}

export type ProveedorForm = Omit<Proveedor, 'id' | 'activo'>

export interface ProveedoresClientProps {
  initialProveedores: Proveedor[]
}
