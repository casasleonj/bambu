import { describe, it, expect, vi } from "vitest";
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

describe("GrupoBarrioEncabezado", () => {
  it("singular y plural", () => {
    const { rerender } = render(<GrupoBarrioEncabezado grupo={{ clave: "x", etiqueta: "X", total: 1 }} enPagina={1} soloEste={false} />);
    expect(screen.getByTestId("grupo-barrio-total-x")).toHaveTextContent("1 pedido");
    rerender(<GrupoBarrioEncabezado grupo={{ clave: "x", etiqueta: "X", total: 2 }} enPagina={2} soloEste={false} />);
    expect(screen.getByTestId("grupo-barrio-total-x")).toHaveTextContent("2 pedidos");
  });
});

describe("filtro «Agrupar por barrio»", () => {
  const f0 = leerFiltrosConsulta(new URLSearchParams(), "2026-11-09");
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
