/**
 * Mappers a la forma `PedidoBase` que consume `calcularAlertasCliente`
 * (src/lib/alertas-detector.ts). Puros, sin I/O.
 *  - draftToPedidoBase: el draft del preview (items[] resueltos) → pedido
 *    sintético con id sentinela `__preview__`, estadoEntrega PENDIENTE y
 *    `fecha = now` para que el detector lo trate como el pedido más reciente.
 *  - pedidoEntityToPedidoBase: una entidad de dominio Pedido → PedidoBase,
 *    reutilizando Pedido.toLegacyFields() (que ya hace el split de BOTELLON
 *    por canal) + los getters de numero/total/saldo/fecha/estado.
 */

import type { PedidoBase } from '@/lib/alertas-detector'

interface ResolvedItem {
  producto: string
  cantidad: number
  precio: number
  subtotal: number
  origen: 'manual' | 'cliente' | 'volumen' | 'base'
}

function emptyLegacyCols() {
  return {
    cPacaAguaPed: 0,
    cPacaHieloPed: 0,
    cBotellonFabPed: 0,
    cBotellonDomPed: 0,
    cBolsaAguaPed: 0,
    cBolsaHieloPed: 0,
    precioPacaAgua: 0,
    precioPacaHielo: 0,
    precioBotellonFab: 0,
    precioBotellonDom: 0,
    precioBolsaAgua: 0,
    precioBolsaHielo: 0,
  }
}

export interface DraftToPedidoBaseInput {
  clienteId: string
  canal: 'PUNTO' | 'DOMICILIO'
  resolvedItems: ResolvedItem[]
  total: number
  /** total − totalPagado del draft; 0 si va totalmente pagado. */
  saldo: number
  nowIso: string
}

export function draftToPedidoBase(input: DraftToPedidoBaseInput): PedidoBase {
  const cols = emptyLegacyCols()
  for (const it of input.resolvedItems) {
    switch (it.producto) {
      case 'PACA_AGUA': cols.cPacaAguaPed = it.cantidad; cols.precioPacaAgua = it.precio; break
      case 'PACA_HIELO': cols.cPacaHieloPed = it.cantidad; cols.precioPacaHielo = it.precio; break
      case 'BOTELLON':
        if (input.canal === 'DOMICILIO') { cols.cBotellonDomPed = it.cantidad; cols.precioBotellonDom = it.precio }
        else { cols.cBotellonFabPed = it.cantidad; cols.precioBotellonFab = it.precio }
        break
      case 'BOLSA_AGUA': cols.cBolsaAguaPed = it.cantidad; cols.precioBolsaAgua = it.precio; break
      case 'BOLSA_HIELO': cols.cBolsaHieloPed = it.cantidad; cols.precioBolsaHielo = it.precio; break
    }
  }
  return {
    id: '__preview__',
    numero: 0,
    clienteId: input.clienteId,
    fecha: input.nowIso,
    total: input.total,
    saldo: input.saldo,
    estadoEntrega: 'PENDIENTE',
    estadoPago: 'PENDIENTE',
    items: input.resolvedItems.map(it => ({
      producto: it.producto,
      cantPedido: it.cantidad,
      precio: it.precio,
      precioOrigen: it.origen,
    })),
    ...cols,
  }
}

// Estructura mínima que necesitamos de la entidad Pedido.
interface PedidoEntityLike {
  numero: number
  clienteId: string
  fecha: Date
  total: { toDecimal(): number }
  saldo: { toDecimal(): number }
  estadoEntrega: { get(): string }
  estadoPago: { get(): string }
  toLegacyFields(): Record<string, number>
}

export function pedidoEntityToPedidoBase(p: PedidoEntityLike, id: string): PedidoBase {
  const legacy = p.toLegacyFields()
  const cols = emptyLegacyCols()
  cols.cPacaAguaPed = legacy.cPacaAguaPed ?? 0
  cols.cPacaHieloPed = legacy.cPacaHieloPed ?? 0
  cols.cBotellonFabPed = legacy.cBotellonFabPed ?? 0
  cols.cBotellonDomPed = legacy.cBotellonDomPed ?? 0
  cols.cBolsaAguaPed = legacy.cBolsaAguaPed ?? 0
  cols.cBolsaHieloPed = legacy.cBolsaHieloPed ?? 0
  cols.precioPacaAgua = legacy.precioPacaAgua ?? 0
  cols.precioPacaHielo = legacy.precioPacaHielo ?? 0
  cols.precioBotellonFab = legacy.precioBotellonFab ?? 0
  cols.precioBotellonDom = legacy.precioBotellonDom ?? 0
  cols.precioBolsaAgua = legacy.precioBolsaAgua ?? 0
  cols.precioBolsaHielo = legacy.precioBolsaHielo ?? 0
  return {
    id,
    numero: p.numero,
    clienteId: p.clienteId,
    fecha: p.fecha.toISOString(),
    total: p.total.toDecimal(),
    saldo: p.saldo.toDecimal(),
    estadoEntrega: p.estadoEntrega.get(),
    estadoPago: p.estadoPago.get(),
    ...cols,
  }
}
