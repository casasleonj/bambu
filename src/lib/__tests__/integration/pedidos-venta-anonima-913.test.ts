// #913 (refs #859) — la venta anónima en punto no es de ningún barrio ni entra al FIFO.
// A01/A02/A32: identidad canónica (Consumidor Final + origen de venta en punto), sin heurística por canal ni nombre.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import { CANONICAL_CONSUMIDOR_FINAL_ID } from "@/lib/constants";

const dia = 86_400_000;
const hace = (d: number) => new Date(Date.now() - d * dia);
const ids: Record<string, string> = {};

async function pedido(clienteId: string, creado: Date, o: { origen?: "PEDIDO" | "VENTA_RAPIDA"; canal?: "PUNTO" | "DOMICILIO"; entregado?: boolean } = {}) {
  const admin = await getAdminUser();
  const entregado = o.entregado ?? false;
  const p = await testPrisma.pedido.create({
    data: {
      clienteId, createdById: admin.id, canal: o.canal ?? "DOMICILIO", origen: o.origen ?? "PEDIDO",
      fecha: creado, createdAt: creado, fechaEntrega: creado,
      estado: entregado ? "ENTREGADO" : "PENDIENTE", estadoEntrega: entregado ? "ENTREGADO" : "PENDIENTE", estadoPago: "PENDIENTE",
      total: 1000, totalPagado: 0, saldo: 1000,
      items: { create: [{ producto: "PACA_AGUA", cantPedido: 2, cantEntrega: entregado ? 2 : 0, precio: 500, subtotal: 1000 }] },
    },
  });
  return p.id;
}
const q = (params: string) =>
  consultarPedidos(leerFiltrosConsulta(new URLSearchParams(`all=true&agrupar=barrio&${params}`)), "ADMIN");

describe("#913 — venta anónima fuera del territorio y del FIFO (Postgres real)", () => {
  beforeAll(async () => {
    await resetAndSeed();
    const centro = await testPrisma.barrio.create({ data: { nombre: "Centro", nombreNormalizado: "centro" } });
    const cCentro = (await testPrisma.cliente.create({ data: { nombre: "Cli Centro", telefono: randomUUID(), barrioId: centro.id, barrio: "Centro" } })).id;
    const cSin = (await testPrisma.cliente.create({ data: { nombre: "Cli Sin Barrio", telefono: randomUUID() } })).id;
    await testPrisma.cliente.upsert({
      where: { id: CANONICAL_CONSUMIDOR_FINAL_ID }, update: {},
      create: { id: CANONICAL_CONSUMIDOR_FINAL_ID, nombre: "Consumidor Final", telefono: "" },
    });
    // La venta anónima abierta es la MÁS antigua de todas: si contara para el FIFO, su grupo iría primero.
    ids.anonAbierta = await pedido(CANONICAL_CONSUMIDOR_FINAL_ID, hace(10), { origen: "VENTA_RAPIDA", canal: "PUNTO" });
    ids.anonEntregada = await pedido(CANONICAL_CONSUMIDOR_FINAL_ID, hace(1), { origen: "VENTA_RAPIDA", canal: "PUNTO", entregado: true });
    // Consumidor Final con PEDIDO a domicilio sí necesita entrega: es territorial («Sin barrio») y cuenta para el FIFO.
    ids.cfDomicilio = await pedido(CANONICAL_CONSUMIDOR_FINAL_ID, hace(5));
    ids.centro = await pedido(cCentro, hace(2));
    ids.sinBarrio = await pedido(cSin, hace(1));
    // Venta PUNTO con cliente REGISTRADO: sigue siendo territorial (no se excluye por canal).
    ids.puntoRegistrado = await pedido(cCentro, hace(3), { origen: "VENTA_RAPIDA", canal: "PUNTO" });
  });
  afterAll(async () => { await disconnect(); });

  it("las ventas anónimas van a su propio grupo, siempre al final, y no cuentan como «Sin barrio»", async () => {
    const r = await q("pageSize=100&page=1");
    const claves = r.grupos!.map((g) => g.clave);
    expect(claves.at(-1)).toBe("venta-anonima");
    const anon = r.grupos!.find((g) => g.clave === "venta-anonima")!;
    expect(anon.total).toBe(2);
    const sin = r.grupos!.find((g) => g.clave === "sin-barrio")!;
    expect(sin.total).toBe(2); // el pedido a domicilio del Consumidor Final + el cliente registrado sin barrio
    const filas = Object.fromEntries(r.pedidos.map((p) => [p.id, p.grupoBarrio!.clave]));
    expect(filas[ids.anonAbierta]).toBe("venta-anonima");
    expect(filas[ids.anonEntregada]).toBe("venta-anonima");
    expect(filas[ids.cfDomicilio]).toBe("sin-barrio");
    expect(filas[ids.puntoRegistrado]).toMatch(/^b:/);
  });

  it("no entra al FIFO: ni ordena barrios ni suma unidades por entregar", async () => {
    const r = await q("pageSize=100&page=1");
    expect(r.grupos![0].clave).toBe("sin-barrio"); // su pedido abierto más antiguo (hace 5 días) manda, no la venta anónima de hace 10
    const anon = r.grupos!.find((g) => g.clave === "venta-anonima")!;
    expect(anon.unidadesPendientes).toBe(0);
    expect(anon.remanentes).toEqual({});
    const sin = r.grupos!.find((g) => g.clave === "sin-barrio")!;
    expect(sin.unidadesPendientes).toBe(4); // 2 + 2, sin sumar la venta anónima
  });

  it("sigue consultable: la consulta general la incluye y se puede ver solo ese grupo", async () => {
    const general = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams("all=true&pageSize=100&page=1")), "ADMIN");
    expect(general.pedidos.map((p) => p.id)).toEqual(expect.arrayContaining([ids.anonAbierta, ids.anonEntregada]));
    const solo = await q("pageSize=100&page=1&grupoBarrio=venta-anonima");
    expect(solo.pedidos.map((p) => p.id).sort()).toEqual([ids.anonAbierta, ids.anonEntregada].sort());
  });

  it("el Recorrido manual no la mueve: la clave no es un barrio y se ignora", async () => {
    expect(leerFiltrosConsulta(new URLSearchParams("recorrido=venta-anonima&recorrido=sin-barrio")).recorrido).toEqual(["sin-barrio"]);
    const r = await q("pageSize=100&page=1&recorrido=sin-barrio");
    expect(r.grupos!.at(-1)!.clave).toBe("venta-anonima");
  });
});
