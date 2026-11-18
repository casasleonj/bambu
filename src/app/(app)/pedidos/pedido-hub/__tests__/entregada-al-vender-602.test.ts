import { describe, it, expect } from "vitest";
import { responsablesConsulta } from "../consulta-datos";
import { esVentaMostradorEntregadaAlVender } from "@/lib/venta-mostrador";
import type { Pedido } from "../types";

const HOY = "2026-11-18";
const VENTA = "2026-11-14T16:37:14.081Z";
const base = {
  canal: "PUNTO",
  estadoEntrega: "ENTREGADO",
  fecha: VENTA,
  entregadoAt: VENTA,
  createdAt: VENTA,
  responsablesEntrega: [],
} as unknown as Pedido;
const con = (extra: Partial<Pedido>) => ({ ...base, ...extra }) as Pedido;

describe("#602 · «Entregada al vender» en la fila", () => {
  it("la venta de Punto entregada a la hora de la venta dice «Entregada al vender»", () => {
    const r = responsablesConsulta(base, HOY);
    expect(r.entrega.titulo).toBe("📦 Entregada al vender");
    expect(r.entrega.meta).toContain("11:37");
  });
  it("con otra hora de entrega o sin ser de Punto conserva «Entrega registrada»", () => {
    expect(
      responsablesConsulta(con({ entregadoAt: "2026-11-14T17:00:00.000Z" }), HOY).entrega.titulo,
    ).toBe("📦 Entrega registrada");
    expect(responsablesConsulta(con({ canal: "DOMICILIO" }), HOY).entrega.titulo).toBe(
      "📦 Entrega registrada",
    );
  });
  it("con responsable de entrega conserva su nombre y sin fecha conserva «Sin entrega registrada»", () => {
    const r = responsablesConsulta(
      con({ responsablesEntrega: [{ id: "t1", nombre: "Juan" }] }),
      HOY,
    );
    expect(r.entrega.titulo).toBe("🚚 Entregó Juan");
    expect(responsablesConsulta(con({ entregadoAt: null }), HOY).entrega.titulo).toBe(
      "🕓 Sin entrega registrada",
    );
  });
  it("la regla es estricta: no entregado, fecha inválida o nula no cuentan", () => {
    const ok = { canal: "PUNTO", estadoEntrega: "ENTREGADO", fecha: VENTA, entregadoAt: VENTA };
    expect(esVentaMostradorEntregadaAlVender(ok)).toBe(true);
    expect(esVentaMostradorEntregadaAlVender({ ...ok, estadoEntrega: "PENDIENTE" })).toBe(false);
    expect(esVentaMostradorEntregadaAlVender({ ...ok, entregadoAt: null })).toBe(false);
    expect(esVentaMostradorEntregadaAlVender({ ...ok, entregadoAt: "no-fecha", fecha: "no-fecha" })).toBe(false);
    expect(esVentaMostradorEntregadaAlVender({ ...ok, entregadoAt: new Date(VENTA), fecha: new Date(VENTA) })).toBe(true);
  });
});
