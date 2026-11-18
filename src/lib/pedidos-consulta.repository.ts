import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { condicionPalabra, palabrasDeBusqueda } from "./clientes-repo";
import { leerExigibles } from "./entregas-exigibles-db";
import { importesEntregaPedido } from "./valor-entregado-pedido";
import { canReadFacturas } from "./permissions";
import { getAnonymousClientDisplayName } from "./cliente-canonical";
import { pickCoords } from "./geo/pedido-coords";
import { pickDireccionTexto } from "./geo/pedido-direccion";
import {
  construirCatalogoBarrios,
  ordenarGrupos,
  resolverGrupoBarrio,
  type GrupoBarrio,
} from "./barrios/grupo-barrio";
import { tipoDesdeCanal } from "./pedido-canal";
import { endOfDayBogota, todayStringBogota } from "./dates";
import { listarEntregasDestacadas } from "./pedidos-entregas-destacadas";
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
  filtrosArrastrados,
  esFocoCompromiso,
  rangoConsultaPedidos,
  baseEfectiva,
  type FiltrosConsultaPedidos,
  type GrupoBarrioConsulta,
  type ProductoConsulta,
  type ResultadoConsultaPedidos,
} from "./pedidos-consulta";

type CoincidenciasBusquedaPedidos = { clientes: string[]; negocios: string[] };

export function whereConsultaPedidos(
  f: FiltrosConsultaPedidos,
  coincidencias?: CoincidenciasBusquedaPedidos,
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
    and.push({ estadoEntrega: { notIn: ["CANCELADO", "ANULADO"] }, saldo: { gt: 0 } });
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
    and.push({ estadoEntrega: { notIn: ["CANCELADO", "ANULADO"] }, saldo: { gt: 0 } });
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
  if (esFocoCompromiso(f.foco)) {
    // #836 F1: demanda abierta por FECHA PROMETIDA (día de Bogotá). No cambia ni usa Pedido.fecha.
    const finHoy = endOfDayBogota(todayStringBogota());
    and.push({
      estadoEntrega: { in: ["PENDIENTE", "EN_RUTA", "NO_ENTREGADO"] },
      fechaEntrega: f.foco === "paraHoy" ? { not: null, lte: finHoy } : { gt: finHoy },
    });
  }
  const base = baseEfectiva(f);
  if ((base === "pedido" || base === "creacion") && !f.all && !esFocoCompromiso(f.foco)) {
    const r = rangoConsultaPedidos(f);
    and.push(
      base === "creacion"
        ? { createdAt: { gte: r.desde, lt: r.hasta } }
        : { fecha: { gte: r.desde, lt: r.hasta } },
    );
  }
  if (f.search) {
    const n = f.search.replace(/^#/, "");
    const numeroSeguro = /^\d+$/.test(n) &&
      Number.isSafeInteger(Number(n)) && Number(n) <= 2147483647;
    // Con # se busca exclusivamente el identificador exacto.
    if (f.search.startsWith("#") && numeroSeguro) {
      and.push({ numero: Number(n) });
    } else {
      const literal = f.search.replace(/[\\%_]/g, "\\$&");
      const text = { contains: literal, mode: "insensitive" as const };
      const or: Prisma.PedidoWhereInput[] = [
        { cliente: { is: { OR: [
          { nombre: text }, { apellido: text }, { telefono: text },
        ] } } },
        { negocio: { is: { nombre: text } } },
        { createdBy: { is: { nombre: text } } },
      ];
      if (numeroSeguro) or.push({ numero: Number(n) });
      if (coincidencias?.clientes.length)
        or.push({ clienteId: { in: coincidencias.clientes } });
      if (coincidencias?.negocios.length)
        or.push({ negocioId: { in: coincidencias.negocios } });
      and.push({ OR: or });
    }
  }
  return { AND: and };
}
const validoFinanciero: Prisma.PedidoWhereInput = {
  estadoEntrega: { notIn: ["ANULADO", "CANCELADO"] },
  estado: { notIn: ["ANULADO", "CANCELADO"] },
  estadoPago: { not: "ANULADO" },
};
/**
 * Tope de ids por tipo (clientes y negocios) que alimenta el `IN (...)` de la consulta.
 * Entre ambos pueden sumar 10.000 parámetros, cerca de un tercio del límite de Prisma (32.767).
 */
const MAX_COINCIDENCIAS_PEDIDOS = 5000;

/** Resolución previa a conteos y paginación, sin excluir clientes históricos. */
export async function resolverCoincidenciasPedidos(
  tx: Prisma.TransactionClient,
  search: string,
): Promise<CoincidenciasBusquedaPedidos> {
  const palabras = palabrasDeBusqueda(search);
  // La resolución aproximada solo aplica a nombres escritos con letras.
  // % y _ son datos literales, NO comodines ni tokens fuzzy. Los números
  // de pedido/factura y códigos con dígitos siguen la ruta exacta (Prisma).
  // Evita que "50%_516" también encuentre "50X516" (#789).
  const soloNombre = /^[\p{L}\p{M}\s]+$/u.test(search);
  if (!palabras.length || !soloNombre || search.length < 2)
    return { clientes: [], negocios: [] };

  const acentos = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
  const reemplazos = "aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc";
  const condicionNegocio = Prisma.join(palabras.map((p) =>
    Prisma.sql`lower(translate(n.nombre, ${acentos}, ${reemplazos})) LIKE ${"%" + p.replace(/[\\%_]/g, "\\$&") + "%"}`),
    " AND ");
  // #824: el tope era 500 y, con más candidatos, dejaba fuera al cliente buscado. Se
  // sube a 5.000. NO se ordena: medido sobre 30.000 clientes con contactos y
  // negocios, un ORDER BY por relevancia costaba 600-800 ms frente a 250-430 ms
  // sin él, porque obliga a recorrer todo el catálogo; y con coincidencias
  // iguales el desempate tampoco garantizaba conservar al buscado.
  const [c, n] = await Promise.all([
    tx.$queryRaw<Array<{ id: string }>>`
      SELECT c.id FROM "Cliente" c
      WHERE (${Prisma.join(palabras.map(condicionPalabra), " AND ")})
         OR ${search} <% c.nombre OR ${search} <% COALESCE(c.apellido, '')
      LIMIT ${MAX_COINCIDENCIAS_PEDIDOS}`,
    tx.$queryRaw<Array<{ id: string }>>`
      SELECT n.id FROM "Negocio" n
      WHERE (${condicionNegocio}) OR ${search} <% n.nombre
      LIMIT ${MAX_COINCIDENCIAS_PEDIDOS}`,
  ]);
  if (c.length >= MAX_COINCIDENCIAS_PEDIDOS || n.length >= MAX_COINCIDENCIAS_PEDIDOS) {
    // Más de 5.000 fichas con el mismo término: el corte vuelve a ser arbitrario.
    logger.warn(
      { clientes: c.length, negocios: n.length, tope: MAX_COINCIDENCIAS_PEDIDOS },
      "Búsqueda de Pedidos truncada por el tope de coincidencias (#824)",
    );
  }
  return { clientes: c.map((x) => x.id), negocios: n.map((x) => x.id) };
}
const centavos = (v: unknown) => {
  const n = Math.round(Number(v ?? 0) * 100);
  if (!Number.isSafeInteger(n)) throw new Error("Importe no verificable");
  return n;
};
const dec = (v: unknown) => centavos(v) / 100;

/**
 * Una foto de la consulta completa, independiente de la página visible.
 * #797: añade los pendientes de días anteriores como lectura aparte; su fallo
 * no invalida la lista principal.
 */
export async function consultarPedidos(
  f: FiltrosConsultaPedidos,
  role: string | null,
  client = prisma,
): Promise<ResultadoConsultaPedidos> {
  const resultado = await leerConsultaPedidos(f, role, client);
  const fa = filtrosArrastrados(f);
  if (!fa) return resultado;
  try {
    const a = await leerConsultaPedidos(fa, role, client, true);
    // #841: un pedido que ya se ve en «Pendientes» no se repite en las entregas de
    // pedidos anteriores; su fila de pendientes ya dice cuánto se entregó y cuánto falta.
    // Solo se quita lo que realmente se muestra (los más antiguos, con tope): un parcial
    // pendiente fuera de ese tope se queda en las entregas para no desaparecer de la pantalla.
    const visibles = new Set(a.pedidos.map((p) => p.id));
    const destacadas = resultado.destacadas?.filter((d) => !visibles.has(d.pedidoId));
    const quitadas = (resultado.destacadas?.length ?? 0) - (destacadas?.length ?? 0);
    return {
      ...resultado,
      ...(destacadas
        ? {
            destacadas,
            destacadasTotal: Math.max(0, (resultado.destacadasTotal ?? 0) - quitadas),
          }
        : {}),
      arrastrados: a.pedidos,
      arrastradosTotal: a.total,
    };
  } catch (error) {
    logger.warn({ err: error }, "No se pudieron leer los pendientes de días anteriores");
    return { ...resultado, arrastradosError: true };
  }
}

async function leerConsultaPedidos(
  f: FiltrosConsultaPedidos,
  role: string | null,
  client = prisma,
  arrastre = false,
): Promise<ResultadoConsultaPedidos> {
  return client.$transaction(
    async (tx) => {
      const coincidencias = f.search
        ? await resolverCoincidenciasPedidos(tx, f.search)
        : undefined;
      const base = baseEfectiva(f);
      const rango = rangoConsultaPedidos(f),
        where = whereConsultaPedidos(f, coincidencias);
      const and = where.AND as Prisma.PedidoWhereInput[];
      let cobros: CobrosPeriodo | null = null,
        entregas: EntregaConsulta[] | null = null;
      if (base === "cobro") {
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
      if (base === "entrega") {
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
      // #656: exigir deuda antes de contar/paginar; el resumen usa todo el conjunto.
      const soloFiados = f.pago === "fiado" || f.foco === "esperandoPago";
      const exigiblesConjunto = f.resumen || soloFiados
        ? await leerExigibles(tx, { AND: [where, validoFinanciero] }) : null;
      if (soloFiados) and.push({ id: { in: [...exigiblesConjunto!].filter(([, monto]) => monto > 0).map(([id]) => id) } });
      // #836 F3: agrupar por barrio efectivo sobre TODO el conjunto filtrado (no sobre la página).
      // Lee solo las columnas necesarias para clasificar; la página real se trae después.
      let grupos: GrupoBarrioConsulta[] | undefined;
      let ordenPagina: string[] | null = null;
      let grupoPorId: Map<string, GrupoBarrio> | null = null;
      if (f.agrupar === "barrio" || f.grupoBarrio) {
        const canonico = { select: { id: true, nombre: true } } as const;
        const [candidatos, barrios] = await Promise.all([
          tx.pedido.findMany({
            where,
            select: {
              id: true, fecha: true, numero: true, direccionEntrega: true, barrioEntrega: true,
              cliente: { select: { direccion: true, barrio: true, barrioCanonico: canonico } },
              negocio: { select: { direccion: true, barrio: true, barrioCanonico: canonico } },
            },
          }),
          tx.barrio.findMany({
            select: { id: true, nombre: true, nombreNormalizado: true, aliases: { select: { textoNormalizado: true } } },
          }),
        ]);
        const catalogo = construirCatalogoBarrios(barrios);
        const porGrupo = new Map<string, { g: GrupoBarrio; items: typeof candidatos }>();
        grupoPorId = new Map();
        for (const c of candidatos) {
          const g = resolverGrupoBarrio(
            { overrideDireccion: c.direccionEntrega, overrideBarrio: c.barrioEntrega, cliente: c.cliente, negocio: c.negocio },
            catalogo,
          );
          grupoPorId.set(c.id, g);
          const e = porGrupo.get(g.clave) ?? { g, items: [] };
          e.items.push(c);
          porGrupo.set(g.clave, e);
        }
        grupos = ordenarGrupos([...porGrupo.values()].map(({ g, items }) => ({ ...g, total: items.length })));
        const elegibles = f.grupoBarrio ? (porGrupo.get(f.grupoBarrio)?.items ?? []) : candidatos;
        if (f.grupoBarrio) and.push({ id: { in: elegibles.map((c) => c.id) } });
        if (f.agrupar === "barrio") {
          const posGrupo = new Map(grupos.map((g, i) => [g.clave, i]));
          ordenPagina = [...elegibles]
            .sort((a, b) =>
              (posGrupo.get(grupoPorId!.get(a.id)!.clave)! - posGrupo.get(grupoPorId!.get(b.id)!.clave)!) ||
              (b.fecha.getTime() - a.fecha.getTime()) ||
              (b.numero - a.numero) ||
              (a.id < b.id ? -1 : 1))
            .slice((f.page - 1) * f.pageSize, f.page * f.pageSize)
            .map((c) => c.id);
        }
      }
      const fin: Prisma.PedidoWhereInput = { AND: [where, validoFinanciero] };
      const [total, rowsSinOrden, repartidores, sumas, parciales] = await Promise.all([
        tx.pedido.count({ where }),
        tx.pedido.findMany({
          where: ordenPagina ? { AND: [where, { id: { in: ordenPagina } }] } : where,
          orderBy: arrastre
            ? [{ fecha: "asc" }, { numero: "asc" }, { id: "asc" }]
            : [{ fecha: "desc" }, { numero: "desc" }, { id: "asc" }],
          ...(ordenPagina ? {} : { skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
          include: {
            items: true,
            pagos: true,
            createdBy: { select: { nombre: true } },
            cliente: { include: { ruta: { select: { nombre: true } } } },
            negocio: { include: { ruta: { select: { nombre: true } }, horarios: { select: { diaSemana: true, desde: true, hasta: true } } } },
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
          select: { id: true, nombre: true, activo: true, usaMoto: true },
          orderBy: [{ nombre: "asc" }, { id: "asc" }],
        }),
        f.resumen
          ? tx.pedido.aggregate({
              where: fin,
              _sum: { total: true, totalPagado: true, saldo: true },
            })
          : null,
        f.resumen ? tx.pedido.findMany({
          where: { AND: [fin, { estadoEntrega: { not: 'ENTREGADO' }, saldo: { gt: 0 }, items: { some: { cantEntrega: { gt: 0 } } } }] },
          select: { id: true, total: true, totalPagado: true, saldo: true, estadoEntrega: true, items: { select: { cantEntrega: true, precio: true } } },
        }) : [],
      ]);
      // #836 F3: con agrupación, la página se trajo por ids; se devuelve en orden de grupo.
      const posicion = ordenPagina ? new Map(ordenPagina.map((id, i) => [id, i])) : null;
      const rows = posicion
        ? [...rowsSinOrden].sort((a, b) => posicion.get(a.id)! - posicion.get(b.id)!)
        : rowsSinOrden;
      let productos: ProductoConsulta[] = [],
        entregasPorConciliar = 0;
      const idsPagina = rows.map((p) => p.id);
      const exigiblesPagina = exigiblesConjunto ?? await leerExigibles(tx, { id: { in: idsPagina } });
      const hechosPagina = await leerEntregasConsulta(tx, { ids: idsPagina });
      if (f.resumen) {
        if (base === "entrega" || cobros) {
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
          if (entregas && base === "entrega") {
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
        if (base !== "entrega") {
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
          exigible: exigiblesPagina.get(raw.id) ?? 0,
          nombreCli:
            getAnonymousClientDisplayName(raw.clienteId, "short") ??
            raw.cliente.nombre,
          apellidoCli: raw.cliente.apellido,
          telefonoCli: raw.cliente.telefono,
          nombreNegocioCli: raw.negocio?.nombre ?? null,
          zonaCli: direccion.direccion ?? "",
          barrioCli: direccion.barrio ?? "",
          ...(grupoPorId?.get(raw.id) ? { grupoBarrio: grupoPorId.get(raw.id) } : {}),
          // #836 F2: tramos del negocio para avisar «cierra ese día»; solo si tiene horario configurado.
          ...(raw.negocio?.horarios?.length ? { negocioHorarios: raw.negocio.horarios } : {}),
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
        fiado = [...(exigiblesConjunto?.values() ?? [])].reduce((s, monto) => s + centavos(monto), 0) / 100;
      const consultaDestacadas = !arrastre && base === "pedido" && !f.all && !esFocoCompromiso(f.foco)
        ? await listarEntregasDestacadas(tx, whereConsultaPedidos({ ...f, fechaBase: "entrega", foco: f.foco === "entregaParcial" ? "" : f.foco }), rango, f.repartidorId, f.foco === "entregaParcial")
        : null;
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
        ...(grupos ? { grupos } : {}),
        ...(consultaDestacadas ? {
          destacadas: consultaDestacadas.destacadas,
          destacadasTotal: consultaDestacadas.destacadasTotal,
          destacadasRangoAmplio: consultaDestacadas.rangoAmplio,
        } : {}),
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
              exigiblesPorConciliar: parciales.filter(p => importesEntregaPedido({ ...p, exigible: exigiblesConjunto?.get(p.id) ?? 0 }).porConciliar).length,
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
