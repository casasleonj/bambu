// #853: evidencia de CAMBIOS DE DEMANDA de un pedido (cantidad pedida) con su momento.
//
// Contrato único entre quien escribe y quien lee:
//   - Los escritores añaden `consultaDemanda` v1 al audit que ya emiten (misma transacción,
//     sin tabla ni migración nuevas) usando `evidenciaDemanda`.
//   - El lector (`leerCambiosDemandaDelDia`) la interpreta SOLO con `interpretarEvidenciaDemanda`.
//     No se busca texto dentro del JSON ni se adivina un formato.
// Las tablas tipadas (`PedidoCantidadAjuste`, `PedidoReduccionComercial`) se leen directamente
// y no pasan por aquí. Lo que no se puede interpretar se declara `sinCantidades`: queda «por
// conciliar», nunca se ignora en silencio.
import { z } from "zod";

export const TIPOS_CAMBIO_DEMANDA = ["CANCELACION", "ANULACION", "EDICION"] as const;
export type TipoCambioDemanda = (typeof TIPOS_CAMBIO_DEMANDA)[number];

/** Demanda física pedida de una línea (cantidad con precio + regalo). */
export interface LineaDemanda {
  producto: string;
  cantidad: number;
}

const linea = z.object({
  producto: z.string().min(1),
  cantidad: z.number().int().nonnegative(),
});
const fechaIso = z.string().refine((s) => Number.isFinite(Date.parse(s)), "fecha inválida");
const consultaDemandaV1 = z.object({
  version: z.literal(1),
  tipo: z.enum(TIPOS_CAMBIO_DEMANDA),
  fecha: fechaIso,
  antes: z.array(linea).optional(),
  despues: z.array(linea).optional(),
});

/** Fragmento para mezclar en `datos` del audit del pedido. */
export function evidenciaDemanda(
  tipo: TipoCambioDemanda,
  fecha: Date,
  lineas: { antes?: readonly LineaDemanda[]; despues?: readonly LineaDemanda[] } = {},
): { consultaDemanda: z.infer<typeof consultaDemandaV1> } {
  return {
    consultaDemanda: {
      version: 1,
      tipo,
      fecha: fecha.toISOString(),
      ...(lineas.antes ? { antes: lineas.antes.map((l) => ({ producto: l.producto, cantidad: l.cantidad })) } : {}),
      ...(lineas.despues ? { despues: lineas.despues.map((l) => ({ producto: l.producto, cantidad: l.cantidad })) } : {}),
    },
  };
}

export interface CambioDemandaInterpretado {
  tipo: TipoCambioDemanda;
  fecha: Date;
  /** Variación neta por producto (después − antes). Vacía si el evento no trae cantidades. */
  neto: Record<string, number>;
  /** El evento prueba que hubo el cambio, pero no sus cantidades (audit anterior a `consultaDemanda`). */
  sinCantidades: boolean;
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function netoDe(antes: readonly LineaDemanda[] = [], despues: readonly LineaDemanda[] = []): Record<string, number> {
  const neto: Record<string, number> = {};
  for (const l of despues) neto[l.producto] = (neto[l.producto] ?? 0) + l.cantidad;
  for (const l of antes) neto[l.producto] = (neto[l.producto] ?? 0) - l.cantidad;
  for (const k of Object.keys(neto)) if (neto[k] === 0) delete neto[k];
  return neto;
}

/**
 * Interpreta el `datos` (ya parseado) de un audit de Pedido. Devuelve `null` si no es un
 * cambio de demanda. Reconoce, en este orden:
 *   1. `consultaDemanda` v1 (contrato vigente).
 *   2. Audit de edición anterior al contrato (`campos` incluye `items`): se sabe que cambió,
 *      no cuánto → `sinCantidades`.
 *   3. Audit de cancelación/anulación anterior al contrato (`modo` o `estado` explícitos).
 */
export function interpretarEvidenciaDemanda(datos: unknown, fechaEvento: Date): CambioDemandaInterpretado | null {
  const d = objeto(datos);
  if (!d) return null;

  if ("consultaDemanda" in d) {
    const v1 = consultaDemandaV1.safeParse(d.consultaDemanda);
    // Una evidencia presente pero ilegible no se descarta: se declara sin cantidades.
    if (!v1.success) return { tipo: "EDICION", fecha: fechaEvento, neto: {}, sinCantidades: true };
    return {
      tipo: v1.data.tipo,
      fecha: new Date(v1.data.fecha),
      neto: netoDe(v1.data.antes, v1.data.despues),
      sinCantidades: false,
    };
  }

  if (Array.isArray(d.campos)) {
    return d.campos.includes("items")
      ? { tipo: "EDICION", fecha: fechaEvento, neto: {}, sinCantidades: true }
      : null;
  }

  const modo = d.modo;
  const estado = d.estado;
  if (modo === "CANCELAR" || estado === "CANCELADO") {
    return { tipo: "CANCELACION", fecha: fechaEvento, neto: {}, sinCantidades: false };
  }
  if (modo === "ANULAR" || estado === "ANULADO") {
    return { tipo: "ANULACION", fecha: fechaEvento, neto: {}, sinCantidades: false };
  }
  return null;
}

/**
 * Registro de cualquier código que escribe líneas de pedido (`pedidoItem.*`). Un test lo contrasta
 * con el código: si aparece un escritor nuevo sin registrar, falla. Así una edición futura de
 * la cantidad pedida no puede pasar sin dejar evidencia del antes y el después.
 *
 * - DEMANDA: puede cambiar `cantPedido`. Debe dejar evidencia (`marca` aparece en `evidencia`).
 * - PERSISTENCIA: guarda el agregado completo; la evidencia la emite el caso de uso que cambia líneas.
 * - ENTREGA / PRECIO: no tocan `cantPedido`.
 * - AJENO: coincide con el patrón pero no escribe líneas de pedido (p. ej. lotes de producción).
 * Crear un pedido nuevo con sus líneas no es un cambio de demanda y no se registra aquí.
 */
export interface EscritorItemsPedido {
  archivo: string;
  efecto: "DEMANDA" | "PERSISTENCIA" | "ENTREGA" | "PRECIO" | "AJENO";
  /** Archivo y texto que prueban la evidencia (solo DEMANDA y PERSISTENCIA). */
  evidencia?: { archivo: string; marca: string };
}
export const ESCRITORES_ITEMS_PEDIDO: readonly EscritorItemsPedido[] = [
  {
    archivo: "src/modules/pedidos/application/use-cases/AjustarPedidoCantidadUseCase.ts",
    efecto: "DEMANDA",
    evidencia: {
      archivo: "src/modules/pedidos/application/use-cases/AjustarPedidoCantidadUseCase.ts",
      marca: "tx.pedidoCantidadAjuste.create",
    },
  },
  {
    archivo: "src/modules/pedidos/application/services/aplicar-reduccion-comercial.service.ts",
    efecto: "DEMANDA",
    evidencia: {
      archivo: "src/modules/pedidos/application/services/aplicar-reduccion-comercial.service.ts",
      marca: "cantPedidoAntes",
    },
  },
  {
    archivo: "src/modules/pedidos/infrastructure/repositories/PrismaPedidoRepository.ts",
    efecto: "PERSISTENCIA",
    evidencia: {
      archivo: "src/modules/pedidos/application/use-cases/ActualizarPedidoUseCase.ts",
      marca: "evidenciaDemanda('EDICION'",
    },
  },
  { archivo: "src/modules/embarques/domain/services/procesar-pedido.service.ts", efecto: "ENTREGA" },
  { archivo: "src/modules/pedidos/application/services/aplicar-correccion-precio.service.ts", efecto: "PRECIO" },
  { archivo: "src/app/api/produccion/[id]/route.ts", efecto: "AJENO" },
];
