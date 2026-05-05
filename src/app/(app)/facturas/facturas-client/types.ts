export interface Factura {
  id: string
  numero: string
  fecha: string
  total: number
  saldo: number
  estado: string
  cliente?: {
    id: string
    nombre: string
    telefono: string
  }
}

export interface Abono {
  id: string
  numero: string
  monto: number
  metodoPago: string
  fecha: string
}
