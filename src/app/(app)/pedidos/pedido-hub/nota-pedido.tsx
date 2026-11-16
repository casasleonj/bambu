"use client";
import { useId, useState } from "react";

/**
 * Observación del pedido en la lista (#635, #780).
 * - Ratón: al pasar el cursor por «📝 Nota» (o su aviso) se lee la nota; al salir se oculta.
 * - Teclado: al enfocar el botón con Tab también se ve.
 * - Táctil o clic: el botón fija o suelta la nota; sirve donde no hay cursor.
 * - Escape cierra. El aviso flota, así la lista no se mueve al pasar el cursor.
 */
export function NotaPedido({ obs, numero }: { obs: string; numero: number }) {
  const [hover, setHover] = useState(false),
    [foco, setFoco] = useState(false),
    [fijada, setFijada] = useState(false);
  const id = useId();
  const visible = hover || foco || fijada;
  const cerrar = () => {
    setHover(false);
    setFoco(false);
    setFijada(false);
  };
  return (
    <div
      className="relative inline-block"
      onClick={(e) => e.stopPropagation()}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && visible) {
          e.stopPropagation();
          cerrar();
        }
      }}
    >
      <button
        type="button"
        aria-expanded={visible}
        aria-describedby={visible ? id : undefined}
        aria-label={`Observaciones del pedido #${numero}`}
        data-testid={`operacion-nota-${numero}`}
        className="mt-1 inline-flex min-h-9 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 text-xs font-semibold text-amber-900"
        onClick={() => setFijada((v) => !v)}
        onFocus={(e) => setFoco(e.currentTarget.matches(":focus-visible"))}
        onBlur={() => setFoco(false)}
      >
        📝 Nota
      </button>
      {visible && (
        <p
          id={id}
          role="tooltip"
          data-testid={`operacion-nota-texto-${numero}`}
          className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw] whitespace-pre-wrap break-words rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-normal text-amber-950 shadow-lg"
        >
          {obs}
        </p>
      )}
    </div>
  );
}
