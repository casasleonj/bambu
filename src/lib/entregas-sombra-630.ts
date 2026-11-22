// #630 F1-A — diagnóstico SOLO LECTURA. No alimentar caja, nómina, stock ni reportes oficiales.
// Este cálculo no sustituye entregas-consulta: reutiliza sus hechos y su deduplicación de espejos.
import type { Prisma } from '@prisma/client'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'
import { leerEntregasConsulta, type EntregaConsulta } from '@/lib/entregas-consulta'
import { unidadesFisicasEntregadas } from '@/lib/unidades-entregadas-dia'

const PRODUCTOS = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO'] as const
type Producto = (typeof PRODUCTOS)[number]
type Db = Pick<Prisma.TransactionClient, 'historial' | 'embarqueMovimiento' | 'pedido'>
const MAX_PEDIDOS = 500

export interface PedidoSombra {
  id: string
  numero: number | null
  fecha: Date
  estadoEntrega: string
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
  items: Array<{ producto: string; cantEntrega: number; cantRegaloEntrega: number }>
}

export type EstadoLineaSombra = 'CONCILIADO' | 'SIN_FECHA' | 'CONFLICTO' | 'REVISAR_ANULACION'
export interface LineaSombra {
  producto: Producto
  acumuladoActual: number
  conEvidenciaEnDia: number
  conEvidenciaOtrosDias: number
  porDia: Array<{ dia: string; cantidad: number }>
  residualSinFecha: number
  excesoFrenteAcumulado: number
  estado: EstadoLineaSombra
  alertas: string[]
}
export interface PedidoDiagnosticoSombra {
  pedidoId: string
  numero: number | null
  fechaCreacion: string
  estadoActual: string
  lineas: LineaSombra[]
}
export interface DiagnosticoEntregasSombra {
  fecha: string
  modo: 'SOLO_LECTURA'
  pedidos: PedidoDiagnosticoSombra[]
  pedidosNoEncontrados: number
  // No usar los resultados para contabilizar ni regularizar cierres: son un diagnóstico.
}

function cantidadesAcumuladas(p: PedidoSombra): Record<Producto, number> {
  const fisicas = unidadesFisicasEntregadas(p)
  return {
    PACA_AGUA: fisicas.agua,
    PACA_HIELO: fisicas.hielo,
    BOTELLON: fisicas.botellon,
    BOLSA_AGUA: fisicas.bolsaAgua,
    BOLSA_HIELO: fisicas.bolsaHielo,
  }
}

function esProducto(v: string): v is Producto {
  return (PRODUCTOS as readonly string[]).includes(v)
}

/** Puro: una entrega sustentada conserva SU fecha aunque falte evidencia de otras unidades. */
export function diagnosticarPedidoEntregasSombra(
  pedido: PedidoSombra,
  eventos: EntregaConsulta[],
  fecha: string,
): PedidoDiagnosticoSombra {
  const acumulado = cantidadesAcumuladas(pedido)
  const dias = new Map<Producto, Map<string, number>>()
  const alertas = new Map<Producto, Set<string>>()
  for (const producto of PRODUCTOS) {
    dias.set(producto, new Map())
    alertas.set(producto, new Set())
  }

  const vistos = new Map<string, string>()
  for (const evento of eventos.filter(e => e.pedidoId === pedido.id)) {
    const firma = JSON.stringify({
      fecha: evento.fecha.toISOString(), cantidades: evento.cantidades,
      fuente: evento.fuente, precisionDia: evento.precisionDia ?? false,
      incompleto: evento.incompleto ?? false,
    })
    const anterior = vistos.get(evento.id)
    if (anterior !== undefined) {
      if (anterior !== firma) {
        for (const producto of PRODUCTOS) alertas.get(producto)!.add('IDENTIDAD_REUTILIZADA_CON_OTRO_CONTENIDO')
      }
      continue // nunca sumar dos veces el mismo ID
    }
    vistos.set(evento.id, firma)

    if (evento.incompleto) {
      for (const producto of PRODUCTOS) alertas.get(producto)!.add('EVIDENCIA_GLOBAL_INCOMPLETA')
    }
    if (!evento.cantidades?.length) {
      for (const producto of PRODUCTOS) alertas.get(producto)!.add('EVENTO_SIN_CANTIDADES_VERIFICABLES')
      continue
    }
    const diaEvento = dayInBogota(evento.fecha)
    for (const linea of evento.cantidades) {
      if (!esProducto(linea.producto)) {
        for (const producto of PRODUCTOS) alertas.get(producto)!.add('PRODUCTO_NO_RECONOCIDO')
        continue
      }
      if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0 ||
        (linea.cantidadRegalo !== undefined &&
          (!Number.isSafeInteger(linea.cantidadRegalo) || linea.cantidadRegalo < 0 ||
            linea.cantidadRegalo > linea.cantidad))) {
        alertas.get(linea.producto)!.add('CANTIDAD_INVALIDA')
        continue
      }
      // cantidad YA incluye el regalo (#795). No sumar cantidadRegalo otra vez.
      const porDia = dias.get(linea.producto)!
      porDia.set(diaEvento, (porDia.get(diaEvento) ?? 0) + linea.cantidad)
    }
  }

  const anulado = pedido.estadoEntrega === 'ANULADO' || pedido.estadoEntrega === 'CANCELADO'
  const lineas: LineaSombra[] = []
  for (const producto of PRODUCTOS) {
    const porDia = [...dias.get(producto)!].sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, cantidad]) => ({ dia, cantidad }))
    const acreditado = porDia.reduce((n, d) => n + d.cantidad, 0)
    const conEvidenciaEnDia = dias.get(producto)!.get(fecha) ?? 0
    const acumuladoActual = acumulado[producto]
    const residualSinFecha = Math.max(0, acumuladoActual - acreditado)
    const excesoFrenteAcumulado = Math.max(0, acreditado - acumuladoActual)
    const avisos = alertas.get(producto)!
    if (acumuladoActual < 0) avisos.add('ACUMULADO_NEGATIVO')
    if (excesoFrenteAcumulado > 0) avisos.add('EVENTOS_EXCEDEN_ACUMULADO')
    if (anulado) avisos.add('ESTADO_ACTUAL_ANULADO_REVISAR_COMPENSACION')
    if (acumuladoActual === 0 && acreditado === 0 && avisos.size === 0) continue

    const conflicto = [...avisos].some(a =>
      a === 'IDENTIDAD_REUTILIZADA_CON_OTRO_CONTENIDO' || a === 'PRODUCTO_NO_RECONOCIDO' ||
      a === 'CANTIDAD_INVALIDA' || a === 'ACUMULADO_NEGATIVO' || a === 'EVENTOS_EXCEDEN_ACUMULADO')
    const estado: EstadoLineaSombra = conflicto ? 'CONFLICTO'
      : anulado ? 'REVISAR_ANULACION'
      : residualSinFecha > 0 || avisos.size > 0 ? 'SIN_FECHA' : 'CONCILIADO'
    lineas.push({
      producto, acumuladoActual, conEvidenciaEnDia,
      conEvidenciaOtrosDias: acreditado - conEvidenciaEnDia, porDia,
      residualSinFecha, excesoFrenteAcumulado, estado, alertas: [...avisos].sort(),
    })
  }
  return {
    pedidoId: pedido.id, numero: pedido.numero,
    fechaCreacion: dayInBogota(pedido.fecha), estadoActual: pedido.estadoEntrega, lineas,
  }
}

/**
 * Consulta aislada por DÍA Bogotá, sin endpoint/flag ni escrituras.
 * Solo cubre pedidos creados ese día o con eventos recuperables por el lector vigente.
 * No infiere fechas de residual histórico, anulaciones ni movimientos no modelados.
 */
export async function consultarEntregasSombraDelDia(
  db: Db,
  fecha: string,
): Promise<DiagnosticoEntregasSombra> {
  const desde = startOfDayInBogota(fecha)
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(fecha) || !Number.isFinite(+desde) || dayInBogota(desde) !== fecha) {
    throw new Error('FECHA_SOMBRA_INVALIDA')
  }
  const hasta = new Date(+desde + 86_400_000)
  const eventosDelDia = await leerEntregasConsulta(db, { rango: { desde, hasta } })
  const ids = [...new Set(eventosDelDia.map(e => e.pedidoId))]
  if (ids.length > MAX_PEDIDOS) throw new Error('SOMBRA_DEMASIADOS_PEDIDOS')
  const pedidos = await db.pedido.findMany({
    where: { OR: [{ fecha: { gte: desde, lt: hasta } }, { id: { in: ids } }] },
    take: MAX_PEDIDOS + 1,
    select: {
      id: true, numero: true, fecha: true, estadoEntrega: true,
      cPacaAguaEnt: true, cPacaHieloEnt: true, cBotellonFabEnt: true,
      cBotellonDomEnt: true, cBolsaAguaEnt: true, cBolsaHieloEnt: true,
      items: { select: { producto: true, cantEntrega: true, cantRegaloEntrega: true } },
    },
  })
  if (pedidos.length > MAX_PEDIDOS) throw new Error('SOMBRA_DEMASIADOS_PEDIDOS')
  const idsEnDb = new Set(pedidos.map(p => p.id))
  const hechos = await leerEntregasConsulta(db, { ids: pedidos.map(p => p.id) })
  const porPedido = new Map<string, EntregaConsulta[]>()
  for (const hecho of hechos) porPedido.set(hecho.pedidoId, [...(porPedido.get(hecho.pedidoId) ?? []), hecho])
  return {
    fecha, modo: 'SOLO_LECTURA',
    pedidosNoEncontrados: ids.filter(id => !idsEnDb.has(id)).length,
    pedidos: pedidos.map(p => diagnosticarPedidoEntregasSombra(p, porPedido.get(p.id) ?? [], fecha)),
  }
}
