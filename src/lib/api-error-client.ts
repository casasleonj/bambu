/**
 * #861 — lectura segura del error que devuelve la API.
 *
 * `apiError()` responde `{ success: false, error: { message, formErrors?, ... } }`: `error` es un
 * objeto. Guardarlo tal cual en el estado de una pantalla y pintarlo hace que React falle con
 * «Objects are not valid as a React child». Este lector devuelve siempre texto.
 * Acepta también el formato antiguo (`error` como texto y `formErrors` en la raíz).
 */
export interface ErrorApiLeido {
  /** Mensaje principal; vacío si la respuesta no trae ninguno. */
  mensaje: string;
  /** Errores de formulario (p. ej. del horario); vacío si no hay. */
  formErrors: string[];
}

const esTexto = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter(esTexto) : []);

export function leerErrorApi(data: unknown): ErrorApiLeido {
  if (typeof data !== "object" || data === null) return { mensaje: "", formErrors: [] };
  const raiz = data as { error?: unknown; formErrors?: unknown };
  const err = raiz.error;
  if (esTexto(err)) return { mensaje: err, formErrors: textos(raiz.formErrors) };
  if (typeof err === "object" && err !== null) {
    const o = err as { message?: unknown; formErrors?: unknown };
    return {
      mensaje: esTexto(o.message) ? o.message : "",
      formErrors: textos(o.formErrors).length ? textos(o.formErrors) : textos(raiz.formErrors),
    };
  }
  return { mensaje: "", formErrors: textos(raiz.formErrors) };
}
