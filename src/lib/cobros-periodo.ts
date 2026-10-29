import type { Prisma } from '@prisma/client'
import { clasificarCobroCartera, leerAbonosDelPeriodo } from './cobro-cartera'
import { isConsumidorFinalCanonical } from './cliente-canonical'

/** Read-only facts. Canal comercial, recepción y confirmación son dimensiones distintas. */
export interface CobroPeriodo {
  id: string
  fuente: 'PAGO' | 'ABONO'
  referencia: string
  pedidoId: string
  pedidoNumero: number
  canal: string
  fechaPedido: string
  registradoAt: string
  metodo: string
  confirmacion: string | null
  bruto: number
  ajuste: number
  neto: number
  pedidoAnterior: boolean
}

export interface CobroPorConciliar {
  id: string
  referencia: string
  pedidoId: string | null
  metodo: string | null
  importe: number | null
  motivo:
    | 'ORIGEN_ABONO'
    | 'AJUSTE_INVALIDO'
    | 'SOBRANTE_SIN_COBRO'
    | 'REGISTRO_INCOMPLETO'
    | 'MEDIO_NO_IDENTIFICADO'
}

export interface MedioCobros {
  metodo: string
  movimientos: number
  bruto: number
  ajustes: number
  neto: number
  confirmado: number
  reportado: number
  discrepante: number
  sinEstadoVerificable: number
  pendienteConciliacion: boolean
}

export interface CobrosPeriodo {
  movimientos: CobroPeriodo[]
  medios: MedioCobros[]
  subtotalRegistrado: number
  creditoAplicado: number
  porConciliar: CobroPorConciliar[]
}

type Tx = Pick<Prisma.TransactionClient, '$queryRaw' | 'pago' | 'historial'>
const centavos = (valor: unknown) => Math.round(Number(valor) * 100)
const metodoIdentificado = (valor: unknown): string | null =>
  typeof valor === 'string' &&
  ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA', 'BONO'].includes(valor)
    ? valor
    : null
const importeVerificable = (valor: unknown): number | null =>
  Number.isFinite(Number(valor)) ? Number(valor) : null
const enRango = (fecha: Date, desde: Date, hasta: Date) =>
  fecha >= desde && fecha < hasta

/**
 * Pago.createdAt / Abono.fecha, intervalo [desde, hasta), sin emparejamiento
 * por tiempo o monto. Correcciones compensan el cobro original, no prueban
 * una devolución física. BONO consume crédito; no vuelve a entrar dinero.
 * El llamador agrupa esta lectura en su snapshot financiero.
 */
export async function leerCobrosPeriodo(
  tx: Tx,
  desde: Date,
  hasta: Date,
): Promise<CobrosPeriodo> {
  if (!Number.isFinite(+desde) || !Number.isFinite(+hasta) || desde >= hasta)
    throw new Error('Rango de cobros inválido')
  const [pagos, abonos, auditorias] = await Promise.all([
    tx.pago.findMany({
      where: {
        createdAt: { gte: desde, lt: hasta },
        regularizacionId: null,
        pedido: { estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] } },
      },
      select: {
        id: true,
        monto: true,
        metodo: true,
        confirmacion: true,
        createdAt: true,
        pedido: {
          select: { id: true, numero: true, fecha: true, canal: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    leerAbonosDelPeriodo(tx, desde, hasta, true),
    // #524: esta evidencia señala sobrantes; NO inventa un Pago/Abono.
    tx.historial.findMany({
      where: {
        entidad: 'Pedido',
        accion: 'UPDATE',
        fecha: { gte: desde, lt: hasta },
        datos: { contains: 'COBRO_FIADO_V2' },
      },
      select: { id: true, datos: true },
      orderBy: { id: 'asc' },
    }),
  ])
  const movimientos: CobroPeriodo[] = pagos.map((p) => ({
    id: p.id,
    fuente: 'PAGO',
    referencia: `Pedido #${p.pedido.numero}`,
    pedidoId: p.pedido.id,
    pedidoNumero: p.pedido.numero,
    canal: p.pedido.canal,
    fechaPedido: p.pedido.fecha.toISOString(),
    registradoAt: p.createdAt.toISOString(),
    metodo: p.metodo,
    confirmacion: p.confirmacion,
    bruto: centavos(p.monto) / 100,
    ajuste: 0,
    neto: centavos(p.monto) / 100,
    pedidoAnterior: p.pedido.fecha < desde,
  }))
  const porConciliar: CobroPorConciliar[] = []
  const porPago = new Map(movimientos.map((m) => [m.id, m]))
  for (const a of abonos) {
    const clase = clasificarCobroCartera(a)
    if (clase === 'PENDIENTE') {
      porConciliar.push({
        id: a.id,
        referencia: a.numero,
        pedidoId: a.pedidoId,
        metodo: metodoIdentificado(a.metodoPago),
        importe: importeVerificable(a.monto),
        motivo: 'ORIGEN_ABONO',
      })
      // Si contradice el método del Pago enlazado, ambos requieren revisión.
      if (a.pagoMetodo && a.pagoMetodo !== a.metodoPago)
        porConciliar.push({
          id: `${a.id}:pago`,
          referencia: a.numero,
          pedidoId: a.pagoPedidoId,
          metodo: a.pagoMetodo,
          importe: null,
          motivo: 'ORIGEN_ABONO',
        })
      continue
    }
    const bruto = centavos(a.monto),
      ajuste = centavos(a.reversion)
    const destino =
      clase === 'ESPEJO' ? porPago.get(a.pagoOrigenId!) : undefined
    if (clase === 'ESPEJO' && !destino) continue // Pago de otro período o regularización.
    if (clase === 'INDEPENDIENTE' && !enRango(a.fecha, desde, hasta)) continue
    if (
      !Number.isSafeInteger(bruto) ||
      !Number.isSafeInteger(ajuste) ||
      bruto <= 0 ||
      ajuste < 0 ||
      ajuste > bruto
    ) {
      porConciliar.push({
        id: a.id,
        referencia: a.numero,
        pedidoId: a.pedidoId,
        metodo: metodoIdentificado(a.metodoPago),
        importe: importeVerificable(a.monto),
        motivo: 'AJUSTE_INVALIDO',
      })
      continue
    }
    if (destino) {
      destino.ajuste = ajuste / 100
      destino.neto = (bruto - ajuste) / 100
    } else {
      movimientos.push({
        id: a.id,
        fuente: 'ABONO',
        referencia: a.numero,
        pedidoId: a.pedidoId,
        pedidoNumero: a.pedidoNumero,
        canal: a.canal,
        fechaPedido: a.fechaPedido.toISOString(),
        registradoAt: a.fecha.toISOString(),
        metodo: a.metodoPago,
        confirmacion: null,
        bruto: bruto / 100,
        ajuste: ajuste / 100,
        neto: (bruto - ajuste) / 100,
        pedidoAnterior: a.fechaPedido < desde,
      })
    }
  }
  for (const h of auditorias) {
    try {
      const datos = JSON.parse(h.datos)
      if (datos.operacion !== 'COBRO_FIADO_V2') continue
      const r = datos.resultado
      if (
        !r ||
        !Array.isArray(r.medios) ||
        typeof r.montoSobrante !== 'number' ||
        !Number.isFinite(r.montoSobrante) ||
        r.montoSobrante < 0
      )
        throw new Error('Auditoría incompleta')
      if (centavos(r.montoSobrante) <= 0) continue
      // El contrato vigente devuelve cambio al anónimo; no acredita crédito.
      if (
        r.saldoFavorAcreditado === 0 &&
        isConsumidorFinalCanonical(r.clienteId)
      )
        continue
      if (
        typeof r.saldoFavorAcreditado !== 'number' ||
        !Number.isFinite(r.saldoFavorAcreditado) ||
        centavos(r.saldoFavorAcreditado) !== centavos(r.montoSobrante)
      )
        throw new Error('Crédito no verificable')
      let encontrado = false,
        desglosado = 0
      const pendientesSobrante: CobroPorConciliar[] = []
      for (const [i, medio] of r.medios.entries()) {
        if (
          !medio ||
          typeof medio.saldoFavor !== 'number' ||
          !Number.isFinite(medio.saldoFavor) ||
          medio.saldoFavor < 0
        )
          throw new Error('Sobrante sin importe verificable')
        if (centavos(medio.saldoFavor) <= 0) continue
        encontrado = true
        desglosado += centavos(medio.saldoFavor)
        // El sobrante de crédito aplicado tampoco representa dinero nuevo.
        if (medio.metodo === 'BONO') continue
        pendientesSobrante.push({
          id: `${h.id}:${i}`,
          referencia: 'Sobrante de cobro a fiados',
          pedidoId: null,
          metodo: metodoIdentificado(medio.metodo),
          importe: medio.saldoFavor,
          motivo: 'SOBRANTE_SIN_COBRO',
        })
      }
      if (!encontrado || desglosado !== centavos(r.montoSobrante))
        throw new Error('Falta desglose del sobrante')
      porConciliar.push(...pendientesSobrante)
    } catch {
      porConciliar.push({
        id: h.id,
        referencia: 'Registro de cobro incompleto',
        pedidoId: null,
        metodo: null,
        importe: null,
        motivo: 'REGISTRO_INCOMPLETO',
      })
    }
  }
  const grupos = new Map<string, MedioCobros>()
  // Abono.metodoPago es texto, no enum. Un dato legado desconocido podría
  // ser crédito: no adivinar que es digital ni incluirlo como dinero nuevo.
  const identificados = movimientos.filter((m) => {
    if (
      !['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA', 'BONO'].includes(
        m.metodo,
      )
    ) {
      porConciliar.push({
        id: m.id,
        referencia: m.referencia,
        pedidoId: m.pedidoId,
        metodo: null,
        importe: Number.isFinite(m.bruto) ? m.bruto : null,
        motivo: 'MEDIO_NO_IDENTIFICADO',
      })
      return false
    }
    if (!Number.isSafeInteger(centavos(m.bruto)) || m.bruto < 0) {
      porConciliar.push({
        id: m.id,
        referencia: m.referencia,
        pedidoId: m.pedidoId,
        metodo: m.metodo,
        importe: null,
        motivo: 'AJUSTE_INVALIDO',
      })
      return false
    }
    return true
  })
  let subtotal = 0,
    credito = 0
  for (const m of identificados) {
    if (m.metodo === 'BONO') {
      credito += centavos(m.neto)
      continue
    }
    subtotal += centavos(m.neto)
    const g = grupos.get(m.metodo) ?? {
      metodo: m.metodo,
      movimientos: 0,
      bruto: 0,
      ajustes: 0,
      neto: 0,
      confirmado: 0,
      reportado: 0,
      discrepante: 0,
      sinEstadoVerificable: 0,
      pendienteConciliacion: false,
    }
    g.movimientos++
    // Acumular centavos; convertir una sola vez al terminar.
    g.bruto += centavos(m.bruto)
    g.ajustes += centavos(m.ajuste)
    g.neto += centavos(m.neto)
    if (m.confirmacion === 'CONFIRMADO') g.confirmado += centavos(m.neto)
    else if (m.confirmacion === 'REPORTADO') g.reportado += centavos(m.neto)
    else if (m.confirmacion === 'DISCREPANTE') g.discrepante += centavos(m.neto)
    else g.sinEstadoVerificable += centavos(m.neto)
    grupos.set(m.metodo, g)
  }
  for (const p of porConciliar) {
    if (p.metodo === 'BONO') continue
    const metodo = p.metodo ?? 'SIN_IDENTIFICAR'
    const g = grupos.get(metodo) ?? {
      metodo,
      movimientos: 0,
      bruto: 0,
      ajustes: 0,
      neto: 0,
      confirmado: 0,
      reportado: 0,
      discrepante: 0,
      sinEstadoVerificable: 0,
      pendienteConciliacion: false,
    }
    g.pendienteConciliacion = true
    grupos.set(metodo, g)
  }
  const medios = [...grupos.values()]
    .map((g) => ({
      ...g,
      pendienteConciliacion:
        g.pendienteConciliacion || porConciliar.some((p) => p.metodo === null),
      bruto: g.bruto / 100,
      ajustes: g.ajustes / 100,
      neto: g.neto / 100,
      confirmado: g.confirmado / 100,
      reportado: g.reportado / 100,
      discrepante: g.discrepante / 100,
      sinEstadoVerificable: g.sinEstadoVerificable / 100,
    }))
    .sort((a, b) => a.metodo.localeCompare(b.metodo))
  identificados.sort(
    (a, b) =>
      a.registradoAt.localeCompare(b.registradoAt) || a.id.localeCompare(b.id),
  )
  return {
    movimientos: identificados,
    medios,
    subtotalRegistrado: subtotal / 100,
    creditoAplicado: credito / 100,
    porConciliar,
  }
}
