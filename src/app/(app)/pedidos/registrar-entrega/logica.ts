// TEMPORAL-SIN-EMBARQUE(#472): lógica pura de la pantalla «Registrar entrega».
// Sin React ni red, para probarla aislada. El SERVIDOR es la autoridad de las
// reglas (ver `EntregarPedidoUseCase`); aquí solo se anticipan para guiar a
// quien usa la pantalla con mensajes sencillos antes de enviar.

export type MetodoCobro = 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA'
export type QuienRecibio = 'REPARTIDOR' | 'OFICINA'

export interface PedidoParaEntrega {
  id: string
  numero: number
  canal: string
  clienteId: string
  nombreCliente: string
  total: number
  totalPagado: number
  /** Repartidor ya fijado por una entrega anterior de este pedido. */
  entregadoPorId?: string | null
  items: Array<{ producto: string; cantPedido: number; cantEntrega: number }>
}

export interface Repartidor { id: string; nombre: string }

export interface DatosEntrega {
  /** `null` = todavía sin elegir. */
  alcance: 'COMPLETA' | 'MENOS' | null
  /** Unidades que se entregan AHORA por producto (solo cuando `alcance === 'MENOS'`). */
  cantidades: Record<string, number>
  repartidorId: string
  /** YYYY-MM-DD (calendario de Bogotá). */
  fecha: string
  monto: string
  quienRecibio: QuienRecibio | null
  metodo: MetodoCobro
  /** YYYY-MM-DD */
  promesa: string
  nota: string
}

export const DIAS_MAX_ATRAS = 7
export const CLIENTE_ANONIMO = 'CONSUMIDOR_FINAL'

export const pesos = (n: number): string => `$${Math.round(n).toLocaleString('es-CO')}`

export function hoyBogota(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

/** «25 de octubre» a partir de YYYY-MM-DD (mediodía de Bogotá: sin saltos de día por zona horaria). */
export function fechaLarga(dia: string): string {
  return new Date(`${dia}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', timeZone: 'America/Bogota' })
}

export function sumarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Unidades que faltan por entregar en cada línea. */
export function pendientes(p: PedidoParaEntrega): Array<{ producto: string; pendiente: number }> {
  return p.items
    .map((i) => ({ producto: i.producto, pendiente: Math.max(0, i.cantPedido - i.cantEntrega) }))
    .filter((i) => i.pendiente > 0)
}

export function datosIniciales(p: PedidoParaEntrega, ahora: Date = new Date()): DatosEntrega {
  return {
    alcance: null,
    cantidades: Object.fromEntries(pendientes(p).map((i) => [i.producto, i.pendiente])),
    repartidorId: p.entregadoPorId ?? '',
    fecha: hoyBogota(ahora),
    monto: '',
    quienRecibio: null,
    metodo: 'EFECTIVO',
    promesa: '',
    nota: '',
  }
}

/** Unidades que se entregarán ahora, por producto. */
export function itemsAEntregar(p: PedidoParaEntrega, d: DatosEntrega): Array<{ producto: string; cantidad: number }> {
  const pend = pendientes(p)
  if (d.alcance === 'COMPLETA') return pend.map((i) => ({ producto: i.producto, cantidad: i.pendiente }))
  return pend
    .map((i) => ({ producto: i.producto, cantidad: Math.min(i.pendiente, Math.max(0, Math.floor(d.cantidades[i.producto] ?? 0))) }))
    .filter((i) => i.cantidad > 0)
}

export function montoNumero(d: DatosEntrega): number {
  const limpio = d.monto.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpio)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function saldoActual(p: PedidoParaEntrega): number {
  return Math.max(0, p.total - p.totalPagado)
}

/** ¿Esta entrega deja el pedido completo (todo lo pendiente se entrega)? */
export function completa(p: PedidoParaEntrega, d: DatosEntrega): boolean {
  const aEntregar = itemsAEntregar(p, d)
  return pendientes(p).every((pe) => (aEntregar.find((a) => a.producto === pe.producto)?.cantidad ?? 0) >= pe.pendiente)
}

export type Errores = Partial<Record<'alcance' | 'cantidades' | 'repartidor' | 'fecha' | 'monto' | 'quienRecibio' | 'promesa', string>>

export function validar(p: PedidoParaEntrega, d: DatosEntrega, ahora: Date = new Date()): Errores {
  const e: Errores = {}
  const hoy = hoyBogota(ahora)
  const esDomicilio = p.canal === 'DOMICILIO'

  if (!d.alcance) e.alcance = 'Indica si se entregó todo o menos.'
  const aEntregar = itemsAEntregar(p, d)
  if (d.alcance === 'MENOS') {
    const unidades = aEntregar.reduce((s, i) => s + i.cantidad, 0)
    if (unidades <= 0) e.cantidades = 'Indica cuántas unidades se entregaron.'
    else if (completa(p, d)) e.cantidades = 'Marcaste todo lo pendiente: elige «Sí, se entregó todo».'
  }

  if (esDomicilio && !p.entregadoPorId && !d.repartidorId) e.repartidor = 'Elige quién entregó el pedido.'

  if (d.fecha > hoy) e.fecha = 'La fecha de entrega no puede ser futura.'
  else if (d.fecha < sumarDias(hoy, -DIAS_MAX_ATRAS)) e.fecha = `Solo se puede registrar una entrega de hasta ${DIAS_MAX_ATRAS} días atrás.`

  const monto = montoNumero(d)
  const saldo = saldoActual(p)
  if (monto > saldo) e.monto = `El dinero recibido es mayor que lo que se debe (${pesos(saldo)}).`
  if (monto > 0 && !d.quienRecibio) e.quienRecibio = 'Indica quién recibió el dinero.'
  const repartidorElegido = Boolean(p.entregadoPorId || d.repartidorId)
  if (monto > 0 && d.quienRecibio === 'REPARTIDOR' && !repartidorElegido) {
    e.quienRecibio = 'Para decir que lo recibió el repartidor, elige primero quién fue.'
  }

  const saldoDespues = Math.max(0, saldo - monto)
  if (saldoDespues > 0 && p.clienteId === CLIENTE_ANONIMO) {
    e.monto = 'No se puede dejar fiado a un cliente sin nombre. Registra el pago completo.'
  } else if (saldoDespues > 0 && d.alcance && completa(p, d)) {
    if (!d.promesa) e.promesa = 'Si queda debiendo, necesitamos hasta cuándo promete pagar.'
    else if (d.promesa < hoy) e.promesa = 'La fecha de promesa no puede estar en el pasado.'
  }
  return e
}

export function hayErrores(e: Errores): boolean {
  return Object.keys(e).length > 0
}

/** Frases de la pantalla «Revisa antes de guardar», en palabras sencillas. */
export function resumen(p: PedidoParaEntrega, d: DatosEntrega, repartidores: Repartidor[], nombreProducto: (c: string) => string): string[] {
  const frases: string[] = []
  const aEntregar = itemsAEntregar(p, d)
  const total = completa(p, d)
  const nombreRep = repartidores.find((r) => r.id === (p.entregadoPorId || d.repartidorId))?.nombre
  const unidades = aEntregar.map((i) => `${i.cantidad} ${nombreProducto(i.producto)}`).join(', ')

  frases.push(
    total
      ? `Se marca como ENTREGADO el ${fechaLarga(d.fecha)}.`
      : `Se registra una entrega parcial el ${fechaLarga(d.fecha)}: ${unidades}. El pedido sigue pendiente por lo que falta.`,
  )
  if (nombreRep) frases.push(`Lo entregó ${nombreRep}.`)

  const monto = montoNumero(d)
  if (monto > 0) {
    const quien = d.quienRecibio === 'REPARTIDOR' ? `Los tiene ${nombreRep ?? 'el repartidor'}` : 'Se pagaron en la oficina'
    frases.push(`Se recibieron ${pesos(monto)} (${d.metodo.toLowerCase()}). ${quien}.`)
  }
  const saldoDespues = Math.max(0, saldoActual(p) - monto)
  if (saldoDespues > 0 && total) {
    frases.push(`Quedan debiendo ${pesos(saldoDespues)} hasta el ${fechaLarga(d.promesa)}.`)
  } else if (saldoDespues > 0) {
    frases.push(`Falta cobrar ${pesos(saldoDespues)} del pedido.`)
  } else {
    frases.push('El pedido queda pagado completo.')
  }
  return frases
}

/** Cuerpo de `POST /api/pedidos/[id]/gestion-admin/entrega`. */
export function armarPayload(p: PedidoParaEntrega, d: DatosEntrega, offlineId: string, ahora: Date = new Date()) {
  const monto = montoNumero(d)
  const hoy = hoyBogota(ahora)
  return {
    offlineId,
    itemsEntregados: itemsAEntregar(p, d),
    ...(d.repartidorId && !p.entregadoPorId ? { repartidorId: d.repartidorId } : {}),
    ...(monto > 0 && d.quienRecibio
      ? { recibioDinero: d.quienRecibio, pagos: [{ metodo: d.metodo, monto }] }
      : {}),
    // Hoy = el instante actual; otro día = mediodía de Bogotá (evita saltos de día por zona horaria).
    ...(d.fecha !== hoy ? { fechaEntrega: `${d.fecha}T17:00:00.000Z`, precisionFecha: 'DIA' as const } : {}),
    ...(d.promesa ? { promesaPagoFecha: d.promesa } : {}),
    ...(d.nota.trim() ? { nota: d.nota.trim() } : {}),
  }
}
