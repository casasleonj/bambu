// #796 (paso 1) — Historial de pagos de una factura armado desde los PAGOS, no desde los abonos.
// Cada pago aparece UNA sola vez, también el que no tiene abono (cobro al entregar). El abono espejo de un pago
// no se lista (sería el mismo dinero dos veces). Un abono independiente (sin Pago de origen) es un pago más.
// Las correcciones se listan aparte, ligadas al pago que corrigen. Funciones puras: sin acceso a datos.

const aCentavos = (v: unknown): number => Math.round(Number(v ?? 0) * 100)

export interface PagoParaHistorial {
  id: string
  metodo: string
  monto: unknown
  createdAt: Date
  /** Fecha efectiva del cobro cuando se registró con otra fecha (flujo de oficina). */
  ocurridoAt: Date | null
  confirmacion: string
}

export interface CorreccionParaHistorial {
  id: string
  numero: string
  tipo: string
  montoRevertido: unknown
  motivo: string
  createdAt: Date
  autorizadoPor: string | null
}

export interface AbonoParaHistorial {
  id: string
  numero: string
  monto: unknown
  metodoPago: string
  fecha: Date
  pagoOrigenId: string | null
  correcciones: readonly CorreccionParaHistorial[]
}

export interface FilaPago {
  /** Clave estable: id del Pago, o `abono:<id>` para un abono independiente. */
  clave: string
  origen: 'PAGO' | 'ABONO'
  /** Posición cronológica, desde 1. */
  numero: number
  fecha: string
  metodo: string
  monto: number
  /** Solo para pagos: CONFIRMADO, REPORTADO o DISCREPANTE. */
  confirmacion: string | null
}

export interface FilaCorreccion {
  id: string
  numero: string
  tipo: string
  monto: number
  motivo: string | null
  fecha: string
  autorizadoPor: string | null
  /** Número del pago corregido en la lista; null si no se pudo ligar. */
  sobrePagoNumero: number | null
}

export interface HistorialPagos {
  pagos: FilaPago[]
  correcciones: FilaCorreccion[]
  totalPagado: number
  totalCorregido: number
  /** pagos − correcciones. */
  totalNeto: number
}

export function armarHistorialPagos(
  pagos: readonly PagoParaHistorial[],
  abonos: readonly AbonoParaHistorial[],
): HistorialPagos {
  const idsPago = new Set(pagos.map((p) => p.id))
  type Cruda = Omit<FilaPago, 'numero'> & { orden: Date; claveCorreccion: string }
  const crudas: Cruda[] = pagos.map((p) => ({
    clave: p.id, origen: 'PAGO', fecha: (p.ocurridoAt ?? p.createdAt).toISOString(), metodo: p.metodo,
    monto: aCentavos(p.monto) / 100, confirmacion: p.confirmacion, orden: p.ocurridoAt ?? p.createdAt, claveCorreccion: p.id,
  }))
  // Un abono con Pago de origen presente es el espejo de ese pago: no se lista. Si su pago no está (dato raro),
  // se lista como un pago más: nunca se pierde un cobro por no encontrar su pareja.
  for (const a of abonos) {
    if (a.pagoOrigenId !== null && idsPago.has(a.pagoOrigenId)) continue
    crudas.push({
      clave: `abono:${a.id}`, origen: 'ABONO', fecha: a.fecha.toISOString(), metodo: a.metodoPago,
      monto: aCentavos(a.monto) / 100, confirmacion: null, orden: a.fecha, claveCorreccion: `abono:${a.id}`,
    })
  }
  crudas.sort((x, y) => +x.orden - +y.orden || (x.clave < y.clave ? -1 : x.clave > y.clave ? 1 : 0))
  const numeroPorClave = new Map<string, number>()
  const filas: FilaPago[] = crudas.map((c, i) => {
    numeroPorClave.set(c.clave, i + 1)
    const { orden: _orden, claveCorreccion: _clave, ...fila } = c
    return { ...fila, numero: i + 1 }
  })

  const correcciones: FilaCorreccion[] = []
  for (const a of abonos) {
    const clave = a.pagoOrigenId !== null && idsPago.has(a.pagoOrigenId) ? a.pagoOrigenId : `abono:${a.id}`
    for (const c of a.correcciones) {
      correcciones.push({
        id: c.id, numero: c.numero, tipo: c.tipo, monto: aCentavos(c.montoRevertido) / 100, motivo: c.motivo,
        fecha: c.createdAt.toISOString(), autorizadoPor: c.autorizadoPor, sobrePagoNumero: numeroPorClave.get(clave) ?? null,
      })
    }
  }
  correcciones.sort((x, y) => (x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : x.numero < y.numero ? -1 : 1))

  const totalPagado = filas.reduce((t, f) => t + aCentavos(f.monto), 0)
  const totalCorregido = correcciones.reduce((t, c) => t + aCentavos(c.monto), 0)
  return { pagos: filas, correcciones, totalPagado: totalPagado / 100, totalCorregido: totalCorregido / 100, totalNeto: (totalPagado - totalCorregido) / 100 }
}

/** Para quien no puede ver el detalle de las correcciones (ASISTENTE): solo el hecho financiero. */
export function ocultarDetalleCorrecciones(h: HistorialPagos): HistorialPagos {
  return { ...h, correcciones: h.correcciones.map((c) => ({ ...c, motivo: null, autorizadoPor: null })) }
}
