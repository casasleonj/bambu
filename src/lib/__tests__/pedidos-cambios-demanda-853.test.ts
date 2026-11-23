import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ESCRITORES_ITEMS_PEDIDO,
  evidenciaDemanda,
  interpretarEvidenciaDemanda,
} from "../pedidos-cambios-demanda";

const raiz = join(__dirname, "../../..");
const fecha = new Date("2026-11-22T15:00:00Z");

describe("#853 · contrato de evidencia de cambios de demanda", () => {
  it("ida y vuelta: lo que escribe el constructor lo interpreta el lector", () => {
    const e = evidenciaDemanda("EDICION", {
      antes: [{ producto: "PACA_AGUA", cantidad: 20 }, { producto: "PACA_HIELO", cantidad: 4 }],
      despues: [{ producto: "PACA_AGUA", cantidad: 15 }, { producto: "BOTELLON", cantidad: 2 }],
    });
    expect(interpretarEvidenciaDemanda(e, fecha)).toEqual({
      tipo: "EDICION", fecha, neto: { PACA_AGUA: -5, PACA_HIELO: -4, BOTELLON: 2 }, sinCantidades: false,
    });
  });

  it("cancelación v1: neto = entregado − pedido (lo pendiente que se retira)", () => {
    const e = evidenciaDemanda("CANCELACION", {
      antes: [{ producto: "PACA_AGUA", cantidad: 20 }],
      despues: [{ producto: "PACA_AGUA", cantidad: 6 }],
    });
    expect(interpretarEvidenciaDemanda(e, new Date(0))?.neto).toEqual({ PACA_AGUA: -14 });
  });

  it("anulación v1 no retira demanda", () => {
    const e = interpretarEvidenciaDemanda(evidenciaDemanda("ANULACION"), fecha);
    expect(e).toEqual({ tipo: "ANULACION", fecha, neto: {}, sinCantidades: false });
  });

  it("evidencia anterior al contrato: cancelación y anulación por `modo` o `estado`, edición sin cantidades", () => {
    const f = new Date("2026-11-22T10:00:00Z");
    expect(interpretarEvidenciaDemanda({ motivo: "x", estado: "CANCELADO", notaCredito: false }, f))
      .toEqual({ tipo: "CANCELACION", fecha: f, neto: {}, sinCantidades: false });
    expect(interpretarEvidenciaDemanda({ motivo: "x", modo: "CANCELAR" }, f)?.tipo).toBe("CANCELACION");
    expect(interpretarEvidenciaDemanda({ motivo: "x", modo: "ANULAR" }, f)?.tipo).toBe("ANULACION");
    expect(interpretarEvidenciaDemanda({ estado: "ANULADO" }, f)?.tipo).toBe("ANULACION");
    expect(interpretarEvidenciaDemanda({ numero: 7, estado: "PENDIENTE", campos: ["items", "total"], antes: {}, despues: {} }, f))
      .toEqual({ tipo: "EDICION", fecha: f, neto: {}, sinCantidades: true });
  });

  it("la misma edición deja siempre la misma evidencia: no lleva hora propia (paridad entre orígenes)", () => {
    const lineas = { antes: [{ producto: "PACA_AGUA", cantidad: 10 }], despues: [{ producto: "PACA_AGUA", cantidad: 6 }] };
    const a = evidenciaDemanda("EDICION", lineas);
    const b = evidenciaDemanda("EDICION", lineas);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toMatch(/fecha|\d{4}-\d{2}-\d{2}T/);
    // La hora la aporta la fila de Historial, no el JSON.
    expect(interpretarEvidenciaDemanda(a, new Date("2026-01-01T00:00:00Z"))?.fecha).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("una edición de otros campos con estado cancelado NO es una cancelación", () => {
    expect(interpretarEvidenciaDemanda({ estado: "CANCELADO", campos: ["obs"], antes: {}, despues: {} }, fecha)).toBeNull();
  });

  it("eventos que no son cambios de demanda se ignoran", () => {
    for (const d of [null, "texto", 7, [], {}, { accion: "ENTREGA_OFICINA" }, { estado: "PENDIENTE" }]) {
      expect(interpretarEvidenciaDemanda(d, fecha)).toBeNull();
    }
  });

  it("evidencia presente pero ilegible no se descarta: queda sin cantidades (por conciliar)", () => {
    for (const rota of [
      { consultaDemanda: { version: 2, tipo: "EDICION" } },
      { consultaDemanda: { version: 1, tipo: "OTRO_TIPO" } },
      { consultaDemanda: { version: 1, tipo: "EDICION", antes: [{ producto: "X", cantidad: -1 }] } },
      { consultaDemanda: "roto" },
    ]) {
      expect(interpretarEvidenciaDemanda(rota, fecha)).toMatchObject({ sinCantidades: true });
    }
  });
});

describe("#853 · guardián: todo escritor de líneas de pedido deja evidencia", () => {
  const codigo: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) {
        if (!["__tests__", "node_modules", ".next"].includes(nombre)) recorrer(ruta);
      } else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\./.test(nombre)) {
        codigo.push(ruta);
      }
    }
  };
  recorrer(join(raiz, "src"));
  // Escrituras que MODIFICAN líneas existentes. Crear un pedido nuevo con sus líneas no es un cambio de demanda.
  const escritura = /\bpedidoItem\.(update|updateMany|upsert|create|createMany|delete|deleteMany)\b|\bitems:\s*\{\s*(update|upsert|deleteMany|set)\b/;

  it("los archivos que escriben líneas son exactamente los registrados", () => {
    const reales = codigo
      .filter((r) => escritura.test(readFileSync(r, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n")))
      .map((r) => relative(raiz, r).split("\\").join("/"))
      .sort();
    const registrados = ESCRITORES_ITEMS_PEDIDO.map((e) => e.archivo).sort();
    expect(
      reales,
      "Hay un escritor de líneas de pedido sin registrar (o uno registrado que ya no escribe). " +
        "Si puede cambiar cantPedido, debe dejar evidencia del antes y el después (ver pedidos-cambios-demanda.ts) y registrarse allí.",
    ).toEqual(registrados);
  });

  it("cada escritor de demanda o persistencia contiene la marca de su evidencia", () => {
    for (const e of ESCRITORES_ITEMS_PEDIDO.filter((x) => x.efecto === "DEMANDA" || x.efecto === "PERSISTENCIA")) {
      expect(e.evidencia, `${e.archivo} debe declarar su evidencia`).toBeDefined();
      const texto = readFileSync(join(raiz, e.evidencia!.archivo), "utf8");
      expect(texto, `${e.evidencia!.archivo} perdió su evidencia «${e.evidencia!.marca}»`).toContain(e.evidencia!.marca);
    }
  });

  it("los escritores de entrega y precio no cambian cantPedido", () => {
    for (const e of ESCRITORES_ITEMS_PEDIDO.filter((x) => x.efecto === "ENTREGA" || x.efecto === "PRECIO")) {
      const lineas = readFileSync(join(raiz, e.archivo), "utf8").split("\n");
      const escrituras = lineas.flatMap((l, i) => (/\bpedidoItem\.(update|updateMany|upsert|create|createMany)\b/.test(l) ? [i] : []));
      for (const i of escrituras) {
        const bloque = lineas.slice(i, i + 12).join("\n").split(/\n\s*\}\)\s*\n/)[0];
        expect(bloque, `${e.archivo}:${i + 1} escribe cantPedido pero está registrado como ${e.efecto}`).not.toMatch(/\bcantPedido\s*:/);
      }
    }
  });
});
