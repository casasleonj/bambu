import { describe, expect, it } from "vitest";
import { userCan } from "../permissions";

// #853 Fase 3: la consulta de Pedidos expone el valor de lo entregado hoy. Esa cifra es la misma de «Ventas»
// del Dashboard, así que solo debe llegar a quien ya puede ver el Dashboard. Si alguien concede
// `view:pedidos` a un rol sin `view:dashboard`, este test lo detecta antes de filtrar dinero.
describe("#853 · quién ve dinero en la consulta de Pedidos", () => {
  const ROLES = ["ADMIN", "ASISTENTE", "CONTADOR", "REPARTIDOR", "SELLADOR"] as const;

  it("todo rol con view:pedidos también tiene view:dashboard (mismas ventas, misma audiencia)", () => {
    for (const rol of ROLES) {
      if (userCan(rol, "view:pedidos")) expect(userCan(rol, "view:dashboard"), `${rol} ve Pedidos pero no el Dashboard`).toBe(true);
    }
  });

  it("REPARTIDOR y SELLADOR no ven la consulta de Pedidos (el repartidor no ve precios)", () => {
    expect(userCan("REPARTIDOR", "view:pedidos")).toBe(false);
    expect(userCan("SELLADOR", "view:pedidos")).toBe(false);
  });

  it("ADMIN, ASISTENTE y CONTADOR sí", () => {
    for (const rol of ["ADMIN", "ASISTENTE", "CONTADOR"] as const) expect(userCan(rol, "view:pedidos")).toBe(true);
  });
});
