import { describe, it, expect } from "vitest";
import {
  leerFiltrosConsulta,
  parametrosConsulta,
  rangoConsultaPedidos,
  FiltroPedidosError,
  filtrosArrastrados,
  MAX_ARRASTRADOS,
  baseEfectiva,
} from "../pedidos-consulta";
const leer = (s = "") =>
  leerFiltrosConsulta(new URLSearchParams(s), "2026-10-30");
describe("#516 — contrato de consulta", () => {
  it("sin filtros es Hoy y no solicita resumen, también al serializar para API", () => {
    const f = leer();
    expect(f.desde).toBe("2026-10-30");
    expect(f.hasta).toBe(f.desde);
    expect(f.resumen).toBe(false);
    expect(leerFiltrosConsulta(parametrosConsulta(f)).resumen).toBe(false);
  });
  it("un enlace con un filtro explícito sí solicita resumen", () => {
    expect(leer("canal=PUNTO").resumen).toBe(true);
  });
  it("horas solas usan Hoy, incluyen todo el minuto final y excluyen el siguiente", () => {
    const r = rangoConsultaPedidos(leer("desdeHora=10:00&hastaHora=10:00"));
    expect(r.desde.toISOString()).toBe("2026-10-30T15:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-10-30T15:01:00.000Z");
  });
  it("fechas y horas son un intervalo continuo, no ventanas diarias", () => {
    const r = rangoConsultaPedidos(
      leer("desde=2026-10-29&hasta=2026-10-30&desdeHora=23:40&hastaHora=00:10"),
    );
    expect(+r.hasta - +r.desde).toBe(31 * 60000);
  });
  it("el extremo de fin de día incluye .999 y no la medianoche siguiente", () => {
    const r = rangoConsultaPedidos(leer());
    expect(new Date("2026-10-31T04:59:59.999Z") < r.hasta).toBe(true);
    expect(r.hasta.toISOString()).toBe("2026-10-31T05:00:00.000Z");
  });
  it.each([
    "desde=2026-02-30",
    "desdeHora=24:00",
    "hastaHora=10:99",
    "desdeHora=12:00&hastaHora=11:59",
    "desde=2026-11-01&hasta=2026-10-31",
    "all=true&desdeHora=10:00",
    "fechaBase=registrado",
    "registro=borrados",
    "estadoEntrega=DESCONOCIDO",
    "canal=OFICINA",
    "page=-1",
    "page=0",
    "pageSize=9999",
  ])("rechaza entrada inválida sin convertirla en otra consulta: %s", (s) =>
    expect(() => leer(s)).toThrow(FiltroPedidosError),
  );
  it("normaliza canales legacy y conserva selección múltiple e identidad al serializar", () => {
    const f = leer(
      "tipo=ENVIO&canal=PUNTO&repartidorId=uno&repartidorId=dos&repartidorId=uno&search=Tienda&fechaBase=entrega",
    );
    expect(f.canal).toEqual(["PUNTO", "DOMICILIO"]);
    expect(f.repartidorId).toEqual(["uno", "dos"]);
    expect(leerFiltrosConsulta(parametrosConsulta(f))).toEqual(f);
  });
  it("Anulado de enlaces anteriores no queda oculto por el nuevo predeterminado Activos", () =>
    expect(leer("estadoEntrega=ANULADO").registro).toBe("todos"));
  it("todos admite rango sin límites, con resumen explícitamente oculto", () => {
    const f = leer("all=true&resumen=0");
    expect(f.desde).toBe("");
    expect(f.hasta).toBe("");
    expect(f.resumen).toBe(false);
  });
});

// #797: pendientes de días anteriores como lectura aparte.
describe("#797 — filtros de pendientes de días anteriores", () => {
  const hoy = "2026-10-30";
  const fa = (s = "") => filtrosArrastrados(leer(s), hoy);
  it("Hoy: lee pendientes anteriores al día, sin resumen y con tope", () => {
    const r = fa()!;
    expect(r.desde).toBe("");
    expect(r.hasta).toBe("2026-10-29");
    expect(r.estadoEntrega).toEqual(["PENDIENTE", "EN_RUTA", "NO_ENTREGADO"]);
    expect(r.resumen).toBe(false);
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(MAX_ARRASTRADOS);
    expect(r.fechaBase).toBe("pedido");
    // El rango resultante es válido y termina al cerrar el día anterior.
    expect(rangoConsultaPedidos(r).hasta.toISOString()).toBe(
      "2026-10-30T05:00:00.000Z",
    );
  });
  it("cruza el cambio de mes y de año al calcular el día anterior", () => {
    expect(
      filtrosArrastrados(leer("desde=2026-10-01&hasta=2026-10-30"), hoy)!.hasta,
    ).toBe("2026-09-30");
    expect(
      filtrosArrastrados(
        leerFiltrosConsulta(new URLSearchParams(), "2027-01-01"),
        "2027-01-01",
      )!.hasta,
    ).toBe("2026-12-31");
  });
  it("las horas solo delimitan el día consultado, no los días previos", () => {
    const r = fa("desdeHora=10:00&hastaHora=11:00")!;
    expect(r.desdeHora).toBe("");
    expect(r.hastaHora).toBe("");
  });
  it("conserva búsqueda, canal y cliente de la consulta", () => {
    const r = fa("search=ana&canal=DOMICILIO&clienteId=c1")!;
    expect(r.search).toBe("ana");
    expect(r.canal).toEqual(["DOMICILIO"]);
    expect(r.clienteId).toBe("c1");
  });
  it("respeta un filtro de estado, solo con los estados que cuentan", () => {
    expect(fa("estadoEntrega=EN_RUTA")!.estadoEntrega).toEqual(["EN_RUTA"]);
    expect(
      fa("estadoEntrega=EN_RUTA&estadoEntrega=ENTREGADO")!.estadoEntrega,
    ).toEqual(["EN_RUTA"]);
  });
  it.each([
    ["solo entregados", "estadoEntrega=ENTREGADO"],
    ["solo anulados", "registro=anulados"],
    ["fecha de entrega", "fechaBase=entrega"],
    ["fecha de cobro", "fechaBase=cobro"],
    ["fecha de creación", "fechaBase=creacion"],
    ["todas las fechas", "all=true"],
    ["un día pasado", "desde=2026-10-20&hasta=2026-10-20"],
    ["un día futuro", "desde=2026-11-02&hasta=2026-11-02"],
    ["sin fecha de inicio", "hasta=2026-10-30"],
  ])("no aplica con %s", (_nombre, query) => {
    expect(fa(query)).toBeNull();
  });
  it("aplica si el rango incluye hoy aunque empiece antes", () => {
    expect(fa("desde=2026-10-25&hasta=2026-10-30")!.hasta).toBe("2026-10-24");
  });
  it("no modifica la consulta original", () => {
    const f = leer("search=ana");
    const antes = JSON.stringify(f);
    filtrosArrastrados(f, hoy);
    expect(JSON.stringify(f)).toBe(antes);
  });
});

describe("#854 baseEfectiva", () => {
  const f = (q: string) =>
    leerFiltrosConsulta(new URLSearchParams(`desde=2026-11-14&hasta=2026-11-14&${q}`), "2026-11-17");
  it("«Entregado» como único estado, con la base por defecto, rige por la fecha de entrega", () => {
    expect(baseEfectiva(f("estadoEntrega=ENTREGADO"))).toBe("entrega");
    expect(baseEfectiva(f("fechaBase=pedido&estadoEntrega=ENTREGADO&canal=PUNTO"))).toBe("entrega");
  });
  it("no cambia sin Entregado, con otros estados mezclados, con otra base, con foco ni sin rango", () => {
    expect(baseEfectiva(f(""))).toBe("pedido");
    expect(baseEfectiva(f("estadoEntrega=PENDIENTE"))).toBe("pedido");
    expect(baseEfectiva(f("estadoEntrega=ENTREGADO&estadoEntrega=PENDIENTE"))).toBe("pedido");
    expect(baseEfectiva(f("fechaBase=creacion&estadoEntrega=ENTREGADO"))).toBe("creacion");
    expect(baseEfectiva(f("fechaBase=cobro&estadoEntrega=ENTREGADO"))).toBe("cobro");
    expect(baseEfectiva(f("foco=enRuta&estadoEntrega=ENTREGADO"))).toBe("pedido");
    expect(baseEfectiva(f("all=true&estadoEntrega=ENTREGADO"))).toBe("pedido");
  });
  it("es derivada: no altera la clave de consulta ni el filtro guardado", () => {
    const x = f("estadoEntrega=ENTREGADO");
    expect(x.fechaBase).toBe("pedido");
    expect(parametrosConsulta(x).get("fechaBase")).toBe("pedido");
  });
});
