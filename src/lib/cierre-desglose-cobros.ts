// #631 — Desglose del dinero cobrado en el día por origen y medio, lista de a quién se fió y detalle de los pagos
// digitales por confirmar. Funciones puras: el cierre las alimenta con lo que ya lee (no cambia ninguna cifra de dinero).

const aCentavos = (v: unknown): number => Math.round(Number(v ?? 0) * 100)
const deCentavos = (c: number): number => c / 100

export interface PagoParaDesglose {
  metodo: string
  monto: unknown
  /** Fecha del pedido sobre el que se cobró (decide si es una venta de hoy o un fiado anterior). */
  pedidoFecha: Date
}

export interface ParteDesglose {
  efectivo: number
  digital: number
  total: number
  /** Solo los medios digitales con valor (Nequi, transferencia, Daviplata, bono). */
  porMetodo: Record<string, number>
}

export interface DesgloseCobros {
  ventasHoy: ParteDesglose
  fiadosAnteriores: ParteDesglose
  /** Abonos independientes menos ajustes de cobros (neto); el efectivo sale de `totalEfectivo`. */
  abonos: ParteDesglose & { independientes: number; ajustes: number }
  efectivo: number
  digital: number
  total: number
  /** Lo que dice «Cobros de la fecha» (cobroVentasHoy + cobroCartera). */
  esperado: number
  diferencia: number
  cuadra: boolean
}

function parteVacia(): { efectivo: number; digital: number; porMetodo: Record<string, number> } {
  return { efectivo: 0, digital: 0, porMetodo: {} }
}

function cerrarParte(p: { efectivo: number; digital: number; porMetodo: Record<string, number> }): ParteDesglose {
  const porMetodo: Record<string, number> = {}
  for (const [m, c] of Object.entries(p.porMetodo)) if (c !== 0) porMetodo[m] = deCentavos(c)
  return { efectivo: deCentavos(p.efectivo), digital: deCentavos(p.digital), total: deCentavos(p.efectivo + p.digital), porMetodo }
}

export function desglosarCobros(
  pagos: readonly PagoParaDesglose[],
  desde: Date,
  hasta: Date,
  abonos: { abonosIndependientes: number; ajustesDeCobros: number; total: number; totalEfectivo: number },
  esperado: number,
): DesgloseCobros {
  const hoy = parteVacia()
  const anteriores = parteVacia()
  for (const p of pagos) {
    const destino = p.pedidoFecha >= desde && p.pedidoFecha < hasta ? hoy : anteriores
    const c = aCentavos(p.monto)
    if (p.metodo === 'EFECTIVO') destino.efectivo += c
    else {
      destino.digital += c
      destino.porMetodo[p.metodo] = (destino.porMetodo[p.metodo] ?? 0) + c
    }
  }
  const abEfectivo = aCentavos(abonos.totalEfectivo)
  const abDigital = aCentavos(abonos.total) - abEfectivo
  const ab = cerrarParte({ efectivo: abEfectivo, digital: abDigital, porMetodo: {} })
  const ventasHoy = cerrarParte(hoy)
  const fiadosAnteriores = cerrarParte(anteriores)
  const efectivo = deCentavos(aCentavos(ventasHoy.efectivo) + aCentavos(fiadosAnteriores.efectivo) + abEfectivo)
  const digital = deCentavos(aCentavos(ventasHoy.digital) + aCentavos(fiadosAnteriores.digital) + abDigital)
  const total = deCentavos(aCentavos(efectivo) + aCentavos(digital))
  const diferencia = deCentavos(aCentavos(total) - aCentavos(esperado))
  return {
    ventasHoy,
    fiadosAnteriores,
    abonos: { ...ab, independientes: abonos.abonosIndependientes, ajustes: abonos.ajustesDeCobros },
    efectivo, digital, total, esperado, diferencia, cuadra: diferencia === 0,
  }
}

export interface PedidoParaFiado {
  id: string
  numero: number
  clienteId: string
  total: unknown
  totalPagado: unknown
  saldo: unknown
  /** Saldo de mercancía entregada calculado por el lector común. */
  exigible?: number
  promesaPagoFecha: Date | null
  cliente: { nombre: string; apellido: string | null } | null
}

export interface FiadoDelDia {
  pedidoId: string
  numero: number
  clienteId: string
  cliente: string
  total: number
  pagado: number
  saldo: number
  saldoComercial?: number
  /** YYYY-MM-DD en hora de Bogotá, o null si no se prometió fecha. */
  promesaPago: string | null
}

const fechaBogota = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** Pedidos del día que quedaron con saldo (aunque hayan pagado una parte). Su suma es el «Fiado» del cierre. */
export function listarFiadosDelDia(pedidos: readonly PedidoParaFiado[]): FiadoDelDia[] {
  return pedidos
    .filter((p) => aCentavos(p.exigible ?? p.saldo) > 0)
    .map((p) => ({
      pedidoId: p.id,
      numero: p.numero,
      clienteId: p.clienteId,
      cliente: p.cliente ? `${p.cliente.nombre} ${p.cliente.apellido ?? ''}`.trim() : 'Sin cliente',
      total: Number(p.total),
      pagado: Number(p.totalPagado),
      saldo: p.exigible ?? Number(p.saldo),
      ...(p.exigible === undefined ? {} : { saldoComercial: Number(p.saldo) }),
      promesaPago: p.promesaPagoFecha ? fechaBogota(p.promesaPagoFecha) : null,
    }))
    .sort((a, b) => a.numero - b.numero)
}

export interface PagoPorConfirmarRaw {
  id: string
  metodo: string
  monto: unknown
  createdAt: Date
  pedido: {
    id: string
    numero: number
    cliente: { id: string; nombre: string; apellido: string | null } | null
    factura: { numero: string } | null
  }
}

export interface PagoPorConfirmarDetalle {
  pagoId: string
  pedidoId: string
  numero: number
  clienteId: string | null
  cliente: string
  factura: string | null
  fecha: string
  metodo: string
  monto: number
}

export function detallarPorConfirmar(rows: readonly PagoPorConfirmarRaw[]): PagoPorConfirmarDetalle[] {
  return rows.map((r) => ({
    pagoId: r.id,
    pedidoId: r.pedido.id,
    numero: r.pedido.numero,
    clienteId: r.pedido.cliente?.id ?? null,
    cliente: r.pedido.cliente ? `${r.pedido.cliente.nombre} ${r.pedido.cliente.apellido ?? ''}`.trim() : 'Sin cliente',
    factura: r.pedido.factura?.numero ?? null,
    fecha: r.createdAt.toISOString(),
    metodo: r.metodo,
    monto: Number(r.monto),
  }))
}

export interface GastoParaLista {
  id: string
  categoria: string
  descripcion: string
  monto: unknown
  fecha: Date
  responsable: string | null
  createdBy: { nombre: string; username: string } | null
}

export interface GastoDelDia {
  id: string
  categoria: string
  descripcion: string
  monto: number
  fecha: string
  registro: string | null
}

/** #646: los gastos del día uno por uno; su suma es «Gastos» del cierre. */
export function listarGastosDelDia(gastos: readonly GastoParaLista[]): GastoDelDia[] {
  return gastos.map((g) => ({
    id: g.id,
    categoria: g.categoria,
    descripcion: g.descripcion,
    monto: Number(g.monto),
    fecha: g.fecha.toISOString(),
    registro: g.responsable?.trim() || (g.createdBy ? (g.createdBy.nombre.trim() || g.createdBy.username) : null),
  }))
}
