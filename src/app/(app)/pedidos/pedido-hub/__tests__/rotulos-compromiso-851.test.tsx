import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FiltrosConsulta } from "../filtros-consulta";
import { ResumenConsulta } from "../resumen-consulta";
import { OperacionList } from "../operacion-list";
import { rotulosCompromiso } from "@/lib/pedidos-compromiso-rotulos";
import {
  leerFiltrosConsulta,
  type ResumenConsultaPedidos,
} from "@/lib/pedidos-consulta";

const filtros = (qs = "") => leerFiltrosConsulta(new URLSearchParams(qs), "2026-11-18");
const reps = [{ id: "1", nombre: "Carlos", activo: true, usaMoto: false }];
const resumen = {
  importe: 0, pagado: 0, saldo: 0, fiado: 0, pendienteEntrega: 0,
  productos: [], entregasPorConciliar: 0, cobros: null,
} as unknown as ResumenConsultaPedidos;

describe("#851 · rótulos de las vistas por fecha prometida", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T15:00:00-05:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("rotulosCompromiso solo existe para paraHoy y programados", () => {
    expect(rotulosCompromiso("paraHoy")?.titulo).toBe("Entregas previstas hoy o atrasadas");
    expect(rotulosCompromiso("programados")?.titulo).toBe("Entregas programadas");
    expect(rotulosCompromiso("enRuta")).toBeNull();
    expect(rotulosCompromiso("")).toBeNull();
    expect(rotulosCompromiso(null)).toBeNull();
    expect(rotulosCompromiso("cualquiera")).toBeNull();
  });

  it("sin foco: chips de período y selector de fecha como siempre", () => {
    render(<FiltrosConsulta filtros={filtros()} repartidores={reps} sinConexion={false} onAplicar={vi.fn()} onLimpiar={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Hoy" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    expect(screen.getByLabelText("Usar la fecha y hora de")).toBeInTheDocument();
  });

  it.each(["paraHoy", "programados"])("foco %s: sin chips de período ni selector de fecha", (foco) => {
    render(<FiltrosConsulta filtros={filtros(`foco=${foco}`)} repartidores={reps} sinConexion={false} onAplicar={vi.fn()} onLimpiar={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Hoy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Todos" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    expect(screen.queryByLabelText("Usar la fecha y hora de")).toBeNull();
    expect(screen.queryByText("Desde · fecha")).toBeNull();
    // lo que sí aplica se conserva
    expect(screen.getByRole("group", { name: "Estado del registro" })).toBeInTheDocument();
  });

  it("el resumen no muestra el rango de fecha de pedido en la vista por fecha prometida", () => {
    window.localStorage.clear();
    const { rerender } = render(<ResumenConsulta resumen={resumen} filtros={filtros("foco=paraHoy")} />);
    expect(screen.getByText(/Fecha prometida: hasta hoy \(incluye atrasadas\)/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-11-18 →/)).toBeNull();
    rerender(<ResumenConsulta resumen={resumen} filtros={filtros("foco=programados")} />);
    expect(screen.getByText(/Fecha prometida: desde mañana/)).toBeInTheDocument();
    rerender(<ResumenConsulta resumen={resumen} filtros={filtros()} />);
    expect(screen.getByText(/2026-11-18 → 2026-11-18/)).toBeInTheDocument();
  });

  it("vista vacía: mensaje propio; sin foco, el de siempre", () => {
    const rot = rotulosCompromiso("paraHoy")!;
    const base = { pedidos: [], viewport: "desktop" as const, hoyBogota: "2026-11-18", onAccion: vi.fn(), onOpen: vi.fn() };
    const { rerender } = render(
      <OperacionList {...base} consulta={{ vacioCompromiso: rot } as never} />,
    );
    expect(screen.getByText("No hay entregas previstas para hoy ni atrasadas")).toBeInTheDocument();
    rerender(<OperacionList {...base} />);
    expect(screen.getByText("No hay operaciones")).toBeInTheDocument();
  });
});
