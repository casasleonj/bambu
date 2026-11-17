import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  proyectarEntregaHistorial,
  type PedidoParaHistorial,
} from "@/lib/pedidos-entregas-historial";
import { EntregasDestacadas } from "../entregas-destacadas";

const pedido: PedidoParaHistorial = {
  id: "p763", numero: 901, nombre: "Negocio de prueba",
  fecha: new Date("2026-11-09T14:00:00Z"),
  solicitadas: [{ producto: "PACA_AGUA", cantidad: 6 }],
};
const hechos = [
  { id: "primera", fecha: new Date("2026-11-09T16:00:00Z"), cantidades: [{ producto: "PACA_AGUA", cantidad: 3 }] },
  { id: "final", fecha: new Date("2026-11-11T16:00:00Z"), cantidades: [{ producto: "PACA_AGUA", cantidad: 3 }] },
];
const rango = (dia: number) => ({
  desde: new Date("2026-11-" + String(dia).padStart(2, "0") + "T05:00:00Z"),
  hasta: new Date("2026-11-" + String(dia + 1).padStart(2, "0") + "T05:00:00Z"),
});

describe("#763 — tarjeta de entrega con histórico al corte", () => {
  it("consulta del lunes: parcial sin cambiar estado y completitud posterior visible", () => {
    const datos = proyectarEntregaHistorial(pedido, hechos, rango(9));
    if (!datos) throw new Error("Proyección no disponible");
    const onVerPedido = vi.fn();
    const onVerTodas = vi.fn();
    render(
      <EntregasDestacadas entregas={[datos]} total={1} rangoAmplio={false}
        hasta="2026-11-09" onVerPedido={onVerPedido} onVerTodas={onVerTodas} />,
    );
    const tarjeta = screen.getByTestId("entrega-historica-901");
    expect(tarjeta).toHaveTextContent("Parcial en la fecha");
    expect(tarjeta).toHaveTextContent("3 pacas de agua");
    expect(tarjeta).toHaveTextContent("Completado posteriormente:");
    expect(tarjeta).toHaveTextContent("11 de nov");
    expect(screen.getAllByText(/nov/).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("button", { name: "Ver pedido 901" }));
    expect(onVerPedido).toHaveBeenCalledWith("p763");
    fireEvent.click(screen.getByRole("button", { name: "Consultar entregas por fecha" }));
    expect(onVerTodas).toHaveBeenCalledTimes(1);
  });
  it("consulta del miércoles: completado tras parcial, solo suma las 3 de ese día", () => {
    const datos = proyectarEntregaHistorial(pedido, hechos, rango(11));
    if (!datos) throw new Error("Proyección no disponible");
    render(
      <EntregasDestacadas entregas={[datos]} total={1} rangoAmplio={false}
        hasta="2026-11-11" onVerPedido={vi.fn()} onVerTodas={vi.fn()} />,
    );
    const tarjeta = screen.getByTestId("entrega-historica-901");
    expect(tarjeta).toHaveTextContent("Completado tras parcial");
    expect(tarjeta).toHaveTextContent("3 pacas de agua");
    expect(tarjeta).toHaveTextContent("6 pacas de agua");
    expect(tarjeta).not.toHaveTextContent("Completado posteriormente");
  });
  it("rangos demasiado amplios indican limitación sin inventar resultados", () => {
    render(
      <EntregasDestacadas entregas={[]} total={0} rangoAmplio={true}
        hasta="2026-11-10" onVerPedido={vi.fn()} onVerTodas={vi.fn()} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("intervalo más corto");
  });
  it("sin movimientos adicionales no añade una sección ni contadores ficticios", () => {
    render(
      <EntregasDestacadas entregas={[]} total={0} rangoAmplio={false}
        hasta="2026-11-10" onVerPedido={vi.fn()} onVerTodas={vi.fn()} />,
    );
    expect(screen.queryByTestId("entregas-historicas-763")).not.toBeInTheDocument();
  });

  describe("#841 — plegada por defecto junto a los pendientes", () => {
    const datos = () => {
      const d = proyectarEntregaHistorial(pedido, hechos, rango(9));
      if (!d) throw new Error("Proyección no disponible");
      return d;
    };
    const montar = (over: Partial<Parameters<typeof EntregasDestacadas>[0]> = {}) =>
      render(
        <EntregasDestacadas entregas={[datos()]} total={1} rangoAmplio={false}
          hasta="2026-11-09" onVerPedido={vi.fn()} onVerTodas={vi.fn()}
          plegable periodo="hoy" {...over} />,
      );
    it("empieza plegada: una línea con el conteo y sin tarjetas", () => {
      montar();
      const toggle = screen.getByTestId("entregas-historicas-toggle");
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveTextContent("1 pedido anterior con entregas hoy");
      expect(toggle).toHaveTextContent("Entregas parciales y de pedidos anteriores");
      expect(toggle.tagName).toBe("BUTTON");
      expect(screen.queryByTestId("entrega-historica-901")).not.toBeInTheDocument();
    });
    it("al tocar la línea muestra la misma tarjeta y se vuelve a ocultar", () => {
      montar();
      fireEvent.click(screen.getByTestId("entregas-historicas-toggle"));
      const abierto = screen.getByTestId("entregas-historicas-toggle");
      expect(abierto).toHaveAttribute("aria-expanded", "true");
      expect(abierto).toHaveTextContent("Ocultar");
      const tarjeta = screen.getByTestId("entrega-historica-901");
      expect(tarjeta).toHaveTextContent("Parcial en la fecha");
      expect(screen.getByRole("button", { name: "Consultar entregas por fecha" })).toBeInTheDocument();
      fireEvent.click(abierto);
      expect(screen.queryByTestId("entrega-historica-901")).not.toBeInTheDocument();
      expect(screen.getByTestId("entregas-historicas-toggle")).toHaveAttribute("aria-expanded", "false");
    });
    it("plural y período distinto de hoy", () => {
      montar({ total: 2, periodo: "en el período" });
      expect(screen.getByTestId("entregas-historicas-toggle")).toHaveTextContent(
        "2 pedidos anteriores con entregas en el período",
      );
    });
    it("el aviso de rango amplio nunca se pliega", () => {
      montar({ entregas: [], total: 0, rangoAmplio: true });
      expect(screen.getByRole("status")).toHaveTextContent("intervalo más corto");
      expect(screen.queryByTestId("entregas-historicas-toggle")).not.toBeInTheDocument();
    });
    it("sin entregas no aparece ni la línea plegada", () => {
      montar({ entregas: [], total: 0 });
      expect(screen.queryByTestId("entregas-historicas-763")).not.toBeInTheDocument();
    });
    it("sin la propiedad plegable conserva el comportamiento anterior (siempre abierta)", () => {
      montar({ plegable: false });
      expect(screen.getByTestId("entrega-historica-901")).toBeInTheDocument();
      expect(screen.queryByTestId("entregas-historicas-toggle")).not.toBeInTheDocument();
    });
  });
});
