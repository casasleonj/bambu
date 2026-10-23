/**
 * Lógica pura del cierre de embarque V2 (épica #447, Fase A).
 *
 * Sin React ni red: todo lo que decide qué ve y qué puede hacer el asistente
 * vive aquí para poder probarlo. Refleja las reglas ya vigentes del backend
 * (no define reglas nuevas):
 *  - PR-1 / B-12: `COMPLETO` exige acumulado = pedido; lo que falta queda
 *    pendiente en el MISMO pedido (`PARCIAL`), sin pedido hijo.
 *  - B-08: `NO_ENTREGADO` = 0 unidades nuevas en esta misión.
 *  - PR-2: `pagos` es dinero NUEVO de la misión; el cobro no puede exceder el
 *    saldo previo (`PAGOS_EXCEDIDOS`).
 *  - CierreEmbarqueService: discrepancia = |cargadas − entregadas − devueltas
 *    − cambios − rotas| por producto (faltantes + sobrantes).
 */

import type { CuadrePedido, Pedido, PagoItem, ProductoRetorno, VentaLibre } from './types'

type EntKey = keyof CuadrePedido['productosEntregados']

export interface LineaEntrega {
  key: EntKey
  codigo: string
  label: string
  pidio: number
  yaEntregado: number
  pendiente: number
  ahora: number
  /** Lo que quedaría sin entregar tras esta misión (≥ 0). */
  falta: number
  /** Lo que se intenta entregar por encima del pendiente (≥ 0). */
  exceso: number
}

export type EstadoEntrega = CuadrePedido['entregado']

export interface ResultadoEntrega {
  estado: EstadoEntrega
  totalAhora: number
  totalFalta: number
  totalExceso: number
  hayExceso: boolean
  /** Hay pendiente y se entrega algo: el asistente debe decir qué pasa con el resto. */
  requiereDecision: boolean
}

const BASE: Array<{ key: EntKey; ped: keyof Pedido; ent: keyof Pedido; codigo: string; label: string }> = [
  { key: 'cPacaAguaEnt', ped: 'cPacaAguaPed', ent: 'cPacaAguaEnt', codigo: 'PACA_AGUA', label: 'Paca de agua' },
  { key: 'cPacaHieloEnt', ped: 'cPacaHieloPed', ent: 'cPacaHieloEnt', codigo: 'PACA_HIELO', label: 'Paca de hielo' },
  { key: 'cBolsaAguaEnt', ped: 'cBolsaAguaPed', ent: 'cBolsaAguaEnt', codigo: 'BOLSA_AGUA', label: 'Bolsa de agua' },
  { key: 'cBolsaHieloEnt', ped: 'cBolsaHieloPed', ent: 'cBolsaHieloEnt', codigo: 'BOLSA_HIELO', label: 'Bolsa de hielo' },
]

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/**
 * Líneas por producto realmente pedido. El botellón se muestra como UNA línea:
 * el pedido guarda la cantidad en la columna Fab (punto) o Dom (domicilio), no
 * en ambas; mostrar las dos invitaba a teclear en la equivocada.
 */
export function lineasEntrega(pedido: Pedido, ahora: CuadrePedido['productosEntregados']): LineaEntrega[] {
  const filas: Array<{ key: EntKey; codigo: string; label: string; pidio: number; ya: number }> = []
  for (const b of BASE.slice(0, 2)) {
    filas.push({ key: b.key, codigo: b.codigo, label: b.label, pidio: n(pedido[b.ped]), ya: n(pedido[b.ent]) })
  }
  const fabPidio = n(pedido.cBotellonFabPed)
  const domPidio = n(pedido.cBotellonDomPed)
  if (fabPidio > 0 || domPidio > 0) {
    const usaFab = fabPidio > 0
    filas.push({
      key: usaFab ? 'cBotellonFabEnt' : 'cBotellonDomEnt',
      codigo: 'BOTELLON',
      label: 'Botellón',
      pidio: fabPidio + domPidio,
      ya: n(pedido.cBotellonFabEnt) + n(pedido.cBotellonDomEnt),
    })
  }
  for (const b of BASE.slice(2)) {
    filas.push({ key: b.key, codigo: b.codigo, label: b.label, pidio: n(pedido[b.ped]), ya: n(pedido[b.ent]) })
  }

  return filas
    .filter((f) => f.pidio > 0)
    .map((f) => {
      const pendiente = Math.max(0, f.pidio - f.ya)
      const a = Math.max(0, n(ahora[f.key]))
      return {
        key: f.key,
        codigo: f.codigo,
        label: f.label,
        pidio: f.pidio,
        yaEntregado: f.ya,
        pendiente,
        ahora: a,
        falta: Math.max(0, pendiente - a),
        exceso: Math.max(0, a - pendiente),
      }
    })
}

/** Estado derivado de las cantidades; la UI ya no pide elegirlo a mano. */
export function derivarEntrega(lineas: LineaEntrega[]): ResultadoEntrega {
  const totalAhora = lineas.reduce((s, l) => s + l.ahora, 0)
  const totalFalta = lineas.reduce((s, l) => s + l.falta, 0)
  const totalExceso = lineas.reduce((s, l) => s + l.exceso, 0)
  const totalPendiente = lineas.reduce((s, l) => s + l.pendiente, 0)

  let estado: EstadoEntrega
  if (totalPendiente === 0) estado = 'COMPLETO'
  else if (totalAhora === 0) estado = 'NO_ENTREGADO'
  else if (totalFalta === 0 && totalExceso === 0) estado = 'COMPLETO'
  else estado = 'PARCIAL'

  return {
    estado,
    totalAhora,
    totalFalta,
    totalExceso,
    hayExceso: totalExceso > 0,
    requiereDecision: estado === 'PARCIAL',
  }
}

/** «Entregó» por defecto: el pendiente de cada línea (entrega completa). */
export function entregaCompleta(pedido: Pedido): CuadrePedido['productosEntregados'] {
  const r: CuadrePedido['productosEntregados'] = {
    cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
  }
  for (const l of lineasEntrega(pedido, r)) r[l.key] = l.pendiente
  return r
}

// ─── Dinero ──────────────────────────────────────────────────────────────

export interface ResumenDinero {
  /** Obligación del pedido (no se recalcula por lo entregado: PR-1). */
  valorPedido: number
  yaPagado: number
  /** Dinero nuevo capturado en esta misión. */
  cobrarAhora: number
  saldoPrevio: number
  /** Lo que sigue debiendo el cliente tras esta misión → fiado. */
  queda: number
  esFiado: boolean
  pagadoCompleto: boolean
  /** El cobro supera el saldo previo: el servidor lo rechaza (PAGOS_EXCEDIDOS). */
  excede: boolean
  /** Efectivo físico que debe entregar el repartidor por este pedido. */
  efectivo: number
  /** Cobrado por medios digitales: nace REPORTADO y se verifica después. */
  digitalPorVerificar: number
}

export function resumenDineroPedido(pedido: Pick<Pedido, 'total' | 'totalPagado'>, pagos: PagoItem[]): ResumenDinero {
  const valorPedido = Number(pedido.total) || 0
  const yaPagado = Number(pedido.totalPagado) || 0
  const validos = pagos.filter((p) => (p.monto || 0) > 0)
  const cobrarAhora = validos.reduce((s, p) => s + p.monto, 0)
  const efectivo = validos.filter((p) => p.metodo === 'EFECTIVO').reduce((s, p) => s + p.monto, 0)
  const saldoPrevio = Math.max(0, valorPedido - yaPagado)
  const excede = cobrarAhora > saldoPrevio + 0.01
  const queda = Math.max(0, saldoPrevio - cobrarAhora)
  return {
    valorPedido,
    yaPagado,
    cobrarAhora,
    saldoPrevio,
    queda,
    esFiado: queda > 0.01,
    pagadoCompleto: queda <= 0.01,
    excede,
    efectivo,
    digitalPorVerificar: cobrarAhora - efectivo,
  }
}

// ─── Conciliación ────────────────────────────────────────────────────────

export type StockPorProducto = Record<'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO', number>

export interface ResultadoConciliacion {
  /** cargadas − entregadas − devueltas − cambios − rotas (>0 falta, <0 sobra). */
  porProducto: StockPorProducto
  totalFaltantes: number
  totalSobrantes: number
  /** Misma definición que el servidor: faltantes + sobrantes (valor absoluto). */
  total: number
}

const PRODUCTOS: Array<keyof StockPorProducto> = ['PACA_AGUA', 'PACA_HIELO', 'BOTELLON', 'BOLSA_AGUA', 'BOLSA_HIELO']

export function conciliar(
  carga: StockPorProducto,
  entregado: StockPorProducto,
  retornos: Record<string, Partial<ProductoRetorno>>,
): ResultadoConciliacion {
  const porProducto = {} as StockPorProducto
  let totalFaltantes = 0
  let totalSobrantes = 0
  for (const p of PRODUCTOS) {
    const r = retornos[p] ?? {}
    const disc = n(carga[p]) - n(entregado[p]) - n(r.devueltas) - n(r.cambios) - n(r.rotas)
    porProducto[p] = disc
    totalFaltantes += Math.max(0, disc)
    totalSobrantes += Math.max(0, -disc)
  }
  return { porProducto, totalFaltantes, totalSobrantes, total: totalFaltantes + totalSobrantes }
}

// ─── Preview ─────────────────────────────────────────────────────────────

export interface ClasificacionPreview {
  tipo: 'rechazo' | 'red' | 'sesion'
  mensaje?: string
}

/**
 * Un 4xx del preview es el backend diciendo «esto no se puede cerrar así»
 * (regla de negocio): se muestra y bloquea. Solo la falta de red o un 5xx
 * justifican el «estimado local» (D7: el preview no es gate duro ante fallas
 * de infraestructura, pero sí ante un rechazo explícito).
 */
export function clasificarErrorPreview(status: number | null, mensaje?: string): ClasificacionPreview {
  if (status === 401 || status === 403) return { tipo: 'sesion' }
  if (status !== null && status >= 400 && status < 500 && status !== 429 && status !== 408) {
    return { tipo: 'rechazo', mensaje: mensaje?.trim() || 'El servidor rechazó el cierre. Revisa los pedidos y vuelve a intentar.' }
  }
  return { tipo: 'red' }
}

// ─── Venta libre ─────────────────────────────────────────────────────────

export const CONSUMIDOR_FINAL_ID = 'CONSUMIDOR_FINAL'

export type PreciosVentaLibre = Partial<Record<'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO', number>>

export function unidadesVentaLibre(v: VentaLibre): number {
  return v.cPacaAgua + v.cPacaHielo + v.cBotellonFab + v.cBotellonDom + v.cBolsaAgua + v.cBolsaHielo
}

/** Total con los precios que resolverá el servidor (DOMICILIO, sin precios especiales). */
export function totalVentaLibre(v: VentaLibre, precios: PreciosVentaLibre): number {
  const p = (c: keyof PreciosVentaLibre) => precios[c] ?? 0
  return (
    v.cPacaAgua * p('PACA_AGUA') +
    v.cPacaHielo * p('PACA_HIELO') +
    (v.cBotellonFab + v.cBotellonDom) * p('BOTELLON') +
    v.cBolsaAgua * p('BOLSA_AGUA') +
    v.cBolsaHielo * p('BOLSA_HIELO')
  )
}

/** Motivos que impiden registrar la venta libre; vacío = válida. */
export function validarVentaLibre(v: VentaLibre, total: number): string[] {
  const motivos: string[] = []
  const pagado = v.pagos.reduce((s, p) => s + (p.monto || 0), 0)
  const unidades = unidadesVentaLibre(v)

  if (!v.clienteId) motivos.push('Elige un cliente o marca «Venta al paso (sin cliente)».')
  if (unidades === 0) {
    motivos.push(pagado > 0 ? 'Registraste un pago sin productos: agrega los productos o quita el pago.' : 'La venta no tiene productos.')
    return motivos
  }
  if (total > 0 && pagado > total + 0.01) {
    motivos.push(`El pago (${pagado}) excede el total de la venta (${total}).`)
  }
  const saldo = total - pagado
  if (v.anonima && saldo > 0.01) {
    motivos.push('La venta al paso exige pago completo: sin cliente no hay a quién cobrarle después.')
  }
  if (v.clienteBloqueado && saldo > 0.01) {
    motivos.push('El cliente está bloqueado: no se puede dejar saldo a su cargo sin una excepción de crédito autorizada.')
  }
  return motivos
}

// ─── Observaciones del cierre ────────────────────────────────────────────

/**
 * Hecho «el cliente ya no quiere el resto»: sin operación económica todavía
 * (#451), queda escrito en las observaciones del cierre para que la oficina lo
 * resuelva. No cambia cantidades ni totales.
 */
export function notaReduccionPendiente(pedidos: Pedido[], cuadres: Record<string, CuadrePedido>): string {
  const lineas: string[] = []
  for (const pedido of pedidos) {
    const c = cuadres[pedido.id]
    if (c?.decisionPendiente !== 'NO_QUIERE_RESTO') continue
    const r = derivarEntrega(lineasEntrega(pedido, c.productosEntregados))
    if (r.totalFalta > 0) {
      lineas.push(`Pedido #${pedido.numero}: el cliente dijo que no quiere las ${r.totalFalta} unidad(es) restantes. Pendiente de autorización en oficina; el total no cambió.`)
    }
  }
  return lineas.join('\n')
}
