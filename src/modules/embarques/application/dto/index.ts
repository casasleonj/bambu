/**
 * Embarques Application DTOs.
 *
 * Data Transfer Objects for use case inputs and outputs.
 */

import type { EstadoEmbarqueValue, ProductCode, CapacidadNivel } from '../../domain'

// --- Input DTOs ---

export interface CrearEmbarqueInput {
  trabajadorId: string
  rutaId?: string
  carga: Record<ProductCode, number>
  tipoMoto?: string
  baseDinero: number
  codigoVisita?: string
  obs?: string
  createdById?: string
  verificarStock?: boolean
}

export interface ActualizarEmbarqueInput {
  id: string
  trabajadorId?: string
  rutaId?: string
  horaSalida?: Date
  carga?: Record<ProductCode, number>
  tipoMoto?: string
  baseDinero?: number
  codigoVisita?: string
  obs?: string
}

export interface EnviarEmbarqueInput {
  id: string
}

export interface CancelarEmbarqueInput {
  id: string
}

export interface CerrarEmbarqueInput {
  id: string
  pedidos: Array<{
    pedidoId: string
    entregado: 'COMPLETO' | 'PARCIAL' | 'NO_ENTREGADO'
    productosEntregados?: {
      cPacaAguaEnt: number
      cPacaHieloEnt: number
      cBotellonFabEnt: number
      cBotellonDomEnt: number
      cBolsaAguaEnt: number
      cBolsaHieloEnt: number
    }
    pagos: Array<{ metodo: string; monto: number }>
    preciosReales?: Record<string, number>
    nuevoEmbarqueId?: string
    obs?: string
  }>
  ventasLibres?: Array<{
    clienteId: string
    cPacaAgua: number
    cPacaHielo: number
    cBotellonFab: number
    cBotellonDom: number
    cBolsaAgua: number
    cBolsaHielo: number
    pagos: Array<{ metodo: string; monto: number }>
    obs?: string
  }>
  productosRetorno?: Array<{
    producto: string
    devueltas: number
    cambios: number
    rotas: number
  }>
  gastos?: Array<{
    categoria: string
    nota?: string
    monto: number
  }>
  dineroEntregado?: number
  justificacionDiscrepancia?: string
  obs?: string
}

export interface AutoGenerarEmbarquesInput {
  fecha: Date
  maxUnidades?: number
}

export interface GestionarGastoInput {
  embarqueId: string
  categoria: string
  descripcion: string
  monto: number
  responsable?: string
  notas?: string
  createdById?: string
}

export interface ListarEmbarquesInput {
  fechaDesde?: Date
  fechaHasta?: Date
  estado?: EstadoEmbarqueValue
  trabajadorId?: string
  rutaId?: string
  all?: boolean
}

// --- Output DTOs ---

export interface EmbarqueResumenDTO {
  id: string
  numero: number
  numeroDia: number
  fecha: string
  trabajadorId: string
  trabajadorNombre: string
  rutaId?: string
  rutaNombre?: string
  estado: EstadoEmbarqueValue
  totalUnidades: number
  pesoKg: number
  capacidadKg: number
  capacidadPorcentaje: number
  capacidadNivel: CapacidadNivel
  capacidadLabel: string
  capacidadColor: string
  capacidadIcon: string
  horaSalida?: string
  horaLlegada?: string
  tipoMoto?: string
  baseDinero: number
  dineroEntregado: number
  codigoVisita?: string
  obs?: string
  pedidosCount: number
  gastosCount: number
  totalGastos: number
  createdAt: string
  updatedAt: string
}

export interface EmbarqueDetalleDTO extends EmbarqueResumenDTO {
  productos: Array<{
    id: string
    producto: ProductCode
    cargadas: number
    devueltas: number
    cambios: number
    rotas: number
    entregadas: number
  }>
  gastos: Array<{
    id: string
    categoria: string
    descripcion: string
    monto: number
    responsable?: string
    notas?: string
  }>
  pedidos?: Array<{
    id: string
    numero: number
    clienteId: string
    clienteNombre: string
    estadoEntrega: string
    estado: string
    total: number
    items: Array<{
      producto: string
      cantidad: number
      cantEntrega: number
      precio: number
    }>
    pagos: Array<{
      metodo: string
      monto: number
    }>
  }>
}

export interface CierreResultadoDTO {
  embarqueId: string
  estado: string
  pedidosProcesados: number
  pedidosHijosCreados: Array<{ id: string; numero: number }>
  pedidosActualizados: Array<{ id: string; estado: string }>
  ventasLibresCreadas: number
  discrepanciaTotal: number
  descuentoCreado?: { id: string; monto: number }
  gastosCreados: number
  totalVentas: number
  comision: number
  caja: {
    efectivoEsperado: number
    efectivoReal: number
    diferencia: number
  }
}
