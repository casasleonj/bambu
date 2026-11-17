import { clasificarCompromiso } from "@/lib/pedidos-compromiso";

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
