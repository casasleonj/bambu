import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FacturaConsultaModal } from "../factura-consulta-modal";
vi.mock("../../../facturas/facturas-client/factura-detail", () => ({
  FacturaDetail: () => <div>Detalle correcto</div>,
}));
const documento = {
  id: "f1",
  pedidoId: "p1",
  pedidoNumero: 901,
  volver: "Volver a Pedidos",
};
describe("#516 — factura exacta y regreso al mismo pedido", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    { id: "otra", pedidoId: "p1" },
    { id: "f1", pedidoId: "otro" },
  ])(
    "rechaza identidad ajena %j y conserva el retorno solicitado",
    async (factura) => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ factura }),
      });
      const onOpenPedido = vi.fn(),
        onClose = vi.fn();
      render(
        <FacturaConsultaModal
          documento={documento}
          onClose={onClose}
          onOpenPedido={onOpenPedido}
        />,
      );
      await screen.findByRole("alert");
      expect(screen.queryByText("Detalle correcto")).toBeNull();
      fireEvent.click(
        screen.getByRole("button", { name: "Volver al pedido #901" }),
      );
      expect(onOpenPedido).toHaveBeenCalledWith("p1");
      expect(onClose).toHaveBeenCalled();
    },
  );
  it("404 no sustituye documento ni pierde la consulta", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    render(
      <FacturaConsultaModal
        documento={documento}
        onClose={vi.fn()}
        onOpenPedido={vi.fn()}
      />,
    );
    expect(
      await screen.findByText(/Factura no encontrada/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Volver a Pedidos" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Detalle correcto")).toBeNull();
  });
});
