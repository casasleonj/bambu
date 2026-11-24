// #630 F1-B0. Comparación de SOLO LECTURA entre el resumen oficial y los hechos sombra.
// No reemplaza cálculos de ventas, stock, producción, comisiones ni cierre; no certifica históricos.
import type { Prisma } from '@prisma/client'
import { startOfDayInBogota } from '@/lib/date-helpers'
import { consultarEntregasSombraDelDia, type DiagnosticoEntregasSombra, type EstadoLineaSombra } from '@/lib/entregas-sombra-630'
import { unidadesEntregadasDelDia, type UnidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'

type Db = Pick<Prisma.TransactionClient, 'historial' | 'embarqueMovimiento' | 'pedido'>

const PRODUCTOS = [
  ['PACA_AGUA', 'agua'],
  ['PACA_HIELO', 'hielo'],
  ['BOTELLON', 'botellon'],
  ['BOLSA_AGUA', 'bolsaAgua'],
  ['BOLSA_HIELO', 'bolsaHielo'],
] as const

export type ProductoComparado630 = (typeof PRODUCTOS)[number][0]
export type CalidadComparacion630 = 'DIFERENCIA' | 'COINCIDENCIA_NUMERICA_NO_CERTIFICADA' | 'REQUIERE_REVISION'

export interface LineaComparacion630 {
  producto: ProductoComparado630
  oficial: number
  // Sólo eventos fechados sin conflicto/anulación; no significa saldo contable certificado.
  conFechaAtribuible: number
  // Eventos presentes pero en conflicto, anulados o pendientes de verificación.
  conFechaEnRevision: number
  residualSinFecha: number
  diferenciaOficialMenosAtribuible: number
  pedidosConIncidencia: number
  calidad: CalidadComparacion630
}

export interface ComparacionEntregas630 {
  fecha: string
  modo: 'SOLO_LECTURA'
  cobertura: 'ACOTADA_NO_CERTIFICADA'
  consistencia: 'SIN_SNAPSHOT_ATOMICO_GARANTIZADO'
  pedidosExaminados: number
  pedidosNoEncontrados: number
  pedidosConAlertas: number
  pedidosAproximadosOficial: number
  porProducto: LineaComparacion630[]
  // Mantener diagnóstico desglosado para rastrear cada pedido/producto/fecha.
  diagnostico: DiagnosticoEntregasSombra
  advertencias: string[]
}

function fechaUtilizable(estado: EstadoLineaSombra): boolean {
  // SIN_FECHA admite hechos parciales fechados, pero NO fecha para su residual.
  return estado === 'CONCILIADO' || estado === 'SIN_FECHA'
}

/**
 * Función pura para contrastar el total oficial agregado contra la procedencia ya leída.
 * La igualdad numérica NO certifica universo histórico, anclas, devoluciones ni cierres.
 * No intenta reconstruir cuál pedido aportó al total oficial, que carece de ese desglose.
 */
export function resumirComparacionEntregas630(
  oficial: UnidadesEntregadasDelDia,
  diagnostico: DiagnosticoEntregasSombra,
): ComparacionEntregas630 {
  const alertaGlobal = diagnostico.pedidos.some(p => p.alertasPedido.length > 0)
  const aproximacionesOficiales = oficial.aproximados.length
  const porProducto: LineaComparacion630[] = PRODUCTOS.map(([producto, clave]) => {
    let conFechaAtribuible = 0
    let conFechaEnRevision = 0
    let residualSinFecha = 0
    let pedidosConIncidencia = 0
    for (const pedido of diagnostico.pedidos) {
      const linea = pedido.lineas.find(l => l.producto === producto)
      if (!linea) continue
      if (fechaUtilizable(linea.estado)) conFechaAtribuible += linea.conEvidenciaEnDia
      else conFechaEnRevision += linea.conEvidenciaEnDia
      residualSinFecha += linea.residualSinFecha
      if (linea.estado !== 'CONCILIADO') pedidosConIncidencia++
    }
    const cantidadOficial = oficial[clave]
    const diferenciaOficialMenosAtribuible = cantidadOficial - conFechaAtribuible
    const calidad: CalidadComparacion630 =
      conFechaEnRevision > 0 || pedidosConIncidencia > 0 || diagnostico.pedidosNoEncontrados > 0 ||
      alertaGlobal || aproximacionesOficiales > 0 || !Number.isSafeInteger(cantidadOficial) || cantidadOficial < 0
        ? 'REQUIERE_REVISION'
        : diferenciaOficialMenosAtribuible !== 0 ? 'DIFERENCIA' : 'COINCIDENCIA_NUMERICA_NO_CERTIFICADA'
    return {
      producto, oficial: cantidadOficial, conFechaAtribuible, conFechaEnRevision,
      residualSinFecha, diferenciaOficialMenosAtribuible, pedidosConIncidencia, calidad,
    }
  })
  return {
    fecha: diagnostico.fecha,
    modo: 'SOLO_LECTURA',
    cobertura: 'ACOTADA_NO_CERTIFICADA',
    consistencia: 'SIN_SNAPSHOT_ATOMICO_GARANTIZADO',
    pedidosExaminados: diagnostico.pedidos.length,
    pedidosNoEncontrados: diagnostico.pedidosNoEncontrados,
    pedidosConAlertas: diagnostico.pedidos.filter(p =>
      p.alertasPedido.length > 0 || p.lineas.some(l => l.estado !== 'CONCILIADO')).length,
    pedidosAproximadosOficial: aproximacionesOficiales,
    porProducto,
    diagnostico,
    advertencias: [
      'COMPARACION_DIAGNOSTICA_NO_CAMBIA_TOTALES',
      'LECTURA_ACOTADA_NO_ACREDITA_COBERTURA_HISTORICA',
      'CONSULTAS_NO_ATOMICAS_SI_EL_CALLER_NO_PROVEE_TRANSACCION',
      'DIFERENCIA_NO_EQUIVALE_A_VENTA_MERMA_O_AJUSTE',
    ],
  }
}

/**
 * Consultas exclusivamente de lectura con el mismo db recibido. El caller puede
 * proporcionar una transacción de lectura consistente; aquí no se abren ni se escriben.
 * El lector sombra valida fecha Bogotá y rechaza límites de 500 antes de emitir resumen.
 */
export async function compararEntregasDelDia630(
  db: Db,
  fecha: string,
): Promise<ComparacionEntregas630> {
  const diagnostico = await consultarEntregasSombraDelDia(db, fecha)
  const desde = startOfDayInBogota(fecha)
  const hasta = new Date(+desde + 86_400_000)
  const oficial = await unidadesEntregadasDelDia(db, { desde, hasta })
  return resumirComparacionEntregas630(oficial, diagnostico)
}
