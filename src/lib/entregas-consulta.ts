import type { Prisma } from "@prisma/client";
import { CAPTURA_ENTREGA_PEDIDO, leerMetadata } from "./entrega-fisica-viva";

export interface EntregaConsulta {
  id: string;
  pedidoId: string;
  fecha: Date;
  repartidorId: string | null;
  cantidades: Array<{ producto: string; cantidad: number }> | null;
  fuente: "AUDITORIA" | "MOVIMIENTO" | "HISTORICO";
  precisionDia?: boolean;
  incompleto?: boolean;
}
type Tx = Pick<
  Prisma.TransactionClient,
  "historial" | "embarqueMovimiento" | "pedido"
>;
type Rango = { desde: Date; hasta: Date };
const objeto = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
const texto = (v: unknown) =>
  typeof v === "string" && v.length > 0 ? v : null;
const fechaValida = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isFinite(+d) ? d : null;
};
const enRango = (d: Date, r?: Rango) => !r || (d >= r.desde && d < r.hasta);
function diaBogota(d: Date) {
  return new Date(
    `${d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}T00:00:00-05:00`,
  );
}
function limitarRango(hechos: EntregaConsulta[], r?: Rango) {
  if (!r) return hechos;
  return hechos.flatMap((e) => {
    if (!e.precisionDia) return enRango(e.fecha, r) ? [e] : [];
    const ini = diaBogota(e.fecha),
      fin = new Date(+ini + 86400000);
    if (ini >= r.hasta || fin <= r.desde) return [];
    return [
      {
        ...e,
        cantidades: r.desde <= ini && r.hasta >= fin ? e.cantidades : null,
      },
    ];
  });
}

/** Superset para auditorías retrofechadas/offline; nunca confundir fecha de registro con el hecho. */
function fechasAuditoria(r: Rango): Prisma.HistorialWhereInput | undefined {
  if (+r.hasta - +r.desde > 32 * 86400000) return undefined;
  const dias: string[] = [];
  const d = new Date(r.desde.toISOString().slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  while (d <= r.hasta) {
    dias.push(d.toISOString().slice(0, 10) + "T");
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return {
    OR: [
      { fecha: { gte: r.desde, lt: r.hasta } },
      ...dias.map((dia) => ({ datos: { contains: dia } })),
    ],
  };
}

/**
 * Lectura de procedencia. Un acumulado sin eventos NO permite repartir las
 * cantidades entre horarios. Un embarque asignado NO demuestra quién entregó.
 */
export async function leerEntregasConsulta(
  tx: Tx,
  opciones: { ids?: string[]; rango?: Rango } = {},
): Promise<EntregaConsulta[]> {
  const { ids, rango } = opciones;
  if (ids?.length === 0) return [];
  const whereAudit: Prisma.HistorialWhereInput = {
    entidad: "Pedido",
    accion: "UPDATE",
    datos: { contains: "ENTREGA" },
    ...(ids ? { registroId: { in: ids } } : {}),
    ...(!ids && rango ? { AND: [fechasAuditoria(rango) ?? {}] } : {}),
  };
  const [auditoriaInicial, movimientos, historicos] = await Promise.all([
    tx.historial.findMany({
      where: whereAudit,
      select: { id: true, registroId: true, fecha: true, datos: true },
    }),
    tx.embarqueMovimiento.findMany({
      where: {
        tipo: "ENTREGA",
        metadata: { path: ["captura"], equals: CAPTURA_ENTREGA_PEDIDO },
        sustitucionEntrega: { none: {} },
        ...(ids
          ? {
              OR: ids.map((id) => ({
                metadata: { path: ["pedidoId"], equals: id },
              })),
            }
          : rango
            ? { createdAt: { gte: rango.desde, lt: rango.hasta } }
            : {}),
      },
      select: {
        id: true,
        producto: true,
        cantidad: true,
        metadata: true,
        createdAt: true,
        embarque: { select: { trabajadorId: true } },
      },
    }),
    tx.pedido.findMany({
      where: {
        ...(ids ? { id: { in: ids } } : {}),
        ...(!ids
          ? {
              entregadoAt: rango
                ? {
                    gte:
                      rango.desde.getUTCFullYear() < 1000
                        ? rango.desde
                        : diaBogota(rango.desde),
                    lt:
                      rango.hasta.getUTCFullYear() > 9000
                        ? rango.hasta
                        : new Date(
                            +diaBogota(new Date(+rango.hasta - 1)) + 86400000,
                          ),
                  }
                : { not: null },
            }
          : {}),
        estadoEntrega: { notIn: ["ANULADO", "CANCELADO"] },
      },
      select: {
        id: true,
        entregadoAt: true,
        entregadoPorId: true,
        items: { select: { producto: true, cantEntrega: true } },
        cPacaAguaEnt: true,
        cPacaHieloEnt: true,
        cBotellonFabEnt: true,
        cBotellonDomEnt: true,
        cBolsaAguaEnt: true,
        cBolsaHieloEnt: true,
      },
    }),
  ]);
  // Un evento registrado hoy puede corresponder a una entrega offline de ayer.
  // Recuperar su auditoría vinculada antes de atribuirlo por createdAt.
  const idsMovimiento = [
    ...new Set(
      movimientos
        .map((m) => texto(leerMetadata(m.metadata).pedidoId))
        .filter((id): id is string => !!id),
    ),
  ];
  if (!ids && rango) {
    const candidatos = [
      ...new Set([
        ...idsMovimiento,
        ...auditoriaInicial.map((a) => a.registroId),
        ...historicos.map((p) => p.id),
      ]),
    ];
    return limitarRango(
      await leerEntregasConsulta(tx, { ids: candidatos }),
      rango,
    );
  }
  const auditorias = auditoriaInicial;
  const resultado: EntregaConsulta[] = [],
    espejos = new Set<string>();
  for (const a of auditorias) {
    let datos: Record<string, unknown> | null = null;
    try {
      datos = objeto(JSON.parse(a.datos));
    } catch {
      continue;
    }
    if (
      !datos ||
      !["ENTREGA", "ENTREGA_OFICINA"].includes(String(datos.accion))
    )
      continue;
    const detalle = objeto(datos.consultaEntrega);
    if (detalle?.version === 1) {
      const eventoId = texto(detalle.eventoEntregaId);
      if (eventoId) espejos.add(eventoId);
      const fecha = fechaValida(detalle.fecha);
      if (!fecha) continue;
      const lineas = Array.isArray(detalle.cantidades)
        ? detalle.cantidades.map(objeto)
        : [];
      const validas =
        lineas.length > 0 &&
        lineas.every(
          (l) =>
            l &&
            texto(l.producto) &&
            Number.isSafeInteger(l.cantidad) &&
            Number(l.cantidad) >= 0,
        );
      const cantidades = validas
        ? lineas.map((l) => ({
            producto: String(l!.producto),
            cantidad: Number(l!.cantidad),
          }))
        : null;
      if (cantidades && !cantidades.some((l) => l.cantidad > 0)) continue;
      resultado.push({
        id: a.id,
        pedidoId: a.registroId,
        fecha,
        repartidorId: texto(detalle.repartidorId),
        cantidades,
        fuente: "AUDITORIA",
        precisionDia: detalle.precisionFecha === "DIA",
      });
    } else {
      resultado.push({
        id: a.id,
        pedidoId: a.registroId,
        fecha: fechaValida(datos.fechaEntrega) ?? a.fecha,
        repartidorId:
          datos.accion === "ENTREGA_OFICINA" ? texto(datos.repartidorId) : null,
        cantidades: null,
        fuente: "HISTORICO",
        precisionDia: datos.accion === "ENTREGA_OFICINA",
      });
    }
  }
  for (const m of movimientos) {
    const meta = leerMetadata(m.metadata);
    if (
      !meta.pedidoId ||
      (meta.eventoEntregaId && espejos.has(meta.eventoEntregaId))
    )
      continue;
    resultado.push({
      id: m.id,
      pedidoId: meta.pedidoId,
      fecha: m.createdAt,
      repartidorId: m.embarque.trabajadorId,
      cantidades:
        meta.posCierre || !Number.isSafeInteger(m.cantidad) || m.cantidad <= 0
          ? null
          : [{ producto: m.producto, cantidad: m.cantidad }],
      fuente: "MOVIMIENTO",
    });
  }
  for (const p of historicos) {
    const evidencias = resultado.filter((e) => e.pedidoId === p.id);
    const conocido = new Map<string, number>();
    for (const e of evidencias)
      for (const l of e.cantidades ?? [])
        conocido.set(l.producto, (conocido.get(l.producto) ?? 0) + l.cantidad);
    const acumulado = p.items.length
      ? p.items.map((i) => ({ producto: i.producto, cantidad: i.cantEntrega }))
      : [
          { producto: "PACA_AGUA", cantidad: p.cPacaAguaEnt },
          { producto: "PACA_HIELO", cantidad: p.cPacaHieloEnt },
          {
            producto: "BOTELLON",
            cantidad: p.cBotellonFabEnt + p.cBotellonDomEnt,
          },
          { producto: "BOLSA_AGUA", cantidad: p.cBolsaAguaEnt },
          { producto: "BOLSA_HIELO", cantidad: p.cBolsaHieloEnt },
        ];
    const porProducto = new Map<string, number>();
    for (const l of acumulado)
      porProducto.set(
        l.producto,
        (porProducto.get(l.producto) ?? 0) + l.cantidad,
      );
    const incompleto =
      [...porProducto].some(
        ([producto, cantidad]) => cantidad !== (conocido.get(producto) ?? 0),
      ) ||
      [...conocido].some(
        ([producto, cantidad]) => cantidad !== (porProducto.get(producto) ?? 0),
      );
    const exceso = [...conocido].some(
      ([producto, cantidad]) => cantidad > (porProducto.get(producto) ?? 0),
    );
    for (const e of evidencias)
      if (incompleto) {
        e.incompleto = true;
        if (exceso) e.cantidades = null;
      }
    if ((!evidencias.length || incompleto) && p.entregadoAt)
      resultado.push({
        id: `historico:${p.id}`,
        pedidoId: p.id,
        fecha: p.entregadoAt,
        repartidorId: p.entregadoPorId,
        cantidades: null,
        fuente: "HISTORICO",
        precisionDia: true,
        incompleto: true,
      });
  }
  return limitarRango(resultado, rango);
}
