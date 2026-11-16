import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { FiltrosConsulta } from "../filtros-consulta";
import { leerFiltrosConsulta, type FiltrosConsultaPedidos } from "@/lib/pedidos-consulta";
import type { RepartidorOpcion } from "../filtros-chips";

const filtros = () => leerFiltrosConsulta(new URLSearchParams(), "2026-11-09");
const reps: RepartidorOpcion[] = [
  { id: "1", nombre: "Carlos", activo: true, usaMoto: true },
  { id: "3", nombre: "Ana", activo: false, usaMoto: false },
];
function montar(extra: Partial<{ sinConexion: boolean; f: FiltrosConsultaPedidos }> = {}) {
  const onAplicar = vi.fn(), onLimpiar = vi.fn();
  const props = { filtros: extra.f ?? filtros(), repartidores: reps, sinConexion: extra.sinConexion ?? false, onAplicar, onLimpiar };
  const r = render(<FiltrosConsulta {...props} />);
  return { onAplicar, onLimpiar, ...r, props };
}

describe("FiltrosConsulta · sin «Aplicar filtros» (#606/#607/#633)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T15:00:00-05:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("no existe el botón «Aplicar filtros» y el panel está plegado", () => {
    montar();
    expect(screen.queryByRole("button", { name: /aplicar filtros/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^Filtros/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Canal de venta" })).toBeNull();
  });
  it("un chip se aplica de inmediato, una sola vez", () => {
    const { onAplicar } = montar();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByRole("button", { name: "Fiado · entregado con saldo" }));
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar.mock.calls[0][0]).toMatchObject({ pago: "fiado", page: 1, resumen: true });
  });
  it("el texto espera ~400 ms y aplica solo el último valor", () => {
    const { onAplicar } = montar();
    const input = screen.getByPlaceholderText("Nombre, teléfono o #pedido");
    for (const v of ["a", "ab", "abc"]) fireEvent.change(input, { target: { value: v } });
    expect(onAplicar).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(399));
    expect(onAplicar).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2));
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar.mock.calls[0][0].search).toBe("abc");
  });
  it("Enter aplica sin esperar", () => {
    const { onAplicar } = montar();
    const input = screen.getByPlaceholderText("Nombre, teléfono o #pedido");
    fireEvent.change(input, { target: { value: "juan" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAplicar).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(1000));
    expect(onAplicar).toHaveBeenCalledTimes(1);
  });
  it("un rango inválido muestra el error y no consulta", () => {
    const { onAplicar } = montar();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.change(screen.getByLabelText("Desde · fecha"), { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByLabelText("Hasta · fecha"), { target: { value: "2026-11-01" } });
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.getByRole("alert")).toHaveTextContent(/posterior o igual al inicio/);
    expect(onAplicar).not.toHaveBeenCalled();
  });
  it("sin conexión conserva lo elegido y lo aplica al volver", () => {
    const { onAplicar, rerender, props } = montar({ sinConexion: true });
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByRole("button", { name: "Fiado · entregado con saldo" }));
    expect(onAplicar).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/Sin conexión/);
    rerender(<FiltrosConsulta {...props} sinConexion={false} />);
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar.mock.calls[0][0].pago).toBe("fiado");
  });
  it("el resumen activo permite quitar un filtro con un toque", () => {
    const { onAplicar } = montar({ f: leerFiltrosConsulta(new URLSearchParams("pago=fiado&canal=PUNTO"), "2026-11-09") });
    expect(screen.getByRole("button", { name: /^Filtros \(2\)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Quitar filtro Pago/ }));
    expect(onAplicar.mock.calls[0][0].pago).toBe("todos");
  });
  it("repartidores: activos primero, inactivos bajo demanda, filtro de moto", () => {
    const { onAplicar } = montar();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByTestId("consulta-repartidores"));
    expect(screen.getByLabelText(/Carlos/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Ana/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar inactivos (1)" }));
    expect(screen.getByLabelText(/Ana \(inactivo\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "🏍️ Con moto" }));
    expect(screen.queryByLabelText(/Ana/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Carlos/));
    expect(onAplicar.mock.calls[0][0].repartidorId).toEqual(["1"]);
  });
  it("«Limpiar filtros» solo aparece con algo activo y limpia", () => {
    const { onLimpiar } = montar({ f: leerFiltrosConsulta(new URLSearchParams("pago=fiado"), "2026-11-09") });
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onLimpiar).toHaveBeenCalled();
  });
});
