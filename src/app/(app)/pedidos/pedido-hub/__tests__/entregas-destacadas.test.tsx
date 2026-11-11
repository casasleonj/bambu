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
    expect(tarjeta).toHaveTextContent("3 paca agua");
    expect(tarjeta).toHaveTextContent("Completado posteriormente:");
    expect(tarjeta).toHaveTextContent("11 nov");
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
    expect(tarjeta).toHaveTextContent("3 paca agua");
    expect(tarjeta).toHaveTextContent("6 paca agua");
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
});