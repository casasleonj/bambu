import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { OperacionList } from "../operacion-list";
import { GrupoBarrioEncabezado } from "../grupo-barrio-encabezado";
import { alternarAgrupar, filtrosActivos } from "../filtros-chips";
import { leerFiltrosConsulta } from "@/lib/pedidos-consulta";
import type { Pedido } from "../../pedidos-client/types";
const base: Pedido = {
  id: "p1",
  numero: 901,
  clienteId: "c1",
  nombreCli: "María",
  telefonoCli: "300",
  zonaCli: "",
  barrioCli: "",
  tipo: "ENVIO",
  canal: "DOMICILIO",
  estado: "PENDIENTE",
  origen: "PEDIDO",
  estadoEntrega: "PENDIENTE",
  estadoPago: "PARCIAL",
  items: [
    {
      producto: "PACA_HIELO",
      cantPedido: 4,
      cantEntrega: 2,
      precio: 5000,
      subtotal: 20000,
    },
    {
      producto: "PACA_AGUA",
      cantPedido: 1,
      cantEntrega: 1,
      precio: 3000,
      subtotal: 3000,
    },
  ],
  cPacaAguaPed: 1,
  cPacaHieloPed: 4,
  cBotellonFabPed: 0,
  cBotellonDomPed: 0,
  cBolsaAguaPed: 0,
  cBolsaHieloPed: 0,
  cPacaAguaEnt: 1,
  cPacaHieloEnt: 2,
  cBotellonFabEnt: 0,
  cBotellonDomEnt: 0,
  cBolsaAguaEnt: 0,
  cBolsaHieloEnt: 0,
  precioPacaAgua: 3000,
  precioPacaHielo: 5000,
  precioBotellonFab: 0,
  precioBotellonDom: 0,
  precioBolsaAgua: 0,
  precioBolsaHielo: 0,
  total: 23000,
  totalPagado: 10000,
  saldo: 13000,
  fecha: "2026-10-29T15:00:00Z",
  createdAt: "2026-10-29T15:00:00Z",
  creadoPor: "Ana",
  factura: { id: "factura-exacta", numero: "FAC-901", estado: "PARCIAL" },
};

const fila = (id: string, numero: number, g?: { clave: string; etiqueta: string }): Pedido => ({
  ...base, id, numero, nombreCli: `Cliente ${numero}`, ...(g ? { grupoBarrio: g } : {}),
});
const CENTRO = { clave: "b:centro", etiqueta: "Centro" };
const VILLA = { clave: "b:villa", etiqueta: "Villa Nueva" };
const SIN = { clave: "sin-barrio", etiqueta: "Sin barrio" };

function montar(pedidos: Pedido[], extra: Record<string, unknown> = {}) {
  const onGrupoBarrio = vi.fn();
  render(
    <OperacionList
      pedidos={pedidos}
      viewport="desktop"
      hoyBogota="2026-10-29"
      onAccion={vi.fn()}
      onOpen={vi.fn()}
      consulta={{
        userRole: "ADMIN", gestionDirecta: true, volver: "/pedidos", onVerPedido: vi.fn(), onVerFactura: vi.fn(),
        grupos: [{ ...CENTRO, total: 70 }, { ...VILLA, total: 11 }, { ...SIN, total: 3 }],
        onGrupoBarrio, ...extra,
      }}
    />,
  );
  return { onGrupoBarrio };
}

describe("#836 F3 — lista agrupada por barrio", () => {
  it("un encabezado por bloque con el total REAL de la consulta, no el de la página", () => {
    montar([fila("a", 1, CENTRO), fila("b", 2, CENTRO), fila("c", 3, VILLA), fila("d", 4, SIN)]);
    expect(screen.getByTestId("grupo-barrio-total-b:centro")).toHaveTextContent("70 pedidos");
    expect(screen.getByTestId("grupo-barrio-total-b:villa")).toHaveTextContent("11 pedidos");
    expect(screen.getByTestId("grupo-barrio-total-sin-barrio")).toHaveTextContent("3 pedidos");
    // Centro: 2 filas aquí de 70 → avisa que el resto sigue en otras páginas
    expect(screen.getByTestId("grupo-barrio-b:centro")).toHaveTextContent("aquí 2");
  });

  it("conserva todas las filas y su orden; cada una dentro de su bloque", () => {
    montar([fila("a", 1, CENTRO), fila("b", 2, CENTRO), fila("c", 3, VILLA)]);
    const centro = screen.getByRole("region", { name: "Barrio Centro" });
    expect(within(centro).getAllByTestId(/^operacion-row-/)).toHaveLength(2);
    const villa = screen.getByRole("region", { name: "Barrio Villa Nueva" });
    expect(within(villa).getAllByTestId(/^operacion-row-/)).toHaveLength(1);
  });

  it("«Ver solo este barrio» pide solo ese grupo; en modo un-barrio ofrece volver a todos", () => {
    const { onGrupoBarrio } = montar([fila("a", 1, CENTRO)]);
    fireEvent.click(screen.getByTestId("grupo-barrio-solo-b:centro"));
    expect(onGrupoBarrio).toHaveBeenCalledWith("b:centro");
  });

  it("con un barrio elegido el encabezado ofrece «Ver todos los barrios» y no repite «aquí N»", () => {
    const { onGrupoBarrio } = montar([fila("a", 1, CENTRO)], { grupoActivo: "b:centro" });
    expect(screen.getByTestId("grupo-barrio-b:centro")).not.toHaveTextContent("aquí");
    fireEvent.click(screen.getByTestId("grupo-barrio-todos"));
    expect(onGrupoBarrio).toHaveBeenCalledWith(null);
  });

  it("sin grupoBarrio en las filas la lista es la de siempre (sin encabezados)", () => {
    montar([fila("a", 1), fila("b", 2)]);
    expect(screen.queryByTestId("pedidos-agrupados-barrio")).toBeNull();
    expect(screen.getAllByTestId(/^operacion-row-/)).toHaveLength(2);
  });
});

describe("#927 — etiquetas de actividad en la misma fila", () => {
  it("parcial de ayer con entrega hoy combina tres etiquetas y cantidades", () => {
    const parcial = {
      ...fila("anterior", 1084),
      fecha: "2026-10-28T15:00:00Z",
      diaAnterior: true,
      actividadOperativa: true,
      entregaEnPeriodo: { unidades: 2 },
    };
    montar([parcial]);
    expect(screen.getByTestId("operacion-dia-anterior-anterior")).toHaveTextContent("De ayer");
    expect(screen.getByTestId("operacion-parcial-anterior")).toHaveTextContent("Parcial");
    expect(screen.getByTestId("operacion-entrega-hoy-anterior")).toHaveTextContent("Entrega hoy");
    expect(screen.getByTestId("operacion-cantidades-anterior")).toHaveTextContent("Pedidas: 5 · Entregadas: 3 · Pendientes: 2 · Hoy: 2");
  });

  it("pedido antiguo completado hoy se rotula una vez, sin parcial", () => {
    const completo = {
      ...fila("completo", 1095),
      fecha: "2026-10-28T15:00:00Z",
      estadoEntrega: "ENTREGADO",
      items: base.items.map((i) => ({ ...i, cantEntrega: i.cantPedido })),
      diaAnterior: true,
      actividadOperativa: true,
      entregaEnPeriodo: { unidades: 2 },
    };
    montar([completo]);
    expect(screen.getByTestId("operacion-entrega-hoy-completo")).toHaveTextContent("Entregado hoy");
    expect(screen.queryByTestId("operacion-parcial-completo")).toBeNull();
    expect(screen.getAllByTestId("operacion-row-completo")).toHaveLength(1);
  });

  it("evidencia histórica incompleta nunca se etiqueta Entregado hoy", () => {
    montar([{
      ...fila("incierto", 1100),
      fecha: "2026-10-28T15:00:00Z",
      estadoEntrega: "ENTREGADO",
      diaAnterior: true,
      actividadOperativa: true,
      entregaEnPeriodo: { unidades: null, porConciliar: true },
    }]);
    expect(screen.getByTestId("operacion-entrega-hoy-incierto")).toHaveTextContent("Entrega por conciliar");
    expect(screen.getByTestId("operacion-cantidades-incierto")).toHaveTextContent("Hoy: por conciliar");
  });
});

describe("GrupoBarrioEncabezado", () => {
  it("singular y plural", () => {
    const { rerender } = render(<GrupoBarrioEncabezado grupo={{ clave: "x", etiqueta: "X", total: 1 }} enPagina={1} soloEste={false} />);
    expect(screen.getByTestId("grupo-barrio-total-x")).toHaveTextContent("1 pedido");
    rerender(<GrupoBarrioEncabezado grupo={{ clave: "x", etiqueta: "X", total: 2 }} enPagina={2} soloEste={false} />);
    expect(screen.getByTestId("grupo-barrio-total-x")).toHaveTextContent("2 pedidos");
  });
});

describe("filtro «Agrupar por barrio»", () => {
  const f0 = leerFiltrosConsulta(new URLSearchParams("agrupar="), "2026-11-09");
  it("alterna, y al desactivar también quita el barrio elegido", () => {
    const on = alternarAgrupar(f0);
    expect(on.agrupar).toBe("barrio");
    const solo = { ...on, grupoBarrio: "b:centro" };
    const off = alternarAgrupar(solo);
    expect(off.agrupar).toBe("");
    expect(off.grupoBarrio).toBe("");
  });
  it("aparece como filtro activo con su «quitar»", () => {
    const on = { ...f0, agrupar: "barrio" as const, grupoBarrio: "b:centro" };
    const chip = filtrosActivos(on, []).find((x) => x.clave === "agrupar")!;
    expect(chip.etiqueta).toMatch(/Agrupado por barrio/);
    const q = chip.quitar(on);
    expect(q.agrupar).toBe("");
    expect(q.grupoBarrio).toBe("");
  });
  it("la URL lleva agrupar y grupoBarrio y los valida", () => {
    expect(leerFiltrosConsulta(new URLSearchParams("agrupar=barrio&grupoBarrio=b%3Aabc"), "2026-11-09")).toMatchObject({ agrupar: "barrio", grupoBarrio: "b:abc" });
    expect(() => leerFiltrosConsulta(new URLSearchParams("agrupar=comuna"), "2026-11-09")).toThrow();
    expect(() => leerFiltrosConsulta(new URLSearchParams("grupoBarrio=%25drop"), "2026-11-09")).toThrow();
  });
});

describe("#909 — Recorrido ↔ FIFO", () => {
  it("el mismo botón Recorrido apaga el modo y vuelve al orden General sin controles extra", () => {
    montar([fila("a", 1, CENTRO), fila("b", 2, VILLA)]);
    const recorrido = screen.getByRole("button", { name: "Recorrido" });
    fireEvent.click(recorrido);
    expect(recorrido).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("recorrido-barrio-select")).toBeInTheDocument();
    fireEvent.click(recorrido);
    expect(recorrido).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("recorrido-barrio-select")).toBeNull();
    expect(screen.queryByLabelText("Subir Centro")).toBeNull();
  });

  it("sin barrios en la consulta de hoy, el Recorrido usa los barrios visibles (arrastres)", () => {
    montar([fila("a", 1, CENTRO), fila("b", 2, VILLA)], { grupos: [] });
    fireEvent.click(screen.getByRole("button", { name: "Recorrido" }));
    const select = screen.getByTestId("recorrido-barrio-select") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Selecciona cualquier barrio", "Centro (1 pedidos)", "Villa Nueva (1 pedidos)",
    ]);
    fireEvent.change(select, { target: { value: "b:villa" } });
    expect(screen.getByTestId("recorrido-priorizar")).toBeEnabled();
  });
});

describe("#913 — Recorrido inmediato y sin viaje al servidor", () => {
  const orden = () => screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
  beforeEach(() => window.history.replaceState({}, "", "/pedidos"));

  it("«Llevar al primero» actualiza la URL y reordena los bloques en el acto", () => {
    montar([fila("a", 1, CENTRO), fila("b", 2, VILLA)]);
    expect(orden()).toEqual(["Barrio Centro", "Barrio Villa Nueva"]);
    fireEvent.click(screen.getByRole("button", { name: "Recorrido" }));
    fireEvent.change(screen.getByTestId("recorrido-barrio-select"), { target: { value: "b:villa" } });
    fireEvent.click(screen.getByTestId("recorrido-priorizar"));
    expect(new URLSearchParams(window.location.search).getAll("recorrido")).toEqual(["b:villa"]);
    expect(new URLSearchParams(window.location.search).get("agrupar")).toBe("barrio");
    expect(orden()).toEqual(["Barrio Villa Nueva", "Barrio Centro"]);
  });

  it("Bajar y Subir mueven un barrio y lo reflejan en la lista sin esperar al servidor", () => {
    montar([fila("a", 1, CENTRO), fila("b", 2, VILLA)]);
    fireEvent.click(screen.getByRole("button", { name: "Recorrido" }));
    fireEvent.click(screen.getByLabelText("Bajar Centro"));
    expect(orden()).toEqual(["Barrio Villa Nueva", "Barrio Centro"]);
    fireEvent.click(screen.getByLabelText("Subir Centro"));
    expect(orden()).toEqual(["Barrio Centro", "Barrio Villa Nueva"]);
  });

  it("la venta anónima en punto va en su propio bloque: sin controles de Recorrido y fuera del selector", () => {
    const ANON = { clave: "venta-anonima", etiqueta: "Ventas en punto sin cliente" };
    const anonima = { ...fila("c", 3, ANON), clienteId: "CONSUMIDOR_FINAL", origen: "VENTA_RAPIDA" as const, canal: "PUNTO" as const };
    montar([fila("a", 1, CENTRO), fila("b", 2, SIN), anonima], { grupos: [{ ...CENTRO, total: 1 }, { ...SIN, total: 1 }, { ...ANON, total: 1, unidadesPendientes: 0, remanentes: {} }] });
    fireEvent.click(screen.getByRole("button", { name: "Recorrido" }));
    expect(screen.queryByLabelText("Subir Ventas en punto sin cliente")).toBeNull();
    expect(screen.queryByLabelText("Bajar Ventas en punto sin cliente")).toBeNull();
    const select = screen.getByTestId("recorrido-barrio-select") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["", "b:centro", "sin-barrio"]);
    expect(screen.getByTestId("grupo-barrio-venta-anonima")).toHaveTextContent("Ventas en punto sin cliente");
    expect(screen.getByTestId("grupo-barrio-venta-anonima")).not.toHaveTextContent("Por entregar");
    // la fila anónima no se rotula «Sin barrio»; la de un cliente registrado sin barrio sí
    expect(screen.queryByTestId("operacion-barrio-c")).toBeNull();
    expect(screen.getByTestId("operacion-barrio-b")).toHaveTextContent("Sin barrio");
    expect(orden().at(-1)).toBe("Barrio Ventas en punto sin cliente");
  });
});

describe("#915 — arrastres y entregas anteriores dentro del grupo de su barrio", () => {
  const entrega = (pedidoId: string, numero: number, g: { clave: string; etiqueta: string }) => ({
    pedidoId, numero, nombre: `Cliente ${numero}`, fechaPedido: "2026-10-28", estadoAlCorte: "PRIMERA_ENTREGA" as const,
    cantidadesDelRango: [{ producto: "PACA_AGUA", cantidad: 4 }], cantidadesAlCorte: [{ producto: "PACA_AGUA", cantidad: 4 }],
    fechaCompletado: "2026-10-29", hitos: [{ fecha: "2026-10-29", cantidades: [{ producto: "PACA_AGUA", cantidad: 4 }], completado: true, porConciliar: false }],
    entregas: [{ instante: "2026-10-29T15:00:00.000Z", fecha: "2026-10-29", horaVerificable: true, cantidades: [{ producto: "PACA_AGUA", cantidad: 4 }], completa: true, faltante: [], porConciliar: false }],
    pedidoAnterior: true, grupoBarrio: g,
  });
  const SOLO = { clave: "b:solo", etiqueta: "Barrio Solo" };
  const ent = (extra: Record<string, unknown> = {}) => ({
    entregasAnteriores: { entregas: [entrega("e1", 501, CENTRO), entrega("e2", 502, SOLO)], primeraPagina: true, hasta: "2026-10-29", periodo: "hoy" as const, onVerTodas: vi.fn(), ...extra },
  });

  it("el pedido de ayer muestra «De ayer» y el de hoy no", () => {
    montar([{ ...fila("a", 1, CENTRO), diaAnterior: true, fecha: "2026-10-28T15:00:00Z", createdAt: "2026-10-28T15:00:00Z" }, fila("b", 2, CENTRO)]);
    expect(screen.getByTestId("operacion-dia-anterior-a")).toHaveTextContent("De ayer");
    expect(screen.queryByTestId("operacion-dia-anterior-b")).toBeNull();
  });

  it("las entregas de pedidos anteriores salen dentro del bloque de su barrio, plegadas", () => {
    montar([fila("a", 1, CENTRO), fila("b", 2, VILLA)], ent());
    const centro = screen.getByRole("region", { name: "Barrio Centro" });
    expect(within(centro).getByTestId("entregas-historicas-toggle")).toHaveTextContent("1 pedido anterior con entregas hoy");
    const villa = screen.getByRole("region", { name: "Barrio Villa Nueva" });
    expect(within(villa).queryByTestId("entregas-historicas-toggle")).toBeNull();
  });

  it("un barrio con solo entregas (sin pedidos) obtiene su bloque, antes de «Sin barrio»; en páginas siguientes no se repite", () => {
    montar([fila("a", 1, CENTRO), fila("c", 3, SIN)], ent());
    const regiones = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label")).filter((l) => l?.startsWith("Barrio "));
    expect(regiones).toEqual(["Barrio Centro", "Barrio Barrio Solo", "Barrio Sin barrio"]);
    expect(within(screen.getByRole("region", { name: "Barrio Barrio Solo" })).getByTestId("entregas-historicas-toggle")).toBeInTheDocument();
  });

  it("en la página 2 no aparecen los bloques de solo entregas", () => {
    montar([fila("a", 1, CENTRO)], ent({ primeraPagina: false }));
    expect(screen.queryByRole("region", { name: "Barrio Barrio Solo" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Barrio Centro" })).getByTestId("entregas-historicas-toggle")).toBeInTheDocument();
  });
});
