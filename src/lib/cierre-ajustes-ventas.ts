import type { Prisma } from '@prisma/client'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'
import { leerEntregasConsulta, type EntregaConsulta } from '@/lib/entregas-consulta'

type Db = Pick<Prisma.TransactionClient, 'pedido' | 'historial' | 'embarqueMovimiento' | 'cierreDia' | 'pedidoReduccionComercial'>
type Nota = { id: string; pedidoId: string; monto: unknown }
type Rango = { start: Date; end: Date }
type Revision = { pedidoId: string; motivo: string }
const objeto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null

/** No usar texto libre de la nota ni su importe como prueba de venta. */
export function esReversaTerminal(datos: string): boolean {
  try {
    const d = objeto(JSON.parse(datos))
    return !!d && typeof d.notaCredito === 'boolean' &&
      (d.modo === 'ANULAR' || d.modo === 'CANCELAR' || d.estado === 'CANCELADO')
  } catch { return false }
}

export function diasCumplimientoVerificado(
  eventos: readonly EntregaConsulta[], acumulado: Record<string, number>,
): Set<string> | null {
  const suma = new Map<string, number>()
  const dias = new Set<string>()
  for (const e of eventos) {
    if (e.incompleto || !e.cantidades || !Number.isFinite(+e.fecha)) return null
    for (const l of e.cantidades) {
      if (!Object.hasOwn(acumulado, l.producto) || !Number.isSafeInteger(l.cantidad) || l.cantidad < 0) return null
      if (!l.cantidad) continue
      suma.set(l.producto, (suma.get(l.producto) ?? 0) + l.cantidad)
      dias.add(dayInBogota(e.fecha))
    }
  }
  return Object.entries(acumulado).every(([p, n]) => n === (suma.get(p) ?? 0)) ? dias : null
}

/** Un snapshot nuevo es evidencia monetaria; un total agregado legado no atribuye importes a pedidos. */
export function importeReconocido(reporte: unknown, pedidoId: string): number | null {
  const r = objeto(reporte)
  if (r?.ventasCriterio !== 'ENTREGA_V1' || !Array.isArray(r.ventasEntregaPorPedido)) return null
  const filas = r.ventasEntregaPorPedido.map(objeto).filter(v => v?.pedidoId === pedidoId)
  if (filas.length !== 1) return null
  const fila = filas[0]
  return fila && fila.valorDeterminado === true && fila.fechaAproximada === false &&
    typeof fila.centavos === 'number' && Number.isSafeInteger(fila.centavos) && fila.centavos >= 0 ? fila.centavos : null
}

/**
 * #885: las reducciones de demanda no revierten ventas. La reversa terminal de
 * una venta previa se atribuye una sola vez por pedido, por importe reconocido,
 * no por dinero cobrado ni por fecha de creación. Un legado sin evidencia queda
 * explícitamente por conciliar; nunca se inventa su ajuste.
 */
export async function leerAjustesVentasCierre(db: Db, rango: Rango, notas: readonly Nota[]) {
  const fecha = { gte: rango.start, lt: rango.end }
  const [auditorias, reducciones] = await Promise.all([
    db.historial.findMany({ where: { entidad: 'Pedido', accion: 'UPDATE', fecha,
      datos: { contains: '"notaCredito"' } }, select: { registroId: true, datos: true } }),
    notas.length ? db.pedidoReduccionComercial.findMany({
      where: { notaCreditoId: { in: notas.map(n => n.id) }, estado: 'APLICADA' },
      select: { notaCreditoId: true, pedidoId: true },
    }) : [],
  ])
  const reducidas = new Set(reducciones.map(r => JSON.stringify([r.notaCreditoId, r.pedidoId])))
  const terminales = new Map<string, number>()
  for (const a of auditorias) if (esReversaTerminal(a.datos))
    terminales.set(a.registroId, (terminales.get(a.registroId) ?? 0) + 1)
  const otrasNotas = notas.filter(n => !reducidas.has(JSON.stringify([n.id, n.pedidoId])))
  const ids = [...new Set([...terminales.keys(), ...otrasNotas.map(n => n.pedidoId)])]
  let ajusteCentavos = 0, notasAnterioresCentavos = 0
  const porConciliar: Revision[] = []
  const ajustes: { pedidoId: string; centavos: number; dias: string[] }[] = []
  const notasTotal = notas.reduce((s, n) => s + Math.round(Number(n.monto) * 100), 0)
  if (!ids.length) return { ajusteCentavos, notasAnterioresCentavos, notasTotal, porConciliar, ajustes }

  const [pedidos, hechos] = await Promise.all([
    db.pedido.findMany({ where: { id: { in: ids } }, select: {
      id: true, estadoEntrega: true, entregadoAt: true,
      cPacaAguaEnt: true, cPacaHieloEnt: true, cBotellonFabEnt: true, cBotellonDomEnt: true,
      cBolsaAguaEnt: true, cBolsaHieloEnt: true,
    } }),
    leerEntregasConsulta(db, { ids }),
  ])
  const porPedido = new Map(pedidos.map(p => [p.id, p]))
  const dia = dayInBogota(rango.start)
  const diasPrevios = [...new Set(hechos.filter(e => e.fecha < rango.start).map(e => dayInBogota(e.fecha)))]
  const cierres = diasPrevios.length ? await db.cierreDia.findMany({
    where: { fecha: { in: diasPrevios.map(startOfDayInBogota) } },
    select: { fecha: true, reporte: true },
  }) : []
  const porDia = new Map(cierres.map(c => [dayInBogota(c.fecha), c.reporte]))
  for (const pedidoId of ids) {
    const p = porPedido.get(pedidoId)
    const revisar = (motivo: string) => porConciliar.push({ pedidoId, motivo })
    const eventos = hechos.filter(h => h.pedidoId === pedidoId)
    if (!p || !['ANULADO', 'CANCELADO'].includes(p.estadoEntrega)) {
      revisar('NOTA_SIN_REVERSA_IDENTIFICADA'); continue
    }
    // Si hay varias operaciones terminales, o no hay traza de la operación,
    // no imputar un ajuste previo al día de la nota por mera coincidencia.
    const operaciones = terminales.get(pedidoId) ?? 0
    if (operaciones > 1 || eventos.some(e => e.fecha >= rango.end)) {
      revisar('REVERSA_AMBIGUA'); continue
    }
    const dias = diasCumplimientoVerificado(eventos, {
      PACA_AGUA: p.cPacaAguaEnt, PACA_HIELO: p.cPacaHieloEnt,
      BOTELLON: p.cBotellonFabEnt + p.cBotellonDomEnt,
      BOLSA_AGUA: p.cBolsaAguaEnt, BOLSA_HIELO: p.cBolsaHieloEnt,
    })
    if (!dias || (!dias.size && (p.estadoEntrega === 'ANULADO' || p.entregadoAt || !operaciones))) {
      revisar('CUMPLIMIENTO_NO_VERIFICADO'); continue
    }
    const anteriores = [...dias].filter(d => d < dia).sort()
    // Sin cumplimiento previo: exclusión de las ventas vigentes suficiente.
    if (!anteriores.length) continue
    if (operaciones !== 1) { revisar('FECHA_REVERSA_NO_VERIFICADA'); continue }
    const valores = anteriores.map(d => importeReconocido(porDia.get(d), pedidoId))
    if (valores.some(v => v === null)) { revisar('VENTA_PREVIA_SIN_DETALLE_DE_CIERRE'); continue }
    const centavos = valores.reduce<number>((s, v) => s + (v ?? 0), 0)
    ajusteCentavos += centavos
    ajustes.push({ pedidoId, centavos, dias: anteriores })
    // La nota es documental: no equivale al ajuste, sobre todo si hubo
    // fiado o una entrega en ambos días. No repartirla por aproximación.
    if (!dias.has(dia)) notasAnterioresCentavos += otrasNotas.filter(n => n.pedidoId === pedidoId)
      .reduce((s, n) => s + Math.round(Number(n.monto) * 100), 0)
  }
  return { ajusteCentavos, notasAnterioresCentavos, notasTotal, porConciliar, ajustes }
}

export class VentasCierreSinConciliarError extends Error {
  constructor() { super('Hay ventas o anulaciones sin evidencia suficiente. Revisa la conciliación de ventas antes de cerrar.') }
}
