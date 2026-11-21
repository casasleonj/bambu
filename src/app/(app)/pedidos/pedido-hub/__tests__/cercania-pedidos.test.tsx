import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Pedido } from "../types";
import { CercaniaPedidos } from "../cercania-pedidos";

vi.mock("../operacion-consulta", () => ({
  OperacionConsulta: ({ pedidos, seleccion }: {
    pedidos: Pedido[];
    seleccion: { marcado: boolean; onAlternar: (p: Pedido) => void; fueraDePaginaIds?: ReadonlySet<string> };
  }) => <div>{pedidos.map(p => <div key={p.id}>
    {seleccion.marcado && <span data-testid={`cercania-seleccionado-${p.id}`}>Seleccionado</span>}
    {seleccion.fueraDePaginaIds?.has(p.id) && <span>Fuera del filtro o página actual</span>}
    <button type="button" data-testid={`cercania-check-${p.id}`}
      aria-pressed={seleccion.marcado}
      onClick={() => seleccion.onAlternar(p)}>{p.id}</button>
  </div>)}</div>,
}));

function pedido(id: string): Pedido {
  return { id, numero: Number(id), canal: "DOMICILIO", estadoEntrega: "PENDIENTE" } as Pedido;
}
const acciones = {
  userRole: "ADMIN", gestionDirecta: false, volver: "/pedidos",
  onVerPedido: vi.fn(), onVerFactura: vi.fn(),
};
function vista(pedidos: Pedido[]) {
  return <CercaniaPedidos activo pedidos={pedidos} viewport="desktop" hoyBogota="2026-11-21"
    acciones={acciones} onAccion={vi.fn()} onOpen={vi.fn()} />;
}
function autorizarGPS() {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (ok: PositionCallback) => ok({
      coords: {
        latitude: 10.03, longitude: -73.23, accuracy: 12,
        altitude: null, altitudeAccuracy: null, heading: null, speed: null,
        toJSON: () => ({ latitude: 10.03, longitude: -73.23, accuracy: 12 }),
      }, timestamp: Date.now(), toJSON: () => ({}),
    }) },
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("#930 selección Cercanía en Pedidos", () => {
  beforeEach(() => { autorizarGPS(); });

  it("conserva agrupación por barrio en otros pedidos y nunca duplica seleccionados", () => {
    const c = { ...pedido("101"), grupoBarrio: { clave: "b:centro", etiqueta: "Centro" } };
    const v = { ...pedido("102"), grupoBarrio: { clave: "b:villa", etiqueta: "Villa Nueva" } };
    render(vista([c, v]));
    expect(screen.getByTestId("pedidos-agrupados-barrio")).toBeTruthy();
    fireEvent.click(screen.getByTestId("cercania-check-101"));
    expect(screen.getByTestId("cercania-seleccionado-101")).toBeTruthy();
    expect(screen.getAllByTestId("cercania-check-101")).toHaveLength(1);
    expect(screen.getByTestId("grupo-barrio-b:villa")).toBeTruthy();
  });

  it("sube seleccionados y no consulta rutas al marcar/desmarcar", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(vista([pedido("101"), pedido("102")]));
    fireEvent.click(screen.getByTestId("cercania-check-102"));
    expect(screen.getByTestId("cercania-seleccionado-102")).toBeTruthy();
    expect(screen.getByText("Seleccionados (1)")).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("cercania-check-102"));
    expect(screen.queryByTestId("cercania-seleccionado-102")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("actualiza pedidos y productos físicos al marcar o desmarcar sin solicitar GPS", () => {
    const gps = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true, value: { getCurrentPosition: gps },
    });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const uno = { ...pedido("101"), items: [{
      producto: "PACA_AGUA", cantPedido: 5, cantEntrega: 2,
      cantRegaloPedido: 2, cantRegaloEntrega: 1, precio: 0, subtotal: 0,
    }] }; // tres de pago + un regalo
    const dos = { ...pedido("102"), items: [{
      producto: "PACA_HIELO", cantPedido: 3, cantEntrega: 1, precio: 0, subtotal: 0,
    }] }; // dos de hielo
    render(vista([uno, dos]));
    expect(screen.getByTestId("cercania-total-pedidos")).toHaveTextContent("0 pedidos");
    expect(screen.getByTestId("cercania-total-productos")).toHaveTextContent("0 unidades");
    fireEvent.click(screen.getByTestId("cercania-check-101"));
    expect(screen.getByTestId("cercania-total-pedidos")).toHaveTextContent("1 pedido");
    expect(screen.getByTestId("cercania-total-productos")).toHaveTextContent("4 unidades por llevar");
    expect(screen.getByTestId("cercania-desglose-productos")).toHaveTextContent("4 pacas de agua");
    fireEvent.click(screen.getByTestId("cercania-check-102"));
    expect(screen.getByTestId("cercania-total-productos")).toHaveTextContent("6 unidades por llevar");
    expect(screen.getByTestId("cercania-desglose-productos")).toHaveTextContent("2 pacas de hielo");
    fireEvent.click(screen.getByTestId("cercania-check-101"));
    expect(screen.getByTestId("cercania-total-pedidos")).toHaveTextContent("1 pedido");
    expect(screen.getByTestId("cercania-total-productos")).toHaveTextContent("2 unidades por llevar");
    expect(gps).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("mantiene selección entre filtros/páginas y obtiene GPS solo al calcular", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        success: true, ordenPedidoIds: ["102", "101"],
        totalParadas: 2, proveedor: "HEIGIT_VROOM",
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const { rerender } = render(vista([pedido("101"), pedido("102")]));
    fireEvent.click(screen.getByTestId("cercania-check-101"));
    fireEvent.click(screen.getByTestId("cercania-check-102"));
    rerender(vista([pedido("102")]));
    expect(screen.getByTestId("cercania-seleccionado-101")).toBeTruthy();
    expect(screen.getByText(/Fuera del filtro o página actual/)).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("cercania-calcular"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/pedidos/recorrido-vial");
    const json = JSON.parse(String(init.body)) as { pedidoIds: string[]; origen: {lat:number;lng:number}};
    expect(json.pedidoIds).toEqual(["101", "102"]);
    expect(json.origen).toEqual({ lat: 10.03, lng: -73.23 });
    await screen.findByText(/Recorrido sugerido/);
    const filas = screen.getAllByTestId(/cercania-seleccionado-/).map(el => el.getAttribute("data-testid"));
    expect(filas).toEqual(["cercania-seleccionado-102", "cercania-seleccionado-101"]);
    fireEvent.click(screen.getByTestId("cercania-check-101"));
    expect(screen.getByText(/La selección cambió/)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("no recalcula al llegar otro pedido pero invalida el orden si cambia un seleccionado", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        success: true, ordenPedidoIds: ["101"], totalParadas: 1,
        proveedor: "HEIGIT_VROOM",
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const inicial = { ...pedido("101"), estadoEntrega: "PENDIENTE", saldo: 1000 };
    const { rerender } = render(vista([inicial]));
    fireEvent.click(screen.getByTestId("cercania-check-101"));
    fireEvent.click(screen.getByTestId("cercania-calcular"));
    await screen.findByText(/Orden sugerido/);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Un nuevo pedido no integra automáticamente el recorrido calculado.
    rerender(vista([inicial, pedido("102")]));
    expect(screen.getByText(/Orden sugerido/)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Cambio de saldo/destino/estado relevante: no mostrar el orden como vigente.
    rerender(vista([{ ...inicial, saldo: 0 }, pedido("102")]));
    await screen.findByText(/se modificó un pedido/);
    expect(screen.queryByText(/Orden sugerido/)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("permiso GPS denegado mantiene la selección y evita llamadas a proveedores", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail({
        code: 1, message: "denied",
      } as GeolocationPositionError) },
    });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(vista([pedido("101")]));
    fireEvent.click(screen.getByTestId("cercania-check-101"));
    fireEvent.click(screen.getByTestId("cercania-calcular"));
    await screen.findByText(/Autoriza la ubicación/);
    expect(screen.getByTestId("cercania-seleccionado-101")).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });
});


describe("#959 Cercanía muestra únicamente mercancía por entregar", () => {
  beforeEach(() => { autorizarGPS(); });

  it("oculta entregados pagados o fiados, punto y pendientes sin remanente", () => {
    const completa = { producto: "PACA_AGUA", cantPedido: 5, cantEntrega: 5, precio: 0, subtotal: 0 };
    const parcial = { ...completa, cantEntrega: 3 };
    render(vista([
      { ...pedido("101"), estadoEntrega: "ENTREGADO", estadoPago: "PAGADO", items: [completa] },
      { ...pedido("102"), estadoEntrega: "ENTREGADO", estadoPago: "PENDIENTE", exigible: 5000, items: [completa] },
      { ...pedido("103"), canal: "PUNTO", items: [parcial] },
      { ...pedido("104"), items: [completa] },
      { ...pedido("105"), estadoEntrega: "PENDIENTE", items: [parcial] },
    ]));
    for (const id of ["101", "102", "103", "104"]) {
      expect(screen.queryByTestId(`cercania-check-${id}`)).toBeNull();
    }
    expect(screen.getByTestId("cercania-check-105")).toBeTruthy();
    expect(screen.getByText("Otros pedidos (1 visibles)")).toBeTruthy();
  });

  it("retira el seleccionado al completarse en otra pantalla, invalida ruta y no pide GPS otra vez", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true, ordenPedidoIds: ["101"],
        totalParadas: 1, proveedor: "HEIGIT_VROOM",
      }),
    });
    vi.stubGlobal("fetch", fetcher);
    const base = { ...pedido("101"), items: [
      { producto: "PACA_AGUA", cantPedido: 5, cantEntrega: 2, precio: 0, subtotal: 0 },
    ] };
    const { rerender } = render(vista([base]));
    fireEvent.click(screen.getByTestId("cercania-check-101"));
    fireEvent.click(screen.getByTestId("cercania-calcular"));
    await waitFor(() => expect(screen.getByTestId("cercania-calcular")).toHaveTextContent("Volver a calcular"));

    // Tras pasar por otra página, la selección permanece hasta que llega
    // la fila actualizada. No se resucita al recibirse ya completada.
    rerender(vista([]));
    expect(screen.getByTestId("cercania-seleccionado-101")).toBeTruthy();
    rerender(vista([{ ...base, estadoEntrega: "ENTREGADO", items: [
      { ...base.items[0], cantEntrega: 5 },
    ] }]));
    await waitFor(() => {
      expect(screen.queryByTestId("cercania-check-101")).toBeNull();
      expect(screen.getByTestId("cercania-total-pedidos")).toHaveTextContent("0 pedidos");
      expect(screen.getByTestId("cercania-calcular")).toBeDisabled();
    });
    expect(screen.getByText("Desactualizado")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
