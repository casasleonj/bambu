import type { Prisma } from '@prisma/client'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'
import { leerEntregasConsulta, type EntregaConsulta } from '@/lib/entregas-consulta'
import { huellaConciliacion, leerUltimasConciliaciones, lineasCoinciden, type CasoConciliacionVenta, type ConciliacionVentaAplicada } from '@/lib/cierre-conciliacion-ventas'

import { pedidosConReversaRegistrada } from '@/lib/cierre-ventas-provisional'

type Db = Pick<Prisma.TransactionClient, 'pedido' | 'historial' | 'embarqueMovimiento' | 'cierreDia' | 'pedidoReduccionComercial'>
type Nota = { id: string; pedidoId: string; monto: unknown }
type Rango = { start: Date; end: Date }
type Revision = { pedidoId: string; motivo: string; numero?: number | null; conciliacion?: CasoConciliacionVenta }
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
      if (!Object.prototype.hasOwnProperty.call(acumulado, l.producto) || !Number.isSafeInteger(l.cantidad) || l.cantidad < 0) return null
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

/** Un cierre tardío posterior a la reversa puede documentar que nunca reconoció
 * esa venta. Solo inferir cero de una proyección nueva íntegra, nunca de un agregado legado. */
export function ventaAusenteEnCierreTardio(reporte: unknown, pedidoId: string): boolean {
  const r = objeto(reporte)
  if (r?.ventasCriterio !== 'ENTREGA_V1' || !Array.isArray(r.ventasEntregaPorPedido) ||
      !Array.isArray(r.ventasPorConciliar) || r.ventasPorConciliar.length ||
      typeof r.ventasEntregadasDelDia !== 'number' || !Number.isFinite(r.ventasEntregadasDelDia)) return false
  const ids = new Set<string>()
  let centavos = 0
  for (const x of r.ventasEntregaPorPedido) {
    const f = objeto(x)
    if (!f || typeof f.pedidoId !== 'string' || f.pedidoId === pedidoId || ids.has(f.pedidoId) ||
        f.valorDeterminado !== true || f.fechaAproximada !== false ||
        typeof f.centavos !== 'number' || !Number.isSafeInteger(f.centavos) || f.centavos < 0) return false
    ids.add(f.pedidoId)
    centavos += f.centavos
  }
  return Number.isSafeInteger(centavos) && centavos === Math.round(r.ventasEntregadasDelDia * 100)
}

/**
 * #885: las reducciones de demanda no revierten ventas. La reversa terminal de
 * una venta previa se atribuye una sola vez por pedido, por importe reconocido,
 * no por dinero cobrado ni por fecha de creación. Un legado sin evidencia queda
 * explícitamente por conciliar; nunca se inventa su ajuste.
 */
export async function leerAjustesVentasCierre(db: Db, rango: Rango, notas: readonly Nota[], opciones: { ignorarConciliacion?: boolean } = {}) {
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
  const conciliacionesAplicadas: ConciliacionVentaAplicada[] = []
  const notasTotal = notas.reduce((s, n) => s + Math.round(Number(n.monto) * 100), 0)
  if (!ids.length) return { ajusteCentavos, notasAnterioresCentavos, notasTotal, porConciliar, ajustes, conciliacionesAplicadas }

  const dia = dayInBogota(rango.start)
  const [pedidos, hechos, reversasHistoricas, ultimas] = await Promise.all([
    db.pedido.findMany({ where: { id: { in: ids } }, select: {
      id: true, numero: true, estadoEntrega: true, entregadoAt: true,
      cPacaAguaEnt: true, cPacaHieloEnt: true, cBotellonFabEnt: true, cBotellonDomEnt: true,
      cBolsaAguaEnt: true, cBolsaHieloEnt: true,
    } }),
    leerEntregasConsulta(db, { ids }),
    db.historial.findMany({ where: { entidad: 'Pedido', accion: 'UPDATE',
      registroId: { in: ids }, datos: { contains: '"notaCredito"' } },
      select: { registroId: true, datos: true, fecha: true } }),
    leerUltimasConciliaciones(db, dia, ids),
  ])
  const reversiones = new Map<string, Date[]>()
  for (const h of reversasHistoricas) if (esReversaTerminal(h.datos)) {
    const fechas = reversiones.get(h.registroId) ?? []
    fechas.push(h.fecha)
    reversiones.set(h.registroId, fechas)
  }
  const porPedido = new Map(pedidos.map(p => [p.id, p]))
  const diasPrevios = [...new Set(hechos.filter(e => e.fecha < rango.start).map(e => dayInBogota(e.fecha)))]
  const cierres = diasPrevios.length ? await db.cierreDia.findMany({
    where: { fecha: { in: diasPrevios.map(startOfDayInBogota) }, necesitaValidacion: false, horaCierre: { not: null } },
    select: { id: true, fecha: true, horaCierre: true, reporte: true },
  }) : []
  const porDia = new Map(cierres.map(c => [dayInBogota(c.fecha), c]))
  const reversasYaRegistradas = await pedidosConReversaRegistrada(db, rango.start, ids)
  for (const pedidoId of ids) {
    const p = porPedido.get(pedidoId)
    const revisar = (motivo: string) => porConciliar.push({ pedidoId, motivo, ...(p ? { numero: p.numero } : {}) })
    const eventos = hechos.filter(h => h.pedidoId === pedidoId)
    if (!p || !['ANULADO', 'CANCELADO'].includes(p.estadoEntrega)) {
      revisar('NOTA_SIN_REVERSA_IDENTIFICADA'); continue
    }
    // Si hay varias operaciones terminales, o no hay traza de la operación,
    // no imputar un ajuste previo al día de la nota por mera coincidencia.
    const operaciones = terminales.get(pedidoId) ?? 0
    const historial = reversiones.get(pedidoId) ?? []
    if (operaciones !== 1 || historial.length !== 1 ||
      eventos.some(e => e.fecha >= rango.end || (!e.precisionDia && e.fecha > historial[0]))) {
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
    const valores = anteriores.map(d => {
      const c = porDia.get(d)
      const conocido = importeReconocido(c?.reporte, pedidoId)
      if (conocido !== null) return conocido
      return c?.horaCierre && c.horaCierre >= historial[0] &&
        ventaAusenteEnCierreTardio(c.reporte, pedidoId) ? 0 : null
    })
    const faltantes = anteriores.filter((_, i) => valores[i] === null)
    let manual = 0
    let aplicada: ConciliacionVentaAplicada | undefined
    if (faltantes.length) {
      const huella = huellaConciliacion([
        dia, pedidoId, historial[0].toISOString(),
        [...eventos].sort((a,b) => a.id.localeCompare(b.id)).map(e => [e.id, e.fecha.toISOString(), e.cantidades, e.precisionDia, e.fuente]),
        anteriores.map((d, i) => [d, valores[i], porDia.get(d)?.id ?? null, porDia.get(d)?.horaCierre?.toISOString() ?? null, porDia.get(d)?.reporte ?? null]),
        otrasNotas.filter(n => n.pedidoId === pedidoId).sort((a,b) => a.id.localeCompare(b.id)).map(n => [n.id, String(n.monto)]),
      ])
      const decision = ultimas.get(pedidoId)
      const caso = { huella, dias: faltantes, revision: decision?.id ?? null }
      if (opciones.ignorarConciliacion || !decision || decision.operacion !== 'RESOLVER' ||
          decision.huella !== huella || !lineasCoinciden(faltantes, decision.lineas)) {
        porConciliar.push({ pedidoId, numero: p.numero, motivo: 'VENTA_PREVIA_SIN_DETALLE_DE_CIERRE', conciliacion: caso })
        continue
      }
      manual = decision.lineas.reduce((s, l) => s + l.centavos, 0)
      aplicada = { pedidoId, numero: p.numero, huella, revision: decision.id, lineas: decision.lineas }
    }
    const centavos = valores.reduce<number>((s, v) => s + (v ?? 0), manual)
    if (centavos > 0 && reversasYaRegistradas.has(pedidoId)) { revisar('REVERSA_YA_REGISTRADA'); continue }
    if (aplicada) conciliacionesAplicadas.push(aplicada)
    ajusteCentavos += centavos
    ajustes.push({ pedidoId, centavos, dias: anteriores })
    // La nota es documental: no equivale al ajuste, sobre todo si hubo
    // fiado o una entrega en ambos días. No repartirla por aproximación.
    if (!dias.has(dia)) notasAnterioresCentavos += otrasNotas.filter(n => n.pedidoId === pedidoId)
      .reduce((s, n) => s + Math.round(Number(n.monto) * 100), 0)
  }
  return { ajusteCentavos, notasAnterioresCentavos, notasTotal, porConciliar, ajustes, conciliacionesAplicadas }
}

export class VentasCierreSinConciliarError extends Error {
  constructor(message = 'Hay ventas o anulaciones sin evidencia suficiente. Revisa la conciliación de ventas antes de cerrar.') { super(message) }
}
