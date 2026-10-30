import { describe, it, expect } from "vitest";
import {
  leerFiltrosConsulta,
  parametrosConsulta,
  rangoConsultaPedidos,
  FiltroPedidosError,
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
