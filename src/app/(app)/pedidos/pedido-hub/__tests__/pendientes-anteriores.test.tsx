// #797: pendientes de días anteriores en «Hoy», sin alterar la fecha ni las cifras del día.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PendientesAnteriores } from "../pendientes-anteriores";
import { diasDeArrastre, etiquetaArrastre } from "../arrastrados";
import type { AccionesConsulta } from "../operacion-consulta";
import type { Pedido } from "../../pedidos-client/types";

const HOY = "2026-11-16";
const pedido = (id: string, numero: number, fecha: string): Pedido =>
  ({
    id,
    numero,
    clienteId: "c" + id,
    nombreCli: "Cliente " + id,
    telefonoCli: "300",
    zonaCli: "",
    barrioCli: "",
    tipo: "ENVIO",
    canal: "DOMICILIO",
    estado: "PENDIENTE",
    origen: "PEDIDO",
    estadoEntrega: "PENDIENTE",
    estadoPago: "PENDIENTE",
    items: [{ producto: "PACA_AGUA", cantPedido: 3, cantEntrega: 0, precio: 2300, subtotal: 6900 }],
    cPacaAguaPed: 3, cPacaHieloPed: 0, cBotellonFabPed: 0, cBotellonDomPed: 0, cBolsaAguaPed: 0, cBolsaHieloPed: 0,
    cPacaAguaEnt: 0, cPacaHieloEnt: 0, cBotellonFabEnt: 0, cBotellonDomEnt: 0, cBolsaAguaEnt: 0, cBolsaHieloEnt: 0,
    precioPacaAgua: 2300, precioPacaHielo: 0, precioBotellonFab: 0, precioBotellonDom: 0, precioBolsaAgua: 0, precioBolsaHielo: 0,
    total: 6900, totalPagado: 0, saldo: 6900,
    fecha, createdAt: fecha, creadoPor: "Ana",
  }) as Pedido;
const consulta: AccionesConsulta = {
  userRole: "ADMIN",
  gestionDirecta: true,
  volver: "/pedidos",
  onVerPedido: vi.fn(),
  onVerFactura: vi.fn(),
};
const props = (over: Partial<Parameters<typeof PendientesAnteriores>[0]> = {}) => ({
  pedidos: [pedido("a", 1084, "2026-11-15T22:40:00Z")],
  total: 1,
  error: false,
  cargando: false,
  viewport: "desktop" as const,
  hoyBogota: HOY,
  consulta,
  onAccion: vi.fn(),
  onOpen: vi.fn(),
  onVerTodos: vi.fn(),
  onReintentar: vi.fn(),
  ...over,
});

describe("#797 — antigüedad del pedido arrastrado", () => {
  it("cuenta días calendario de Bogotá y nunca es negativo", () => {
    expect(diasDeArrastre("2026-11-15T22:40:00Z", HOY)).toBe(1);
    expect(diasDeArrastre("2026-11-14T15:00:00Z", HOY)).toBe(2);
    expect(diasDeArrastre("2026-11-17T15:00:00Z", HOY)).toBe(0);
  });
  it("una hora tarde de Bogotá sigue siendo el día de Bogotá, no el de UTC", () => {
    // 15-nov 21:17 en Bogotá es 16-nov 02:17 UTC: es de ayer, no de hoy.
    expect(diasDeArrastre("2026-11-16T02:17:00Z", HOY)).toBe(1);
  });
  it("etiqueta con fecha original y antigüedad", () => {
    expect(etiquetaArrastre("2026-11-15T22:40:00Z", HOY)).toBe(
      "Creado ayer · 17:40 · hace 1 día",
    );
    expect(etiquetaArrastre("2026-11-13T15:00:00Z", HOY)).toMatch(/hace 3 días$/);
  });
});

describe("#797 — sección «Pendientes de días anteriores»", () => {
  it("muestra el total, la fecha original y la acción habitual de la fila", () => {
    const p = props();
    render(<PendientesAnteriores {...p} />);
    expect(screen.getByRole("heading", { name: /Pendientes de días anteriores \(1\)/ })).toBeTruthy();
    expect(screen.getByText(/No cuentan como pedidos creados hoy/)).toBeTruthy();
    expect(screen.getByTestId("operacion-arrastre-a").textContent).toBe(
      "Creado ayer · 17:40 · hace 1 día",
    );
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrega" }));
    expect(p.onAccion).toHaveBeenCalledWith(p.pedidos[0], "registrar-entrega");
  });
  it("sin gestión directa ofrece Planificar (la acción vigente del Hub)", () => {
    render(<PendientesAnteriores {...props({ consulta: { ...consulta, gestionDirecta: false } })} />);
    expect(screen.getAllByRole("button", { name: /Planificar/ }).length).toBeGreaterThan(0);
  });
  it("vacío: la sección no se muestra", () => {
    const { container } = render(<PendientesAnteriores {...props({ pedidos: [], total: 0 })} />);
    expect(container.innerHTML).toBe("");
  });
  it("cargando: esqueleto accesible, sin filas", () => {
    render(<PendientesAnteriores {...props({ pedidos: [], total: 0, cargando: true })} />);
    expect(screen.getByTestId("pendientes-anteriores-carga").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("operacion-row-a")).toBeNull();
  });
  it("error: aviso con Reintentar y sin ocultar nada más", () => {
    const p = props({ error: true, pedidos: [], total: 0 });
    render(<PendientesAnteriores {...p} />);
    expect(screen.getByRole("alert").textContent).toMatch(/La lista de hoy sigue funcionando/);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(p.onReintentar).toHaveBeenCalledTimes(1);
  });
  it("muchos: avisa cuántos se muestran y ofrece ver todos", () => {
    const p = props({ total: 12 });
    render(<PendientesAnteriores {...p} />);
    expect(screen.getByText(/Mostrando los 1 más antiguos de 12/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("pendientes-anteriores-ver-todos"));
    expect(p.onVerTodos).toHaveBeenCalledTimes(1);
  });
  it("sin más que mostrar no ofrece «ver todos»", () => {
    render(<PendientesAnteriores {...props()} />);
    expect(screen.queryByTestId("pendientes-anteriores-ver-todos")).toBeNull();
  });
  it("móvil: mismas filas y la misma etiqueta", () => {
    render(<PendientesAnteriores {...props({ viewport: "mobile" })} />);
    expect(screen.getByTestId("pedido-hub-mobile")).toBeTruthy();
    expect(screen.getByTestId("operacion-arrastre-a")).toBeTruthy();
  });
  it("CONTADOR ve la fila sin botón de acción", () => {
    render(<PendientesAnteriores {...props({ consulta: { ...consulta, userRole: "CONTADOR" } })} />);
    expect(screen.queryByRole("button", { name: "Registrar entrega" })).toBeNull();
  });
});
