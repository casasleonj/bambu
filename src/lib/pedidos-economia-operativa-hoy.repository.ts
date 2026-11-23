// #853 Fase 3: lectura de la economía de lo entregado HOY. Solo lectura: no escribe ni recalcula
// caja, nómina, inventario ni saldos. Reutiliza las fuentes canónicas:
//   - valor entregado: valoración del Dashboard (#883), la misma de «Ventas».
//   - reparto de pagos: regla de fiados (#656) vía `leerExigibles` (FIFO por antigüedad).
//   - cobros recibidos: `leerCobrosPeriodo`.
import type { Prisma } from "@prisma/client";
import { leerVentasEntregadasDiaPorPedido } from "@/modules/dashboard/infrastructure/ventas-entregadas.repository";
import { leerCobrosPeriodo } from "./cobros-periodo";
import { leerExigibles } from "./entregas-exigibles-db";
import { exigiblesActivos } from "./exigibles-flag";
import {
  calcularEconomiaOperativaHoy,
  exigibleParaEconomia,
  type EconomiaOperativaHoy,
  type PedidoEconomiaEntrada,
} from "./pedidos-economia-operativa-hoy";
import type { RangoDia, detalleUnidadesEntregadasDelDia } from "./unidades-entregadas-dia";

type Tx = Prisma.TransactionClient;

export interface EconomiaHoyResultado extends EconomiaOperativaHoy {
  /** Unidades de hoy sin precio verificable (informativo; su valor no está en «Entregado hoy»). */
  unidadesSinPrecio: number;
  /** Dinero que ENTRÓ hoy por cobros (cualquier pedido). Otra magnitud: no se suma a las demás. */
  cobrosHoy: { neto: number; porConciliar: boolean };
}

const centavos = (v: unknown) => {
  const n = Math.round(Number(v ?? 0) * 100);
  if (!Number.isSafeInteger(n)) throw new Error("Importe no verificable");
  return n;
};

export async function leerEconomiaOperativaHoy(
  tx: Tx,
  rango: RangoDia,
  /** Entregas del día ya leídas en la misma transacción (evita repetir la consulta más pesada). */
  base?: Awaited<ReturnType<typeof detalleUnidadesEntregadasDelDia>>,
): Promise<EconomiaHoyResultado> {
  const ventas = await leerVentasEntregadasDiaPorPedido(tx, { start: rango.desde, end: rango.hasta }, base);
  const ids = [...new Set([...ventas.porPedidoCentavos.keys(), ...ventas.pedidosSinPrecio])];
  const aproximados = new Set(ventas.unidades.aproximados.map((a) => a.pedidoId));

  const pedidos = ids.length
    ? await tx.pedido.findMany({
        where: { id: { in: ids }, estadoEntrega: { notIn: ["ANULADO", "CANCELADO"] } },
        select: {
          id: true,
          estadoEntrega: true,
          saldo: true,
          totalPagado: true,
          entregasExigibles: { select: { entregadoAt: true } },
        },
      })
    : [];

  // Exigible vigente solo de los parciales y solo con la proyección de fiados activa: con ella apagada
  // no se lee la tabla de hechos (misma conducta que el resto del sistema).
  const proyeccionActiva = exigiblesActivos();
  const parciales = pedidos.filter((p) => p.estadoEntrega !== "ENTREGADO").map((p) => p.id);
  const vigentes = proyeccionActiva && parciales.length ? await leerExigibles(tx, { id: { in: parciales } }) : new Map<string, number>();

  const entradas: PedidoEconomiaEntrada[] = pedidos.map((p) => {
    const hechosDeHoy = p.entregasExigibles.filter((e) => e.entregadoAt >= rango.desde && e.entregadoAt < rango.hasta).length;
    return {
      id: p.id,
      valorHoyCentavos: ventas.porPedidoCentavos.get(p.id) ?? 0,
      sinPrecio: ventas.pedidosSinPrecio.has(p.id),
      aproximado: aproximados.has(p.id),
      totalPagadoCentavos: centavos(p.totalPagado),
      exigibleCentavos: exigibleParaEconomia({
        estadoEntrega: p.estadoEntrega,
        saldoCentavos: centavos(p.saldo),
        exigibleVigenteCentavos: Math.round((vigentes.get(p.id) ?? 0) * 100),
        proyeccionActiva,
        hechosDeHoy,
      }),
    };
  });

  const economia = calcularEconomiaOperativaHoy(entradas);
  // Seguro de integridad: «Entregado hoy» ES el total de Ventas del Dashboard. Si no suma exactamente
  // lo mismo, no se muestran cifras que no concilian.
  if (Math.round(economia.entregadoHoy * 100) !== Math.round(ventas.total * 100)) {
    throw new Error("ECONOMIA_NO_CONCILIA_CON_DASHBOARD");
  }

  const cobros = await leerCobrosPeriodo(tx, rango.desde, rango.hasta);
  return {
    ...economia,
    unidadesSinPrecio: ventas.sinPrecio,
    cobrosHoy: { neto: cobros.subtotalRegistrado, porConciliar: cobros.porConciliar.length > 0 },
  };
}
