import { describe, expect, it } from "vitest";
import { requiereConciliacionEntrega, type EntregaConsulta } from "../entregas-consulta";

const hito = (cambios: Partial<EntregaConsulta> = {}): EntregaConsulta => ({
  id: "hito-mostrador",
  pedidoId: "pedido-sintetico",
  fecha: new Date("2026-11-21T14:00:00Z"),
  repartidorId: null,
  fuente: "HISTORICO",
  cantidades: [{ producto: "PACA_AGUA", cantidad: 3 }],
  precisionDia: false,
  ...cambios,
});

describe("#959 aviso de conciliación por calidad del hecho y no por su origen", () => {
  it("mostrador inmediato preciso: cantidades físicas completas no generan aviso", () => {
    expect(requiereConciliacionEntrega(hito())).toBe(false);
    expect(requiereConciliacionEntrega(hito({ fuente: "AUDITORIA" }))).toBe(false);
    expect(requiereConciliacionEntrega(hito({ fuente: "MOVIMIENTO" }))).toBe(false);
  });

  it("histórico sin cantidades mantiene advertencia", () => {
    expect(requiereConciliacionEntrega(hito({ cantidades: null, incompleto: true }))).toBe(true);
    expect(requiereConciliacionEntrega(hito({ cantidades: [] }))).toBe(true);
  });

  it("incompleto aunque tenga cantidades y fecha imprecisa mantienen advertencia", () => {
    expect(requiereConciliacionEntrega(hito({ incompleto: true }))).toBe(true);
    expect(requiereConciliacionEntrega(hito({ precisionDia: true }))).toBe(true);
  });

  it("la clasificación de un hecho preciso no depende de su cobro", () => {
    const entregadoConFiado = hito();
    expect(requiereConciliacionEntrega(entregadoConFiado)).toBe(false);
  });
});
