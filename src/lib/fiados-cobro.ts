import { z } from 'zod'

export const metodoFiadoSchema = z.enum(['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'BONO'])
export const importeFiadoSchema = z.coerce.number().positive().max(99999999.99)
  .refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, 'Usa hasta dos decimales')
export type MetodoFiado = z.infer<typeof metodoFiadoSchema>
export interface LineaCobroFiado { metodo: MetodoFiado; monto: number }
export interface DeudaFiado {
  id: string; numero: number; fecha: string; total: number; totalPagado: number; saldo: number
  factura: { id: string; numero: string } | null
}
export interface AplicacionFiado {
  pedidoId: string; numero: number; facturaId?: string; facturaNumero?: string
  montoAplicado: number; saldoRestante: number; abonoCreado?: boolean
}
export interface ResultadoCobroFiado {
  referencia: string | null
  clienteId: string
  clienteNombre: string
  registradoAt: string
  recepcion?: { quien: 'OFICINA' | 'REPARTIDOR'; nombre: string; fecha: string }
  pagosAplicados: AplicacionFiado[]
  montoRecibido: number
  montoAplicado: number
  montoSobrante: number
  saldoFavorAcreditado: number
  medios: Array<LineaCobroFiado & { montoAplicado: number; saldoFavor: number; confirmacion: 'REPORTADO' | 'CONFIRMADO' | null }>
  deduped?: boolean
}
export interface PreparacionCobroFiado {
  clienteId: string; clienteNombre: string; version: string; deudaTotal: number
  pedidos: DeudaFiado[]; metodosPorConfirmar: string[]
}

/** El cálculo compartido usa centavos; el servidor vuelve a leer bajo CARTERA. */
export function repartirCobroFiado(pedidos: DeudaFiado[], monto: number) {
  let resto = Math.round(monto * 100)
  const aplicaciones: AplicacionFiado[] = []
  for (const pedido of [...pedidos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero)) {
    if (resto <= 0) break
    const aplicar = Math.min(resto, Math.round(pedido.saldo * 100))
    if (aplicar <= 0) continue
    aplicaciones.push({ pedidoId: pedido.id, numero: pedido.numero,
      facturaId: pedido.factura?.id, facturaNumero: pedido.factura?.numero,
      montoAplicado: aplicar / 100, saldoRestante: (Math.round(pedido.saldo * 100) - aplicar) / 100 })
    resto -= aplicar
  }
  return { aplicaciones, sobrante: resto / 100 }
}

export function sumarCobroFiado(pagos: LineaCobroFiado[]): number {
  return pagos.reduce((sum, pago) => sum + Math.round(pago.monto * 100), 0) / 100
}
