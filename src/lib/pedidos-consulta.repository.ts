import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { canReadFacturas } from "./permissions";
import { getAnonymousClientDisplayName } from "./cliente-canonical";
import { pickCoords } from "./geo/pedido-coords";
import { pickDireccionTexto } from "./geo/pedido-direccion";
import { tipoDesdeCanal } from "./pedido-canal";
import { PedidoMapper } from "@/modules/pedidos/infrastructure/mappers/PedidoMapper";
import { PedidoDTOMapper } from "@/modules/pedidos/application/dto/PedidoDTOMapper";
import {
  leerCobrosPeriodo,
  resumirCobrosPeriodo,
  type CobrosPeriodo,
} from "./cobros-periodo";
import {
  leerEntregasConsulta,
  type EntregaConsulta,
} from "./entregas-consulta";
import {
  parametrosConsulta,
  rangoConsultaPedidos,
  type FiltrosConsultaPedidos,
  type ProductoConsulta,
  type ResultadoConsultaPedidos,
} from "./pedidos-consulta";

export function whereConsultaPedidos(
  f: FiltrosConsultaPedidos,
): Prisma.PedidoWhereInput {
  const and: Prisma.PedidoWhereInput[] = [];
  if (f.registro === "activos")
    and.push({ estadoEntrega: { notIn: ["CANCELADO", "ANULADO"] } });
  if (f.registro === "anulados") and.push({ estadoEntrega: "ANULADO" });
  if (f.clienteId) and.push({ clienteId: f.clienteId });
  if (f.canal.length) and.push({ canal: { in: f.canal } });
  if (f.origen.length)
    and.push({
      origen: { in: f.origen as Prisma.EnumOrigenPedidoFilter["in"] },
    });
  if (f.conRecurrencia) and.push({ origen: "RECURRENTE" });
  if (f.estadoEntrega.length)
    and.push({
      estadoEntrega: {
        in: f.estadoEntrega as Prisma.EnumEstadoEntregaFilter["in"],
      },
    });
  if (f.estadoPago.length)
    and.push({
      estadoPago: { in: f.estadoPago as Prisma.EnumEstadoPagoFilter["in"] },
    });
  if (f.pago === "sin_pago") and.push({ totalPagado: 0 });
  if (f.pago === "parcial")
    and.push({ totalPagado: { gt: 0 }, saldo: { gt: 0 } });
  if (f.pago === "registrado")
    and.push({ estadoPago: { in: ["PAGADO", "ANTICIPADO"] } });
  if (f.pago === "fiado")
    and.push({ estadoEntrega: "ENTREGADO", saldo: { gt: 0 } });
  if (f.foco === "porPlanificar")
    and.push({ estadoEntrega: "PENDIENTE", embarqueId: null });
  if (f.foco === "entregaParcial")
    and.push({
      estadoEntrega: { notIn: ["ENTREGADO", "CANCELADO", "ANULADO"] },
      OR: [
        { items: { some: { cantEntrega: { gt: 0 } } } },
        { cPacaAguaEnt: { gt: 0 } },
        { cPacaHieloEnt: { gt: 0 } },
        { cBotellonFabEnt: { gt: 0 } },
        { cBotellonDomEnt: { gt: 0 } },
        { cBolsaAguaEnt: { gt: 0 } },
        { cBolsaHieloEnt: { gt: 0 } },
      ],
    });
  if (f.foco === "enRuta") and.push({ estadoEntrega: "EN_RUTA" });
  if (f.foco === "esperandoPago")
    and.push({ estadoEntrega: "ENTREGADO", saldo: { gt: 0 } });
  if (f.foco === "pendientesN2")
    and.push({ obligacion: { is: { estado: "ABIERTA" } } });
  if (f.foco === "excepciones")
    and.push({
      OR: [
        { disputaAbierta: true },
        { pagos: { some: { confirmacion: "DISCREPANTE" } } },
        { casos: { some: { status: { in: ["ABIERTO", "EN_PROCESO"] } } } },
      ],
    });
  if ((f.fechaBase === "pedido" || f.fechaBase === "creacion") && !f.all) {
    const r = rangoConsultaPedidos(f);
    and.push(
      f.fechaBase === "creacion"
        ? { createdAt: { gte: r.desde, lt: r.hasta } }
        : { fecha: { gte: r.desde, lt: r.hasta } },
    );
  }
  if (f.search) {
    const literal = f.search.replace(/[\\%_]/g, "\\$&");
    const text = { contains: literal, mode: "insensitive" as const };
    const or: Prisma.PedidoWhereInput[] = [
      {
        cliente: {
          is: {
            OR: [{ nombre: text }, { apellido: text }, { telefono: text }],
          },
        },
      },
      { negocio: { is: { nombre: text } } },
      { createdBy: { is: { nombre: text } } },
    ];
    const n = f.search.replace(/^#/, "");
    if (
      /^\d+$/.test(n) &&
      Number.isSafeInteger(Number(n)) &&
      Number(n) <= 2147483647
    )
      or.push({ numero: Number(n) });
    and.push({ OR: or });
  }
  return { AND: and };
}
const validoFinanciero: Prisma.PedidoWhereInput = {
  estadoEntrega: { notIn: ["ANULADO", "CANCELADO"] },
  estado: { notIn: ["ANULADO", "CANCELADO"] },
  estadoPago: { not: "ANULADO" },
};
const centavos = (v: unknown) => {
  const n = Math.round(Number(v ?? 0) * 100);
  if (!Number.isSafeInteger(n)) throw new Error("Importe no verificable");
  return n;
};
const dec = (v: unknown) => centavos(v) / 100;

/** Una foto de la consulta completa, independiente de la página visible. */
export async function consultarPedidos(
  f: FiltrosConsultaPedidos,
  role: string | null,
  client = prisma,
): Promise<ResultadoConsultaPedidos> {
  return client.$transaction(
    async (tx) => {
      const rango = rangoConsultaPedidos(f),
        where = whereConsultaPedidos(f);
      const and = where.AND as Prisma.PedidoWhereInput[];
      let cobros: CobrosPeriodo | null = null,
        entregas: EntregaConsulta[] | null = null;
      if (f.fechaBase === "cobro") {
        cobros = await leerCobrosPeriodo(tx, rango.desde, rango.hasta);
        const ids = [
          ...new Set([
            ...cobros.movimientos.map((c) => c.pedidoId),
            ...cobros.porConciliar
              .map((c) => c.pedidoId)
              .filter((id): id is string => !!id),
          ]),
        ];
        and.push({ id: { in: ids } });
      }
      if (f.fechaBase === "entrega") {
        entregas = await leerEntregasConsulta(tx, { rango });
        const ids = [
          ...new Set(
            entregas
              .filter(
                (e) =>
                  !f.repartidorId.length ||
                  (!!e.repartidorId && f.repartidorId.includes(e.repartidorId)),
              )
              .map((e) => e.pedidoId),
          ),
        ];
        and.push({ id: { in: ids } });
      } else if (f.repartidorId.length) {
        const candidatos = await tx.pedido.findMany({
          where,
          select: { id: true },
        });
        entregas = await leerEntregasConsulta(tx, {
          ids: candidatos.map((p) => p.id),
        });
        and.push({
          id: {
            in: [
              ...new Set(
                entregas
                  .filter(
                    (e) =>
                      !!e.repartidorId &&
                      f.repartidorId.includes(e.repartidorId),
                  )
                  .map((e) => e.pedidoId),
              ),
            ],
          },
        });
      }
      const fin: Prisma.PedidoWhereInput = { AND: [where, validoFinanciero] };
      const [total, rows, repartidores, sumas, fiados] = await Promise.all([
        tx.pedido.count({ where }),
        tx.pedido.findMany({
          where,
          orderBy: [{ fecha: "desc" }, { numero: "desc" }, { id: "asc" }],
          skip: (f.page - 1) * f.pageSize,
          take: f.pageSize,
          include: {
            items: true,
            pagos: true,
            createdBy: { select: { nombre: true } },
            cliente: { include: { ruta: { select: { nombre: true } } } },
            negocio: { include: { ruta: { select: { nombre: true } } } },
            obligacion: {
              select: {
                id: true,
                producto: true,
                estado: true,
                cantidadOriginal: true,
                cantidadCumplida: true,
              },
            },
            casos: {
              where: { status: { in: ["ABIERTO", "EN_PROCESO"] } },
              select: {
                id: true,
                alertaTipo: true,
                severidad: true,
                status: true,
              },
            },
            embarque: {
              select: {
                id: true,
                numeroDia: true,
                trabajador: { select: { nombre: true } },
              },
            },
            factura: canReadFacturas(role)
              ? { select: { id: true, numero: true, estado: true } }
              : false,
          },
        }),
        tx.trabajador.findMany({
          where: {
            OR: [
              { rol: "REPARTIDOR" },
              { usaMoto: true },
              { pedidosEntregados: { some: {} } },
            ],
          },
          select: { id: true, nombre: true, activo: true },
          orderBy: [{ nombre: "asc" }, { id: "asc" }],
        }),
        f.resumen
          ? tx.pedido.aggregate({
              where: fin,
              _sum: { total: true, totalPagado: true, saldo: true },
            })
          : null,
        f.resumen
          ? tx.pedido.aggregate({
              where: {
                AND: [fin, { estadoEntrega: "ENTREGADO", saldo: { gt: 0 } }],
              },
              _sum: { saldo: true },
            })
          : null,
      ]);
      let productos: ProductoConsulta[] = [],
        entregasPorConciliar = 0;
      const idsPagina = rows.map((p) => p.id);
      const hechosPagina = await leerEntregasConsulta(tx, { ids: idsPagina });
      if (f.resumen) {
        if (f.fechaBase === "entrega" || cobros) {
          const elegibles = await tx.pedido.findMany({
            where: fin,
            select: { id: true },
          });
          const ids = new Set(elegibles.map((p) => p.id));
          if (cobros)
            cobros = resumirCobrosPeriodo(
              cobros.movimientos.filter((c) => ids.has(c.pedidoId)),
              cobros.porConciliar.filter(
                (c) => !c.pedidoId || ids.has(c.pedidoId),
              ),
            );
          if (entregas && f.fechaBase === "entrega") {
            const hechos = entregas.filter(
              (e) =>
                ids.has(e.pedidoId) &&
                (!f.repartidorId.length ||
                  (!!e.repartidorId &&
                    f.repartidorId.includes(e.repartidorId))),
            );
            entregasPorConciliar = new Set(
              hechos
                .filter((e) => !e.cantidades || e.incompleto)
                .map((e) => e.pedidoId),
            ).size;
            const sums = new Map<string, number>();
            for (const e of hechos)
              for (const l of e.cantidades ?? [])
                sums.set(l.producto, (sums.get(l.producto) ?? 0) + l.cantidad);
            productos = [...sums].map(([producto, entregadas]) => ({
              producto,
              pedidas: 0,
              entregadas,
            }));
          }
        }
        if (f.fechaBase !== "entrega") {
          const [lineas, legacy] = await Promise.all([
            tx.pedidoItem.groupBy({
              by: ["producto"],
              where: { pedido: { is: fin } },
              _sum: { cantPedido: true, cantEntrega: true },
            }),
            tx.pedido.aggregate({
              where: { AND: [fin, { items: { none: {} } }] },
              _sum: {
                cPacaAguaPed: true,
                cPacaAguaEnt: true,
                cPacaHieloPed: true,
                cPacaHieloEnt: true,
                cBotellonFabPed: true,
                cBotellonFabEnt: true,
                cBotellonDomPed: true,
                cBotellonDomEnt: true,
                cBolsaAguaPed: true,
                cBolsaAguaEnt: true,
                cBolsaHieloPed: true,
                cBolsaHieloEnt: true,
              },
            }),
          ]);
          const sums = new Map(
            lineas.map((l) => [
              l.producto,
              {
                producto: l.producto,
                pedidas: l._sum.cantPedido ?? 0,
                entregadas: l._sum.cantEntrega ?? 0,
              },
            ]),
          );
          for (const [producto, pedidas, entregadas] of [
            ["PACA_AGUA", legacy._sum.cPacaAguaPed, legacy._sum.cPacaAguaEnt],
            [
              "PACA_HIELO",
              legacy._sum.cPacaHieloPed,
              legacy._sum.cPacaHieloEnt,
            ],
            [
              "BOTELLON",
              (legacy._sum.cBotellonFabPed ?? 0) +
                (legacy._sum.cBotellonDomPed ?? 0),
              (legacy._sum.cBotellonFabEnt ?? 0) +
                (legacy._sum.cBotellonDomEnt ?? 0),
            ],
            [
              "BOLSA_AGUA",
              legacy._sum.cBolsaAguaPed,
              legacy._sum.cBolsaAguaEnt,
            ],
            [
              "BOLSA_HIELO",
              legacy._sum.cBolsaHieloPed,
              legacy._sum.cBolsaHieloEnt,
            ],
          ] as const)
            if (pedidas || entregadas) {
              const a = sums.get(producto) ?? {
                producto,
                pedidas: 0,
                entregadas: 0,
              };
              a.pedidas += pedidas ?? 0;
              a.entregadas += entregadas ?? 0;
              sums.set(producto, a);
            }
          productos = [...sums.values()];
        }
      }
      const nombres = new Map(repartidores.map((r) => [r.id, r.nombre]));
      const pedidos = rows.map((raw) => {
        const dto = PedidoDTOMapper.toResumen(
          PedidoMapper.fromPrisma({ ...raw, factura: undefined }),
        );
        const hechos = hechosPagina
          .filter((e) => e.pedidoId === raw.id)
          .sort((a, b) => +b.fecha - +a.fecha);
        const ids = [
          ...new Set(
            hechos
              .map((e) => e.repartidorId)
              .filter((id): id is string => !!id),
          ),
        ];
        const coords = pickCoords({
          pedido: { lat: raw.entregaLat, lng: raw.entregaLng },
          cliente: raw.cliente,
          negocio: raw.negocio,
        });
        const direccion = pickDireccionTexto({
          cliente: raw.cliente,
          negocio: raw.negocio,
          overrideDireccion: raw.direccionEntrega,
          overrideBarrio: raw.barrioEntrega,
        });
        const legacy = raw.items.length
          ? {}
          : {
              cPacaAguaPed: raw.cPacaAguaPed,
              cPacaAguaEnt: raw.cPacaAguaEnt,
              cPacaHieloPed: raw.cPacaHieloPed,
              cPacaHieloEnt: raw.cPacaHieloEnt,
              cBotellonFabPed: raw.cBotellonFabPed,
              cBotellonFabEnt: raw.cBotellonFabEnt,
              cBotellonDomPed: raw.cBotellonDomPed,
              cBotellonDomEnt: raw.cBotellonDomEnt,
              cBolsaAguaPed: raw.cBolsaAguaPed,
              cBolsaAguaEnt: raw.cBolsaAguaEnt,
              cBolsaHieloPed: raw.cBolsaHieloPed,
              cBolsaHieloEnt: raw.cBolsaHieloEnt,
            };
        return {
          ...dto,
          ...legacy,
          embarqueId: dto.embarqueId ?? undefined,
          tipo: tipoDesdeCanal(raw.canal),
          saldo: dec(raw.saldo),
          nombreCli:
            getAnonymousClientDisplayName(raw.clienteId, "short") ??
            raw.cliente.nombre,
          apellidoCli: raw.cliente.apellido,
          telefonoCli: raw.cliente.telefono,
          nombreNegocioCli: raw.negocio?.nombre ?? null,
          zonaCli: direccion.direccion ?? "",
          barrioCli: direccion.barrio ?? "",
          rutaNombre:
            raw.negocio?.ruta?.nombre ?? raw.cliente.ruta?.nombre ?? null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          creadoPor: raw.createdBy?.nombre ?? null,
          createdAt: raw.createdAt.toISOString(),
          disputaAbierta: raw.disputaAbierta,
          casosAbiertos: raw.casos,
          pendienteN2: raw.obligacion
            ? {
                id: raw.obligacion.id,
                producto: raw.obligacion.producto,
                estado: raw.obligacion.estado,
                remanente:
                  raw.obligacion.cantidadOriginal -
                  raw.obligacion.cantidadCumplida,
              }
            : null,
          entregadoAt:
            hechos[0]?.fecha.toISOString() ??
            raw.entregadoAt?.toISOString() ??
            null,
          responsablesEntrega: ids.map((id) => ({
            id,
            nombre: nombres.get(id) ?? "Responsable histórico",
          })),
          entregasSinDetalle:
            hechos.some((e) => !e.cantidades || e.incompleto) ||
            (!hechos.length &&
              (raw.items.some((i) => i.cantEntrega > 0) ||
                raw.cPacaAguaEnt +
                  raw.cPacaHieloEnt +
                  raw.cBotellonFabEnt +
                  raw.cBotellonDomEnt +
                  raw.cBolsaAguaEnt +
                  raw.cBolsaHieloEnt >
                  0)),
          entregaHoraVerificable: hechos[0] ? !hechos[0].precisionDia : false,
          embarqueNumeroDia: raw.embarque?.numeroDia ?? null,
          embarqueRepartidor: raw.embarque?.trabajador.nombre ?? null,
          factura:
            canReadFacturas(role) && raw.factura
              ? {
                  id: raw.factura.id,
                  numero: raw.factura.numero,
                  estado: raw.factura.estado,
                }
              : undefined,
        };
      });
      const importe = dec(sumas?._sum.total),
        pagado = dec(sumas?._sum.totalPagado),
        saldo = dec(sumas?._sum.saldo),
        fiado = dec(fiados?._sum.saldo);
      const [{ ahora }] = await tx.$queryRaw<
        Array<{ ahora: Date }>
      >`SELECT transaction_timestamp() AS ahora`;
      return {
        consultaKey: parametrosConsulta(f).toString(),
        pedidos,
        total,
        page: f.page,
        pageSize: f.pageSize,
        leidoAt: ahora.toISOString(),
        repartidores,
        resumen: f.resumen
          ? {
              importe,
              pagado,
              saldo,
              fiado,
              pendienteEntrega: (centavos(saldo) - centavos(fiado)) / 100,
              productos: productos.sort((a, b) =>
                a.producto.localeCompare(b.producto),
              ),
              entregasPorConciliar,
              importesPorConciliar:
                centavos(importe) !== centavos(pagado) + centavos(saldo),
              cobros: cobros
                ? {
                    medios: cobros.medios,
                    subtotalRegistrado: cobros.subtotalRegistrado,
                    creditoAplicado: cobros.creditoAplicado,
                    porConciliar: cobros.porConciliar,
                  }
                : null,
            }
          : null,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 15000,
    },
  );
}
