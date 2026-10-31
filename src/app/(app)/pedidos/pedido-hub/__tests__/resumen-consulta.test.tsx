import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResumenConsulta } from "../resumen-consulta";
import type {
  FiltrosConsultaPedidos,
  ResumenConsultaPedidos,
} from "@/lib/pedidos-consulta";

const resumen = {
  importe: 95500,
  pagado: 20000,
  saldo: 75500,
  fiado: 0,
  pendienteEntrega: 0,
  productos: [],
  entregasPorConciliar: 0,
  cobros: null,
} as unknown as ResumenConsultaPedidos;
const filtros = {
  all: true,
  canal: ["PUNTO", "DOMICILIO"],
  repartidorId: [],
  fechaBase: "pedido",
} as unknown as FiltrosConsultaPedidos;

function movil(esMovil: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (q: string) => ({
      matches: esMovil && q.includes("max-width"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

describe("ResumenConsulta colapsable", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("en móvil empieza cerrado, con la línea corta", () => {
    movil(true);
    render(<ResumenConsulta resumen={resumen} filtros={filtros} />);
    const boton = screen.getByTestId("consulta-resumen-alternar");
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("consulta-resumen-linea")).toHaveTextContent("Saldo");
    expect(document.getElementById("consulta-resumen-detalle")).toHaveAttribute("hidden");
  });

  it("en escritorio empieza abierto", () => {
    movil(false);
    render(<ResumenConsulta resumen={resumen} filtros={filtros} />);
    expect(screen.getByTestId("consulta-resumen-alternar")).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("consulta-resumen-linea")).toBeNull();
  });

  it("al abrirlo en móvil se recuerda en este dispositivo", () => {
    movil(true);
    const { unmount } = render(<ResumenConsulta resumen={resumen} filtros={filtros} />);
    fireEvent.click(screen.getByTestId("consulta-resumen-alternar"));
    expect(screen.getByTestId("consulta-resumen-alternar")).toHaveAttribute("aria-expanded", "true");
    unmount();
    render(<ResumenConsulta resumen={resumen} filtros={filtros} />);
    expect(screen.getByTestId("consulta-resumen-alternar")).toHaveAttribute("aria-expanded", "true");
  });
});
