import { describe, it, expect } from "vitest";
import { leerErrorApi } from "../api-error-client";

describe("leerErrorApi (#861)", () => {
  it("lee el mensaje de la forma actual { error: { message } }", () => {
    expect(leerErrorApi({ success: false, error: { message: "El negocio fue modificado por otro admin." } }))
      .toEqual({ mensaje: "El negocio fue modificado por otro admin.", formErrors: [] });
  });
  it("lee formErrors dentro de error", () => {
    expect(leerErrorApi({ error: { message: "Datos inválidos", formErrors: ["Lunes: cierra antes de abrir", "Martes: tramo repetido"] } }))
      .toEqual({ mensaje: "Datos inválidos", formErrors: ["Lunes: cierra antes de abrir", "Martes: tramo repetido"] });
  });
  it("acepta el formato antiguo: error como texto y formErrors en la raíz", () => {
    expect(leerErrorApi({ error: "Falló", formErrors: ["a"] })).toEqual({ mensaje: "Falló", formErrors: ["a"] });
    expect(leerErrorApi({ formErrors: ["solo esto"] })).toEqual({ mensaje: "", formErrors: ["solo esto"] });
  });
  it("siempre devuelve texto, nunca un objeto", () => {
    for (const x of [null, undefined, 5, "x", {}, { error: {} }, { error: { message: { x: 1 } } }, { error: [1] }, { error: { formErrors: [1, null, { a: 1 }] } }]) {
      const r = leerErrorApi(x);
      expect(typeof r.mensaje).toBe("string");
      expect(r.formErrors.every((f) => typeof f === "string")).toBe(true);
    }
  });
});
