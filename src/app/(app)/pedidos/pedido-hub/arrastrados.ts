import { fechaConsulta } from "./fecha-consulta";

const ZONA = "America/Bogota";
const diaBogota = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });

/** Días calendario (Bogotá) entre la fecha del pedido y hoy; nunca negativo. */
export function diasDeArrastre(fechaIso: string, hoyBogota: string): number {
  const d1 = new Date(`${diaBogota(fechaIso)}T00:00:00-05:00`).getTime();
  const d2 = new Date(`${hoyBogota}T00:00:00-05:00`).getTime();
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return 0;
  return Math.max(0, Math.round((d2 - d1) / 86_400_000));
}

/** «Creado ayer · 17:40 · hace 1 día»: fecha original sin alterar la del pedido (#797). */
export function etiquetaArrastre(fechaIso: string, hoyBogota: string): string {
  const dias = diasDeArrastre(fechaIso, hoyBogota);
  const cuando = fechaConsulta(fechaIso, hoyBogota);
  const original = cuando.charAt(0).toLowerCase() + cuando.slice(1);
  if (dias === 0) return `Creado ${original}`;
  return `Creado ${original} · hace ${dias} ${dias === 1 ? "día" : "días"}`;
}

/** #927: etiqueta breve, relativa al día consultado en Bogotá (sin tecnicismos). */
export function etiquetaAntiguedadPedido(fechaIso: string, diaConsulta: string): string | null {
  const dias = diasDeArrastre(fechaIso, diaConsulta);
  if (dias === 0) return null;
  if (dias === 1) return "De ayer";
  if (dias === 2) return "De anteayer";
  return `De hace ${dias} días`;
}
