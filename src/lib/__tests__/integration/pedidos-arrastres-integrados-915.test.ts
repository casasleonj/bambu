// #927 amplía #915: pendientes y entregas físicas anteriores en el MISMO universo
// de Hoy, tanto en lista general como barrio, sin duplicados ni tope artificial.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";

const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const antes = (n: number) => {
  const [a, m, d] = HOY.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
};
const en = (dia: string, h: string) => new Date(`${dia}T${h}-05:00`);
const ids: Record<string, string> = {};
const claves: Record<string, string> = {};
const villaIds: string[] = [];

async function pedido(
  clienteId: string,
  fecha: Date,
  o: { estado?: "PENDIENTE" | "ENTREGADO"; entregadas?: number; eventoHoy?: boolean } = {},
) {
  const admin = await getAdminUser();
  const estado = o.estado ?? "PENDIENTE";
  const entregadas = estado === "ENTREGADO" ? 3 : (o.entregadas ?? 0);
  const p = await testPrisma.pedido.create({
    data: {
      clienteId, createdById: admin.id, canal: "DOMICILIO", fecha, createdAt: fecha, fechaEntrega: fecha,
      estado, estadoEntrega: estado, estadoPago: "PENDIENTE",
      entregadoAt: estado === "ENTREGADO" ? en(HOY, "08:00:00") : null,
      total: 6900, totalPagado: 0, saldo: 6900,
      items: { create: { producto: "PACA_AGUA", cantPedido: 3, cantEntrega: entregadas, precio: 2300, subtotal: 6900 } },
    },
  });
  if (o.eventoHoy || estado === "ENTREGADO")
    await testPrisma.historial.create({
      data: {
        entidad: "Pedido", registroId: p.id, accion: "UPDATE", fecha: en(HOY, "08:00:00"),
        datos: JSON.stringify({
          accion: "ENTREGA_OFICINA",
          consultaEntrega: {
            version: 1, precisionFecha: "INSTANTE", fecha: en(HOY, "08:00:00").toISOString(),
            repartidorId: null, cantidades: [{ producto: "PACA_AGUA", cantidad: Math.max(1, entregadas) }],
          },
        }),
      },
    });
  return p.id;
}
const barrio = async (nombre: string) =>
  (await testPrisma.barrio.create({ data: { nombre, nombreNormalizado: nombre.toLowerCase() } })).id;
const cliente = async (nombre: string, barrioId: string) =>
  (await testPrisma.cliente.create({ data: { nombre, telefono: randomUUID(), barrioId, barrio: nombre } })).id;
const q = (extra = "") =>
  consultarPedidos(leerFiltrosConsulta(new URLSearchParams(`desde=${HOY}&hasta=${HOY}&agrupar=barrio&pageSize=100${extra}`), HOY), "ADMIN");

describe("#915 — arrastres y entregas anteriores dentro del barrio (Postgres real)", () => {
  beforeAll(async () => {
    await resetAndSeed();
    const bCentro = await barrio("Centro"), bVilla = await barrio("Villa"), bSolo = await barrio("Solo");
    claves.centro = `b:${bCentro}`; claves.villa = `b:${bVilla}`; claves.solo = `b:${bSolo}`;
    const cCentro = await cliente("Cli Centro", bCentro), cVilla = await cliente("Cli Villa", bVilla), cSolo = await cliente("Cli Solo", bSolo);
    ids.hoyCentro = await pedido(cCentro, new Date());
    ids.arrCentro = await pedido(cCentro, en(antes(1), "09:00:00"));
    // Villa: 6 arrastres (más que el tope histórico de 5), uno de ellos parcial con entrega hoy.
    for (const [d, h] of [[6, "07:00:00"], [5, "07:00:00"], [4, "07:00:00"], [4, "15:00:00"], [3, "07:00:00"], [2, "07:00:00"]] as const)
      villaIds.push(await pedido(cVilla, en(antes(d), h), d === 2 ? { entregadas: 1, eventoHoy: true } : {}));
    // Pedido de AYER ya entregado hoy: no es pendiente, pero su entrega debe verse en el grupo de su barrio.
    ids.entregadoCentro = await pedido(cCentro, en(antes(1), "10:00:00"), { estado: "ENTREGADO" });
    ids.entregadoSolo = await pedido(cSolo, en(antes(1), "10:30:00"), { estado: "ENTREGADO" });
  }, 120000);
  afterAll(disconnect);

  it("pedidos anteriores abiertos y completados hoy entran en la misma lista sin duplicados", async () => {
    const r = await q();
    expect(r.arrastradosIntegrados).toBe(true);
    expect(r.arrastrados).toBeUndefined();
    const lista = r.pedidos.map((p) => p.id);
    expect(new Set(lista).size).toBe(lista.length);
    expect(lista.sort()).toEqual([ids.hoyCentro, ids.arrCentro, ...villaIds, ids.entregadoCentro, ids.entregadoSolo].sort());
    expect(r.total).toBe(10);
    expect(r.actividadIntegrada).toBe(true);
    expect(r.destacadas ?? []).toHaveLength(0);
    expect(r.pedidos.find(p => p.id === ids.entregadoCentro)?.entregaEnPeriodo?.unidades).toBe(3);
    const marca = Object.fromEntries(r.pedidos.map((p) => [p.id, p.diaAnterior === true]));
    expect(marca[ids.hoyCentro]).toBe(false);
    expect(marca[ids.arrCentro]).toBe(true);
    for (const v of villaIds) expect(marca[v]).toBe(true);
    expect(marca[ids.entregadoCentro]).toBe(true);
    expect(marca[ids.entregadoSolo]).toBe(true);
  });

  it("cada pedido va en el grupo de su barrio; FIFO entre barrios y dentro del barrio; totales físicos con los arrastres", async () => {
    const r = await q();
    // El pedido abierto más antiguo de Villa (hace 6 días) manda sobre el de Centro (ayer).
    expect(r.grupos!.map((g) => g.clave).slice(0, 2)).toEqual([claves.villa, claves.centro]);
    const villa = r.grupos!.find((g) => g.clave === claves.villa)!;
    const centro = r.grupos!.find((g) => g.clave === claves.centro)!;
    expect(villa.total).toBe(6);
    expect(villa.unidadesPendientes).toBe(3 * 5 + 2); // 5 pedidos × 3 + el parcial (3 − 1)
    expect(centro.total).toBe(3);
    expect(centro.unidadesPendientes).toBe(3 + 3);
    const filasVilla = r.pedidos.filter((p) => p.grupoBarrio?.clave === claves.villa);
    expect(filasVilla.map((p) => +new Date(p.createdAt!))).toEqual([...filasVilla.map((p) => +new Date(p.createdAt!))].sort((a, b) => a - b));
  });

  it("pagina el universo unido antes de ordenar y no repite pedidos entre páginas", async () => {
    const primera = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams(
      `desde=${HOY}&hasta=${HOY}&agrupar=&page=1&pageSize=3`
    ), HOY), "ADMIN");
    const segunda = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams(
      `desde=${HOY}&hasta=${HOY}&agrupar=&page=2&pageSize=3`
    ), HOY), "ADMIN");
    expect(primera.total).toBe(10);
    expect(segunda.total).toBe(10);
    expect(primera.pedidos).toHaveLength(3);
    expect(segunda.pedidos).toHaveLength(3);
    expect(new Set([...primera.pedidos, ...segunda.pedidos].map(p => p.id)).size).toBe(6);
  });

  it("no cuenta las entregas de pedidos anteriores en el importe comercial del día", async () => {
    const r = await q("&resumen=1");
    expect(r.resumen!.importe).toBe(6900);
    expect(r.total).toBe(10);
  });

  it("el resumen del día no se mezcla con los arrastres (XMOD)", async () => {
    const r = await q("&resumen=1");
    expect(r.resumen!.importe).toBe(6900); // solo el pedido de hoy
  });

  it("las entregas verificadas de pedidos anteriores tienen fila propia y barrio (sin tarjetas paralelas)", async () => {
    const r = await q();
    const porPedido = Object.fromEntries(r.pedidos.map((p) => [p.id, p.grupoBarrio?.clave]));
    expect(porPedido[ids.entregadoCentro]).toBe(claves.centro);
    expect(porPedido[ids.entregadoSolo]).toBe(claves.solo);
    expect(r.destacadas ?? []).toHaveLength(0);
    expect(r.pedidos.filter(p => p.id === villaIds.at(-1))).toHaveLength(1);
  });

  it("con un barrio elegido no se cuelan arrastres ni entregas de otros barrios", async () => {
    const r = await q(`&grupoBarrio=${encodeURIComponent(claves.centro)}`);
    expect(r.pedidos.map((p) => p.id).sort()).toEqual([ids.hoyCentro, ids.arrCentro, ids.entregadoCentro].sort());
    expect(r.destacadas ?? []).toHaveLength(0);
  });

  it("sin agrupar y con repartidor se preserva el mismo universo filtrable", async () => {
    const sin = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams(`desde=${HOY}&hasta=${HOY}&agrupar=&pageSize=100`), HOY), "ADMIN");
    expect(sin.arrastradosIntegrados).toBe(true);
    expect(sin.pedidos.map(p => p.id).sort()).toEqual([ids.hoyCentro, ids.arrCentro, ...villaIds, ids.entregadoCentro, ids.entregadoSolo].sort());
    expect(sin.arrastrados).toBeUndefined();
    expect(sin.total).toBe(10);
    const rep = await q(`&repartidorId=${randomUUID()}`);
    expect(rep.arrastradosIntegrados).toBe(true);
    expect(rep.pedidos).toHaveLength(0);
  });
});
