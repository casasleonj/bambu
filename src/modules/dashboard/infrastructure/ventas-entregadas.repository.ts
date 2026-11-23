import type { Prisma } from '@prisma/client'
import type { ProductCode } from '@/shared/domain'
import type { VentaPorPrecio } from '../domain'
import { importeEntregaCentavos } from '@/shared/domain/unit-price'
import { detalleUnidadesEntregadasDelDia, unidadesFisicasEntregadas, type UnidadEntregadaDetalle, type UnidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'

type Db = Pick<Prisma.TransactionClient, 'pedido' | 'historial' | 'embarqueMovimiento'>
type PedidoPrecio = {
  id: string
  canal: string | null
  items: { producto: string; precio: unknown; cantEntrega?: number; cantRegaloEntrega?: number }[]
  /** Only set when all currently delivered units belong to this period and the order is complete. */
  totalCompleto?: number
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
): Pick<VentasEntregadasDia, 'desglose' | 'total' | 'sinPrecio'> {
  const { desglose, total, sinPrecio } = valorarEntregasDiaPorPedido(detalle, pedidos)
  return { desglose, total, sinPrecio }
}

/** Valoración con su desglose por pedido (#853): el total es exactamente la suma de `porPedidoCentavos`. */
export interface ValoracionEntregasDia extends Pick<VentasEntregadasDia, 'desglose' | 'total' | 'sinPrecio'> {
  /** Valor comercial de lo entregado en el periodo, por pedido, en centavos. */
  porPedidoCentavos: Map<string, number>
  /** Pedidos con unidades del periodo que no pudieron valorarse (sin precio verificable o sin desglose). */
  pedidosSinPrecio: Set<string>
}

export function valorarEntregasDiaPorPedido(
  detalle: UnidadEntregadaDetalle[],
  pedidos: PedidoPrecio[],
): ValoracionEntregasDia {
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
  const pedidosSinPrecio = new Set<string>()
  const marcarSinPrecio = (id: string, n: number) => { sinPrecio += n; pedidosSinPrecio.add(id) }

  function agregar(pedido: PedidoPrecio, producto: string, precio: number, cantidad: number, previa: number, regalos = 0) {
    const canal = pedido.canal === 'PUNTO' ? 'PUNTO' : 'DOMICILIO'
    const cents = importeEntregaCentavos(precio, cantidad, previa)
    const key = JSON.stringify([producto, canal, precio])
    const grupo = grupos.get(key) ?? {
      producto: producto as ProductCode, canal, precio, cantidad: 0, subtotal: 0,
    }
    grupo.cantidad += cantidad
    if (regalos > 0) grupo.cantidadRegalo = (grupo.cantidadRegalo ?? 0) + regalos
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
      marcarSinPrecio(pedidoId, cantidad)
      continue
    }
    if (items.length === 1) {
      const precio = numeroPrecio(items[0].precio)
      if (!precioValido(precio)) {
        marcarSinPrecio(pedidoId, cantidad)
        continue
      }
      // El evento físico debe separar las unidades cobradas de los regalos.
      // Si el regalo existe pero falta su desglose en un hecho histórico,
      // conservar las unidades, sin atribuirle ingresos no demostrados.
      const tieneRegalos = (items[0].cantRegaloEntrega ?? 0) > 0
      if (tieneRegalos && delProducto.some(l => l.cantidadRegalo === undefined)) {
        marcarSinPrecio(pedidoId, cantidad)
        continue
      }
      if (delProducto.some(l => (l.cantidadRegalo ?? 0) > l.cantidad || l.cantidadRegaloPrevia > l.cantidadPrevia)) {
        marcarSinPrecio(pedidoId, cantidad)
        continue
      }
      for (const l of delProducto) {
        const regalo = l.cantidadRegalo ?? 0
        agregar(pedido, producto, precio, l.cantidad - regalo,
          l.cantidadPrevia - l.cantidadRegaloPrevia, regalo)
      }
      continue
    }

    // Si la entrega completa de este producto está dentro del rango,
    // las cantidades entregadas de cada item permiten separar tarifas y centavos.
    // Si cruza días, ni siquiera tarifas iguales garantizan el mismo redondeo.
    const completoEnRango = delProducto.some(l => l.cantidadPrevia === 0) &&
      items.every(i => Number.isSafeInteger(i.cantEntrega) && (i.cantEntrega ?? -1) >= 0 &&
        Number.isSafeInteger(i.cantRegaloEntrega ?? 0) && (i.cantRegaloEntrega ?? 0) >= 0 &&
        precioValido(numeroPrecio(i.precio))) &&
      items.reduce((s, i) => s + (i.cantEntrega ?? 0) + (i.cantRegaloEntrega ?? 0), 0) === cantidad
    if (!completoEnRango) {
      marcarSinPrecio(pedidoId, cantidad)
      continue
    }
    for (const item of items) {
      if ((item.cantEntrega ?? 0) + (item.cantRegaloEntrega ?? 0) > 0)
        agregar(pedido, producto, numeroPrecio(item.precio), item.cantEntrega ?? 0, 0, item.cantRegaloEntrega ?? 0)
    }
  }

  // Mantener el importe comercial conocido de pedidos completados íntegramente
  // en el periodo, incluso si su desglose legado falta. No distribuir descuentos
  // ni un total contractual de varios días entre días sin evidencia.
  let totalCents = 0
  const porPedidoCentavos = new Map<string, number>()
  for (const pedido of pedidos) {
    const completo = pedido.totalCompleto
    const cents = completo !== undefined && Number.isSafeInteger(Math.round(completo * 100)) && completo >= 0
      ? Math.round(completo * 100)
      : valorPorPedido.get(pedido.id) ?? 0
    totalCents += cents
    porPedidoCentavos.set(pedido.id, (porPedidoCentavos.get(pedido.id) ?? 0) + cents)
  }
  const desglose = [...grupos.values()].sort((a, b) =>
    b.subtotal - a.subtotal || a.producto.localeCompare(b.producto) || a.canal.localeCompare(b.canal))
  return { desglose, total: totalCents / 100, sinPrecio, porPedidoCentavos, pedidosSinPrecio }
}

export async function leerVentasEntregadasDia(db: Db, rango: { start: Date; end: Date }): Promise<VentasEntregadasDia> {
  const { unidades, desglose, total, sinPrecio } = await leerVentasEntregadasDiaPorPedido(db, rango)
  return { unidades, desglose, total, sinPrecio }
}

export interface VentasEntregadasDiaPorPedido extends VentasEntregadasDia, Pick<ValoracionEntregasDia, 'porPedidoCentavos' | 'pedidosSinPrecio'> {
  /** Pedidos del periodo que ya tenían entregas anteriores (el valor del periodo no es el total del pedido). */
  conEntregasAnteriores: Set<string>
}

export async function leerVentasEntregadasDiaPorPedido(
  db: Db,
  rango: { start: Date; end: Date },
  /** #853: la lectura de entregas del día ya hecha en la misma transacción; evita repetir la consulta pesada. */
  base?: Awaited<ReturnType<typeof detalleUnidadesEntregadasDelDia>>,
): Promise<VentasEntregadasDiaPorPedido> {
  const { unidades, detalle } = base ?? await detalleUnidadesEntregadasDelDia(db, {
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
      id: true, canal: true, total: true, estadoEntrega: true,
      cPacaAguaEnt: true, cPacaHieloEnt: true, cBotellonFabEnt: true, cBotellonDomEnt: true,
      cBolsaAguaEnt: true, cBolsaHieloEnt: true,
      items: { select: { producto: true, precio: true, cantEntrega: true, cantRegaloEntrega: true } },
    },
  }) : []
  const conPrecio = pedidos.map(p => {
    const delDia = cantidades.get(p.id)
    const fisico = unidadesFisicasEntregadas(p)
    const acumulado: Record<string, number> = {
      PACA_AGUA: fisico.agua, PACA_HIELO: fisico.hielo,
      BOTELLON: fisico.botellon, BOLSA_AGUA: fisico.bolsaAgua, BOLSA_HIELO: fisico.bolsaHielo,
    }
    const completo = p.estadoEntrega === 'ENTREGADO' && !conEntregasAnteriores.has(p.id) &&
      Object.entries(acumulado).every(([producto, cantidad]) => cantidad === (delDia?.get(producto) ?? 0))
    return { ...p, totalCompleto: completo ? Number(p.total) : undefined }
  })
  return { unidades, conEntregasAnteriores, ...valorarEntregasDiaPorPedido(detalle, conPrecio) }
}
