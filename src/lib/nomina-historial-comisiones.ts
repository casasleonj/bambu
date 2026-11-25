import type { Prisma } from '@prisma/client'
import { dayInBogota, dateRangeForDay } from './date-helpers'
import { endOfDayBogota } from './dates'
import { whereFechaPagoComision } from './comision-pagada'
import { calcularComisionRepartidor, tarifasRepartidor } from './comision-repartidor'
import { agruparHistorialComisiones, claveJornadaComision, resumirPagosComision, type PagoHistorialComision } from './nomina-historial-comisiones-calculo'

import { interpretarEvidenciaComision } from './comision-evidencia'

const LIMITE_PAGOS = 10_000
export class HistorialComisionLimiteError extends Error {}
type Tx = Prisma.TransactionClient
type Grupo = Pick<PagoHistorialComision, 'trabajadorId' | 'fechaTrabajo' | 'concepto'>
export interface FiltroHistorial {
  desde: string
  hasta: string
  porFecha: 'TRABAJO' | 'PAGO'
  trabajadorId?: string
  concepto?: string
  pagina: number
  tamano: number
}

async function leerPagos(tx: Tx, where: Prisma.PagoComisionRepartidorWhereInput): Promise<PagoHistorialComision[]> {
  const filas = await tx.pagoComisionRepartidor.findMany({
    where, take: LIMITE_PAGOS + 1, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      trabajador: { select: { nombre: true } },
      pagadoPor: { select: { nombre: true, username: true } },
      correcciones: { orderBy: [{ corregidoAt: 'desc' }, { id: 'desc' }], take: 1,
        include: { corregidoPor: { select: { nombre: true, username: true } } } },
    },
  })
  if (filas.length > LIMITE_PAGOS) throw new HistorialComisionLimiteError('Reduce el rango de fechas de la consulta')
  return filas.map(p => {
    const c = p.correcciones[0]
    return {
      id: p.id, trabajadorId: p.trabajadorId, nombre: p.trabajador.nombre, concepto: p.concepto,
      fechaTrabajo: dayInBogota(p.fecha), fechaPagoReal: p.fechaPagoReal ? dayInBogota(p.fechaPagoReal) : null,
      registradoAt: p.createdAt.toISOString(), monto: Number(p.monto), metodo: p.metodo,
      registradoPor: p.pagadoPor ? p.pagadoPor.nombre || p.pagadoPor.username : null,
      correccion: c ? { anterior: c.fechaRealAnterior ? dayInBogota(c.fechaRealAnterior) : null,
        nueva: dayInBogota(c.fechaRealNueva), motivo: c.motivo, por: c.corregidoPor.nombre || c.corregidoPor.username,
        at: c.corregidoAt.toISOString() } : null,
    }
  })
}

const whereJornada = (g: Grupo): Prisma.PagoComisionRepartidorWhereInput => ({
  trabajadorId: g.trabajadorId, concepto: g.concepto, fecha: dateRangeForDay(g.fechaTrabajo),
})

/** Solo pagos reales; no se suma el agregado comisionPagadaCaja de Nomina. */
export async function leerHistorialComisiones(tx: Tx, filtro: FiltroHistorial) {
  const desde = dateRangeForDay(filtro.desde).gte
  const hasta = dateRangeForDay(filtro.hasta).lt
  const pagos = await leerPagos(tx, {
    trabajadorId: filtro.trabajadorId, concepto: filtro.concepto,
    ...(filtro.porFecha === 'TRABAJO' ? { fecha: { gte: desde, lt: hasta } } : whereFechaPagoComision(desde, hasta)),
  })
  const grupos = agruparHistorialComisiones(pagos)
  const pagina = grupos.slice((filtro.pagina - 1) * filtro.tamano, filtro.pagina * filtro.tamano)
  const completos = filtro.porFecha === 'TRABAJO' ? pagina : pagina.length
    ? agruparHistorialComisiones(await leerPagos(tx, { OR: pagina.map(whereJornada) })) : []
  const porClave = new Map(completos.map(g => [claveJornadaComision(g), g.subtotalFiltro]))
  return {
    filtro, resumen: resumirPagosComision(pagos), totalJornadas: grupos.length,
    totalPaginas: Math.ceil(grupos.length / filtro.tamano),
    jornadas: pagina.map(g => ({ ...g, totalJornada: porClave.get(claveJornadaComision(g)) ?? null })),
  }
}

/** Evidencia operativa disponible ahora, nunca certificación de la tarifa o cantidad al pagar. */
export async function leerDetalleHistorialComision(tx: Tx, grupo: Grupo) {
  const pagos = await leerPagos(tx, whereJornada(grupo))
  if (!pagos.length) return null
  const evidencias = await tx.pagoComisionEvidencia.findMany({ where: { pagoId: { in: pagos.map(p => p.id) } } })
  const porPago = new Map(evidencias.map(e => [e.pagoId, e.datos]))
  // Cada evidencia representa una versión acumulada de la jornada. Nunca sumar sus unidades.
  const evidenciasAlRegistrar = pagos.map(p => ({
    pagoId: p.id, ...interpretarEvidenciaComision(porPago.get(p.id), p),
  }))
  const base = { ...grupo, pagos, totalJornada: resumirPagosComision(pagos),
    evidenciaAlPagar: 'NO_VERIFICADA' as const, evidenciasAlRegistrar }
  const rango = dateRangeForDay(grupo.fechaTrabajo)
  if (grupo.concepto === 'REPARTO') {
    const [trabajador, config] = await Promise.all([
      tx.trabajador.findUnique({ where: { id: grupo.trabajadorId } }),
      tx.config.findUnique({ where: { clave: 'COM_REPARTIDOR' } }),
    ])
    if (!trabajador) return { ...base, trabajo: null }
    const calculo = await calcularComisionRepartidor(tx, grupo.trabajadorId, rango.gte,
      endOfDayBogota(grupo.fechaTrabajo), tarifasRepartidor(trabajador, config ? Number(config.valor) : undefined),
      { detallePedidos: true })
    return { ...base, trabajo: {
      tipo: 'REPARTO' as const, evidencia: 'CALCULO_ACTUAL_NO_HISTORICO' as const,
      hayFuentes: calculo.fuentes.length > 0, calculo,
    } }
  }
  if (grupo.concepto === 'PRODUCCION') {
    const registros = await tx.produccion.findMany({
      where: { trabajadorId: grupo.trabajadorId, fecha: rango }, orderBy: [{ turno: 'asc' }, { id: 'asc' }],
      select: { id: true, turno: true, fecha: true, comSellTotal: true,
        items: { select: { id: true, producto: true, producido: true, comSellador: true }, orderBy: { producto: 'asc' } } },
    })
    const totales = new Map<string, { producto: string; unidades: number; importeCentavos: number }>()
    const detalle = registros.map(r => ({
      id: r.id, turno: r.turno, fecha: dayInBogota(r.fecha), importe: Number(r.comSellTotal),
      items: r.items.map(i => {
        const importe = Number(i.comSellador)
        const centavos = Math.round(importe * 100)
        const fila = totales.get(i.producto) ?? { producto: i.producto, unidades: 0, importeCentavos: 0 }
        fila.unidades += i.producido
        fila.importeCentavos += centavos
        totales.set(i.producto, fila)
        // Cociente aritmético del registro actual: no prueba tarifa aplicada al pago.
        return { id: i.id, producto: i.producto, unidades: i.producido, importe,
          tarifaImplicita: i.producido > 0 && centavos % i.producido === 0 ? centavos / i.producido / 100 : null }
      }),
    }))
    return { ...base, trabajo: {
      tipo: 'PRODUCCION' as const, evidencia: 'REGISTRO_OPERATIVO_ACTUAL' as const, hayFuentes: detalle.length > 0,
      registros: detalle, totalRegistrado: registros.reduce((s, r) => s + Math.round(Number(r.comSellTotal) * 100), 0) / 100,
      porProducto: [...totales.values()].map(p => ({ producto: p.producto, unidades: p.unidades, importe: p.importeCentavos / 100 })),
    } }
  }
  return { ...base, trabajo: null }
}
