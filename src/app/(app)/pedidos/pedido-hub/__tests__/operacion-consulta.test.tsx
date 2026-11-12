import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OperacionList } from "../operacion-list";
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
function montar({
  pedido = base,
  activa = true,
  role = "ADMIN",
}: { pedido?: Pedido; activa?: boolean; role?: string } = {}) {
  const acciones = {
      userRole: role,
      gestionDirecta: activa,
      volver: "/pedidos?desdeHora=10%3A00",
      onVerPedido: vi.fn(),
      onVerFactura: vi.fn(),
    },
    onAccion = vi.fn(),
    onOpen = vi.fn();
  render(
    <OperacionList
      pedidos={[pedido]}
      viewport="desktop"
      hoyBogota="2026-10-29"
      onAccion={onAccion}
      onOpen={onOpen}
      consulta={acciones}
    />,
  );
  return { acciones, onAccion, onOpen };
}
describe("#516 — productos, acciones y navegación", () => {
  it.each(['desktop', 'mobile'] as const)('#656 %s: distingue importe comercial y saldo exigible del parcial', viewport => {
    const pedido: Pedido = { ...base, total: 12500, totalPagado: 0, saldo: 12500, exigible: 7500,
      items: [{ producto: 'PACA_AGUA', cantPedido: 5, cantEntrega: 3, precio: 2500, subtotal: 12500 }] }
    render(<OperacionList pedidos={[pedido]} viewport={viewport} hoyBogota="2026-10-29" onAccion={vi.fn()} onOpen={vi.fn()} consulta={{ userRole: 'ADMIN', gestionDirecta: true, volver: '/pedidos', onVerPedido: vi.fn(), onVerFactura: vi.fn() }} />)
    const row = screen.getByTestId(`operacion-row-${pedido.id}`)
    expect(row.textContent).toMatch(/Importe.*12\.500/)
    expect(row.textContent).toMatch(/Por cobrar de lo entregado.*7\.500/)
    expect(row.textContent).toMatch(/Pendiente de entrega:.*5\.000/)
    expect(row.textContent).toContain('5 pedidas · 3 entregadas · 2 por entregar')
  })
  it('#656 parcial sin hecho no anuncia deuda cero como definitiva', () => {
    montar({ pedido: { ...base, totalPagado: 0, exigible: 0 } })
    expect(screen.getByText('Por conciliar')).toBeInTheDocument()
  })
  it("mezcla de productos conserva cantidades individuales y muestra el faltante del parcial", () => {
    montar();
    expect(screen.getByText("Paca Hielo")).toBeInTheDocument();
    expect(
      screen.getByText("4 pedidas · 2 entregadas · 2 por entregar"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 pedidas y entregadas")).toBeInTheDocument();
    expect(screen.getByText(/Creado por Ana/)).toBeInTheDocument();
    expect(screen.getByText(/Entrega parcial/)).toBeInTheDocument();
  });
  it("gestión directa activa tiene Registrar entrega y conserva Planificar sin disparar ambas", () => {
    const { onAccion, onOpen } = montar();
    fireEvent.click(
      screen.getByRole("button", { name: /Planificar en embarque/ }),
    );
    expect(onAccion).toHaveBeenCalledTimes(1);
    expect(onAccion).toHaveBeenCalledWith(base, "planificar");
    expect(onOpen).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Registrar entrega" }),
    ).toBeEnabled();
  });
  it("apagar gestión directa deshabilita esa acción y mantiene planificación independiente", () => {
    montar({ activa: false });
    expect(
      screen.getByRole("button", { name: "Registrar entrega" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Planificar en embarque/ }),
    ).toBeEnabled();
  });
  it("enlace por identidad conserva regreso; el teclado de un enlace no abre además el peek", () => {
    const { acciones, onOpen } = montar();
    const link = screen.getByRole("link", { name: "Ver pedido #901" });
    expect(link).toHaveAttribute(
      "href",
      "/pedidos/p1?volver=%2Fpedidos%3FdesdeHora%3D10%253A00",
    );
    fireEvent.keyDown(link, { key: "Enter" });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(acciones.onVerPedido).toHaveBeenCalledWith("p1");
    expect(onOpen).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Ver factura FAC-901" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("facturaId=factura-exacta"),
    );
  });
  it("#556 ASISTENTE y CONTADOR reciben el enlace a la factura; REPARTIDOR no; CONTADOR no recibe botones de entrega", () => {
    const { unmount } = render(
      <OperacionList
        pedidos={[base]}
        viewport="mobile"
        hoyBogota="2026-10-29"
        onAccion={vi.fn()}
        onOpen={vi.fn()}
        consulta={{
          userRole: "ASISTENTE",
          gestionDirecta: false,
          volver: "/pedidos",
          onVerPedido: vi.fn(),
          onVerFactura: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /Ver factura/ })).toBeInTheDocument();
    unmount();
    const rep = render(
      <OperacionList
        pedidos={[base]}
        viewport="mobile"
        hoyBogota="2026-10-29"
        onAccion={vi.fn()}
        onOpen={vi.fn()}
        consulta={{
          userRole: "REPARTIDOR",
          gestionDirecta: false,
          volver: "/pedidos",
          onVerPedido: vi.fn(),
          onVerFactura: vi.fn(),
        }}
      />,
    );
    expect(screen.queryByRole("link", { name: /Ver factura/ })).toBeNull();
    rep.unmount();
    montar({ role: "CONTADOR" });
    expect(
      screen.getByRole("link", { name: /Ver factura/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Registrar entrega|Planificar/ }),
    ).toBeNull();
  });
  it("la asignación no se presenta como el responsable de una entrega anterior", () => {
    montar({
      pedido: {
        ...base,
        estadoEntrega: "ENTREGADO",
        responsablesEntrega: [{ id: "r2", nombre: "Pedro" }],
        entregadoAt: "2026-10-29T16:00:00Z",
        embarqueId: "nuevo",
        embarqueNumeroDia: 4,
        embarqueRepartidor: "Juan",
      },
    });
    expect(screen.getByText(/Entregó Pedro/)).toBeInTheDocument();
    expect(
      screen.getByText(/Asignación: Embarque #4 · Juan/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Entregó Juan/)).toBeNull();
  });
  it("anulados sin CTA ni texto que prometa entregar el faltante", () => {
    montar({
      pedido: {
        ...base,
        estadoEntrega: "ANULADO",
        estadoPago: "ANULADO",
        total: 0,
        totalPagado: 0,
        saldo: 0,
      },
    });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/por entregar/)).toBeNull();
    expect(screen.getAllByText(/pedido anulado/)).toHaveLength(2);
  });
  it("un pendiente N2 conserva su prioridad y no se salta a entrega directa", () => {
    montar({
      pedido: {
        ...base,
        pendienteN2: {
          id: "n2",
          producto: "PACA_HIELO",
          remanente: 2,
          estado: "ABIERTA",
        },
      },
    });
    expect(
      screen.getByRole("button", { name: "Completar pendiente" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Registrar entrega" }),
    ).toBeNull();
  });
});

describe("#608 barrio y #635 notas en la fila", () => {
  it.each(["desktop", "mobile"] as const)("%s: muestra solo el barrio (sin dirección) y «Sin barrio» si falta", (viewport) => {
    const conBarrio: Pedido = { ...base, id: "b1", barrioCli: "Laureles", zonaCli: "Cra 80 # 45-12" };
    const sinBarrio: Pedido = { ...base, id: "b2", numero: 902, barrioCli: "  ", zonaCli: "Calle 1" };
    render(<OperacionList pedidos={[conBarrio, sinBarrio]} viewport={viewport} hoyBogota="2026-10-29" onAccion={vi.fn()} onOpen={vi.fn()} consulta={{ userRole: "ADMIN", gestionDirecta: true, volver: "/pedidos", onVerPedido: vi.fn(), onVerFactura: vi.fn() }} />);
    expect(screen.getByTestId("operacion-barrio-b1")).toHaveTextContent("Laureles");
    expect(screen.getByTestId("operacion-barrio-b2")).toHaveTextContent("Sin barrio");
    expect(screen.queryByText(/Cra 80/)).toBeNull();
  });
  it("un pedido con observación muestra «Nota»; al tocarla se lee sin abrir el pedido", () => {
    const { onOpen } = montar({ pedido: { ...base, obs: "Dejar con el portero\nLlamar antes" } });
    const boton = screen.getByRole("button", { name: "Observaciones del pedido #901" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("operacion-nota-texto-901")).toBeNull();
    fireEvent.click(boton);
    expect(boton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("operacion-nota-texto-901").textContent).toContain("Dejar con el portero");
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(boton);
    expect(screen.queryByTestId("operacion-nota-texto-901")).toBeNull();
  });
  it("sin observación o con solo espacios no hay indicador", () => {
    montar({ pedido: { ...base, obs: "   " } });
    expect(screen.queryByTestId("operacion-nota-901")).toBeNull();
  });
});
