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
    expect(screen.getByTestId("consulta-resumen-linea")).toHaveTextContent("Por cobrar de lo entregado");
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
  it("muestra 581 entregadas hoy y explica por qué no son las 571 de pedidos fechados hoy", () => {
    movil(true);
    const conOperacion = {
      ...resumen,
      productos: [{ producto: "PACA_AGUA", pedidas: 571, entregadas: 571 }],
      operacionDia: {
        total: 581,
        productos: [{
          producto: "PACA_AGUA",
          entregadasHoy: 581,
          dePedidosFecha: 571,
          dePedidosAnteriores: 10,
          porConciliarOrigen: 0,
        }],
      },
    };
    const historicos = { ...filtros, all: false, desde: "2026-11-21", hasta: "2026-11-21", canal: [] } as FiltrosConsultaPedidos;
    render(<ResumenConsulta resumen={conOperacion} filtros={historicos} />);
    expect(screen.getByTestId("consulta-total-fisico-hoy")).toHaveTextContent("581");
    fireEvent.click(screen.getByTestId("consulta-resumen-alternar"));
    expect(screen.getByTestId("consulta-resumen-operacion-hoy")).toHaveTextContent("2026-11-21: 581 productos");
    expect(screen.getByTestId("consulta-resumen-operacion-hoy")).toHaveTextContent("571 de pedidos fechados ese día");
    expect(screen.getByTestId("consulta-resumen-operacion-hoy")).toHaveTextContent("10 de pedidos anteriores");
    expect(screen.getByTestId("consulta-cohorte-fecha-pedido")).not.toHaveAttribute("open");
    expect(screen.getByTestId("consulta-productos-resumen")).toHaveTextContent("571 pedidas");
    fireEvent.click(screen.getByText("Ver acumulados de pedidos fechados ese día (no son entregas del día)"));
    expect(screen.getByTestId("consulta-cohorte-fecha-pedido")).toHaveAttribute("open");
  });

  it("cuando falla la lectura física no muestra un cero ficticio", () => {
    movil(true);
    render(<ResumenConsulta resumen={{ ...resumen, operacionDiaError: true }} filtros={filtros} />);
    expect(screen.getByText("Entregas de la fecha consultada por conciliar")).toBeInTheDocument();
    expect(screen.queryByTestId("consulta-total-fisico-hoy")).toBeNull();
  });

});
