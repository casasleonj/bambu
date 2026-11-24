// #853 Fase 3: dinero de lo entregado HOY. Cálculo puro, solo lectura.
//
// Tres cifras con una identidad:
//   Entregado hoy = Pagado de eso + Por cobrar de eso + Por conciliar
//
// - «Entregado hoy» es la valoración canónica del Dashboard (#883): valor comercial de las
//   unidades que salieron hoy, no el total del pedido ni lo cobrado.
// - Los pagos de un pedido cubren primero las entregas MÁS ANTIGUAS (regla de fiados #656,
//   `asignarPagoFIFO`). Por eso lo que queda sin pagar de un pedido pertenece a sus entregas más
//   recientes: la parte de hoy sin pagar es min(exigible del pedido, valor entregado hoy).
// - Lo que no se puede afirmar con evidencia queda «por conciliar»; nunca se inventa un reparto.
// - «Cobros recibidos hoy» es otra magnitud (dinero que entró hoy, de cualquier pedido) y NO se
//   suma ni se compara con estas cifras.

export interface PedidoEconomiaEntrada {
  id: string;
  /** Valor comercial de lo entregado hoy en este pedido, en centavos (valoración del Dashboard). */
  valorHoyCentavos: number;
  /** Hay unidades de hoy sin precio verificable: el reparto pagado/por cobrar no es confiable. */
  sinPrecio: boolean;
  /**
   * El pedido no tiene desglose de entregas por día y el Dashboard lo atribuye a su fecha de creación
   * («aproximado»): su entrega pudo ser de otro día, así que no se afirma qué parte es de hoy.
   */
  aproximado?: boolean;
  /** Pagado acumulado del pedido, en centavos. */
  totalPagadoCentavos: number;
  /** Deuda exigible vigente del pedido (regla de fiados) en centavos; null si no se puede afirmar. */
  exigibleCentavos: number | null;
}

export interface EconomiaOperativaHoy {
  entregadoHoy: number;
  pagadoDeEso: number;
  porCobrarDeEso: number;
  /** Valor entregado hoy cuyo reparto pagado/por cobrar no se puede afirmar. */
  porConciliar: { pedidos: number; valor: number };
}

const entero = (n: number) => Number.isSafeInteger(n);

/**
 * Exigible del pedido que se usa para repartir lo de hoy, o null si no hay evidencia.
 * - ENTREGADO: el saldo íntegro es exigible (aunque solo la última entrega tenga hecho).
 * - Parcial: solo con la proyección de fiados activa y al menos un hecho de entrega de HOY;
 *   sin eso no se inventa exigible (decisión del PO en #656).
 */
export function exigibleParaEconomia(p: {
  estadoEntrega: string;
  saldoCentavos: number;
  exigibleVigenteCentavos: number;
  proyeccionActiva: boolean;
  hechosDeHoy: number;
}): number | null {
  if (p.estadoEntrega === "ENTREGADO") return Math.max(0, p.saldoCentavos);
  if (!p.proyeccionActiva || p.hechosDeHoy <= 0) return null;
  return Math.max(0, p.exigibleVigenteCentavos);
}

export function calcularEconomiaOperativaHoy(pedidos: readonly PedidoEconomiaEntrada[]): EconomiaOperativaHoy {
  let entregado = 0;
  let pagado = 0;
  let porCobrar = 0;
  let conciliarValor = 0;
  let conciliarPedidos = 0;
  const vistos = new Set<string>();

  for (const p of pedidos) {
    if (vistos.has(p.id)) continue; // una sola identidad por pedido
    vistos.add(p.id);
    if (![p.valorHoyCentavos, p.totalPagadoCentavos].every(entero) || p.valorHoyCentavos < 0 || p.totalPagadoCentavos < 0) {
      throw new Error("Importe de entrega no verificable");
    }
    if (p.valorHoyCentavos === 0) continue;
    entregado += p.valorHoyCentavos;

    const porCobrarHoy = p.exigibleCentavos === null || !entero(p.exigibleCentavos) || p.exigibleCentavos < 0
      ? null
      : Math.min(p.exigibleCentavos, p.valorHoyCentavos);
    const pagadoHoy = porCobrarHoy === null ? null : p.valorHoyCentavos - porCobrarHoy;
    // Más pagado que lo que el pedido tiene pagado: el valor de hoy no concuerda (p. ej. un precio
    // corregido después de entregar). No se fuerza: queda por conciliar.
    if (p.sinPrecio || p.aproximado === true || porCobrarHoy === null || pagadoHoy === null || pagadoHoy > p.totalPagadoCentavos) {
      conciliarValor += p.valorHoyCentavos;
      conciliarPedidos += 1;
      continue;
    }
    pagado += pagadoHoy;
    porCobrar += porCobrarHoy;
  }

  return {
    entregadoHoy: entregado / 100,
    pagadoDeEso: pagado / 100,
    porCobrarDeEso: porCobrar / 100,
    porConciliar: { pedidos: conciliarPedidos, valor: conciliarValor / 100 },
  };
}
