import type { Prisma } from '@prisma/client'
import type { ProductCode } from '@/shared/domain'
import { importeEntregaCentavos } from '@/shared/domain/unit-price'
import { detalleUnidadesEntregadasDelDia, type UnidadEntregadaDetalle, type UnidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'

export interface VentaPorPrecio {
  producto: ProductCode
  canal: 'PUNTO' | 'DOMICILIO'
  precio: number
  cantidad: number
  subtotal: number
}

type Db = Pick<Prisma.TransactionClient, 'pedido' | 'historial' | 'embarqueMovimiento'>
type PedidoPrecio = {
  id: string
  canal: string | null
  origen?: string
  items: { producto: string; precio: unknown; cantEntrega?: number }[]
  /** Only set when all currently delivered units belong to this period and the order is complete. */
  totalCompleto?: number
}

export interface VentaEntregadaPedido {
  pedidoId: string
  origen: string
  centavos: number
  valorDeterminado: boolean
}
export interface VentasEntregadasDia {
  unidades: UnidadesEntregadasDelDia
  desglose: VentaPorPrecio[]
  total: number
  sinPrecio: number
}

const precioValido = (precio: unknown): precio is number =>
  typeof precio === 'number' && Number.isFinite(precio) && precio >= 0 && precio <= 99_999_999.999999 &&
  Number(precio.toFixed(6)) === precio
const numeroPrecio = (precio: unknown) => precio == null ? NaN : Number(precio)

/**
 * #883: periodo de cumplimiento físico, no de creación ni de pago.
 * Valorar al precio comercial vigente, conservando la semántica anterior.
 * No deducir el precio a partir de cobros. Si una entrega parcial admite varias
 * tarifas y no hay asignación por línea, conservar sus unidades como sin precio.
 */
export function valorarEntregasDia(
  detalle: UnidadEntregadaDetalle[],
  pedidos: PedidoPrecio[],
): Pick<VentasEntregadasDia, 'desglose' | 'total' | 'sinPrecio'> & { porPedido: VentaEntregadaPedido[] } {
  const porPedido = new Map(pedidos.map(p => [p.id, p]))
  const entregas = new Map<string, UnidadEntregadaDetalle[]>()
  for (const l of detalle) {
    if (l.cantidad <= 0) continue
    const key = JSON.stringify([l.pedidoId, l.producto])
    const grupo = entregas.get(key) ?? []
    grupo.push(l)
    entregas.set(key, grupo)
  }
  const grupos = new Map<string, VentaPorPrecio>()
  const valorPorPedido = new Map<string, number>()
  let sinPrecio = 0
  const sinValor = new Set<string>()

  function agregar(pedido: PedidoPrecio, producto: string, precio: number, cantidad: number, previa: number) {
    const canal = pedido.canal === 'PUNTO' ? 'PUNTO' : 'DOMICILIO'
    const cents = importeEntregaCentavos(precio, cantidad, previa)
    const key = JSON.stringify([producto, canal, precio])
    const grupo = grupos.get(key) ?? {
      producto: producto as ProductCode, canal, precio, cantidad: 0, subtotal: 0,
    }
    grupo.cantidad += cantidad
    grupo.subtotal = (Math.round(grupo.subtotal * 100) + cents) / 100
    grupos.set(key, grupo)
    valorPorPedido.set(pedido.id, (valorPorPedido.get(pedido.id) ?? 0) + cents)
  }

  for (const delProducto of entregas.values()) {
    const { pedidoId, producto } = delProducto[0]
    const cantidad = delProducto.reduce((s, l) => s + l.cantidad, 0)
    const pedido = porPedido.get(pedidoId)
    const items = pedido?.items.filter(i => i.producto === producto) ?? []
    if (!pedido || !items.length) {
      sinPrecio += cantidad
      sinValor.add(pedidoId)
      continue
    }
    if (items.length === 1) {
      const precio = numeroPrecio(items[0].precio)
      if (!precioValido(precio)) {
        sinPrecio += cantidad
        sinValor.add(pedidoId)
        continue
      }
      for (const l of delProducto) agregar(pedido, producto, precio, l.cantidad, l.cantidadPrevia)
      continue
    }

    // Si la entrega completa de este producto está dentro del rango,
    // las cantidades entregadas de cada item permiten separar tarifas y centavos.
    // Si cruza días, ni siquiera tarifas iguales garantizan el mismo redondeo.
    const completoEnRango = delProducto.some(l => l.cantidadPrevia === 0) &&
      items.every(i => Number.isSafeInteger(i.cantEntrega) && (i.cantEntrega ?? -1) >= 0 &&
        precioValido(numeroPrecio(i.precio))) &&
      items.reduce((s, i) => s + (i.cantEntrega ?? 0), 0) === cantidad
    if (!completoEnRango) {
      sinPrecio += cantidad
      sinValor.add(pedidoId)
      continue
    }
    for (const item of items) {
      if (item.cantEntrega) agregar(pedido, producto, numeroPrecio(item.precio), item.cantEntrega, 0)
    }
  }

  // Mantener el importe comercial conocido de pedidos completados íntegramente
  // en el periodo, incluso si su desglose legado falta. No distribuir descuentos
  // ni un total contractual de varios días entre días sin evidencia.
  let totalCents = 0
  const detallePorPedido: VentaEntregadaPedido[] = []
  for (const pedido of pedidos) {
    const completo = pedido.totalCompleto
    const valorCompleto = completo !== undefined && Number.isSafeInteger(Math.round(completo * 100)) && completo >= 0
    const centavos = valorCompleto ? Math.round(completo * 100) : valorPorPedido.get(pedido.id) ?? 0
    totalCents += centavos
    detallePorPedido.push({ pedidoId: pedido.id, origen: pedido.origen ?? 'SIN_ORIGEN',
      centavos, valorDeterminado: valorCompleto || !sinValor.has(pedido.id) })
  }
  for (const pedidoId of sinValor) if (!porPedido.has(pedidoId))
    detallePorPedido.push({ pedidoId, origen: 'SIN_ORIGEN', centavos: 0, valorDeterminado: false })
  const desglose = [...grupos.values()].sort((a, b) =>
    b.subtotal - a.subtotal || a.producto.localeCompare(b.producto) || a.canal.localeCompare(b.canal))
  return { desglose, total: totalCents / 100, sinPrecio, porPedido: detallePorPedido }
}

export async function leerVentasEntregadasDia(db: Db, rango: { start: Date; end: Date }): Promise<VentasEntregadasDia & { porPedido: (VentaEntregadaPedido & { fechaAproximada: boolean })[] }> {
  const { unidades, detalle } = await detalleUnidadesEntregadasDelDia(db, {
    desde: rango.start, hasta: rango.end,
  })
  const cantidades = new Map<string, Map<string, number>>()
  const conEntregasAnteriores = new Set<string>()
  for (const l of detalle) {
    const porProducto = cantidades.get(l.pedidoId) ?? new Map<string, number>()
    if (!porProducto.has(l.producto) && l.cantidadPrevia > 0) conEntregasAnteriores.add(l.pedidoId)
    porProducto.set(l.producto, (porProducto.get(l.producto) ?? 0) + l.cantidad)
    cantidades.set(l.pedidoId, porProducto)
  }
  const ids = [...cantidades.keys()]
  const pedidos = ids.length ? await db.pedido.findMany({
    where: { id: { in: ids }, estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] } },
    select: {
      id: true, canal: true, origen: true, total: true, estadoEntrega: true,
      cPacaAguaEnt: true, cPacaHieloEnt: true, cBotellonFabEnt: true, cBotellonDomEnt: true,
      cBolsaAguaEnt: true, cBolsaHieloEnt: true,
      items: { select: { producto: true, precio: true, cantEntrega: true } },
    },
  }) : []
  const conPrecio = pedidos.map(p => {
    const delDia = cantidades.get(p.id)
    const acumulado: Record<string, number> = {
      PACA_AGUA: p.cPacaAguaEnt, PACA_HIELO: p.cPacaHieloEnt,
      BOTELLON: p.cBotellonFabEnt + p.cBotellonDomEnt,
      BOLSA_AGUA: p.cBolsaAguaEnt, BOLSA_HIELO: p.cBolsaHieloEnt,
    }
    const completo = p.estadoEntrega === 'ENTREGADO' && !conEntregasAnteriores.has(p.id) &&
      Object.entries(acumulado).every(([producto, cantidad]) => cantidad === (delDia?.get(producto) ?? 0))
    return { ...p, totalCompleto: completo ? Number(p.total) : undefined }
  })
  // Legado monetario: conservar el importe de completos sin unidades
  // registradas como aproximado, sin inventar mercancía ni precio.
  const legado = await db.pedido.findMany({
    where: { estadoEntrega: 'ENTREGADO', total: { gt: 0 }, id: { notIn: ids },
      cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0,
      cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
      items: { none: { cantEntrega: { gt: 0 } } },
      OR: [{ entregadoAt: { gte: rango.start, lt: rango.end } },
        { entregadoAt: null, fecha: { gte: rango.start, lt: rango.end } }],
    },
    select: { id: true, numero: true, fecha: true, origen: true, canal: true, total: true },
  })
  const aproxIds = new Set(unidades.aproximados.map(p => p.pedidoId))
  for (const p of legado) {
    aproxIds.add(p.id)
    unidades.aproximados.push({ pedidoId: p.id, numero: p.numero, fechaCreacion: p.fecha,
      unidades: { agua: 0, hielo: 0, botellon: 0, bolsaAgua: 0, bolsaHielo: 0 } })
  }
  const valoradas = valorarEntregasDia(detalle, [
    ...conPrecio, ...legado.map(p => ({ ...p, totalCompleto: Number(p.total), items: [] })),
  ])
  return { unidades, ...valoradas,
    porPedido: valoradas.porPedido.map(p => ({ ...p, fechaAproximada: aproxIds.has(p.pedidoId) })) }
}
