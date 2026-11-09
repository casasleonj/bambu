import { describe, it, expect } from "vitest";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import {
  alternarCanal,
  alternarEstadoEntrega,
  alternarFoco,
  alternarOrigen,
  alternarPago,
  canalesVisibles,
  elegirRegistro,
  filtrosActivos,
  origenesVisibles,
  repartidoresVisibles,
  type RepartidorOpcion,
} from "../filtros-chips";

const base = leerFiltrosConsulta(new URLSearchParams(), "2026-11-09");
const reps: RepartidorOpcion[] = [
  { id: "1", nombre: "Carlos", activo: true, usaMoto: true },
  { id: "2", nombre: "Luis", activo: true, usaMoto: false },
  { id: "3", nombre: "Ana", activo: false, usaMoto: true },
];

describe("chips de Pedidos (#607)", () => {
  it("canal: vacío = ambos; no se puede quedar sin canal; ambos vuelve a vacío", () => {
    expect(canalesVisibles(base)).toEqual(["PUNTO", "DOMICILIO"]);
    const solo = alternarCanal(base, "PUNTO");
    expect(solo.canal).toEqual(["DOMICILIO"]);
    expect(alternarCanal(solo, "DOMICILIO")).toBe(solo);
    expect(alternarCanal(solo, "PUNTO").canal).toEqual([]);
  });
  it("entrega admite varios estados (o) y retira la gestión", () => {
    const f = alternarFoco(base, "porPlanificar");
    const g = alternarEstadoEntrega(alternarEstadoEntrega(f, "PENDIENTE"), "EN_RUTA");
    expect(g.estadoEntrega).toEqual(["PENDIENTE", "EN_RUTA"]);
    expect(g.foco).toBe("");
    expect(alternarEstadoEntrega(g, "PENDIENTE").estadoEntrega).toEqual(["EN_RUTA"]);
  });
  it("la gestión limpia los estados y se alterna", () => {
    const f = alternarFoco(alternarEstadoEntrega(base, "ENTREGADO"), "enRuta");
    expect(f.estadoEntrega).toEqual([]);
    expect(f.foco).toBe("enRuta");
    expect(alternarFoco(f, "enRuta").foco).toBe("");
  });
  it("elegir cancelado/anulado pasa el registro a «todos»; elegir «anulados» limpia estados", () => {
    expect(alternarEstadoEntrega(base, "CANCELADO").registro).toBe("todos");
    const a = elegirRegistro(alternarEstadoEntrega(base, "CANCELADO"), "anulados");
    expect(a.estadoEntrega).toEqual([]);
    expect(elegirRegistro(alternarEstadoEntrega(base, "CANCELADO"), "activos").estadoEntrega).toEqual([]);
  });
  it("pago es único y se retira al repetir", () => {
    const f = alternarPago(base, "fiado");
    expect(f.pago).toBe("fiado");
    expect(alternarPago(f, "fiado").pago).toBe("todos");
  });
  it("origen admite varios (o) y «habitual» es el origen RECURRENTE", () => {
    const f = alternarOrigen(alternarOrigen(base, "PEDIDO"), "RECURRENTE");
    expect(f.origen).toEqual(["PEDIDO", "RECURRENTE"]);
    expect(alternarOrigen(f, "RECURRENTE").origen).toEqual(["PEDIDO"]);
    // enlace antiguo con conRecurrencia=true se ve y se quita como habitual
    const viejo = { ...base, conRecurrencia: true };
    expect(origenesVisibles(viejo)).toEqual(["RECURRENTE"]);
    expect(alternarOrigen(viejo, "RECURRENTE")).toMatchObject({ origen: [], conRecurrencia: false });
  });
  it("el resumen activo lista cada filtro con su «quitar»", () => {
    const f = alternarPago(alternarCanal(base, "PUNTO"), "fiado");
    const a = filtrosActivos({ ...f, repartidorId: ["1", "x"] }, reps);
    expect(a.map((x) => x.clave)).toEqual(["canal", "pago", "repartidor"]);
    expect(a.find((x) => x.clave === "repartidor")!.etiqueta).toBe("Repartidor: Carlos o Otro");
    expect(a[0]!.quitar(f).canal).toEqual([]);
    expect(filtrosActivos(base, reps)).toEqual([]);
  });
});

describe("repartidores (#633)", () => {
  const opt = { moto: "todos" as const, inactivos: false, texto: "", elegidos: [] as string[] };
  it("por defecto solo activos, ordenados", () => {
    expect(repartidoresVisibles(reps, opt).map((r) => r.id)).toEqual(["1", "2"]);
  });
  it("inactivos solo si se piden, al final; los elegidos siguen visibles", () => {
    expect(repartidoresVisibles(reps, { ...opt, inactivos: true }).map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(repartidoresVisibles(reps, { ...opt, elegidos: ["3"] }).map((r) => r.id)).toContain("3");
  });
  it("moto: con / sin / todos usa el atributo del trabajador", () => {
    expect(repartidoresVisibles(reps, { ...opt, moto: "con", inactivos: true }).map((r) => r.id)).toEqual(["1", "3"]);
    expect(repartidoresVisibles(reps, { ...opt, moto: "sin" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("busca por nombre sin distinguir mayúsculas", () => {
    expect(repartidoresVisibles(reps, { ...opt, texto: "CARL" }).map((r) => r.id)).toEqual(["1"]);
  });
});
