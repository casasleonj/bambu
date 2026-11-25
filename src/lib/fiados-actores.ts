import type { Prisma } from "@prisma/client";
import { leerEntregasConsulta, type EntregaConsulta } from "./entregas-consulta";
import { ROLES } from "./constants";

/**
 * #614 F1: quién creó, quién entregó y quién recibió cada pago de un pedido fiado.
 * Solo hechos acreditados: nunca se infiere un autor desde la ruta/embarque actual
 * ni se reparte dinero. Un dato sin autor se devuelve como `null` (desconocido).
 */
/** Quién cobró cada pago y los montos son datos de gestión: no se entregan a repartidores ni selladores. */
export function puedeVerActoresFiados(role: string | null | undefined): boolean {
  return role === ROLES.ADMIN || role === ROLES.ASISTENTE || role === ROLES.CONTADOR;
}

export const RESPONSABLE_HISTORICO = "Responsable histórico";

export interface ResponsableFiado {
  id: string;
  nombre: string;
}
export interface EventoEntregaFiado {
  id: string;
  fecha: string;
  /** `true` cuando solo se conoce el día, no la hora. */
  soloDia: boolean;
  /** `null` = la evidencia no identifica a quien entregó. */
  responsable: ResponsableFiado | null;
  /** `null` = hay evento pero sin cantidades verificables. */
  cantidades: Array<{ producto: string; cantidad: number; cantidadRegalo?: number }> | null;
}
export interface PagoActorFiado {
  id: string;
  /** Fecha efectiva del cobro (`ocurridoAt` si existe; si no, el registro). */
  fecha: string;
  metodo: string;
  monto: number;
  /** `null` = oficina o dato anterior a la columna (el esquema no distingue). */
  recibidoPor: ResponsableFiado | null;
}
export interface ActoresFiado {
  creadoPor: string | null;
  createdAt: string;
  entregas: EventoEntregaFiado[];
  responsablesEntrega: ResponsableFiado[];
  /** Hay entrega registrada sin cantidades o sin responsable identificado. */
  entregasSinDetalle: boolean;
  pagos: PagoActorFiado[];
}

type Tx = Pick<
  Prisma.TransactionClient,
  "historial" | "embarqueMovimiento" | "pedido" | "trabajador" | "pago"
>;

/** Pura: separa la composición de la lectura para poder probarla sin base de datos. */
export function componerActoresFiado(
  pedido: { creadoPor: string | null; createdAt: Date },
  hechos: EntregaConsulta[],
  pagos: Array<{ id: string; fecha: Date; metodo: string; monto: number; recibidoPorId: string | null }>,
  nombres: ReadonlyMap<string, string>,
): ActoresFiado {
  const persona = (id: string | null): ResponsableFiado | null =>
    id ? { id, nombre: nombres.get(id) ?? RESPONSABLE_HISTORICO } : null;
  const entregas = [...hechos]
    .sort((a, b) => +a.fecha - +b.fecha || a.id.localeCompare(b.id))
    .map((e) => ({
      id: e.id,
      fecha: e.fecha.toISOString(),
      soloDia: e.precisionDia === true,
      responsable: persona(e.repartidorId),
      cantidades: e.incompleto ? null : e.cantidades,
    }));
  const vistos = new Map<string, ResponsableFiado>();
  for (const e of entregas) if (e.responsable) vistos.set(e.responsable.id, e.responsable);
  return {
    creadoPor: pedido.creadoPor,
    createdAt: pedido.createdAt.toISOString(),
    entregas,
    responsablesEntrega: [...vistos.values()],
    entregasSinDetalle: entregas.some((e) => !e.cantidades || !e.responsable),
    pagos: [...pagos]
      .sort((a, b) => +a.fecha - +b.fecha || a.id.localeCompare(b.id))
      .map((p) => ({
        id: p.id,
        fecha: p.fecha.toISOString(),
        metodo: p.metodo,
        monto: p.monto,
        recibidoPor: persona(p.recibidoPorId),
      })),
  };
}

/** Lectura por lote (sin N+1). Los nombres se resuelven por ID sin exigir que la persona siga activa. */
export async function leerActoresFiados(
  tx: Tx,
  pedidoIds: string[],
): Promise<Map<string, ActoresFiado>> {
  const salida = new Map<string, ActoresFiado>();
  if (pedidoIds.length === 0) return salida;
  const [pedidos, hechos, pagos] = await Promise.all([
    tx.pedido.findMany({
      where: { id: { in: pedidoIds } },
      select: { id: true, createdAt: true, createdBy: { select: { nombre: true } } },
    }),
    leerEntregasConsulta(tx, { ids: pedidoIds }),
    tx.pago.findMany({
      where: { pedidoId: { in: pedidoIds } },
      select: {
        id: true, pedidoId: true, metodo: true, monto: true,
        createdAt: true, ocurridoAt: true, recibidoPorId: true,
      },
    }),
  ]);
  const idsPersona = new Set<string>();
  for (const h of hechos) if (h.repartidorId) idsPersona.add(h.repartidorId);
  for (const p of pagos) if (p.recibidoPorId) idsPersona.add(p.recibidoPorId);
  const trabajadores = idsPersona.size
    ? await tx.trabajador.findMany({
        where: { id: { in: [...idsPersona] } },
        select: { id: true, nombre: true },
      })
    : [];
  const nombres = new Map(trabajadores.map((t) => [t.id, t.nombre]));
  for (const p of pedidos) {
    salida.set(
      p.id,
      componerActoresFiado(
        { creadoPor: p.createdBy?.nombre ?? null, createdAt: p.createdAt },
        hechos.filter((h) => h.pedidoId === p.id),
        pagos
          .filter((x) => x.pedidoId === p.id)
          .map((x) => ({
            id: x.id,
            fecha: x.ocurridoAt ?? x.createdAt,
            metodo: String(x.metodo),
            monto: Number(x.monto),
            recibidoPorId: x.recibidoPorId,
          })),
        nombres,
      ),
    );
  }
  return salida;
}
