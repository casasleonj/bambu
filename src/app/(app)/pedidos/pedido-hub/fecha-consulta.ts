const ZONA = "America/Bogota";

function partes(fecha: Date, opts: Intl.DateTimeFormatOptions) {
  const r: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("es-CO", {
    timeZone: ZONA,
    ...opts,
  }).formatToParts(fecha))
    r[p.type] = p.value;
  return r;
}

function diaBogota(fecha: Date): string {
  const p = partes(fecha, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${p.year}-${p.month}-${p.day}`;
}

function diaAnterior(dia: string): string {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Fecha y hora de la consulta (24 h, Bogotá): «Hoy · 11:50», «Ayer · 16:05»,
 * «27 de oct, 09:40» y, si es de otro año, «22 de oct de 2025, 11:20».
 * `hoyBogota` es YYYY-MM-DD; así «hoy» sigue al reloj del servidor, no al del equipo.
 */
export function fechaConsulta(
  valor: string | null | undefined,
  hoyBogota: string,
): string {
  if (!valor) return "Sin fecha registrada";
  const f = new Date(valor);
  if (Number.isNaN(f.getTime())) return "Sin fecha registrada";
  const h = partes(f, { hour: "2-digit", minute: "2-digit", hour12: false });
  const hora = `${h.hour === "24" ? "00" : h.hour}:${h.minute}`;
  const dia = diaBogota(f);
  if (dia === hoyBogota) return `Hoy · ${hora}`;
  if (dia === diaAnterior(hoyBogota)) return `Ayer · ${hora}`;
  const d = partes(f, { day: "numeric", month: "short", year: "numeric" });
  const mes = d.month.replace(".", "");
  const anio = d.year !== hoyBogota.slice(0, 4) ? ` de ${d.year}` : "";
  return `${d.day} de ${mes}${anio}, ${hora}`;
}
