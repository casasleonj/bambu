import { clasificarCompromiso } from "@/lib/pedidos-compromiso";
import { negocioCerradoEseDia, type TramoHorario } from "@/lib/negocio-horario";

const TONO = {
  hoy: "bg-green-100 text-green-800",
  arrastrado: "bg-amber-100 text-amber-900",
  programado: "bg-blue-50 text-blue-800",
} as const;

function dia(fecha: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short",
  }).format(new Date(fecha));
}

/** Texto de la fecha prometida, o `null` si no hay compromiso abierto que mostrar (#836 F1). */
export function etiquetaCompromiso(
  p: { fechaEntrega?: string | null; estadoEntrega: string },
  hoyBogota: string,
): { clase: keyof typeof TONO; texto: string } | null {
  if (!p.fechaEntrega) return null;
  const clase = clasificarCompromiso({ fechaEntrega: p.fechaEntrega, estadoEntrega: p.estadoEntrega }, hoyBogota);
  if (clase === "hoy") return { clase, texto: "Para hoy" };
  if (clase === "arrastrado") return { clase, texto: `Arrastrado · previsto ${dia(p.fechaEntrega)}` };
  if (clase === "programado") return { clase, texto: `Programado · ${dia(p.fechaEntrega)}` };
  return null;
}

export function CompromisoChip({
  id, pedido, hoyBogota,
}: {
  id: string;
  pedido: { fechaEntrega?: string | null; estadoEntrega: string };
  hoyBogota: string;
}) {
  const e = etiquetaCompromiso(pedido, hoyBogota);
  if (!e) return null;
  return (
    <p
      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONO[e.clase]}`}
      data-testid={`operacion-compromiso-${id}`}
    >
      📅 {e.texto}
    </p>
  );
}

/**
 * #836 F2: aviso (no bloqueo) de que el negocio no atiende el día de la fecha prometida. Solo con
 * horario configurado y un pedido todavía abierto; el pedido sigue visible y se puede preparar.
 */
export function CierreNegocioChip({
  id, pedido,
}: {
  id: string;
  pedido: { fechaEntrega?: string | null; estadoEntrega: string; negocioHorarios?: TramoHorario[] };
}) {
  if (!pedido.fechaEntrega || !pedido.negocioHorarios?.length) return null;
  if (["ENTREGADO", "CANCELADO", "ANULADO"].includes(pedido.estadoEntrega)) return null;
  if (!negocioCerradoEseDia(pedido.negocioHorarios, pedido.fechaEntrega)) return null;
  return (
    <p
      className="mt-1 ml-1 inline-block rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800"
      data-testid={`operacion-cierre-${id}`}
      title="Según el horario del negocio, ese día no atiende. Se puede preparar igual."
    >
      Negocio cerrado ese día
    </p>
  );
}
