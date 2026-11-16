import { describe, it, expect, vi } from "vitest";
import { fechaConsulta, fechaLecturaConsulta } from "../fecha-consulta";

const HOY = "2026-10-29";

describe("fechaConsulta (24 h, Bogotá)", () => {
  it("hoy muestra solo la hora", () => {
    expect(fechaConsulta("2026-10-29T16:50:00Z", HOY)).toBe("Hoy · 11:50");
  });
  it("ayer muestra «Ayer» y la hora", () => {
    expect(fechaConsulta("2026-10-28T21:05:00Z", HOY)).toBe("Ayer · 16:05");
  });
  it("usa el día de Bogotá, no el UTC (02:00Z del 30 es 21:00 del 29)", () => {
    expect(fechaConsulta("2026-10-30T02:00:00Z", HOY)).toBe("Hoy · 21:00");
  });
  it("otro día del mismo año lleva día, mes y hora", () => {
    expect(fechaConsulta("2026-10-27T14:40:00Z", HOY)).toBe("27 de oct, 09:40");
  });
  it("otro año agrega el año", () => {
    expect(fechaConsulta("2025-10-22T16:20:00Z", HOY)).toBe("22 de oct de 2025, 11:20");
  });
  it("medianoche se escribe 00:xx", () => {
    expect(fechaConsulta("2026-10-29T05:05:00Z", HOY)).toBe("Hoy · 00:05");
  });
  it("sin fecha o inválida", () => {
    expect(fechaConsulta(null, HOY)).toBe("Sin fecha registrada");
    expect(fechaConsulta("no-fecha", HOY)).toBe("Sin fecha registrada");
  });
});

describe("#779 — lectura idéntica entre ICU de servidor y navegador", () => {
  it.each([" ", "\u00a0", "\u202f"])(
    "un espacio %j en el período de la hora no provoca diferencias de hidratación",
    (espacio) => {
      // Variantes reales permitidas por Intl: el CDP mostró U+0020 en
      // el HTML y U+00A0 en el texto que React esperaba en Chromium.
      const formatter = new Intl.DateTimeFormat("es-CO");
      Object.defineProperty(formatter, "format", {
        value: () => `11/11/26, 10:16:38 p.${espacio}m.`,
      });
      const format = vi.spyOn(Intl, "DateTimeFormat").mockReturnValue(formatter);
      try {
        expect(fechaLecturaConsulta("2026-11-12T03:16:38Z"))
          .toBe("11/11/26, 10:16:38 p. m.");
      } finally {
        format.mockRestore();
      }
    },
  );
});
