// #836 F3 — agrupar la consulta de Pedidos por barrio efectivo, en el servidor y sobre el conjunto completo.
// A13 (barrio por pedido), A14 (alias/homónimo/sin barrio), A15 (70 pedidos y página de 25).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testPrisma, resetAndSeed, disconnect, getAdminUser } from "./setup";
import { consultarPedidos } from "@/lib/pedidos-consulta.repository";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";

const ids = { centro: "", villa: "" };
const fecha = new Date("2026-11-10T15:00:00Z");

async function barrio(nombre: string, alias: string[] = []) {
  const b = await testPrisma.barrio.create({
    data: { nombre, nombreNormalizado: nombre.toLowerCase(), aliases: { create: alias.map((a) => ({ texto: a, textoNormalizado: a.toLowerCase() })) } },
  });
  return b.id;
}
async function cliente(nombre: string, o: { barrioId?: string; barrio?: string } = {}) {
  return (await testPrisma.cliente.create({
    data: { nombre, telefono: randomUUID(), barrioId: o.barrioId ?? null, barrio: o.barrio ?? null },
  })).id;
}
async function pedidos(clienteId: string, n: number, extra: { barrioEntrega?: string; direccionEntrega?: string; estado?: "PENDIENTE" | "ANULADO" } = {}) {
  const admin = await getAdminUser();
  const estado = extra.estado ?? "PENDIENTE";
  const creados: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await testPrisma.pedido.create({
      data: {
        clienteId, createdById: admin.id, canal: "DOMICILIO", origen: "PEDIDO", fecha, createdAt: fecha,
        estado, estadoEntrega: estado, estadoPago: estado === "ANULADO" ? "ANULADO" : "PENDIENTE",
        total: 1000, totalPagado: 0, saldo: 1000,
        barrioEntrega: extra.barrioEntrega ?? null, direccionEntrega: extra.direccionEntrega ?? null,
      },
    });
    creados.push(p.id);
  }
  return creados;
}
const q = (params: string) =>
  consultarPedidos(leerFiltrosConsulta(new URLSearchParams(`all=true&agrupar=barrio&${params}`)), "ADMIN");

describe("#836 F3 — consulta agrupada por barrio (Postgres real)", () => {
  const idsPorGrupo: Record<string, string[]> = {};
  beforeAll(async () => {
    await resetAndSeed();
    ids.centro = await barrio("Centro", ["El Centro"]);
    ids.villa = await barrio("Villa Nueva");
    const cCentro = await cliente("Cliente Centro", { barrioId: ids.centro });
    const cVilla = await cliente("Cliente Villa", { barrioId: ids.villa });
    const cEsp = await cliente("Cliente Esperanza", { barrio: "La Esperanza" });
    const cEsp2 = await cliente("Cliente Esperanza 2", { barrio: "La Esperanza 2" });
    const cNada = await cliente("Cliente Sin Barrio");
    idsPorGrupo.centro = await pedidos(cCentro, 70); // A15
    idsPorGrupo.villa = await pedidos(cVilla, 11);
    idsPorGrupo.esperanza = await pedidos(cEsp, 4);
    idsPorGrupo.esperanza2 = await pedidos(cEsp2, 2);
    idsPorGrupo.sin = await pedidos(cNada, 3);
    // A13: el barrio de ESTE pedido gana sobre el del cliente; texto con otra tilde/mayúscula/alias cuenta en el catálogo.
    idsPorGrupo.overrideAVilla = await pedidos(cCentro, 1, { barrioEntrega: "VILLA nueva", direccionEntrega: "Mz 3" });
    idsPorGrupo.aliasACentro = await pedidos(cNada, 1, { barrioEntrega: "El Centro", direccionEntrega: "Cl 9" });
    // anulados no son demanda
    await pedidos(cCentro, 2, { estado: "ANULADO" });
  });
  afterAll(async () => { await disconnect(); });

  it("A15: 70 pedidos de un barrio con página de 25 → el grupo dice 70 y el total es el real", async () => {
    const r = await q("pageSize=25&page=1");
    const centro = r.grupos!.find((g) => g.etiqueta === "Centro")!;
    expect(centro.total).toBe(70 + 1); // + el pedido con alias «El Centro»
    expect(r.pedidos).toHaveLength(25);
    expect(r.total).toBe(70 + 11 + 4 + 2 + 3 + 1 + 1);
  });

  it("la suma de los grupos es el total; «Sin barrio» va al final; ningún pedido se pierde ni se repite al paginar", async () => {
    const r1 = await q("pageSize=25&page=1");
    expect(r1.grupos!.reduce((s, g) => s + g.total, 0)).toBe(r1.total);
    expect(r1.grupos![r1.grupos!.length - 1].etiqueta).toBe("Sin barrio");
    const vistos: string[] = [];
    for (let page = 1; page <= Math.ceil(r1.total / 25); page++) {
      const r = await q(`pageSize=25&page=${page}`);
      vistos.push(...r.pedidos.map((p) => p.id));
      for (const p of r.pedidos) expect(p.grupoBarrio).toBeTruthy();
    }
    expect(vistos).toHaveLength(r1.total);
    expect(new Set(vistos).size).toBe(r1.total);
  });

  it("la lista sale ordenada por grupo (Centro, Villa Nueva, …, Sin barrio) y cada fila trae su grupo", async () => {
    const r = await q("pageSize=100&page=1");
    const secuencia = r.pedidos.map((p) => p.grupoBarrio!.etiqueta).filter((e, i, a) => i === 0 || e !== a[i - 1]);
    expect(secuencia).toEqual(r.grupos!.map((g) => g.etiqueta).slice(0, secuencia.length));
    expect(new Set(secuencia).size).toBe(secuencia.length); // cada grupo es un bloque continuo
  });


  it("#859: un barrio de la última página pasa a la primera sin duplicar pedidos ni alterar FIFO al volver", async () => {
    const base = await q("pageSize=25&page=1");
    const villa = base.grupos!.find(g => g.etiqueta === "Villa Nueva")!;
    const sin = base.grupos!.find(g => g.etiqueta === "Sin barrio")!;
    const total = base.total;
    const ordenManual = encodeURIComponent(villa.clave);
    expect(leerFiltrosConsulta(new URLSearchParams(`recorrido=${ordenManual}`)).recorrido).toEqual([villa.clave]);
    const primera = await q(`pageSize=25&page=1&recorrido=${ordenManual}`);
    expect(primera.grupos![0].clave).toBe(villa.clave);
    expect(primera.pedidos[0].grupoBarrio!.clave).toBe(villa.clave);
    const ids: string[] = [];
    for (let page = 1; page <= Math.ceil(total / 25); page++) {
      const actual = await q(`pageSize=25&page=${page}&recorrido=${ordenManual}`);
      ids.push(...actual.pedidos.map(p => p.id));
    }
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    const restaurado = await q("pageSize=25&page=1");
    expect(restaurado.grupos!.map(g => g.clave)).toEqual(base.grupos!.map(g => g.clave));
    expect(restaurado.grupos!.at(-1)!.clave).toBe(sin.clave);
  });

  it("A13: el barrio del pedido gana sobre el del cliente; alias y otra tilde/mayúscula cuentan en su barrio", async () => {
    const r = await q("pageSize=100&page=1&grupoBarrio=" + encodeURIComponent(`b:${ids.villa}`));
    const idsVilla = new Set(r.pedidos.map((p) => p.id));
    expect(idsVilla.has(idsPorGrupo.overrideAVilla[0])).toBe(true);
    expect(idsVilla.has(idsPorGrupo.aliasACentro[0])).toBe(false);
    const c = await q("pageSize=100&page=1&grupoBarrio=" + encodeURIComponent(`b:${ids.centro}`));
    expect(c.pedidos.map((p) => p.id)).toContain(idsPorGrupo.aliasACentro[0]);
    expect(c.pedidos.map((p) => p.id)).not.toContain(idsPorGrupo.overrideAVilla[0]);
  });

  it("A14: barrios de texto libre parecidos NO se mezclan y «Sin barrio» conserva sus pedidos", async () => {
    const r = await q("pageSize=1&page=1");
    const g = (e: string) => r.grupos!.find((x) => x.etiqueta === e)?.total;
    expect(g("La Esperanza")).toBe(4);
    expect(g("La Esperanza 2")).toBe(2);
    expect(g("Sin barrio")).toBe(3);
  });

  it("el filtro por grupo deja solo ese grupo, con total y conteos coherentes", async () => {
    const r = await q("pageSize=25&page=1&resumen=1&grupoBarrio=" + encodeURIComponent(`b:${ids.villa}`));
    expect(r.total).toBe(11 + 1);
    expect(r.pedidos.every((p) => p.grupoBarrio!.clave === `b:${ids.villa}`)).toBe(true);
    expect(r.grupos!.find((g) => g.clave === `b:${ids.villa}`)!.total).toBe(12);
    expect(r.resumen!.importe).toBe(12 * 1000);
  });

  it("sin agrupar la consulta no cambia: no hay grupos ni grupo en las filas", async () => {
    const r = await consultarPedidos(leerFiltrosConsulta(new URLSearchParams("all=true&pageSize=25")), "ADMIN");
    expect(r.grupos).toBeUndefined();
    expect(r.pedidos[0].grupoBarrio).toBeUndefined();
    expect(r.total).toBe(70 + 11 + 4 + 2 + 3 + 1 + 1);
  });

  it("respeta los demás filtros: la búsqueda reduce también los totales de cada grupo", async () => {
    const r = await q("pageSize=25&page=1&search=" + encodeURIComponent("Cliente Villa"));
    expect(r.total).toBe(11);
    expect(r.grupos!.reduce((s, g) => s + g.total, 0)).toBe(11);
  });
});
