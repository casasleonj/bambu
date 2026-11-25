import { z } from 'zod'
import type { ComisionRepartidor } from './comision-repartidor-calculo'

const entero = z.number().int()
const texto = z.string().min(1)
const unidades = z.object({ agua: entero, hielo: entero, botellon: entero })
const tarifas = z.object({ agua: entero, hielo: entero, botellon: entero })
const reparto = z.object({
  tipo: z.literal('REPARTO'), tarifasCentavos: tarifas, unidades,
  importesCentavos: tarifas,
  fuentes: z.array(z.object({
    id: texto, origen: z.enum(['EMBARQUE_VIVO', 'EMBARQUE_LEGADO', 'SIN_EMBARQUE']),
    unidades, sinPedido: unidades.optional(),
    pedidos: z.array(z.object({ id: texto, unidades, detalle: z.enum(['POR_DIA', 'SIN_DETALLE', 'HISTORICO']) })).optional(),
  })),
})
const produccion = z.object({
  tipo: z.literal('PRODUCCION'),
  registros: z.array(z.object({
    id: texto, turno: texto, totalCentavos: entero,
    items: z.array(z.object({
      id: texto, producto: texto, unidades: entero, importeCentavos: entero,
      tarifaImplicitaCentavos: entero.nullable(),
    })),
  })),
})
export const evidenciaComisionV1 = z.object({
  version: z.literal(1),
  alcance: z.literal('JORNADA_ACUMULADA'),
  trabajadorId: texto, fechaTrabajo: texto, fechaPagoRealDeclarada: texto, registradoAt: texto,
  totalCentavos: entero, pagadoAntesCentavos: entero, desembolsoCentavos: entero,
  desgloseCuadra: z.boolean(), detalle: z.discriminatedUnion('tipo', [reparto, produccion]),
})
export type EvidenciaComisionV1 = z.infer<typeof evidenciaComisionV1>
export type DetalleEvidenciaComision = EvidenciaComisionV1['detalle']

export const centavosComision = (n: unknown) => Math.round(Number(n) * 100)

/** Guarda las tarifas efectivas del motor usado en el registro, no las vigentes al trabajar. */
export function evidenciaReparto(c: ComisionRepartidor): z.infer<typeof reparto> {
  return {
    tipo: 'REPARTO',
    tarifasCentavos: { agua: centavosComision(c.tarifas.agua), hielo: centavosComision(c.tarifas.hielo), botellon: centavosComision(c.tarifas.botellon) },
    unidades: { agua: c.entregasAgua, hielo: c.entregasHielo, botellon: c.entregasBotellon },
    importesCentavos: { agua: centavosComision(c.comAgua), hielo: centavosComision(c.comHielo), botellon: centavosComision(c.comBotellon) },
    // IDs y cantidades solamente: no copiar nombres, direcciones ni datos de clientes.
    fuentes: c.fuentes.map(f => ({
      id: f.id, origen: f.origen, unidades: f.unidades,
      ...(f.sinPedido ? { sinPedido: f.sinPedido } : {}),
      ...(f.pedidos ? { pedidos: f.pedidos.map(p => ({ id: p.id, unidades: p.unidades, detalle: p.detalle })) } : {}),
    })),
  }
}

export function evidenciaProduccion(registros: readonly {
  id: string; turno: string; comSellTotal: unknown;
  items: readonly { id: string; producto: string; producido: number; comSellador: unknown }[];
}[]): z.infer<typeof produccion> {
  return {
    tipo: 'PRODUCCION',
    registros: registros.map(r => ({
      id: r.id, turno: r.turno, totalCentavos: centavosComision(r.comSellTotal),
      items: r.items.map(i => {
        const importeCentavos = centavosComision(i.comSellador)
        return { id: i.id, producto: i.producto, unidades: i.producido, importeCentavos,
          // Solo cociente exacto del item guardado; nunca se afirma tarifa contractual histórica.
          tarifaImplicitaCentavos: i.producido > 0 && importeCentavos >= 0 && importeCentavos % i.producido === 0
            ? importeCentavos / i.producido : null }
      }),
    })),
  }
}

export function construirEvidenciaComision(
  base: Omit<EvidenciaComisionV1, 'version' | 'alcance' | 'desgloseCuadra' | 'detalle'>,
  detalle: DetalleEvidenciaComision,
): EvidenciaComisionV1 {
  const totalDetalle = detalle.tipo === 'REPARTO'
    ? Object.values(detalle.importesCentavos).reduce((a, b) => a + b, 0)
    : detalle.registros.reduce((s, r) => s + r.totalCentavos, 0)
  const itemsCuadran = detalle.tipo === 'REPARTO'
    ? (['agua', 'hielo', 'botellon'] as const).every(p =>
      detalle.fuentes.reduce((s, f) => s + f.unidades[p], 0) === detalle.unidades[p]
      && detalle.unidades[p] * detalle.tarifasCentavos[p] === detalle.importesCentavos[p])
    : detalle.registros.every(r => r.items.reduce((s, i) => s + i.importeCentavos, 0) === r.totalCentavos)
  return {
    ...base, version: 1, alcance: 'JORNADA_ACUMULADA', detalle,
    desgloseCuadra: itemsCuadran && totalDetalle === base.totalCentavos
      && base.totalCentavos - base.pagadoAntesCentavos === base.desembolsoCentavos,
  }
}

/** Una versión desconocida o evidencia inconsistente no altera el pago ni se presenta como certificada. */
export function interpretarEvidenciaComision(raw: unknown, pago: {
  trabajadorId: string; fechaTrabajo: string; concepto: string; monto: number; registradoAt: string;
}) {
  if (raw == null) return { estado: 'NO_VERIFICADA' as const, evidencia: null }
  const parsed = evidenciaComisionV1.safeParse(raw)
  if (!parsed.success) return { estado: 'NO_INTERPRETABLE' as const, evidencia: null }
  const e = parsed.data
  if (e.trabajadorId !== pago.trabajadorId || e.fechaTrabajo !== pago.fechaTrabajo || e.detalle.tipo !== pago.concepto
    || e.desembolsoCentavos !== centavosComision(pago.monto) || e.registradoAt !== pago.registradoAt) {
    return { estado: 'NO_INTERPRETABLE' as const, evidencia: null }
  }
  return { estado: e.desgloseCuadra && construirEvidenciaComision(e, e.detalle).desgloseCuadra
    ? 'REGISTRADA' as const : 'REGISTRADA_CON_DIFERENCIAS' as const, evidencia: e }
}
