export interface Proveedor {
  id: string
  nombre: string
}

export interface Insumo {
  id: string
  nombre: string
  unidad: string
}

export interface CompraInsumo {
  id: string
  numero: string
  proveedorId: string
  proveedor: Proveedor
  insumoId: string
  insumo: Insumo
  cantidad: number
  montoTotal: number
  fecha: string
}
