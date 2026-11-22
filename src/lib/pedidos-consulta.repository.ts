import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { condicionPalabra, palabrasDeBusqueda } from "./clientes-repo";
import { leerExigibles } from "./entregas-exigibles-db";
import { isConsumidorFinalCanonical } from "./cliente-canonical";
import { resumirFiadosAnteriores } from "./fiados-anteriores-pedido";
import { importesEntregaPedido } from "./valor-entregado-pedido";
import { canReadFacturas } from "./permissions";
import { getAnonymousClientDisplayName } from "./cliente-canonical";
import { pickCoords } from "./geo/pedido-coords";
import { pickDireccionTexto } from "./geo/pedido-direccion";
import {
  type CatalogoBarrios,
  CLAVE_VENTA_ANONIMA,
  ETIQUETA_VENTA_ANONIMA,
  construirCatalogoBarrios,
  esVentaAnonima,
  ordenarGrupos,
  resolverGrupoBarrio,
  type GrupoBarrio,
} from "./barrios/grupo-barrio";
import { remanentesPorProducto } from "./barrios/remanentes-barrio";
import { ordenarBarriosFIFO } from "./barrios/fifo-barrio";
import { tipoDesdeCanal } from "./pedido-canal";
import { endOfDayBogota, todayStringBogota } from "./dates";
import { detalleUnidadesEntregadasDelDia } from "./unidades-entregadas-dia";
import { mostrarResumenOperativoHoy, resumirEntregasOperativasHoy } from "./pedidos-resumen-operativo-hoy";
import { ordenarPorFranja } from "./pedidos-franja";
import { ordenarPrioridadPedidos } from "./pedidos-prioridad-921";
import { findPedidosEnRiesgo } from "./pedidos-sin-asignar";
import { elegibleRiesgoOperativo, type RiesgoOperativo } from "./pedidos-riesgo-operativo";
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
  requiereConciliacionEntrega,
  type EntregaConsulta,
} from "./entregas-consulta";
import {
  parametrosConsulta,
  arrastreIntegrado,
  filtrosArrastrados,
  esFocoCompromiso,
  rangoConsultaPedidos,
  baseEfectiva,
  entregadoComoUnicoEstado,
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
// #939: Prisma usa DECIMAL(10,2). Comparar pagos sumados en coma flotante
// puede degradar visualmente un pedido 100% confirmado con centavos.
const sumarConfirmados = (pagos: ReadonlyArray<{ monto: unknown }>): number => {
  let sumaCentavos = 0;
  for (const pago of pagos) {
    sumaCentavos += centavos(pago.monto);
    if (!Number.isSafeInteger(sumaCentavos))
      throw new Error("Suma de pagos confirmados no verificable");
  }
  return sumaCentavos / 100;
};

/**
 * Una foto de la consulta completa, independiente de la página visible.
 * #797: añade los pendientes de días anteriores como lectura aparte; su fallo
 * no invalida la lista principal.
 */
/** #913: sin demanda FIFO, «Sin barrio» va tras los barrios y las ventas anónimas al final de todo. */
const colaNoTerritorial = (clave: string) => (clave === CLAVE_VENTA_ANONIMA ? 2 : clave === "sin-barrio" ? 1 : 0);

async function consultarPedidosSinAviso(
  f: FiltrosConsultaPedidos,
  role: string | null,
  client = prisma,
): Promise<ResultadoConsultaPedidos> {
  // Se evalúa una sola vez por consulta, incluso si tiene varias páginas
  // internas de pedidos anteriores. No se consulta por cada tarjeta.
  let riesgos: ReadonlyMap<string, RiesgoOperativo> = new Map();
  if (client === prisma) {
    try {
      riesgos = await findPedidosEnRiesgo();
    } catch (error) {
      logger.warn({ err: error }, "No se pudieron evaluar los riesgos operativos de Pedidos");
    }
  }
  const fa = filtrosArrastrados(f);
  // #915: vista agrupada → los pendientes/parciales de días anteriores entran en la MISMA consulta
  // (un solo universo deduplicado por pedido, sin tope de 5, agrupado y paginado en el servidor).
  if (fa && arrastreIntegrado(f)) {
    const integrado = await leerConsultaPedidos(f, role, client, false, fa, riesgos);
    // #841: una entrega parcial de un pedido que ya se ve como fila de esta página no se repite como tarjeta.
    const visibles = new Set(integrado.pedidos.map((p) => p.id));
    const destacadas = integrado.actividadIntegrada
      ? []
      : integrado.destacadas?.filter((d) => !visibles.has(d.pedidoId));
    const quitadas = (integrado.destacadas?.length ?? 0) - (destacadas?.length ?? 0);
    return {
      ...integrado,
      ...(destacadas
        ? { destacadas, destacadasTotal: Math.max(0, (integrado.destacadasTotal ?? 0) - quitadas) }
        : {}),
      arrastradosIntegrados: true,
    };
  }
  const resultado = await leerConsultaPedidos(f, role, client, false, null, riesgos);
  if (!fa) return resultado;
  try {
    // #859: leer TODAS las páginas de arrastres, no solamente las primeras cinco.
    // Se conserva el paginado interno para no crear una consulta de tamaño ilimitado.
    const lote = 100;
    const primera = await leerConsultaPedidos({ ...fa, page: 1, pageSize: lote }, role, client, true, null, riesgos);
    const acumulados = [...primera.pedidos];
    const idsLeidos = new Set(acumulados.map(p => p.id));
    const paginas = Math.ceil(primera.total / lote);
    for (let pagina = 2; pagina <= paginas; pagina++) {
      const siguiente = await leerConsultaPedidos({ ...fa, page: pagina, pageSize: lote }, role, client, true, null, riesgos);
      for (const pedido of siguiente.pedidos) {
        if (!idsLeidos.has(pedido.id)) {
          idsLeidos.add(pedido.id);
          acumulados.push(pedido);
        }
      }
    }
    // La vista histórica conserva el límite de cinco; el total sigue siendo global.
    const a = { ...primera, pedidos: acumulados.slice(0, 5) };
    // #841: un pedido que ya se ve en «Pendientes» no se repite en las entregas de
    // pedidos anteriores; su fila de pendientes ya dice cuánto se entregó y cuánto falta.
    // Solo se quita lo que realmente se muestra (los más antiguos, con tope): un parcial
    // pendiente fuera de ese tope se queda en las entregas para no desaparecer de la pantalla.
    const idsPrincipal = new Set(resultado.pedidos.map(p => p.id));
    a.pedidos = a.pedidos.filter(p => !idsPrincipal.has(p.id));
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
      arrastradosTotal: primera.total,
    };
  } catch (error) {
    logger.warn({ err: error }, "No se pudieron leer los pendientes de días anteriores");
    return { ...resultado, arrastradosError: true };
  }
}


/**
 * #932: enriquecer los Pedidos con datos de OTROS cobros pendientes del cliente.
 * La lectura financiera es opcional y tiene su propia transacción consistente:
 * un error de esa lectura nunca aborta la lista principal de Pedidos.
 */
export async function consultarPedidos(
  f: FiltrosConsultaPedidos,
  role: string | null,
  client = prisma,
): Promise<ResultadoConsultaPedidos> {
  let resultado = await consultarPedidosSinAviso(f, role, client)
  // #853: el balance físico global es una lectura opcional e independiente.
  // Nunca comprometer la transacción de la consulta principal por un error
  // en el detalle de entregas del día.
  const resumenBase = resultado.resumen;
  if (resumenBase && mostrarResumenOperativoHoy(f, todayStringBogota())) {
    try {
      const operacionHoy = await client.$transaction(async (tx) => {
        const rango = rangoConsultaPedidos(f);
        const { detalle } = await detalleUnidadesEntregadasDelDia(tx, rango);
        const ids = [...new Set(detalle.map((d) => d.pedidoId))];
        const pedidosOrigen = await tx.pedido.findMany({
          where: { id: { in: ids } },
          select: { id: true, fecha: true },
        });
        return resumirEntregasOperativasHoy(
          detalle,
          new Map(pedidosOrigen.map((p) => [p.id, p.fecha])),
          rango,
        );
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
      });
      resultado = { ...resultado, resumen: { ...resumenBase, operacionHoy } };
    } catch (error) {
      logger.warn({ err: error }, "No se pudo conciliar el resumen operativo del día (#853)");
      resultado = { ...resultado, resumen: { ...resumenBase, operacionHoyError: true } };
    }
  }
  const visibles = [...resultado.pedidos, ...(resultado.arrastrados ?? [])]
  const clientes = [...new Set(visibles.map(p => p.clienteId))]
    .filter(id => !isConsumidorFinalCanonical(id))
  if (!visibles.length || !clientes.length) return resultado

  try {
    const avisos = await client.$transaction(async (tx) => {
      // Primero leer solamente IDs; los productos/negocios se consultan
      // después de establecer la deuda exigible positiva, sin límite temporal.
      const candidatos = await tx.pedido.findMany({
        where: {
          clienteId: { in: clientes },
          estadoEntrega: { notIn: ["ANULADO", "CANCELADO"] },
          saldo: { gt: 0 },
        },
        select: { id: true, clienteId: true },
      })
      const montos = new Map<string, number>()
      const lote = 500
      for (let i = 0; i < candidatos.length; i += lote) {
        const ids = candidatos.slice(i, i + lote).map(p => p.id)
        const exigibles = await leerExigibles(tx, { id: { in: ids } })
        for (const [id, monto] of exigibles) montos.set(id, monto)
      }
      const conDeuda = candidatos.filter(p => (montos.get(p.id) ?? 0) > 0)
      const deudas = []
      for (let i = 0; i < conDeuda.length; i += lote) {
        const detalles = await tx.pedido.findMany({
          where: { id: { in: conDeuda.slice(i, i + lote).map(p => p.id) } },
          select: {
            id: true, numero: true, clienteId: true,
            negocio: { select: { nombre: true } },
            items: { select: { producto: true, cantEntrega: true, cantRegaloEntrega: true } },
            cPacaAguaEnt: true, cPacaHieloEnt: true,
            cBotellonFabEnt: true, cBotellonDomEnt: true,
            cBolsaAguaEnt: true, cBolsaHieloEnt: true,
            pagos: { where: { confirmacion: "REPORTADO" }, select: { id: true }, take: 1 },
          },
        })
        for (const p of detalles) {
          deudas.push({
            id: p.id, numero: p.numero, clienteId: p.clienteId,
            exigible: montos.get(p.id) ?? 0,
            negocioNombre: p.negocio?.nombre ?? null,
            pagoPorConfirmar: p.pagos.length > 0,
            productos: p.items.length
              ? p.items.map(item => ({
                  producto: item.producto,
                  cantidadEntregada: item.cantEntrega + (item.cantRegaloEntrega ?? 0),
                }))
              : [
                  { producto: "PACA_AGUA", cantidadEntregada: p.cPacaAguaEnt },
                  { producto: "PACA_HIELO", cantidadEntregada: p.cPacaHieloEnt },
                  { producto: "BOTELLON", cantidadEntregada: p.cBotellonFabEnt + p.cBotellonDomEnt },
                  { producto: "BOLSA_AGUA", cantidadEntregada: p.cBolsaAguaEnt },
                  { producto: "BOLSA_HIELO", cantidadEntregada: p.cBolsaHieloEnt },
                ],
          })
        }
      }
      return resumirFiadosAnteriores(
        visibles.map(p => ({ id: p.id, clienteId: p.clienteId })),
        deudas,
      )
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 15000,
    })

    const incluir = (pedidos: typeof resultado.pedidos) =>
      pedidos.map(p => avisos.has(p.id)
        ? { ...p, fiadosAnteriores: avisos.get(p.id) }
        : p)
    return {
      ...resultado,
      pedidos: incluir(resultado.pedidos),
      ...(resultado.arrastrados ? { arrastrados: incluir(resultado.arrastrados) } : {}),
    }
  } catch (error) {
    // Una consulta de badge que falle no invalida pedidos ni finge saldo cero.
    logger.warn({ err: error }, "No fue posible verificar los cobros pendientes de clientes de Pedidos (#932)")
    const sinVerificar = (pedidos: typeof resultado.pedidos) =>
      pedidos.map(p => isConsumidorFinalCanonical(p.clienteId)
        ? p : { ...p, fiadosConsultaError: true })
    return {
      ...resultado,
      pedidos: sinVerificar(resultado.pedidos),
      ...(resultado.arrastrados ? { arrastrados: sinVerificar(resultado.arrastrados) } : {}),
    }
  }
}

async function leerConsultaPedidos(
  f: FiltrosConsultaPedidos,
  role: string | null,
  client = prisma,
  arrastre = false,
  /** #915: filtros de arrastre cuando se integran a esta misma consulta (vista agrupada). */
  fArrastre: FiltrosConsultaPedidos | null = null,
  riesgos: ReadonlyMap<string, RiesgoOperativo> = new Map(),
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
      // #915: universo de la lista = rango de hoy ∪ pendientes de días anteriores. El resumen del día
      // (importes, cobros, conteos) sigue usando solo `where`, para no mezclar días.
      // #927: «Hoy» es una actividad operativa; no proyectar el estado actual
      // sobre fechas históricas sin reconstruir los eventos al corte.
      const diaOperativo = f.desde === todayStringBogota() &&
        f.hasta === f.desde && !f.desdeHora && !f.hastaHora && !f.all;
      const actividadIntegrada = !!fArrastre && diaOperativo &&
        base === "pedido" && f.foco === "";
      // #927: no adelantar a «Hoy» pedidos antiguos reprogramados para
      // mañana o después. Los pedidos creados hoy conservan su consulta normal.
      const anteriores: Prisma.PedidoWhereInput | null = fArrastre
        ? whereConsultaPedidos(fArrastre, coincidencias) : null;
      const anterioresExigibles: Prisma.PedidoWhereInput | null = anteriores &&
        actividadIntegrada
        ? { AND: [anteriores, { OR: [
          { fechaEntrega: null },
          { fechaEntrega: { lt: rango.hasta } },
        ] }] }
        : anteriores;
      let whereLista: Prisma.PedidoWhereInput = anterioresExigibles
        ? { OR: [where, anterioresExigibles] }
        : where;
      if (actividadIntegrada) {
        // La evidencia histórica incierta se muestra «Por conciliar», jamás
        // como entrega física confirmada ni como movimiento contable nuevo.
        const hechosHoy = await leerEntregasConsulta(tx, { rango });
        const idsEntregados = [...new Set(hechosHoy.map((e) => e.pedidoId))];
        if (idsEntregados.length) {
          const sinFechaPedido = whereConsultaPedidos({ ...f, all: true }, coincidencias);
          whereLista = {
            OR: [
              whereLista,
              { AND: [
                sinFechaPedido,
                { fecha: { lt: rango.desde }, id: { in: idsEntregados } },
              ] },
            ],
          };
        }
      }
      let catalogoBarrios: CatalogoBarrios | null = null;
      let cobros: CobrosPeriodo | null = null,
        entregas: EntregaConsulta[] | null = null;
      // #854: «Entregado» sin fecha ni evento de entrega (ventas de mostrador antiguas o
      // inmediatas). Convención del repo (entregas-hoy, unidades-entregadas-dia, fiados): el día
      // de la entrega es el de la fecha del pedido, marcado como «por conciliar». No se escribe
      // ninguna fecha. No aplica con repartidor: sin evidencia no hay a quién atribuirla.
      const sinFechaEntrega = new Set<string>();
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
        const ids = new Set(
          entregas
            .filter(
              (e) =>
                !f.repartidorId.length ||
                (!!e.repartidorId && f.repartidorId.includes(e.repartidorId)),
            )
            .map((e) => e.pedidoId),
        );
        if (entregadoComoUnicoEstado(f) && !f.repartidorId.length) {
          const candidatos = await tx.pedido.findMany({
            where: {
              AND: [
                ...and,
                { entregadoAt: null, fecha: { gte: rango.desde, lt: rango.hasta } },
              ],
            },
            select: { id: true },
          });
          if (candidatos.length) {
            const conHechos = new Set(
              (await leerEntregasConsulta(tx, { ids: candidatos.map((c) => c.id) })).map(
                (e) => e.pedidoId,
              ),
            );
            for (const c of candidatos)
              if (!conHechos.has(c.id)) {
                sinFechaEntrega.add(c.id);
                ids.add(c.id);
              }
          }
        }
        and.push({ id: { in: [...ids] } });
      } else if (f.repartidorId.length) {
        const candidatos = await tx.pedido.findMany({
          where: whereLista,
          select: { id: true },
        });
        entregas = await leerEntregasConsulta(tx, {
          ids: candidatos.map((p) => p.id),
        });
        const idsRepartidor = [...new Set(entregas
          .filter((e) => !!e.repartidorId && f.repartidorId.includes(e.repartidorId))
          .map((e) => e.pedidoId))];
        const filtroRepartidor: Prisma.PedidoWhereInput = { id: { in: idsRepartidor } };
        and.push(filtroRepartidor);
        if (fArrastre) whereLista = { AND: [whereLista, filtroRepartidor] };
      }
      // #656: exigir deuda antes de contar/paginar; el resumen usa todo el conjunto.
      const soloFiados = f.pago === "fiado" || f.foco === "esperandoPago";
      // El resumen comercial sigue siendo del período de pedido, nunca de la unión.
      const exigiblesResumen = f.resumen
        ? await leerExigibles(tx, { AND: [where, validoFinanciero] }) : null;
      const exigiblesConjunto = soloFiados || (fArrastre && f.resumen)
        ? await leerExigibles(tx, { AND: [whereLista, validoFinanciero] })
        : exigiblesResumen;
      if (soloFiados) {
        const filtroFiado: Prisma.PedidoWhereInput = {
          id: { in: [...exigiblesConjunto!].filter(([, monto]) => monto > 0).map(([id]) => id) },
        };
        and.push(filtroFiado);
        if (fArrastre) whereLista = { AND: [whereLista, filtroFiado] };
      }
      // #836 F3: agrupar por barrio efectivo sobre TODO el conjunto filtrado (no sobre la página).
      // Lee solo las columnas necesarias para clasificar; la página real se trae después.
      let grupos: GrupoBarrioConsulta[] | undefined;
      let ordenPagina: string[] | null = null;
      let grupoPorId: Map<string, GrupoBarrio> | null = null;
      if (f.agrupar === "barrio" || f.grupoBarrio) {
        const canonico = { select: { id: true, nombre: true } } as const;
        const [candidatos, barrios] = await Promise.all([
          tx.pedido.findMany({
            where: whereLista,
            select: {
              id: true, clienteId: true, origen: true, fecha: true, createdAt: true, numero: true, estadoEntrega: true, fechaEntrega: true, direccionEntrega: true, barrioEntrega: true,
              items: { select: { producto: true, cantPedido: true, cantEntrega: true, cantRegaloPedido: true, cantRegaloEntrega: true } },
              cliente: { select: { direccion: true, barrio: true, barrioCanonico: canonico } },
              negocio: { select: { direccion: true, barrio: true, barrioCanonico: canonico } },
            },
          }),
          tx.barrio.findMany({
            select: { id: true, nombre: true, nombreNormalizado: true, aliases: { select: { textoNormalizado: true } } },
          }),
        ]);
        const catalogo = construirCatalogoBarrios(barrios);
        catalogoBarrios = catalogo;
        const porGrupo = new Map<string, { g: GrupoBarrio; items: typeof candidatos }>();
        grupoPorId = new Map();
        for (const c of candidatos) {
          // #913: la venta anónima en punto no es de ningún barrio: grupo propio, fuera del FIFO.
          const g: GrupoBarrio = esVentaAnonima(c)
            ? { clave: CLAVE_VENTA_ANONIMA, etiqueta: ETIQUETA_VENTA_ANONIMA }
            : resolverGrupoBarrio(
                { overrideDireccion: c.direccionEntrega, overrideBarrio: c.barrioEntrega, cliente: c.cliente, negocio: c.negocio },
                catalogo,
              );
          grupoPorId.set(c.id, g);
          const e = porGrupo.get(g.clave) ?? { g, items: [] };
          e.items.push(c);
          porGrupo.set(g.clave, e);
        }
        // #859: el FIFO usa únicamente demanda física abierta y exigible.
        const ahora = new Date();
        const abiertos = candidatos.filter(c =>
          !esVentaAnonima(c) &&
          !["ENTREGADO", "CANCELADO", "ANULADO"].includes(c.estadoEntrega) &&
          (!c.fechaEntrega || c.fechaEntrega <= ahora) &&
          c.items.some(item => item.cantPedido > item.cantEntrega || item.cantRegaloPedido > item.cantRegaloEntrega)
        );
        const fifo = ordenarBarriosFIFO(abiertos.map(c => ({
          id: c.id, barrioClave: grupoPorId!.get(c.id)!.clave, createdAt: c.createdAt,
        })));
        const posicionesFIFO = new Map(fifo.map((g, i) => [g.clave, i]));
        const demandaPorBarrio = new Map<string, Record<string, number>>();
        for (const pedido of abiertos) {
          const clave = grupoPorId!.get(pedido.id)!.clave;
          const acumulado = demandaPorBarrio.get(clave) ?? {};
          for (const [producto, cantidad] of Object.entries(remanentesPorProducto(pedido.items))) {
            acumulado[producto] = (acumulado[producto] ?? 0) + cantidad;
          }
          demandaPorBarrio.set(clave, acumulado);
        }
        grupos = ordenarGrupos([...porGrupo.values()].map(({ g, items }) => {
          const remanentes = demandaPorBarrio.get(g.clave) ?? {};
          return { ...g, total: items.length, remanentes,
            unidadesPendientes: Object.values(remanentes).reduce((total, n) => total + n, 0) };
        }))
          .sort((a, b) =>
            (posicionesFIFO.get(a.clave) ?? Number.MAX_SAFE_INTEGER) -
            (posicionesFIFO.get(b.clave) ?? Number.MAX_SAFE_INTEGER) ||
            colaNoTerritorial(a.clave) - colaNoTerritorial(b.clave) ||
            a.etiqueta.localeCompare(b.etiqueta)
          );
        // El recorrido manual se aplica al conjunto completo antes de paginar.
        // Los barrios no incluidos conservan su orden FIFO relativo.
        if (f.recorrido?.length) {
          const posicionesManual = new Map(f.recorrido.map((clave, i) => [clave, i]));
          grupos.sort((a, b) =>
            (posicionesManual.get(a.clave) ?? Number.MAX_SAFE_INTEGER) -
            (posicionesManual.get(b.clave) ?? Number.MAX_SAFE_INTEGER)
          );
        }
        const elegibles = f.grupoBarrio ? (porGrupo.get(f.grupoBarrio)?.items ?? []) : candidatos;
        if (f.grupoBarrio) {
          and.push({ id: { in: elegibles.map((c) => c.id) } });
          if (fArrastre) whereLista = { AND: [whereLista, { id: { in: elegibles.map((c) => c.id) } }] };
        }
        if (f.agrupar === "barrio") {
          const posGrupo = new Map(grupos.map((g, i) => [g.clave, i]));
          ordenPagina = [...elegibles]
            .sort((a, b) =>
              (posGrupo.get(grupoPorId!.get(a.id)!.clave)! - posGrupo.get(grupoPorId!.get(b.id)!.clave)!) ||
              (a.createdAt.getTime() - b.createdAt.getTime()) ||
              (a.numero - b.numero) ||
              (a.id < b.id ? -1 : 1))
            .slice((f.page - 1) * f.pageSize, f.page * f.pageSize)
            .map((c) => c.id);
        }
      }
      // #921: prioridad operativa sobre el conjunto filtrado COMPLETO, antes de skip/take.
      // No toca barrio/Recorrido, ni focos con ordenamiento propio, ni consultas de arrastre.
      if (!ordenPagina && !f.agrupar && !f.grupoBarrio && !f.foco && !arrastre) {
        const candidatos = await tx.pedido.findMany({
          where: whereLista,
          select: {
            id: true, createdAt: true, total: true, totalPagado: true, saldo: true,
            estadoEntrega: true, fechaEntrega: true, entregaNoAntesDe: true,
            items: { select: { cantPedido: true, cantEntrega: true, cantRegaloPedido: true, cantRegaloEntrega: true } },
            pagos: { where: { confirmacion: "CONFIRMADO" }, select: { monto: true } },
          },
        });
        ordenPagina = ordenarPrioridadPedidos(candidatos.map(p => ({
          ...p,
          total: Number(p.total),
          totalPagado: Number(p.totalPagado),
          saldo: Number(p.saldo),
          confirmado: sumarConfirmados(p.pagos),
        })), new Date())
          .slice((f.page - 1) * f.pageSize, f.page * f.pageSize)
          .map(p => p.id);
      }
      // #921 + #836: «Para hoy» conserva las franjas como prioridad primaria;
      // dentro de cada franja aplica pago confirmado y FIFO, sobre el conjunto completo.
      // No modificar la vista agrupada por barrio ni las consultas de arrastre.
      if (!ordenPagina && f.foco === "paraHoy" && !f.grupoBarrio && !f.agrupar && !arrastre) {
        const candidatos = await tx.pedido.findMany({
          where: whereLista,
          select: {
            id: true, createdAt: true, total: true, totalPagado: true, saldo: true,
            estadoEntrega: true, fechaEntrega: true, entregaNoAntesDe: true,
            items: { select: { cantPedido: true, cantEntrega: true, cantRegaloPedido: true, cantRegaloEntrega: true } },
            pagos: { where: { confirmacion: "CONFIRMADO" }, select: { monto: true } },
          },
        });
        const ahora = new Date();
        const priorizados = ordenarPrioridadPedidos(candidatos.map(p => ({
          ...p,
          total: Number(p.total), totalPagado: Number(p.totalPagado),
          saldo: Number(p.saldo),
          confirmado: sumarConfirmados(p.pagos),
        })), ahora);
        ordenPagina = ordenarPorFranja(priorizados, ahora, p => p)
          .slice((f.page - 1) * f.pageSize, f.page * f.pageSize)
          .map(p => p.id);
      }
      const fin: Prisma.PedidoWhereInput = { AND: [where, validoFinanciero] };
      const [total, rowsSinOrden, repartidores, sumas, parciales] = await Promise.all([
        tx.pedido.count({ where: whereLista }),
        tx.pedido.findMany({
          where: ordenPagina ? { AND: [whereLista, { id: { in: ordenPagina } }] } : whereLista,
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
            entregasPorConciliar = new Set([
              ...hechos
                .filter(requiereConciliacionEntrega)
                .map((e) => e.pedidoId),
              ...[...sinFechaEntrega].filter((id) => ids.has(id)),
            ]).size;
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
              _sum: { cantPedido: true, cantEntrega: true, cantRegaloPedido: true, cantRegaloEntrega: true },
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
                pedidas: (l._sum.cantPedido ?? 0) + (l._sum.cantRegaloPedido ?? 0),
                entregadas: (l._sum.cantEntrega ?? 0) + (l._sum.cantRegaloEntrega ?? 0),
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
      // Usar el reloj de PostgreSQL que también se publica como leidoAt.
      const [{ ahora }] = await tx.$queryRaw<Array<{ ahora: Date }>>`SELECT transaction_timestamp() AS ahora`;
      const pedidos = rows.map((raw) => {
        const dto = PedidoDTOMapper.toResumen(
          PedidoMapper.fromPrisma({ ...raw, factura: undefined }),
        );
        const hechos = hechosPagina
          .filter((e) => e.pedidoId === raw.id)
          .sort((a, b) => +b.fecha - +a.fecha);
        // #959: en mostrador un hecho HISTORICO con cantidades/fecha exactas
        // sí es válido; no equiparar fuente histórica con evento incompleto.
        const entregaEnRangoIncierta = diaOperativo && hechos.some((e) =>
          e.fecha >= rango.desde && e.fecha < rango.hasta && requiereConciliacionEntrega(e),
        );
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
        const riesgo = riesgos.get(raw.id);
        const estadoRiesgo = raw.estadoEntrega === "PENDIENTE" ? "sin_gestionar"
          : raw.estadoEntrega === "NO_ENTREGADO" ? "sin_reasignar"
          : raw.estadoEntrega === "EN_RUTA" ? "en_ruta" : null;
        return {
          ...dto,
          ...legacy,
          ...(riesgo && riesgo.tipo === estadoRiesgo && elegibleRiesgoOperativo(raw, ahora)
            ? { riesgoOperativo: riesgo } : {}),
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
          ...((fArrastre || diaOperativo) && raw.fecha < rango.desde ? { diaAnterior: true, diaReferenciaConsulta: f.desde } : {}),
          ...(diaOperativo ? { actividadOperativa: true } : {}),
          ...(diaOperativo && hechos.some((e) =>
            e.fecha >= rango.desde && e.fecha < rango.hasta
          ) ? {
            entregaEnPeriodo: {
              porConciliar: entregaEnRangoIncierta,
              unidades: entregaEnRangoIncierta ? null : hechos
                .filter((e) => e.fecha >= rango.desde && e.fecha < rango.hasta)
                .reduce((n, e) => n + (e.cantidades ?? []).reduce((subtotal, l) => subtotal + l.cantidad, 0), 0),
            },
          } : {}),
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
        fiado = [...(exigiblesResumen?.values() ?? [])].reduce((s, monto) => s + centavos(monto), 0) / 100;
      const consultaDestacadas = !actividadIntegrada && !arrastre && base === "pedido" && !f.all && !esFocoCompromiso(f.foco)
        ? await listarEntregasDestacadas(tx, whereConsultaPedidos({ ...f, fechaBase: "entrega", foco: f.foco === "entregaParcial" ? "" : f.foco }), rango, f.repartidorId, f.foco === "entregaParcial")
        : null;
      // #915: con la vista agrupada, cada entrega de un pedido anterior se ubica en el grupo de su barrio efectivo
      // (misma resolución que las filas: override del pedido > negocio > cliente; venta anónima aparte).
      if (consultaDestacadas && catalogoBarrios && consultaDestacadas.destacadas.length) {
        const fuentes = await tx.pedido.findMany({
          where: { id: { in: consultaDestacadas.destacadas.map((d) => d.pedidoId) } },
          select: {
            id: true, clienteId: true, origen: true, direccionEntrega: true, barrioEntrega: true,
            cliente: { select: { direccion: true, barrio: true, barrioCanonico: { select: { id: true, nombre: true } } } },
            negocio: { select: { direccion: true, barrio: true, barrioCanonico: { select: { id: true, nombre: true } } } },
          },
        });
        const grupoDe = new Map<string, GrupoBarrio>(fuentes.map((c) => [c.id, esVentaAnonima(c)
          ? { clave: CLAVE_VENTA_ANONIMA, etiqueta: ETIQUETA_VENTA_ANONIMA }
          : resolverGrupoBarrio(
              { overrideDireccion: c.direccionEntrega, overrideBarrio: c.barrioEntrega, cliente: c.cliente, negocio: c.negocio },
              catalogoBarrios!,
            )]));
        const conBarrio = consultaDestacadas.destacadas.map((d) => ({ ...d, ...(grupoDe.get(d.pedidoId) ? { grupoBarrio: grupoDe.get(d.pedidoId) } : {}) }));
        // Con un barrio elegido no se cuelan entregas de otros barrios (A07).
        const dentro = f.grupoBarrio ? conBarrio.filter((d) => d.grupoBarrio?.clave === f.grupoBarrio) : conBarrio;
        consultaDestacadas.destacadasTotal = Math.max(0, consultaDestacadas.destacadasTotal - (conBarrio.length - dentro.length));
        consultaDestacadas.destacadas = dentro;
      }
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
        ...(actividadIntegrada ? { actividadIntegrada: true } : {}),
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
              exigiblesPorConciliar: parciales.filter(p => importesEntregaPedido({ ...p, exigible: exigiblesResumen?.get(p.id) ?? 0 }).porConciliar).length,
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
